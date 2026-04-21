import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import AddTodoForm from './components/AddTodoForm'
import type { CreateReminderPayload, TodoDraft } from './components/AddTodoForm'
import AuthForm from './components/AuthForm'
import Header, { type HeaderReminderItem } from './components/Header'
import Modal from './components/Modal'
import { FilterPanel, type FilterState } from './components/FilterPanel'
import Toast from './components/Toast'
import Toolbar from './components/Toolbar'
import TodoList from './components/TodoList'
import { fetchWithAuth } from './api/fetchWithAuth'

const API_BASE = '/api/todos'
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS

interface TodoDependencySummary {
  id: number
  name: string
  isCompleted: boolean
}

interface TodoRelatedSummary {
  id: number
  name: string
  isCompleted: boolean
}

interface AttachmentSummary {
  id: number
  fileName: string
  fileSize: number
  uploadedAt: string
  contentType: string
}

interface ReminderSummary {
  id: number
  type: number
  offsetMinutes: number | null
  reminderDateTimeUtc: string | null
  isSent: boolean
}

interface UploadedAttachmentResponse extends AttachmentSummary {
  todoId: number
}

interface TodoApiResponse {
  id: number
  sortOrder?: number
  name: string
  description: string | null
  deadline: string | null
  notes: string | null
  tags?: string[]
  isCompleted: boolean
  createdAt: string
  parentId: number | null
  doable?: boolean
  dependencies?: TodoDependencySummary[]
  relatedTodos?: TodoRelatedSummary[]
  attachments?: AttachmentSummary[]
  reminders?: ReminderSummary[]
}

interface Todo extends Omit<TodoApiResponse, 'dependencies' | 'relatedTodos'> {
  sortOrder: number
  doable: boolean
  dependencies: TodoDependencySummary[]
  relatedTodos: TodoRelatedSummary[]
  tags: string[]
  attachments: AttachmentSummary[]
  reminders: ReminderSummary[]
  children: Todo[]
}

interface UploadProgressState {
  total: number
  completed: number
  currentFileName: string | null
  isUploading: boolean
}

interface CreateTodoPayload {
  name: string
  description: string | null
  deadline: string | null
  notes: string | null
  parentId: number | null
}

interface UpdateTodoPayload extends CreateTodoPayload {
  isCompleted: boolean
}

interface ActiveDropZone {
  afterTodoId: number | null
  parentId: number | null
}

interface UserSettings {
  preferredLanguage: 'en' | 'pl'
  showCompletedOnStartup: boolean
  defaultReminderOffsets: number[]
}

interface UserSettingsResponse {
  preferredLanguage?: string
  showCompletedOnStartup?: boolean
  defaultReminderOffsets?: number[]
}

interface PushNotificationPayload {
  title: string
  body: string
  todoId: number | null
}

interface PushNotificationClientMessage {
  type: 'push-notification'
  payload: PushNotificationPayload
}

type AppView = 'todos' | 'settings'

const normalizeText = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const normalizeLanguage = (language: string | undefined): 'en' | 'pl' => {
  if (language?.toLowerCase().startsWith('pl')) {
    return 'pl'
  }

  return 'en'
}

const normalizeReminderOffsets = (offsets: number[] | undefined): number[] => {
  if (!Array.isArray(offsets)) {
    return []
  }

  const uniqueOffsets = new Set<number>()
  offsets.forEach((offset) => {
    if (Number.isFinite(offset) && offset > 0) {
      uniqueOffsets.add(Math.trunc(offset))
    }
  })

  return [...uniqueOffsets].sort((left, right) => left - right)
}

const isPushNotificationClientMessage = (value: unknown): value is PushNotificationClientMessage => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  if (candidate.type !== 'push-notification') {
    return false
  }

  if (!candidate.payload || typeof candidate.payload !== 'object') {
    return false
  }

  const payload = candidate.payload as Record<string, unknown>
  const hasValidTodoId =
    payload.todoId === null ||
    (typeof payload.todoId === 'number' && Number.isFinite(payload.todoId))

  return typeof payload.title === 'string' && typeof payload.body === 'string' && hasValidTodoId
}

const normalizeSettings = (settings: UserSettingsResponse | null | undefined): UserSettings => ({
  preferredLanguage: normalizeLanguage(settings?.preferredLanguage),
  showCompletedOnStartup: Boolean(settings?.showCompletedOnStartup),
  defaultReminderOffsets: normalizeReminderOffsets(settings?.defaultReminderOffsets),
})

const DEFAULT_USER_SETTINGS: UserSettings = {
  preferredLanguage: 'en',
  showCompletedOnStartup: false,
  defaultReminderOffsets: [],
}

const DEFAULT_REMINDER_OFFSET_PRESETS = [
  { minutes: 15, labelKey: 'reminder.15min' },
  { minutes: 30, labelKey: 'reminder.30min' },
  { minutes: 60, labelKey: 'reminder.1hour' },
  { minutes: 1440, labelKey: 'reminder.1day' },
  { minutes: 10080, labelKey: 'reminder.1week' },
] as const

const normalizeTag = (value: string): string => value.trim().toLowerCase()

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index)
  }

  return outputArray
}

const uint8ArrayToBase64 = (value: Uint8Array): string => {
  let binary = ''
  value.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return window.btoa(binary)
}

const normalizeTagList = (tags: string[]): string[] => {
  const deduped = new Set<string>()
  tags.forEach((tag) => {
    const normalized = normalizeTag(tag)
    if (normalized) {
      deduped.add(normalized)
    }
  })

  return [...deduped]
}

const deriveDoable = (dependencies: TodoDependencySummary[]): boolean => {
  if (dependencies.length === 0) {
    return true
  }

  return dependencies.every((dependency) => dependency.isCompleted)
}

const buildDependencySummary = (todo: Todo): TodoDependencySummary => ({
  id: todo.id,
  name: todo.name,
  isCompleted: todo.isCompleted,
})

const hydrateTodo = (todo: TodoApiResponse): Todo => {
  const dependencies = Array.isArray(todo.dependencies)
    ? todo.dependencies.map((dependency) => ({
        id: dependency.id,
        name: dependency.name,
        isCompleted: Boolean(dependency.isCompleted),
      }))
    : []
  const tags = Array.isArray(todo.tags)
    ? todo.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => normalizeTag(tag))
        .filter((tag) => tag.length > 0)
    : []
  const attachments = Array.isArray(todo.attachments)
    ? todo.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        fileSize: Number(attachment.fileSize),
        uploadedAt: attachment.uploadedAt,
        contentType: attachment.contentType,
      }))
    : []

  const relatedTodos = Array.isArray(todo.relatedTodos)
    ? todo.relatedTodos.map((relatedTodo) => ({
        id: relatedTodo.id,
        name: relatedTodo.name,
        isCompleted: Boolean(relatedTodo.isCompleted),
      }))
    : []
  const reminders = Array.isArray(todo.reminders)
    ? todo.reminders.map((reminder) => ({
        id: reminder.id,
        type: Number(reminder.type),
        offsetMinutes:
          typeof reminder.offsetMinutes === 'number' ? Number(reminder.offsetMinutes) : null,
        reminderDateTimeUtc: reminder.reminderDateTimeUtc,
        isSent: Boolean(reminder.isSent),
      }))
    : []

  return {
    ...todo,
    sortOrder: todo.sortOrder ?? todo.id,
    dependencies,
    relatedTodos,
    tags,
    attachments,
    reminders,
    doable: deriveDoable(dependencies),
    children: [],
  }
}

const applyDoable = (items: Todo[]): Todo[] =>
  items.map((todo) => {
    const dependencies = todo.dependencies ?? []
    return {
      ...todo,
      dependencies,
      doable: deriveDoable(dependencies),
    }
  })

const buildTodoHierarchy = (
  items: Todo[],
): { roots: Todo[]; descendantMap: Map<number, Set<number>> } => {
  const nodes = items.map((todo) => ({ ...todo, children: [] as Todo[] }))
  const nodeMap = new Map<number, Todo>(nodes.map((todo) => [todo.id, todo]))
  const roots: Todo[] = []

  nodes.forEach((node) => {
    const parentId = node.parentId ?? null
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)?.children.push(node)
    } else {
      roots.push(node)
    }
  })

  nodes.forEach((node) => {
    node.children.sort((left, right) => left.sortOrder - right.sortOrder)
  })
  roots.sort((left, right) => left.sortOrder - right.sortOrder)

  const descendantMap = new Map<number, Set<number>>()

  const collectDescendants = (node: Todo): Set<number> => {
    const descendants = new Set<number>()
    node.children.forEach((child) => {
      descendants.add(child.id)
      collectDescendants(child).forEach((id) => descendants.add(id))
    })
    descendantMap.set(node.id, descendants)
    return descendants
  }

  roots.forEach((root) => {
    collectDescendants(root)
  })

  nodes.forEach((node) => {
    if (!descendantMap.has(node.id)) {
      descendantMap.set(node.id, new Set<number>())
    }
  })

  return { roots, descendantMap }
}

const filterTodoHierarchy = (items: Todo[], filters: FilterState): Todo[] => {
  const hasActiveFilter =
    filters.showDoableOnly || filters.hideCompleted || filters.hasAttachmentsOnly || filters.dueDate !== null

  if (!hasActiveFilter) {
    return items
  }

  const filterNodes = (nodes: Todo[]): Todo[] =>
    nodes
      .filter((node) => {
        if (filters.showDoableOnly && !node.doable) {
          return false
        }

        if (filters.hideCompleted && node.isCompleted) {
          return false
        }

        if (filters.hasAttachmentsOnly && node.attachments.length === 0) {
          return false
        }

        if (filters.dueDate !== null) {
          if (node.deadline === null) {
            return false
          }

          if (node.deadline.substring(0, 10) !== filters.dueDate) {
            return false
          }
        }

        return true
      })
      .map((node) => ({
        ...node,
        children: filterNodes(node.children),
      }))

  return filterNodes(items)
}

function App() {
  const { t, i18n } = useTranslation()
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem('token') ?? '')
  const [authUsername, setAuthUsername] = useState<string>(() => localStorage.getItem('username') ?? '')
  const [todos, setTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [processingIds, setProcessingIds] = useState<number[]>([])
  const [error, setError] = useState<string>('')
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null)
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false)
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null)
  const [collapsedTodoIds, setCollapsedTodoIds] = useState<Set<number>>(new Set<number>())
  const [draggingTodoId, setDraggingTodoId] = useState<number | null>(null)
  const [activeDropTodoId, setActiveDropTodoId] = useState<number | null>(null)
  const [activeDropZone, setActiveDropZone] = useState<ActiveDropZone | null>(null)
  const [filters, setFilters] = useState<FilterState>({
    showDoableOnly: false,
    hideCompleted: false,
    hasAttachmentsOnly: false,
    dueDate: null,
  })
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState>({
    total: 0,
    completed: 0,
    currentFileName: null,
    isUploading: false,
  })
  const [attachmentError, setAttachmentError] = useState<string>('')
  const [formAttachments, setFormAttachments] = useState<AttachmentSummary[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState<boolean>(() => !window.navigator.onLine)
  const [highlightedTodoIds, setHighlightedTodoIds] = useState<Set<number>>(new Set<number>())
  const [activeView, setActiveView] = useState<AppView>('todos')
  const [userSettings, setUserSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS)
  const [settingsDraft, setSettingsDraft] = useState<UserSettings>(DEFAULT_USER_SETTINGS)
  const [isSettingsLoading, setIsSettingsLoading] = useState<boolean>(false)
  const [isSettingsSaving, setIsSettingsSaving] = useState<boolean>(false)
  const [settingsError, setSettingsError] = useState<string>('')
  const [hasAppliedStartupSettings, setHasAppliedStartupSettings] = useState<boolean>(false)
  const [pushEnabled, setPushEnabled] = useState<boolean>(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(() =>
    'Notification' in window ? Notification.permission : 'default',
  )
  const [isPushUpdating, setIsPushUpdating] = useState<boolean>(false)
  const isPushSupported = 'serviceWorker' in navigator && 'PushManager' in window
  const isAuthenticated = authToken.length > 0

  const loadTodos = async (): Promise<void> => {
    if (!isAuthenticated) {
      setTodos([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await fetchWithAuth(API_BASE)
      if (!response.ok) {
        throw new Error(t('errors.fetchTodos'))
      }

      const data = (await response.json()) as TodoApiResponse[]
      const normalized = Array.isArray(data) ? data.map(hydrateTodo) : []
      setTodos(normalized)
    } catch (loadError) {
      console.error(loadError)
      setError(t('errors.loadTodos'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadTodos()
  }, [isAuthenticated])

  const handleAuthenticated = (
    token: string,
    username: string,
    settings?: UserSettingsResponse,
  ): void => {
    localStorage.setItem('token', token)
    localStorage.setItem('username', username)
    setAuthToken(token)
    setAuthUsername(username)
    const normalizedSettings = normalizeSettings(settings)
    setUserSettings(normalizedSettings)
    setSettingsDraft(normalizedSettings)
    setFilters((previous) => ({
      ...previous,
      hideCompleted: !normalizedSettings.showCompletedOnStartup,
    }))
    void i18n.changeLanguage(normalizedSettings.preferredLanguage)
    setHasAppliedStartupSettings(true)
    setActiveView('todos')
    setSettingsError('')
    setError('')
  }

  const handleLogout = (): void => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    window.location.reload()
  }

  const loadCurrentSettings = useCallback(async (): Promise<UserSettings | null> => {
    if (!isAuthenticated) {
      return null
    }

    const response = await fetchWithAuth('/api/settings')
    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as UserSettingsResponse
    return normalizeSettings(data)
  }, [isAuthenticated])

  const { roots, descendantMap } = useMemo(() => buildTodoHierarchy(todos), [todos])
  const parentTodoIds = useMemo(
    () =>
      todos
        .filter((todo) => todos.some((candidate) => candidate.parentId === todo.id))
        .map((todo) => todo.id),
    [todos],
  )
  const allParentsCollapsed = useMemo(
    () =>
      parentTodoIds.length > 0 && parentTodoIds.every((parentTodoId) => collapsedTodoIds.has(parentTodoId)),
    [collapsedTodoIds, parentTodoIds],
  )
  const editingTodo = useMemo(
    () => (editingTodoId === null ? null : todos.find((todo) => todo.id === editingTodoId) ?? null),
    [editingTodoId, todos],
  )
  const selectedParentName = useMemo(
    () => todos.find((todo) => todo.id === selectedParentId)?.name ?? '',
    [selectedParentId, todos],
  )
  const headerReminders = useMemo<HeaderReminderItem[]>(() => {
    const threshold = Date.now() - SEVEN_DAYS_MS

    return todos
      .flatMap((todo) =>
        todo.reminders.flatMap((reminder) => {
          if (reminder.reminderDateTimeUtc === null) {
            return []
          }

          return {
            reminderId: reminder.id,
            todoId: todo.id,
            todoName: todo.name,
            reminderDateTimeUtc: reminder.reminderDateTimeUtc,
            isSent: reminder.isSent,
          }
        }),
      )
      .filter((reminder) => Date.parse(reminder.reminderDateTimeUtc) >= threshold)
      .sort((left, right) => Date.parse(right.reminderDateTimeUtc) - Date.parse(left.reminderDateTimeUtc))
  }, [todos])
  const hasReminderBadge = useMemo(() => {
    const recentSentThreshold = Date.now() - ONE_DAY_MS

    return todos.some((todo) =>
      todo.reminders.some((reminder) => {
        if (!reminder.isSent) {
          return true
        }

        if (reminder.reminderDateTimeUtc === null) {
          return false
        }

        return Date.parse(reminder.reminderDateTimeUtc) >= recentSentThreshold
      }),
    )
  }, [todos])
  const visibleRoots = useMemo(() => filterTodoHierarchy(roots, filters), [roots, filters])

  useEffect(() => {
    if (isAuthenticated) {
      return
    }

    setActiveView('todos')
    setUserSettings(DEFAULT_USER_SETTINGS)
    setSettingsDraft(DEFAULT_USER_SETTINGS)
    setSettingsError('')
    setHasAppliedStartupSettings(false)
    void i18n.changeLanguage('en')
  }, [i18n, isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated || hasAppliedStartupSettings) {
      return
    }

    let isCancelled = false

    const initializeSessionSettings = async (): Promise<void> => {
      try {
        const settings = await loadCurrentSettings()
        if (!settings || isCancelled) {
          return
        }

        setUserSettings(settings)
        setSettingsDraft(settings)
        setFilters((previous) => ({
          ...previous,
          hideCompleted: !settings.showCompletedOnStartup,
        }))
        void i18n.changeLanguage(settings.preferredLanguage)
      } catch (settingsLoadError) {
        console.error(settingsLoadError)
      } finally {
        if (!isCancelled) {
          setHasAppliedStartupSettings(true)
        }
      }
    }

    void initializeSessionSettings()

    return () => {
      isCancelled = true
    }
  }, [hasAppliedStartupSettings, i18n, isAuthenticated, loadCurrentSettings])

  useEffect(() => {
    if (!isAuthenticated || activeView !== 'settings') {
      return
    }

    let isCancelled = false

    const refreshSettingsForView = async (): Promise<void> => {
      setIsSettingsLoading(true)
      setSettingsError('')

      try {
        const settings = await loadCurrentSettings()
        if (!settings) {
          throw new Error(t('settings.errors.loadFailed'))
        }

        if (isCancelled) {
          return
        }

        setUserSettings(settings)
        setSettingsDraft(settings)
      } catch (settingsLoadError) {
        console.error(settingsLoadError)
        if (!isCancelled) {
          setSettingsError(t('settings.errors.loadFailed'))
        }
      } finally {
        if (!isCancelled) {
          setIsSettingsLoading(false)
        }
      }
    }

    void refreshSettingsForView()

    return () => {
      isCancelled = true
    }
  }, [activeView, isAuthenticated, loadCurrentSettings, t])

  useEffect(() => {
    if (!isAuthenticated || activeView !== 'settings' || !isPushSupported) {
      if (activeView === 'settings') {
        setPushEnabled(false)
      }
      return
    }

    let isCancelled = false

    const initializePushSubscriptionState = async (): Promise<void> => {
      setPushPermission(Notification.permission)
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (!isCancelled) {
          setPushEnabled(Boolean(subscription))
        }
      } catch (pushInitError) {
        console.error(pushInitError)
        if (!isCancelled) {
          setPushEnabled(false)
        }
      }
    }

    void initializePushSubscriptionState()

    return () => {
      isCancelled = true
    }
  }, [activeView, isAuthenticated, isPushSupported])

  const handlePushToggle = async (enabled: boolean): Promise<void> => {
    if (!isPushSupported) {
      return
    }

    setSettingsError('')
    setIsPushUpdating(true)

    try {
      const registration = await navigator.serviceWorker.ready

      if (enabled) {
        const vapidResponse = await fetchWithAuth('/api/push/vapid-public-key')
        if (!vapidResponse.ok) {
          throw new Error('Unable to load VAPID public key.')
        }

        const vapidPublicKey = (await vapidResponse.text()).trim()
        if (!vapidPublicKey) {
          throw new Error('VAPID public key is missing.')
        }

        const permission = await Notification.requestPermission()
        setPushPermission(permission)
        if (permission !== 'granted') {
          setPushEnabled(false)
          return
        }

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        })

        const p256dhKey = subscription.getKey('p256dh')
        const authKey = subscription.getKey('auth')

        if (!p256dhKey || !authKey) {
          throw new Error('Push subscription keys are unavailable.')
        }

        const subscribeResponse = await fetchWithAuth('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dh: uint8ArrayToBase64(new Uint8Array(p256dhKey)),
            auth: uint8ArrayToBase64(new Uint8Array(authKey)),
          }),
        })

        if (!subscribeResponse.ok) {
          throw new Error('Failed to register push subscription.')
        }

        setPushEnabled(true)
        return
      }

      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const unsubscribeSucceeded = await subscription.unsubscribe()
        if (!unsubscribeSucceeded) {
          throw new Error('Browser failed to unsubscribe push subscription.')
        }

        const unsubscribeResponse = await fetchWithAuth('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
          }),
        })

        if (!unsubscribeResponse.ok && unsubscribeResponse.status !== 404) {
          throw new Error('Failed to remove push subscription from server.')
        }
      }

      setPushPermission(Notification.permission)
      setPushEnabled(false)
    } catch (pushToggleError) {
      console.error(pushToggleError)
      setSettingsError(t('settings.errors.saveFailed'))
    } finally {
      setIsPushUpdating(false)
    }
  }

  const handleSaveSettings = async (): Promise<void> => {
    setIsSettingsSaving(true)
    setSettingsError('')

    const payload: UserSettings = {
      preferredLanguage: normalizeLanguage(settingsDraft.preferredLanguage),
      showCompletedOnStartup: settingsDraft.showCompletedOnStartup,
      defaultReminderOffsets: normalizeReminderOffsets(settingsDraft.defaultReminderOffsets),
    }

    try {
      const response = await fetchWithAuth('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(t('settings.errors.saveFailed'))
      }

      const saved = normalizeSettings((await response.json()) as UserSettingsResponse)
      setUserSettings(saved)
      setSettingsDraft(saved)
      void i18n.changeLanguage(saved.preferredLanguage)
    } catch (settingsSaveError) {
      console.error(settingsSaveError)
      setSettingsError(t('settings.errors.saveFailed'))
    } finally {
      setIsSettingsSaving(false)
    }
  }

  const handleDefaultReminderOffsetToggle = (minutes: number): void => {
    setSettingsDraft((previous) => {
      const isActive = previous.defaultReminderOffsets.includes(minutes)
      const nextOffsets = isActive
        ? previous.defaultReminderOffsets.filter((offset) => offset !== minutes)
        : [...previous.defaultReminderOffsets, minutes].sort((left, right) => left - right)

      return {
        ...previous,
        defaultReminderOffsets: nextOffsets,
      }
    })
  }

  useEffect(() => {
    if (!showCreateForm) {
      setUploadProgress({
        total: 0,
        completed: 0,
        currentFileName: null,
        isUploading: false,
      })
      setAttachmentError('')
      setFormAttachments([])
      return
    }

    if (editingTodo) {
      setFormAttachments(editingTodo.attachments ?? [])
      return
    }

    setFormAttachments([])
  }, [editingTodo, showCreateForm])

  useEffect(() => {
    const handleOnline = (): void => {
      setIsOffline(false)
      setToast(t('toast.online'))
    }

    const handleOffline = (): void => {
      setIsOffline(true)
      setToast(t('toast.offline'))
    }

    setIsOffline(!window.navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [t])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    const handleServiceWorkerMessage = (event: MessageEvent<unknown>): void => {
      if (!isPushNotificationClientMessage(event.data)) {
        return
      }

      const { title, body } = event.data.payload
      const message = [title.trim(), body.trim()].filter((part) => part.length > 0).join(': ')
      if (message.length > 0) {
        setToast(message)
      }
    }

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
    }
  }, [])

  const setProcessing = (id: number, isProcessing: boolean): void => {
    setProcessingIds((prev) => {
      if (isProcessing) {
        return prev.includes(id) ? prev : [...prev, id]
      }

      return prev.filter((value) => value !== id)
    })
  }

  const clearDropTargets = useCallback((): void => {
    setActiveDropTodoId(null)
    setActiveDropZone(null)
  }, [])

  const clearDragState = useCallback((): void => {
    setDraggingTodoId(null)
    clearDropTargets()
  }, [clearDropTargets])

  useEffect(() => {
    if (draggingTodoId === null) {
      return
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }

      event.preventDefault()
      clearDragState()
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [clearDragState, draggingTodoId])

  const syncTodoTags = async (
    todoId: number,
    existingTags: string[],
    requestedTags: string[],
  ): Promise<void> => {
    const currentSet = new Set(normalizeTagList(existingTags))
    const requestedSet = new Set(normalizeTagList(requestedTags))
    const tagsToAdd = [...requestedSet].filter((tag) => !currentSet.has(tag))
    const tagsToRemove = [...currentSet].filter((tag) => !requestedSet.has(tag))

    if (tagsToAdd.length > 0) {
      const addResponses = await Promise.all(
        tagsToAdd.map((tag) =>
          fetchWithAuth(`${API_BASE}/${todoId}/tags`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: tag }),
          }),
        ),
      )

      const failedAdd = addResponses.find((response) => !response.ok)
      if (failedAdd) {
        throw new Error(t('errors.syncTags'))
      }
    }

    if (tagsToRemove.length > 0) {
      const removeResponses = await Promise.all(
        tagsToRemove.map((tag) =>
          fetchWithAuth(`${API_BASE}/${todoId}/tags/${encodeURIComponent(tag)}`, {
            method: 'DELETE',
          }),
        ),
      )

      const failedRemove = removeResponses.find((response) => !response.ok)
      if (failedRemove) {
        throw new Error(t('errors.syncTags'))
      }
    }
  }

  const blockOfflineMutation = (): boolean => {
    if (!isOffline) {
      return false
    }

    setToast(t('toast.offlineAction'))
    return true
  }

  const handleCreate = async (todoDraft: TodoDraft): Promise<boolean> => {
    if (blockOfflineMutation()) {
      return false
    }

    setIsSubmitting(true)
    setError('')

    try {
      const payload: CreateTodoPayload = {
        name: todoDraft.name.trim(),
        description: normalizeText(todoDraft.description),
        deadline: todoDraft.deadline ? todoDraft.deadline : null,
        notes: normalizeText(todoDraft.notes),
        parentId: todoDraft.parentId ?? null,
      }

      const response = await fetchWithAuth(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(t('errors.createTodo'))
      }

      const created = (await response.json()) as TodoApiResponse
      await syncTodoTags(created.id, created.tags ?? [], todoDraft.tags)
      if (todoDraft.files.length > 0) {
        await uploadAttachments(created.id, todoDraft.files)
      }
      await loadTodos()
      setEditingTodoId(null)
      setShowCreateForm(false)
      setSelectedParentId(null)
      return true
    } catch (createError) {
      console.error(createError)
      setError(t('errors.addTodo'))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdate = async (todoDraft: TodoDraft): Promise<boolean> => {
    if (editingTodoId === null) {
      return false
    }

    if (blockOfflineMutation()) {
      return false
    }

    const targetTodo = todos.find((todo) => todo.id === editingTodoId)
    if (!targetTodo) {
      setError(t('errors.updateTodoMessage'))
      return false
    }

    setIsSubmitting(true)
    setError('')

    try {
      const payload: UpdateTodoPayload = {
        name: todoDraft.name.trim(),
        description: normalizeText(todoDraft.description),
        deadline: todoDraft.deadline ? todoDraft.deadline : null,
        notes: normalizeText(todoDraft.notes),
        parentId: todoDraft.parentId ?? null,
        isCompleted: targetTodo.isCompleted,
      }

      const response = await fetchWithAuth(`${API_BASE}/${targetTodo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(t('errors.updateTodo'))
      }

      await syncTodoTags(targetTodo.id, targetTodo.tags, todoDraft.tags)
      if (todoDraft.files.length > 0) {
        await uploadAttachments(targetTodo.id, todoDraft.files)
      }
      await loadTodos()
      setEditingTodoId(null)
      setShowCreateForm(false)
      setSelectedParentId(null)
      return true
    } catch (updateError) {
      console.error(updateError)
      setError(t('errors.updateTodoMessage'))
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitTodo = async (todoDraft: TodoDraft): Promise<boolean> => {
    if (editingTodoId !== null) {
      return handleUpdate(todoDraft)
    }

    return handleCreate(todoDraft)
  }

  const createUpdatePayload = (
    todo: Todo,
    overrides: Partial<UpdateTodoPayload> = {},
  ): UpdateTodoPayload => ({
    name: todo.name,
    description: todo.description ?? null,
    deadline: todo.deadline ?? null,
    notes: todo.notes ?? null,
    parentId: todo.parentId ?? null,
    isCompleted: todo.isCompleted,
    ...overrides,
  })

  const handleToggle = async (todo: Todo): Promise<void> => {
    if (!todo.doable && !todo.isCompleted) {
      setToast(t('toast.blockedByDependencies'))
      const blockingTodoIds = (todo.dependencies ?? [])
        .filter((dependency) => !dependency.isCompleted)
        .map((dependency) => dependency.id)
      setHighlightedTodoIds(new Set<number>(blockingTodoIds))
      window.setTimeout(() => {
        setHighlightedTodoIds(new Set<number>())
      }, 2000)
      return
    }

    if (blockOfflineMutation()) {
      return
    }

    const payload = createUpdatePayload(todo, { isCompleted: !todo.isCompleted })

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(t('errors.updateTodo'))
      }

      setTodos((prev) =>
        applyDoable(
          prev.map((item) => ({
            ...item,
            isCompleted: item.id === todo.id ? payload.isCompleted : item.isCompleted,
            dependencies: (item.dependencies ?? []).map((dependency) =>
              dependency.id === todo.id
                ? { ...dependency, isCompleted: payload.isCompleted }
                : dependency,
            ),
          })),
        ),
      )
    } catch (updateError) {
      console.error(updateError)
      setError(t('errors.updateTodoMessage'))
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleAddDependency = async (
    todo: Todo,
    dependsOnId: number,
  ): Promise<void> => {
    if (!dependsOnId) {
      return
    }

    if (blockOfflineMutation()) {
      return
    }

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todo.id}/dependencies/${dependsOnId}`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(t('errors.addDependency'))
      }

      setTodos((prev) => {
        const dependencyTodo = prev.find((item) => item.id === dependsOnId)
        if (!dependencyTodo) {
          return prev
        }

        const updated = prev.map((item) => {
          if (item.id !== todo.id) {
            return item
          }

          const existing = item.dependencies ?? []
          if (existing.some((dependency) => dependency.id === dependsOnId)) {
            return item
          }

          const nextDependencies = [...existing, buildDependencySummary(dependencyTodo)]
          return {
            ...item,
            dependencies: nextDependencies,
          }
        })

        return applyDoable(updated)
      })
    } catch (dependencyError) {
      console.error(dependencyError)
      setError(t('errors.addDependencyMessage'))
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleRemoveDependency = async (
    todo: Todo,
    dependsOnId: number,
  ): Promise<void> => {
    if (blockOfflineMutation()) {
      return
    }

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todo.id}/dependencies/${dependsOnId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(t('errors.removeDependency'))
      }

      setTodos((prev) => {
        const updated = prev.map((item) => {
          if (item.id !== todo.id) {
            return item
          }

          const nextDependencies = (item.dependencies ?? []).filter(
            (dependency) => dependency.id !== dependsOnId,
          )

          return {
            ...item,
            dependencies: nextDependencies,
          }
        })

        return applyDoable(updated)
      })
    } catch (dependencyError) {
      console.error(dependencyError)
      setError(t('errors.removeDependencyMessage'))
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleAddRelated = async (
    todo: Todo,
    relatedTodoId: number,
  ): Promise<void> => {
    if (!relatedTodoId) {
      return
    }

    if (blockOfflineMutation()) {
      return
    }

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todo.id}/related/${relatedTodoId}`, {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(t('errors.addRelated'))
      }

      await loadTodos()
    } catch (relatedError) {
      console.error(relatedError)
      setError(t('errors.addRelatedMessage'))
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleRemoveRelated = async (
    todo: Todo,
    relatedTodoId: number,
  ): Promise<void> => {
    if (blockOfflineMutation()) {
      return
    }

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todo.id}/related/${relatedTodoId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(t('errors.removeRelated'))
      }

      await loadTodos()
    } catch (relatedError) {
      console.error(relatedError)
      setError(t('errors.removeRelatedMessage'))
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleAddReminder = async (
    todo: Todo,
    payload: CreateReminderPayload,
  ): Promise<boolean> => {
    if (blockOfflineMutation()) {
      return false
    }

    setProcessing(todo.id, true)
    setError('')

    try {
      const requestBody =
        payload.type === 'beforeDeadline'
          ? {
              type: 0,
              offsetMinutes: payload.offsetMinutes ?? null,
              reminderDateTimeUtc: null,
            }
          : {
              type: 1,
              offsetMinutes: null,
              reminderDateTimeUtc: payload.reminderDateTimeUtc ?? null,
            }

      const response = await fetchWithAuth(`${API_BASE}/${todo.id}/reminders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        throw new Error(t('errors.addReminder'))
      }

      await loadTodos()
      return true
    } catch (reminderError) {
      console.error(reminderError)
      setError(t('errors.addReminderMessage'))
      return false
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleRemoveReminder = async (
    todo: Todo,
    reminderId: number,
  ): Promise<boolean> => {
    if (blockOfflineMutation()) {
      return false
    }

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todo.id}/reminders/${reminderId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(t('errors.removeReminder'))
      }

      await loadTodos()
      return true
    } catch (reminderError) {
      console.error(reminderError)
      setError(t('errors.removeReminderMessage'))
      return false
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleReparent = async (
    todo: Todo,
    nextParentId: number | null,
  ): Promise<void> => {
    const normalizedParentId = nextParentId ?? null
    const currentParentId = todo.parentId ?? null
    if (currentParentId === normalizedParentId) {
      return
    }

    if (blockOfflineMutation()) {
      return
    }

    const payload = createUpdatePayload(todo, { parentId: normalizedParentId })

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(t('errors.updateTodo'))
      }

      setTodos((prev) =>
        prev.map((item) =>
          item.id === todo.id ? { ...item, parentId: normalizedParentId } : item,
        ),
      )
    } catch (updateError) {
      console.error(updateError)
      setError(t('errors.updateTodoMessage'))
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleDragStart = (todoId: number): void => {
    if (processingIds.includes(todoId)) {
      return
    }

    setDraggingTodoId(todoId)
    setActiveDropTodoId(null)
    setActiveDropZone(null)
    setError('')
  }

  const handleDragEnd = (): void => {
    clearDragState()
  }

  const handleDragOverTodo = (todoId: number | null): void => {
    if (draggingTodoId === null) {
      return
    }

    setActiveDropTodoId(todoId)
    setActiveDropZone(null)
  }

  const handleDragOverZone = (afterTodoId: number | null, parentId: number | null): void => {
    if (draggingTodoId === null) {
      return
    }

    const draggedTodo = todos.find((todo) => todo.id === draggingTodoId)
    if (!draggedTodo || (draggedTodo.parentId ?? null) !== parentId) {
      setActiveDropZone(null)
      return
    }

    setActiveDropZone({ afterTodoId, parentId })
    setActiveDropTodoId(null)
  }

  const handleDropOnTodo = (targetTodoId: number): void => {
    if (draggingTodoId === null) {
      return
    }

    const draggedTodo = todos.find((todo) => todo.id === draggingTodoId)
    if (!draggedTodo || processingIds.includes(draggedTodo.id)) {
      clearDragState()
      return
    }

    const targetDescendants = descendantMap.get(draggedTodo.id) ?? new Set<number>()
    const isInvalidTarget = targetTodoId === draggedTodo.id || targetDescendants.has(targetTodoId)
    clearDragState()
    if (isInvalidTarget) {
      return
    }

    void handleReparent(draggedTodo, targetTodoId)
  }

  const handleDropOnZone = async (afterTodoId: number | null, parentId: number | null): Promise<void> => {
    if (draggingTodoId === null) {
      return
    }

    const draggedTodo = todos.find((todo) => todo.id === draggingTodoId)
    clearDragState()
    if (!draggedTodo || processingIds.includes(draggedTodo.id)) {
      return
    }

    if (blockOfflineMutation()) {
      return
    }

    const normalizedParentId = parentId ?? null
    if ((draggedTodo.parentId ?? null) !== normalizedParentId) {
      return
    }

    const sortedSiblings = todos
      .filter((todo) => (todo.parentId ?? null) === normalizedParentId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
    const draggedIndex = sortedSiblings.findIndex((todo) => todo.id === draggedTodo.id)
    if (draggedIndex === -1) {
      return
    }

    const currentPreviousTodoId = draggedIndex === 0 ? null : sortedSiblings[draggedIndex - 1].id
    if (afterTodoId === currentPreviousTodoId) {
      return
    }

    const siblingsWithoutDragged = sortedSiblings.filter((todo) => todo.id !== draggedTodo.id)
    const insertIndex =
      afterTodoId === null ? 0 : siblingsWithoutDragged.findIndex((todo) => todo.id === afterTodoId) + 1
    if (afterTodoId !== null && insertIndex === 0) {
      return
    }

    siblingsWithoutDragged.splice(insertIndex, 0, draggedTodo)
    const reorderPayload = siblingsWithoutDragged.map((todo, index) => ({
      id: todo.id,
      sortOrder: index * 10,
    }))

    try {
      const response = await fetchWithAuth(`${API_BASE}/reorder`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(reorderPayload),
      })

      if (!response.ok) {
        throw new Error(t('errors.updateTodo'))
      }

      setTodos((previous) =>
        previous.map((todo) => {
          const reordered = reorderPayload.find((item) => item.id === todo.id)
          return reordered ? { ...todo, sortOrder: reordered.sortOrder } : todo
        }),
      )
    } catch (updateError) {
      console.error(updateError)
      setError(t('errors.updateTodoMessage'))
    }
  }

  const handleAddSubtask = (todoId: number): void => {
    setEditingTodoId(null)
    setSelectedParentId(todoId)
    setShowCreateForm(true)
  }

  const handleToggleCollapsed = (todoId: number): void => {
    setCollapsedTodoIds((previous) => {
      const next = new Set(previous)
      if (next.has(todoId)) {
        next.delete(todoId)
      } else {
        next.add(todoId)
      }

      return next
    })
  }

  const handleToggleAllCollapsed = (): void => {
    if (parentTodoIds.length === 0) {
      return
    }

    setCollapsedTodoIds((previous) => {
      const allCollapsed = parentTodoIds.every((parentTodoId) => previous.has(parentTodoId))
      if (allCollapsed) {
        const next = new Set(previous)
        parentTodoIds.forEach((parentTodoId) => next.delete(parentTodoId))
        return next
      }

      const next = new Set(previous)
      parentTodoIds.forEach((parentTodoId) => next.add(parentTodoId))
      return next
    })
  }

  const handleStartEdit = (todo: Todo): void => {
    setEditingTodoId(todo.id)
    setSelectedParentId(todo.parentId ?? null)
    setShowCreateForm(true)
  }

  const handleNotificationReminderClick = useCallback(
    (reminder: HeaderReminderItem): void => {
      const todo = todos.find((candidate) => candidate.id === reminder.todoId)
      if (!todo) {
        return
      }

      handleStartEdit(todo)
    },
    [todos],
  )

  const handleToggleCreateForm = (): void => {
    setShowCreateForm((previous) => {
      if (previous) {
        setSelectedParentId(null)
        setEditingTodoId(null)
      } else {
        setSelectedParentId(null)
        setEditingTodoId(null)
      }

      return !previous
    })
  }

  const handleCloseCreateForm = (): void => {
    setShowCreateForm(false)
    setSelectedParentId(null)
    setEditingTodoId(null)
    setAttachmentError('')
    setUploadProgress({
      total: 0,
      completed: 0,
      currentFileName: null,
      isUploading: false,
    })
    setFormAttachments([])
  }

  const handleToggleSettingsView = (): void => {
    if (activeView === 'settings') {
      setActiveView('todos')
      return
    }

    setSettingsDraft(userSettings)
    setActiveView('settings')
  }

  const uploadAttachments = async (todoId: number, files: File[]): Promise<void> => {
    if (files.length === 0) {
      return
    }

    setAttachmentError('')
    setUploadProgress({
      total: files.length,
      completed: 0,
      currentFileName: files[0].name,
      isUploading: true,
    })

    let completed = 0

    try {
      for (const file of files) {
        if (file.size > MAX_UPLOAD_SIZE_BYTES) {
          throw new Error(t('errors.attachmentTooLarge'))
        }

        setUploadProgress((previous) => ({
          ...previous,
          currentFileName: file.name,
        }))

        const formData = new FormData()
        formData.append('file', file)

        const response = await fetchWithAuth(`${API_BASE}/${todoId}/attachments`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error(t('errors.uploadAttachment'))
        }

        const uploaded = (await response.json()) as UploadedAttachmentResponse
        setFormAttachments((previous) => [
          ...previous,
          {
            id: uploaded.id,
            fileName: uploaded.fileName,
            fileSize: uploaded.fileSize,
            uploadedAt: uploaded.uploadedAt,
            contentType: uploaded.contentType,
          },
        ])

        completed += 1
        setUploadProgress((previous) => ({
          ...previous,
          completed,
        }))
      }
    } catch (uploadError) {
      console.error(uploadError)
      setAttachmentError(t('errors.uploadAttachment'))
      throw uploadError
    } finally {
      setUploadProgress((previous) => ({
        ...previous,
        currentFileName: null,
        isUploading: false,
      }))
    }
  }

  const handleDownloadAttachment = async (
    todoId: number,
    attachment: AttachmentSummary,
  ): Promise<void> => {
    setProcessing(todoId, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todoId}/attachments/${attachment.id}`)
      if (!response.ok) {
        throw new Error(t('errors.downloadAttachment'))
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = attachment.fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
    } catch (downloadError) {
      console.error(downloadError)
      setError(t('errors.downloadAttachmentMessage'))
    } finally {
      setProcessing(todoId, false)
    }
  }

  const removeAttachmentFromState = (todoId: number, attachmentId: number): void => {
    setTodos((previous) =>
      previous.map((todo) =>
        todo.id === todoId
          ? { ...todo, attachments: todo.attachments.filter((attachment) => attachment.id !== attachmentId) }
          : todo,
      ),
    )
    setFormAttachments((previous) => previous.filter((attachment) => attachment.id !== attachmentId))
  }

  const handleDeleteAttachment = async (todoId: number, attachmentId: number): Promise<void> => {
    setProcessing(todoId, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todoId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(t('errors.deleteAttachment'))
      }

      removeAttachmentFromState(todoId, attachmentId)
    } catch (deleteError) {
      console.error(deleteError)
      setError(t('errors.deleteAttachmentMessage'))
    } finally {
      setProcessing(todoId, false)
    }
  }

  const handleDelete = async (todo: Todo): Promise<void> => {
    if (blockOfflineMutation()) {
      return
    }

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetchWithAuth(`${API_BASE}/${todo.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(t('errors.deleteTodo'))
      }

      setTodos((prev) => prev.filter((item) => item.id !== todo.id))
    } catch (deleteError) {
      console.error(deleteError)
      setError(t('errors.deleteTodoMessage'))
    } finally {
      setProcessing(todo.id, false)
    }
  }

  return (
    <div className="app">
      <Header
        onRefresh={loadTodos}
        isRefreshing={isLoading}
        onToggleSettingsView={handleToggleSettingsView}
        isSettingsView={activeView === 'settings'}
        userName={authUsername}
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
        reminders={headerReminders}
        hasReminderBadge={hasReminderBadge}
        onReminderClick={handleNotificationReminderClick}
        onDeleteReminder={(todoId, reminderId) => {
          const todo = todos.find((candidate) => candidate.id === todoId)
          if (todo) {
            void handleRemoveReminder(todo, reminderId)
          }
        }}
      />
      {isAuthenticated ? (
        <Toolbar
          ariaLabel={t('toolbar.ariaLabel')}
          collapseAllLabel={allParentsCollapsed ? t('toolbar.expandAll') : t('toolbar.collapseAll')}
          isAllCollapsed={allParentsCollapsed}
          isCollapseToggleDisabled={parentTodoIds.length === 0}
          onToggleAllCollapsed={activeView === 'todos' ? handleToggleAllCollapsed : undefined}
        >
          {activeView === 'todos' ? <FilterPanel filters={filters} onFilterChange={setFilters} /> : null}
        </Toolbar>
      ) : null}

      <section className="app-body">
        {!isAuthenticated ? (
          <AuthForm onAuthenticated={handleAuthenticated} />
        ) : null}

        {isAuthenticated && activeView === 'todos' && error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        {isAuthenticated && activeView === 'settings' ? (
          <section className="settings-panel" aria-live="polite">
            <h2 className="settings-title">{t('settings.title')}</h2>
            <p className="settings-description">{t('settings.description')}</p>
            {isSettingsLoading ? <p className="loading">{t('settings.loading')}</p> : null}
            {!isSettingsLoading ? (
              <form
                className="settings-form"
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSaveSettings()
                }}
              >
                <label className="todo-field-label" htmlFor="settings-language">
                  {t('settings.language')}
                </label>
                <select
                  id="settings-language"
                  className="todo-input"
                  value={settingsDraft.preferredLanguage}
                  onChange={(event) =>
                    setSettingsDraft((previous) => ({
                      ...previous,
                      preferredLanguage: normalizeLanguage(event.target.value),
                    }))
                  }
                  disabled={isSettingsSaving}
                >
                  <option value="en">English</option>
                  <option value="pl">Polski</option>
                </select>
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={settingsDraft.showCompletedOnStartup}
                    onChange={(event) =>
                      setSettingsDraft((previous) => ({
                        ...previous,
                        showCompletedOnStartup: event.target.checked,
                      }))
                    }
                    disabled={isSettingsSaving}
                  />
                  <span>{t('settings.showCompletedOnStartup')}</span>
                </label>
                <div>
                  <p className="todo-field-label">{t('settings.defaultReminders')}</p>
                  <p className="settings-reminder-help">{t('settings.defaultRemindersHelp')}</p>
                  <div className="settings-reminder-chips" role="group" aria-label={t('settings.defaultReminders')}>
                    {DEFAULT_REMINDER_OFFSET_PRESETS.map((preset) => {
                      const isActive = settingsDraft.defaultReminderOffsets.includes(preset.minutes)
                      return (
                        <button
                          key={preset.minutes}
                          type="button"
                          className={`reminder-chip ${isActive ? 'is-active' : ''}`}
                          onClick={() => handleDefaultReminderOffsetToggle(preset.minutes)}
                          disabled={isSettingsSaving}
                          aria-pressed={isActive}
                        >
                          {t(preset.labelKey)}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {isPushSupported ? (
                  <>
                    <p className="todo-field-label">{t('settings.pushNotifications')}</p>
                    <label className="settings-checkbox">
                      <input
                        type="checkbox"
                        checked={pushEnabled}
                        onChange={(event) => {
                          void handlePushToggle(event.target.checked)
                        }}
                        disabled={isSettingsSaving || isPushUpdating || pushPermission === 'denied'}
                      />
                      <span>{t('settings.pushEnabled')}</span>
                    </label>
                    {pushPermission === 'denied' ? (
                      <p className="form-error" role="alert">
                        {t('settings.pushDenied')}
                      </p>
                    ) : null}
                  </>
                ) : null}
                {settingsError ? (
                  <p className="form-error" role="alert">
                    {settingsError}
                  </p>
                ) : null}
                <div className="settings-actions">
                  <button className="primary-button" type="submit" disabled={isSettingsSaving}>
                    {isSettingsSaving ? t('settings.saving') : t('settings.save')}
                  </button>
                </div>
              </form>
            ) : null}
          </section>
        ) : null}

        {isAuthenticated && activeView === 'todos' ? (
          <Modal
            isOpen={showCreateForm}
            title={editingTodo ? t('modal.editTodo') : t('modal.createTodo')}
            onClose={handleCloseCreateForm}
          >
            <AddTodoForm
              onSubmit={handleSubmitTodo}
              isSubmitting={isSubmitting}
              parentId={selectedParentId}
              parentName={selectedParentName}
              onParentChange={setSelectedParentId}
              attachments={formAttachments}
              uploadProgress={uploadProgress}
              attachmentError={attachmentError}
              maxFileSizeBytes={MAX_UPLOAD_SIZE_BYTES}
              onAttachmentDeleted={(attachmentId) => {
                if (editingTodo) {
                  removeAttachmentFromState(editingTodo.id, attachmentId)
                }
              }}
              onCancel={handleCloseCreateForm}
              isEditMode={Boolean(editingTodo)}
              dependencies={editingTodo?.dependencies ?? []}
              relatedTodos={editingTodo?.relatedTodos ?? []}
              reminders={editingTodo?.reminders ?? []}
              onAddDependency={editingTodo ? (id) => void handleAddDependency(editingTodo, id) : undefined}
              onRemoveDependency={editingTodo ? (id) => void handleRemoveDependency(editingTodo, id) : undefined}
              onAddRelated={editingTodo ? (id) => void handleAddRelated(editingTodo, id) : undefined}
              onRemoveRelated={editingTodo ? (id) => void handleRemoveRelated(editingTodo, id) : undefined}
              onAddReminder={
                editingTodo
                  ? (payload) => handleAddReminder(editingTodo, payload)
                  : undefined
              }
              onRemoveReminder={
                editingTodo
                  ? (reminderId) => handleRemoveReminder(editingTodo, reminderId)
                  : undefined
              }
              initialDraft={
                editingTodo
                  ? {
                      id: editingTodo.id,
                      name: editingTodo.name,
                      description: editingTodo.description ?? '',
                      deadline: editingTodo.deadline ?? '',
                      notes: editingTodo.notes ?? '',
                      tags: editingTodo.tags,
                    }
                  : undefined
              }
            />
          </Modal>
        ) : null}

        {isAuthenticated && activeView === 'todos' && isLoading ? (
          <p className="loading">{t('app.loading')}</p>
        ) : null}

        {isAuthenticated && activeView === 'todos' && !isLoading ? (
          <TodoList
            todos={visibleRoots}
            descendantMap={descendantMap}
            collapsedTodoIds={collapsedTodoIds}
            highlightedTodoIds={highlightedTodoIds}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onEdit={handleReparent}
            onStartEdit={handleStartEdit}
            onAddSubtask={handleAddSubtask}
            onToggleCollapsed={handleToggleCollapsed}
            onDownloadAttachment={handleDownloadAttachment}
            onDeleteAttachment={handleDeleteAttachment}
            draggingTodoId={draggingTodoId}
            activeDropTodoId={activeDropTodoId}
            activeDropZone={activeDropZone}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOverTodo={handleDragOverTodo}
            onDropOnTodo={handleDropOnTodo}
            onDragOverZone={handleDragOverZone}
            onDropOnZone={(afterTodoId, parentId) => void handleDropOnZone(afterTodoId, parentId)}
            onClearDropTargets={clearDropTargets}
            processingIds={processingIds}
          />
        ) : null}
      </section>
      {isAuthenticated && activeView === 'todos' ? (
        <button
          className={`floating-create-button${showCreateForm ? ' is-active' : ''}`}
          type="button"
          onClick={handleToggleCreateForm}
          aria-pressed={showCreateForm}
          aria-label={
            showCreateForm ? t('buttons.closeCreateModalAria') : t('buttons.openCreateModalAria')
          }
        >
          <span className="floating-create-button-icon" aria-hidden="true">
            {showCreateForm ? '×' : '+'}
          </span>
          <span>{showCreateForm ? t('buttons.cancel') : t('buttons.create')}</span>
        </button>
      ) : null}
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}

export default App
