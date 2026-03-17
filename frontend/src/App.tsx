import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import AddTodoForm from './components/AddTodoForm'
import type { TodoDraft } from './components/AddTodoForm'
import AuthForm from './components/AuthForm'
import Header from './components/Header'
import Modal from './components/Modal'
import { FilterPanel, type FilterState } from './components/FilterPanel'
import Toast from './components/Toast'
import Toolbar from './components/Toolbar'
import TodoList from './components/TodoList'
import { fetchWithAuth } from './api/fetchWithAuth'

const API_BASE = '/api/todos'
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024

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

interface UploadedAttachmentResponse extends AttachmentSummary {
  todoId: number
}

interface TodoApiResponse {
  id: number
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
}

interface Todo extends Omit<TodoApiResponse, 'dependencies' | 'relatedTodos'> {
  doable: boolean
  dependencies: TodoDependencySummary[]
  relatedTodos: TodoRelatedSummary[]
  tags: string[]
  attachments: AttachmentSummary[]
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

const normalizeText = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const normalizeTag = (value: string): string => value.trim().toLowerCase()

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

  return {
    ...todo,
    dependencies,
    relatedTodos,
    tags,
    attachments,
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
  const { t } = useTranslation()
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
  const [isRootDropActive, setIsRootDropActive] = useState<boolean>(false)
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
  const [highlightedTodoIds, setHighlightedTodoIds] = useState<Set<number>>(new Set<number>())
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

  const handleAuthenticated = (token: string, username: string): void => {
    localStorage.setItem('token', token)
    localStorage.setItem('username', username)
    setAuthToken(token)
    setAuthUsername(username)
    setError('')
  }

  const handleLogout = (): void => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    window.location.reload()
  }

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
  const visibleRoots = useMemo(() => filterTodoHierarchy(roots, filters), [roots, filters])

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
    setIsRootDropActive(false)
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

  const handleCreate = async (todoDraft: TodoDraft): Promise<boolean> => {
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

  const handleReparent = async (
    todo: Todo,
    nextParentId: number | null,
  ): Promise<void> => {
    const normalizedParentId = nextParentId ?? null
    const currentParentId = todo.parentId ?? null
    if (currentParentId === normalizedParentId) {
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
    setIsRootDropActive(false)
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
    setIsRootDropActive(false)
  }

  const handleDragOverRoot = (): void => {
    if (draggingTodoId === null) {
      return
    }

    setActiveDropTodoId(null)
    setIsRootDropActive(true)
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

  const handleDropOnRoot = (): void => {
    if (draggingTodoId === null) {
      return
    }

    const draggedTodo = todos.find((todo) => todo.id === draggingTodoId)
    clearDragState()
    if (!draggedTodo || processingIds.includes(draggedTodo.id)) {
      return
    }

    void handleReparent(draggedTodo, null)
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
        onToggleCreate={handleToggleCreateForm}
        isCreateVisible={showCreateForm}
        userName={authUsername}
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
      />
      {isAuthenticated ? (
        <Toolbar
          ariaLabel={t('toolbar.ariaLabel')}
          collapseAllLabel={allParentsCollapsed ? t('toolbar.expandAll') : t('toolbar.collapseAll')}
          isAllCollapsed={allParentsCollapsed}
          isCollapseToggleDisabled={parentTodoIds.length === 0}
          onToggleAllCollapsed={handleToggleAllCollapsed}
        >
          <FilterPanel filters={filters} onFilterChange={setFilters} />
        </Toolbar>
      ) : null}

      <section className="app-body">
        {!isAuthenticated ? (
          <AuthForm onAuthenticated={handleAuthenticated} />
        ) : null}

        {isAuthenticated && error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        {isAuthenticated ? (
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

        {isAuthenticated && isLoading ? (
          <p className="loading">{t('app.loading')}</p>
        ) : null}

        {isAuthenticated && !isLoading ? (
          <TodoList
            todos={visibleRoots}
            allTodos={todos}
            descendantMap={descendantMap}
            collapsedTodoIds={collapsedTodoIds}
            highlightedTodoIds={highlightedTodoIds}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onEdit={handleReparent}
            onStartEdit={handleStartEdit}
            onAddSubtask={handleAddSubtask}
            onToggleCollapsed={handleToggleCollapsed}
            onAddDependency={handleAddDependency}
            onRemoveDependency={handleRemoveDependency}
            onAddRelated={handleAddRelated}
            onRemoveRelated={handleRemoveRelated}
            onDownloadAttachment={handleDownloadAttachment}
            onDeleteAttachment={handleDeleteAttachment}
            draggingTodoId={draggingTodoId}
            activeDropTodoId={activeDropTodoId}
            isRootDropActive={isRootDropActive}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOverTodo={handleDragOverTodo}
            onDropOnTodo={handleDropOnTodo}
            onDragOverRoot={handleDragOverRoot}
            onDropOnRoot={handleDropOnRoot}
            onClearDropTargets={clearDropTargets}
            processingIds={processingIds}
          />
        ) : null}
      </section>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}

export default App
