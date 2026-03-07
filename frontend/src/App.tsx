import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import AddTodoForm from './components/AddTodoForm'
import type { ParentOption, TodoDraft } from './components/AddTodoForm'
import Header from './components/Header'
import Modal from './components/Modal'
import Toolbar from './components/Toolbar'
import TodoList from './components/TodoList'

const API_BASE = '/api/todos'

interface TodoDependencySummary {
  id: number
  name: string
  isCompleted: boolean
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
}

interface Todo extends Omit<TodoApiResponse, 'dependencies'> {
  doable: boolean
  dependencies: TodoDependencySummary[]
  tags: string[]
  children: Todo[]
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

  return {
    ...todo,
    dependencies,
    tags,
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

function App() {
  const { t } = useTranslation()
  const [todos, setTodos] = useState<Todo[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [processingIds, setProcessingIds] = useState<number[]>([])
  const [error, setError] = useState<string>('')
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null)
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false)
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null)
  const [collapsedTodoIds, setCollapsedTodoIds] = useState<Set<number>>(new Set<number>())

  const loadTodos = async (): Promise<void> => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(API_BASE)
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
  }, [])

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
  const parentOptions = useMemo<ParentOption[]>(
    () => todos.map((todo) => ({ id: todo.id, name: todo.name })),
    [todos],
  )

  const setProcessing = (id: number, isProcessing: boolean): void => {
    setProcessingIds((prev) => {
      if (isProcessing) {
        return prev.includes(id) ? prev : [...prev, id]
      }

      return prev.filter((value) => value !== id)
    })
  }

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
          fetch(`${API_BASE}/${todoId}/tags`, {
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
          fetch(`${API_BASE}/${todoId}/tags/${encodeURIComponent(tag)}`, {
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

      const response = await fetch(API_BASE, {
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
      setEditingTodoId(null)
      setShowCreateForm(false)
      setSelectedParentId(null)
      await loadTodos()
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

      const response = await fetch(`${API_BASE}/${targetTodo.id}`, {
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
      setEditingTodoId(null)
      setShowCreateForm(false)
      setSelectedParentId(null)
      await loadTodos()
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
      return
    }

    const payload = createUpdatePayload(todo, { isCompleted: !todo.isCompleted })

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/${todo.id}`, {
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
      const response = await fetch(`${API_BASE}/${todo.id}/dependencies/${dependsOnId}`, {
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
      const response = await fetch(`${API_BASE}/${todo.id}/dependencies/${dependsOnId}`, {
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
      const response = await fetch(`${API_BASE}/${todo.id}`, {
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
  }

  const handleDelete = async (todo: Todo): Promise<void> => {
    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/${todo.id}`, {
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
      />
      <Toolbar
        ariaLabel={t('toolbar.ariaLabel')}
        collapseAllLabel={allParentsCollapsed ? t('toolbar.expandAll') : t('toolbar.collapseAll')}
        isAllCollapsed={allParentsCollapsed}
        isCollapseToggleDisabled={parentTodoIds.length === 0}
        onToggleAllCollapsed={handleToggleAllCollapsed}
      />

      <section className="app-body">
        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        <Modal
          isOpen={showCreateForm}
          title={editingTodo ? t('modal.editTodo') : t('modal.createTodo')}
          onClose={handleCloseCreateForm}
        >
          <AddTodoForm
            onSubmit={handleSubmitTodo}
            isSubmitting={isSubmitting}
            parentOptions={parentOptions}
            parentId={selectedParentId}
            onParentChange={setSelectedParentId}
            onCancel={handleCloseCreateForm}
            isEditMode={Boolean(editingTodo)}
            initialDraft={
              editingTodo
                ? {
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

        {isLoading ? (
          <p className="loading">{t('app.loading')}</p>
        ) : (
          <TodoList
            todos={roots}
            allTodos={todos}
            descendantMap={descendantMap}
            collapsedTodoIds={collapsedTodoIds}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onEdit={handleReparent}
            onStartEdit={handleStartEdit}
            onAddSubtask={handleAddSubtask}
            onToggleCollapsed={handleToggleCollapsed}
            onAddDependency={handleAddDependency}
            onRemoveDependency={handleRemoveDependency}
            processingIds={processingIds}
          />
        )}
      </section>
    </div>
  )
}

export default App
