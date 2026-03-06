import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = '/api/todos'

const parseParentId = (value) => {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

const normalizeText = (value) => {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const deriveDoable = (dependencies) => {
  if (!dependencies || dependencies.length === 0) {
    return true
  }

  return dependencies.every((dependency) => dependency.isCompleted)
}

const buildDependencySummary = (todo) => ({
  id: todo.id,
  name: todo.name,
  isCompleted: todo.isCompleted,
})

const hydrateTodo = (todo) => {
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
  }
}

const applyDoable = (items) =>
  items.map((todo) => ({
    ...todo,
    dependencies: todo.dependencies ?? [],
    doable: deriveDoable(todo.dependencies ?? []),
  }))

const formatDeadline = (deadline) => {
  if (!deadline) {
    return null
  }

  const date = new Date(deadline)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const buildTodoHierarchy = (items) => {
  const nodes = items.map((todo) => ({ ...todo, children: [] }))
  const nodeMap = new Map(nodes.map((todo) => [todo.id, todo]))
  const roots = []

  nodes.forEach((node) => {
    const parentId = node.parentId ?? null
    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId).children.push(node)
    } else {
      roots.push(node)
    }
  })

  const descendantMap = new Map()

  const collectDescendants = (node) => {
    const descendants = new Set()
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
      descendantMap.set(node.id, new Set())
    }
  })

  return { roots, descendantMap }
}

function App() {
  const [todos, setTodos] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processingIds, setProcessingIds] = useState([])
  const [error, setError] = useState('')
  const [selectedParentId, setSelectedParentId] = useState(null)

  const loadTodos = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(API_BASE)
      if (!response.ok) {
        throw new Error('Failed to fetch todos.')
      }

      const data = await response.json()
      const normalized = Array.isArray(data) ? data.map(hydrateTodo) : []
      setTodos(normalized)
    } catch (loadError) {
      console.error(loadError)
      setError('Unable to load todos right now. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadTodos()
  }, [])

  const { roots, descendantMap } = useMemo(() => buildTodoHierarchy(todos), [todos])
  const parentOptions = useMemo(
    () => todos.map((todo) => ({ id: todo.id, name: todo.name })),
    [todos],
  )

  const setProcessing = (id, isProcessing) => {
    setProcessingIds((prev) => {
      if (isProcessing) {
        return prev.includes(id) ? prev : [...prev, id]
      }

      return prev.filter((value) => value !== id)
    })
  }

  const handleAdd = async (todoDraft) => {
    setIsSubmitting(true)
    setError('')

    try {
      const payload = {
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
        throw new Error('Failed to create todo.')
      }

      const created = await response.json()
      const hydrated = hydrateTodo(created)
      setTodos((prev) => [hydrated, ...prev])
      return true
    } catch (createError) {
      console.error(createError)
      setError('Unable to add todo. Please try again.')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const createUpdatePayload = (todo, overrides = {}) => ({
    name: todo.name,
    description: todo.description ?? null,
    deadline: todo.deadline ?? null,
    notes: todo.notes ?? null,
    parentId: todo.parentId ?? null,
    isCompleted: todo.isCompleted,
    ...overrides,
  })

  const handleToggle = async (todo) => {
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
        throw new Error('Failed to update todo.')
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
      setError('Unable to update todo. Please try again.')
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleAddDependency = async (todo, dependsOnId) => {
    if (!dependsOnId) {
      return
    }

    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetch(
        `${API_BASE}/${todo.id}/dependencies/${dependsOnId}`,
        {
          method: 'POST',
        },
      )

      if (!response.ok) {
        throw new Error('Failed to add dependency.')
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
      setError('Unable to add dependency. Please try again.')
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleRemoveDependency = async (todo, dependsOnId) => {
    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetch(
        `${API_BASE}/${todo.id}/dependencies/${dependsOnId}`,
        {
          method: 'DELETE',
        },
      )

      if (!response.ok) {
        throw new Error('Failed to remove dependency.')
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
      setError('Unable to remove dependency. Please try again.')
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleReparent = async (todo, nextParentId) => {
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
        throw new Error('Failed to update todo.')
      }

      setTodos((prev) =>
        prev.map((item) =>
          item.id === todo.id ? { ...item, parentId: normalizedParentId } : item,
        ),
      )
    } catch (updateError) {
      console.error(updateError)
      setError('Unable to update todo. Please try again.')
    } finally {
      setProcessing(todo.id, false)
    }
  }

  const handleAddSubtask = (todoId) => {
    setSelectedParentId(todoId)
  }

  const handleDelete = async (todo) => {
    setProcessing(todo.id, true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/${todo.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete todo.')
      }

      setTodos((prev) => prev.filter((item) => item.id !== todo.id))
    } catch (deleteError) {
      console.error(deleteError)
      setError('Unable to delete todo. Please try again.')
    } finally {
      setProcessing(todo.id, false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Todo App</h1>
          <p className="app-subtitle">Track tasks and stay organized.</p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={loadTodos}
          disabled={isLoading}
        >
          Refresh
        </button>
      </header>

      <section className="app-body">
        {error ? (
          <div className="alert" role="alert">
            {error}
          </div>
        ) : null}

        <AddTodo
          onAdd={handleAdd}
          isSubmitting={isSubmitting}
          parentOptions={parentOptions}
          parentId={selectedParentId}
          onParentChange={setSelectedParentId}
        />

        {isLoading ? (
          <p className="loading">Loading todos...</p>
        ) : todos.length === 0 ? (
          <p className="empty-state">No todos yet. Add your first task above.</p>
        ) : (
          <TodoList
            roots={roots}
            allTodos={todos}
            descendantMap={descendantMap}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onReparent={handleReparent}
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

function AddTodo({ onAdd, isSubmitting, parentOptions, parentId, onParentChange }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmed = name.trim()

    if (!trimmed) {
      setFormError('Please enter a task name.')
      return
    }

    setFormError('')
    const didCreate = await onAdd({
      name: trimmed,
      description,
      deadline,
      notes,
      parentId,
    })

    if (didCreate) {
      setName('')
      setDescription('')
      setDeadline('')
      setNotes('')
    }
  }

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <label className="todo-label" htmlFor="todo-name">
        New task
      </label>
      <div className="todo-controls">
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-name">
            Task name
          </label>
          <input
            id="todo-name"
            className="todo-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Task name"
            disabled={isSubmitting}
            required
          />
        </div>
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-deadline">
            Deadline
          </label>
          <input
            id="todo-deadline"
            className="todo-input"
            type="date"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            disabled={isSubmitting}
          />
        </div>
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-parent">
            Parent task
          </label>
          <select
            id="todo-parent"
            className="todo-input todo-select"
            value={parentId ? String(parentId) : ''}
            onChange={(event) => onParentChange(parseParentId(event.target.value))}
            disabled={isSubmitting}
          >
            <option value="">No parent (top-level)</option>
            {parentOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="todo-controls todo-controls--stacked">
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-description">
            Description
          </label>
          <textarea
            id="todo-description"
            className="todo-input todo-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
            rows={3}
            disabled={isSubmitting}
          />
        </div>
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-notes">
            Notes
          </label>
          <textarea
            id="todo-notes"
            className="todo-input todo-textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            disabled={isSubmitting}
          />
        </div>
      </div>
      <div className="todo-controls">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding...' : 'Add'}
        </button>
      </div>
      {formError ? <p className="form-error">{formError}</p> : null}
    </form>
  )
}

function TodoList({
  roots,
  allTodos,
  descendantMap,
  onToggle,
  onDelete,
  onReparent,
  onAddSubtask,
  onAddDependency,
  onRemoveDependency,
  processingIds,
}) {
  return (
    <ul className="todo-list">
      {roots.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
          onReparent={onReparent}
          onAddSubtask={onAddSubtask}
          onAddDependency={onAddDependency}
          onRemoveDependency={onRemoveDependency}
          allTodos={allTodos}
          descendantMap={descendantMap}
          isProcessing={processingIds.includes(todo.id)}
          processingIds={processingIds}
          depth={0}
        />
      ))}
    </ul>
  )
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
  onReparent,
  onAddSubtask,
  onAddDependency,
  onRemoveDependency,
  allTodos,
  descendantMap,
  isProcessing,
  processingIds,
  depth,
}) {
  const formattedDeadline = formatDeadline(todo.deadline)
  const invalidParents = descendantMap.get(todo.id) ?? new Set()
  const availableParents = allTodos.filter(
    (option) =>
      option.id !== todo.id &&
      (!invalidParents.has(option.id) || option.id === todo.parentId),
  )
  const dependencyOptions = allTodos.filter(
    (option) =>
      option.id !== todo.id &&
      !(todo.dependencies ?? []).some((dependency) => dependency.id === option.id),
  )
  const [selectedDependencyId, setSelectedDependencyId] = useState('')
  const isBlocked = !todo.doable && !todo.isCompleted
  const isEditLocked = isProcessing || isBlocked

  return (
    <li className="todo-node">
      <div
        className={`todo-item${todo.isCompleted ? ' is-completed' : ''}${
          depth > 0 ? ' todo-item--subtask' : ''
        }`}
      >
        <button
          className={`todo-toggle${todo.isCompleted ? ' is-completed' : ''}`}
          type="button"
          onClick={() => onToggle(todo)}
          disabled={isEditLocked}
          aria-pressed={todo.isCompleted}
          aria-label={todo.isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
        >
          {todo.isCompleted ? '✓' : ''}
        </button>
        <div className="todo-content">
          <div className="todo-header">
            <span className="todo-title">{todo.name}</span>
            <span
              className={`todo-badge${
                todo.doable ? ' todo-badge--doable' : ' todo-badge--blocked'
              }`}
            >
              {todo.doable ? 'Doable' : 'Blocked'}
            </span>
          </div>
          <div className="todo-meta">
            {todo.description ? (
              <p className="todo-detail">
                <span className="todo-detail-label">Description:</span> {todo.description}
              </p>
            ) : null}
            {formattedDeadline ? (
              <p className="todo-detail">
                <span className="todo-detail-label">Deadline:</span> {formattedDeadline}
              </p>
            ) : null}
            {todo.notes ? (
              <p className="todo-detail">
                <span className="todo-detail-label">Notes:</span> {todo.notes}
              </p>
            ) : null}
            <div className="todo-dependencies">
              <p className="todo-detail">
                <span className="todo-detail-label">Dependencies:</span>{' '}
                {(todo.dependencies ?? []).length === 0 ? 'None' : ''}
              </p>
              {(todo.dependencies ?? []).length > 0 ? (
                <ul className="dependency-list">
                  {todo.dependencies.map((dependency) => (
                    <li
                      key={dependency.id}
                      className={`dependency-item${
                        dependency.isCompleted ? ' is-completed' : ''
                      }`}
                    >
                      <span>{dependency.name}</span>
                      <span
                        className={`dependency-status${
                          dependency.isCompleted ? ' is-completed' : ''
                        }`}
                      >
                        {dependency.isCompleted ? 'Complete' : 'Pending'}
                      </span>
                      <button
                        className="dependency-remove"
                        type="button"
                        onClick={() => onRemoveDependency(todo, dependency.id)}
                        disabled={isProcessing}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {isBlocked ? (
                <p className="todo-helper">Complete dependencies to start this task.</p>
              ) : null}
            </div>
          </div>
          <div className="todo-actions">
            <div className="todo-field todo-field--compact">
              <label className="todo-field-label" htmlFor={`todo-parent-${todo.id}`}>
                Parent
              </label>
              <select
                id={`todo-parent-${todo.id}`}
                className="todo-input todo-select"
                value={todo.parentId ? String(todo.parentId) : ''}
                onChange={(event) => onReparent(todo, parseParentId(event.target.value))}
                disabled={isEditLocked}
              >
                <option value="">No parent</option>
                {availableParents.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="todo-field todo-field--compact">
              <label
                className="todo-field-label"
                htmlFor={`todo-dependency-${todo.id}`}
              >
                Add dependency
              </label>
              <div className="todo-dependency-controls">
                <select
                  id={`todo-dependency-${todo.id}`}
                  className="todo-input todo-select"
                  value={selectedDependencyId}
                  onChange={(event) => setSelectedDependencyId(event.target.value)}
                  disabled={isProcessing}
                >
                  <option value="">Select todo</option>
                  {dependencyOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    const parsed = parseParentId(selectedDependencyId)
                    if (parsed !== null) {
                      onAddDependency(todo, parsed)
                      setSelectedDependencyId('')
                    }
                  }}
                  disabled={isProcessing || !selectedDependencyId}
                >
                  Add
                </button>
              </div>
            </div>
            <button
              className="todo-subtask"
              type="button"
              onClick={() => onAddSubtask(todo.id)}
              disabled={isEditLocked}
            >
              Add subtask
            </button>
          </div>
        </div>
        <button
          className="todo-delete"
          type="button"
          onClick={() => onDelete(todo)}
          disabled={isProcessing}
        >
          Delete
        </button>
      </div>
      {todo.children.length > 0 ? (
        <ul className="todo-children">
          {todo.children.map((child) => (
            <TodoItem
              key={child.id}
              todo={child}
              onToggle={onToggle}
              onDelete={onDelete}
              onReparent={onReparent}
              onAddSubtask={onAddSubtask}
              onAddDependency={onAddDependency}
              onRemoveDependency={onRemoveDependency}
              allTodos={allTodos}
              descendantMap={descendantMap}
              isProcessing={processingIds.includes(child.id)}
              processingIds={processingIds}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default App
