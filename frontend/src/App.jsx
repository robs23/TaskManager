import { useEffect, useState } from 'react'
import './App.css'

const API_BASE = '/api/todos'

function App() {
  const [todos, setTodos] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [processingIds, setProcessingIds] = useState([])
  const [error, setError] = useState('')

  const loadTodos = async () => {
    setIsLoading(true)
    setError('')

    try {
      const response = await fetch(API_BASE)
      if (!response.ok) {
        throw new Error('Failed to fetch todos.')
      }

      const data = await response.json()
      setTodos(Array.isArray(data) ? data : [])
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

  const setProcessing = (id, isProcessing) => {
    setProcessingIds((prev) => {
      if (isProcessing) {
        return prev.includes(id) ? prev : [...prev, id]
      }

      return prev.filter((value) => value !== id)
    })
  }

  const handleAdd = async (title) => {
    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title }),
      })

      if (!response.ok) {
        throw new Error('Failed to create todo.')
      }

      const created = await response.json()
      setTodos((prev) => [created, ...prev])
      return true
    } catch (createError) {
      console.error(createError)
      setError('Unable to add todo. Please try again.')
      return false
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggle = async (todo) => {
    const payload = {
      title: todo.title,
      isCompleted: !todo.isCompleted,
    }

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
          item.id === todo.id ? { ...item, isCompleted: payload.isCompleted } : item,
        ),
      )
    } catch (updateError) {
      console.error(updateError)
      setError('Unable to update todo. Please try again.')
    } finally {
      setProcessing(todo.id, false)
    }
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

        <AddTodo onAdd={handleAdd} isSubmitting={isSubmitting} />

        {isLoading ? (
          <p className="loading">Loading todos...</p>
        ) : todos.length === 0 ? (
          <p className="empty-state">No todos yet. Add your first task above.</p>
        ) : (
          <TodoList
            todos={todos}
            onToggle={handleToggle}
            onDelete={handleDelete}
            processingIds={processingIds}
          />
        )}
      </section>
    </div>
  )
}

function AddTodo({ onAdd, isSubmitting }) {
  const [title, setTitle] = useState('')
  const [formError, setFormError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    const trimmed = title.trim()

    if (!trimmed) {
      setFormError('Please enter a task title.')
      return
    }

    setFormError('')
    const didCreate = await onAdd(trimmed)

    if (didCreate) {
      setTitle('')
    }
  }

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <label className="todo-label" htmlFor="todo-title">
        New task
      </label>
      <div className="todo-controls">
        <input
          id="todo-title"
          className="todo-input"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="What needs to get done?"
          disabled={isSubmitting}
        />
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Adding...' : 'Add'}
        </button>
      </div>
      {formError ? <p className="form-error">{formError}</p> : null}
    </form>
  )
}

function TodoList({ todos, onToggle, onDelete, processingIds }) {
  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
          isProcessing={processingIds.includes(todo.id)}
        />
      ))}
    </ul>
  )
}

function TodoItem({ todo, onToggle, onDelete, isProcessing }) {
  return (
    <li className={`todo-item${todo.isCompleted ? ' is-completed' : ''}`}>
      <button
        className={`todo-toggle${todo.isCompleted ? ' is-completed' : ''}`}
        type="button"
        onClick={() => onToggle(todo)}
        disabled={isProcessing}
        aria-pressed={todo.isCompleted}
        aria-label={todo.isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {todo.isCompleted ? '✓' : ''}
      </button>
      <span className="todo-title">{todo.title}</span>
      <button
        className="todo-delete"
        type="button"
        onClick={() => onDelete(todo)}
        disabled={isProcessing}
      >
        Delete
      </button>
    </li>
  )
}

export default App
