import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface TodoDependencySummary {
  id: number
  name: string
  isCompleted: boolean
}

export interface Todo {
  id: number
  name: string
  description: string | null
  deadline: string | null
  notes: string | null
  isCompleted: boolean
  createdAt: string
  parentId: number | null
  doable: boolean
  dependencies: TodoDependencySummary[]
  children: Todo[]
}

export interface TodoItemProps {
  todo: Todo
  allTodos: Todo[]
  descendantMap: Map<number, Set<number>>
  onToggle: (todo: Todo) => Promise<void>
  onDelete: (todo: Todo) => Promise<void>
  onEdit: (todo: Todo, nextParentId: number | null) => Promise<void>
  onAddSubtask: (todoId: number) => void
  onAddDependency: (todo: Todo, dependsOnId: number) => Promise<void>
  onRemoveDependency: (todo: Todo, dependsOnId: number) => Promise<void>
  isProcessing: boolean
  processingIds: number[]
  depth: number
}

const parseParentId = (value: string): number | null => {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
  onEdit,
  onAddSubtask,
  onAddDependency,
  onRemoveDependency,
  allTodos,
  descendantMap,
  isProcessing,
  processingIds,
  depth,
}: TodoItemProps) {
  const { t } = useTranslation()
  const [selectedDependencyId, setSelectedDependencyId] = useState<string>('')
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const invalidParents = descendantMap.get(todo.id) ?? new Set<number>()
  const availableParents = allTodos.filter(
    (option) => option.id !== todo.id && (!invalidParents.has(option.id) || option.id === todo.parentId),
  )
  const dependencyOptions = allTodos.filter(
    (option) =>
      option.id !== todo.id &&
      !(todo.dependencies ?? []).some((dependency) => dependency.id === option.id),
  )
  const isBlocked = !todo.doable && !todo.isCompleted
  const isToggleLocked = isProcessing || isBlocked

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
          onClick={() => void onToggle(todo)}
          disabled={isToggleLocked}
          aria-pressed={todo.isCompleted}
          aria-label={
            todo.isCompleted ? t('todoItem.markAsIncomplete') : t('todoItem.markAsComplete')
          }
          title={todo.isCompleted ? t('todoItem.markAsIncomplete') : t('todoItem.markAsComplete')}
        >
          {todo.isCompleted ? '✓' : ''}
        </button>
        <div className="todo-content">
          <span className="todo-title" title={todo.name}>
            {todo.name}
          </span>
          <span className={`todo-badge${todo.doable ? ' todo-badge--doable' : ' todo-badge--blocked'}`}>
            {todo.doable ? t('common.doable') : t('common.blocked')}
          </span>
        </div>
        <div className="todo-actions">
          <button
            className={`todo-compact-action${isExpanded ? ' is-active' : ''}`}
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            disabled={isProcessing}
            aria-label={t('buttons.edit')}
            title={t('buttons.edit')}
          >
            ✎
          </button>
          <button
            className="todo-compact-action"
            type="button"
            onClick={() => onAddSubtask(todo.id)}
            disabled={isProcessing}
            aria-label={t('buttons.addSubtask')}
            title={t('buttons.addSubtask')}
          >
            +
          </button>
          <button
            className="todo-compact-action todo-delete"
            type="button"
            onClick={() => void onDelete(todo)}
            disabled={isProcessing}
            aria-label={t('buttons.delete')}
            title={t('buttons.delete')}
          >
            ×
          </button>
        </div>
      </div>

      {isExpanded ? (
        <div className="todo-item-details">
          <div className="todo-meta">
            {todo.description ? (
              <p className="todo-detail">
                <span className="todo-detail-label">{t('form.description')}:</span> {todo.description}
              </p>
            ) : null}
            {todo.deadline ? (
              <p className="todo-detail">
                <span className="todo-detail-label">{t('form.deadline')}:</span> {todo.deadline}
              </p>
            ) : null}
            {todo.notes ? (
              <p className="todo-detail">
                <span className="todo-detail-label">{t('form.notes')}:</span> {todo.notes}
              </p>
            ) : null}
            <div className="todo-dependencies">
              <p className="todo-detail">
                <span className="todo-detail-label">{t('common.dependencies')}:</span>{' '}
                {(todo.dependencies ?? []).length === 0 ? t('common.none') : ''}
              </p>
              {(todo.dependencies ?? []).length > 0 ? (
                <ul className="dependency-list">
                  {todo.dependencies.map((dependency) => (
                    <li
                      key={dependency.id}
                      className={`dependency-item${dependency.isCompleted ? ' is-completed' : ''}`}
                    >
                      <span>{dependency.name}</span>
                      <span className={`dependency-status${dependency.isCompleted ? ' is-completed' : ''}`}>
                        {dependency.isCompleted ? t('common.complete') : t('common.pending')}
                      </span>
                      <button
                        className="dependency-remove"
                        type="button"
                        onClick={() => void onRemoveDependency(todo, dependency.id)}
                        disabled={isProcessing}
                      >
                        {t('buttons.remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {isBlocked ? <p className="todo-helper">{t('common.completeDependenciesToStart')}</p> : null}
            </div>
          </div>

          <div className="todo-item-details-actions">
            <div className="todo-field todo-field--compact">
              <label className="todo-field-label" htmlFor={`todo-parent-${todo.id}`}>
                {t('common.parent')}
              </label>
              <select
                id={`todo-parent-${todo.id}`}
                className="todo-input todo-select"
                value={todo.parentId ? String(todo.parentId) : ''}
                onChange={(event) => void onEdit(todo, parseParentId(event.target.value))}
                disabled={isProcessing}
              >
                <option value="">{t('common.noParent')}</option>
                {availableParents.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="todo-field todo-field--compact">
              <label className="todo-field-label" htmlFor={`todo-dependency-${todo.id}`}>
                {t('common.addDependency')}
              </label>
              <div className="todo-dependency-controls">
                <select
                  id={`todo-dependency-${todo.id}`}
                  className="todo-input todo-select"
                  value={selectedDependencyId}
                  onChange={(event) => setSelectedDependencyId(event.target.value)}
                  disabled={isProcessing}
                >
                  <option value="">{t('common.selectTodo')}</option>
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
                      void onAddDependency(todo, parsed)
                      setSelectedDependencyId('')
                    }
                  }}
                  disabled={isProcessing || !selectedDependencyId}
                >
                  {t('buttons.add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {todo.children.length > 0 ? (
        <ul className="todo-children">
          {todo.children.map((child) => (
            <TodoItem
              key={child.id}
              todo={child}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
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

export default TodoItem
