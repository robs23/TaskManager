import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import AddTodoForm from './components/AddTodoForm'
import type { ParentOption, TodoDraft } from './components/AddTodoForm'
import Header from './components/Header'
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
  isCompleted: boolean
  createdAt: string
  parentId: number | null
  doable?: boolean
  dependencies?: TodoDependencySummary[]
}

interface Todo extends Omit<TodoApiResponse, 'dependencies'> {
  doable: boolean
  dependencies: TodoDependencySummary[]
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

  return {
    ...todo,
    dependencies,
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

  const handleAdd = async (todoDraft: TodoDraft): Promise<boolean> => {
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
      const hydrated = hydrateTodo(created)
      setTodos((prev) => [hydrated, ...prev])
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
    setSelectedParentId(todoId)
    setShowCreateForm(true)
  }

  const handleToggleCreateForm = (): void => {
    setShowCreateForm((previous) => {
      const next = !previous
      if (!next) {
        setSelectedParentId(null)
      }

      return next
    })
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

      <section className="app-body">
        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        {showCreateForm ? (
          <section className="todo-form-container" aria-label={t('buttons.create')}>
            <AddTodoForm
              onAdd={handleAdd}
              isSubmitting={isSubmitting}
              parentOptions={parentOptions}
              parentId={selectedParentId}
              onParentChange={setSelectedParentId}
              onCancel={handleToggleCreateForm}
            />
          </section>
        ) : null}

        {isLoading ? (
          <p className="loading">{t('app.loading')}</p>
        ) : (
          <TodoList
            todos={roots}
            allTodos={todos}
            descendantMap={descendantMap}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onEdit={handleReparent}
            onAddSubtask={handleAddSubtask}
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
