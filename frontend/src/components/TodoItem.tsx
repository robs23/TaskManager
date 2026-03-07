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
  tags: string[]
  doable: boolean
  dependencies: TodoDependencySummary[]
  children: Todo[]
}

export interface TodoItemProps {
  todo: Todo
  allTodos: Todo[]
  descendantMap: Map<number, Set<number>>
  collapsedTodoIds: Set<number>
  onToggle: (todo: Todo) => Promise<void>
  onDelete: (todo: Todo) => Promise<void>
  onEdit: (todo: Todo, nextParentId: number | null) => Promise<void>
  onStartEdit: (todo: Todo) => void
  onAddSubtask: (todoId: number) => void
  onToggleCollapsed: (todoId: number) => void
  onAddDependency: (todo: Todo, dependsOnId: number) => Promise<void>
  onRemoveDependency: (todo: Todo, dependsOnId: number) => Promise<void>
  draggingTodoId: number | null
  activeDropTodoId: number | null
  onDragStart: (todoId: number) => void
  onDragEnd: () => void
  onDragOverTodo: (todoId: number | null) => void
  onDropOnTodo: (todoId: number) => void
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
  onStartEdit,
  onAddSubtask,
  onToggleCollapsed,
  onAddDependency,
  onRemoveDependency,
  draggingTodoId,
  activeDropTodoId,
  onDragStart,
  onDragEnd,
  onDragOverTodo,
  onDropOnTodo,
  allTodos,
  descendantMap,
  collapsedTodoIds,
  isProcessing,
  processingIds,
  depth,
}: TodoItemProps) {
  const { t, i18n } = useTranslation()
  const maxVisibleTags = 3
  const [selectedDependencyId, setSelectedDependencyId] = useState<string>('')
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [isDraggingHandle, setIsDraggingHandle] = useState<boolean>(false)
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
  const hasChildren = todo.children.length > 0
  const isCollapsed = collapsedTodoIds.has(todo.id)
  const isDraggingThisTodo = draggingTodoId === todo.id
  const isDropTarget = activeDropTodoId === todo.id
  const draggedTodoDescendants =
    draggingTodoId === null ? new Set<number>() : descendantMap.get(draggingTodoId) ?? new Set<number>()
  const canAcceptDrop =
    draggingTodoId !== null &&
    draggingTodoId !== todo.id &&
    !draggedTodoDescendants.has(todo.id) &&
    !isProcessing
  const deadlineDate = todo.deadline
    ? /^\d{4}-\d{2}-\d{2}$/.test(todo.deadline)
      ? new Date(
          Number(todo.deadline.slice(0, 4)),
          Number(todo.deadline.slice(5, 7)) - 1,
          Number(todo.deadline.slice(8, 10)),
        )
      : new Date(todo.deadline)
    : null
  const formattedDeadline =
    deadlineDate && !Number.isNaN(deadlineDate.getTime())
      ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
          dateStyle: 'medium',
        }).format(deadlineDate)
      : null
  const deadlineLabel = t('todoItem.due')
  const visibleTags = todo.tags.slice(0, maxVisibleTags)
  const hasHiddenTags = todo.tags.length > maxVisibleTags

  return (
    <li className="todo-node">
      <div
        className={`todo-item${todo.isCompleted ? ' is-completed' : ''}${
          depth > 0 ? ' todo-item--subtask' : ''
        }${formattedDeadline ? ' todo-item--with-deadline' : ''}${
          isDraggingThisTodo ? ' is-dragging' : ''
        }${isDropTarget ? ' is-drop-target' : ''}`}
        onDragOver={(event) => {
          if (!canAcceptDrop) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          onDragOverTodo(todo.id)
        }}
        onDrop={(event) => {
          if (!canAcceptDrop) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          onDropOnTodo(todo.id)
        }}
        onDragLeave={(event) => {
          if (!canAcceptDrop) {
            return
          }

          const nextHoverTarget = event.relatedTarget
          if (nextHoverTarget instanceof Node && event.currentTarget.contains(nextHoverTarget)) {
            return
          }

          onDragOverTodo(null)
        }}
        onDragEnter={(event) => {
          if (!canAcceptDrop) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          onDragOverTodo(todo.id)
        }}
        aria-dropeffect={canAcceptDrop ? 'move' : undefined}
        data-drop-target={isDropTarget ? 'true' : undefined}
      >
        <button
          className={`todo-drag-handle${isDraggingHandle ? ' is-dragging' : ''}`}
          type="button"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', String(todo.id))
            setIsDraggingHandle(true)
            onDragStart(todo.id)
          }}
          onDragEnd={() => {
            setIsDraggingHandle(false)
            onDragEnd()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          disabled={isProcessing}
          aria-label={t('todoItem.dragHandle')}
          aria-grabbed={isDraggingHandle}
          title={t('todoItem.dragHandle')}
        >
          ⋮⋮
        </button>
        {hasChildren ? (
          <button
            className={`todo-collapse-toggle${isCollapsed ? '' : ' is-expanded'}`}
            type="button"
            onClick={() => onToggleCollapsed(todo.id)}
            disabled={isProcessing}
            aria-label={isCollapsed ? t('todoItem.expandSubtasks') : t('todoItem.collapseSubtasks')}
            title={isCollapsed ? t('todoItem.expandSubtasks') : t('todoItem.collapseSubtasks')}
            aria-expanded={!isCollapsed}
          >
            {isCollapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span className="todo-collapse-placeholder" aria-hidden="true" />
        )}
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
        <div className={`todo-content${formattedDeadline ? ' todo-content--with-deadline' : ''}`}>
          <div className="todo-text">
            <div className="todo-title-row">
              <span className="todo-title" title={todo.name}>
                {todo.name}
              </span>
              {visibleTags.length > 0 ? (
                <span className="todo-tag-list" aria-label="Todo tags">
                  {visibleTags.map((tag) => (
                    <span className="todo-tag-badge" key={`${todo.id}-${tag}`} title={tag}>
                      <span className="todo-tag-badge-label">{tag}</span>
                    </span>
                  ))}
                  {hasHiddenTags ? (
                    <span className="todo-tag-badge todo-tag-badge--more" title={t('form.tags')}>
                      <span className="todo-tag-badge-label">...</span>
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>
            {formattedDeadline ? (
              <span className="todo-deadline" title={`${deadlineLabel}: ${formattedDeadline}`}>
                {deadlineLabel}: {formattedDeadline}
              </span>
            ) : null}
          </div>
        </div>
        <div className="todo-actions">
          <button
            className="todo-compact-action"
            type="button"
            onClick={() => onStartEdit(todo)}
            disabled={isProcessing}
            aria-label={t('buttons.edit')}
            title={t('buttons.edit')}
          >
            ✎
          </button>
          <button
            className={`todo-compact-action${isExpanded ? ' is-active' : ''}`}
            type="button"
            onClick={() => setIsExpanded((previous) => !previous)}
            disabled={isProcessing}
            aria-label={t('buttons.details')}
            title={t('buttons.details')}
          >
            ⋯
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

      {hasChildren && !isCollapsed ? (
        <ul className="todo-children">
          {todo.children.map((child) => (
            <TodoItem
              key={child.id}
              todo={child}
              onToggle={onToggle}
              onDelete={onDelete}
              onEdit={onEdit}
              onStartEdit={onStartEdit}
              onAddSubtask={onAddSubtask}
              onToggleCollapsed={onToggleCollapsed}
              onAddDependency={onAddDependency}
              onRemoveDependency={onRemoveDependency}
              draggingTodoId={draggingTodoId}
              activeDropTodoId={activeDropTodoId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverTodo={onDragOverTodo}
              onDropOnTodo={onDropOnTodo}
              allTodos={allTodos}
              descendantMap={descendantMap}
              collapsedTodoIds={collapsedTodoIds}
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

