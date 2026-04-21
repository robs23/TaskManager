import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  isSent: boolean
  reminderDateTimeUtc: string | null
}

export interface Todo {
  id: number
  sortOrder: number
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
  relatedTodos: TodoRelatedSummary[]
  attachments: AttachmentSummary[]
  reminders: ReminderSummary[]
  children: Todo[]
}

export interface TodoItemProps {
  todo: Todo
  descendantMap: Map<number, Set<number>>
  collapsedTodoIds: Set<number>
  highlightedTodoIds: Set<number>
  onToggle: (todo: Todo) => Promise<void>
  onDelete: (todo: Todo) => Promise<void>
  onEdit: (todo: Todo, nextParentId: number | null) => Promise<void>
  onStartEdit: (todo: Todo) => void
  onAddSubtask: (todoId: number) => void
  onToggleCollapsed: (todoId: number) => void
  onDownloadAttachment: (todoId: number, attachment: AttachmentSummary) => Promise<void>
  onDeleteAttachment: (todoId: number, attachmentId: number) => Promise<void>
  draggingTodoId: number | null
  activeDropTodoId: number | null
  activeDropZone: { afterTodoId: number | null; parentId: number | null } | null
  onDragStart: (todoId: number) => void
  onDragEnd: () => void
  onDragOverTodo: (todoId: number | null) => void
  onDropOnTodo: (todoId: number) => void
  onDragOverZone: (afterTodoId: number | null, parentId: number | null) => void
  onDropOnZone: (afterTodoId: number | null, parentId: number | null) => void
  isProcessing: boolean
  processingIds: number[]
  depth: number
}

function TodoItem({
  todo,
  onToggle,
  onDelete,
  onEdit,
  onStartEdit,
  onAddSubtask,
  onToggleCollapsed,
  onDownloadAttachment,
  onDeleteAttachment,
  draggingTodoId,
  activeDropTodoId,
  activeDropZone,
  onDragStart,
  onDragEnd,
  onDragOverTodo,
  onDropOnTodo,
  onDragOverZone,
  onDropOnZone,
  descendantMap,
  collapsedTodoIds,
  highlightedTodoIds,
  isProcessing,
  processingIds,
  depth,
}: TodoItemProps) {
  const { t, i18n } = useTranslation()
  const maxVisibleTags = 3
  const [isDraggingHandle, setIsDraggingHandle] = useState<boolean>(false)
  const isBlocked = !todo.doable && !todo.isCompleted
  const hasChildren = todo.children.length > 0
  const isHighlighted = highlightedTodoIds.has(todo.id)
  const isCollapsed = collapsedTodoIds.has(todo.id)
  const isDraggingThisTodo = draggingTodoId === todo.id
  const isDropTarget = activeDropTodoId === todo.id
  const hasPendingReminder = todo.reminders.some((r) => !r.isSent)
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
  const attachments = todo.attachments ?? []
  const isDropZoneActive = (afterTodoId: number | null, parentId: number | null): boolean =>
    draggingTodoId !== null &&
    activeDropZone?.afterTodoId === afterTodoId &&
    activeDropZone?.parentId === parentId

  return (
    <li className={`todo-node${isHighlighted ? ' todo-highlighted' : ''}`}>
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
        ) : null}
        <button
          className={`todo-toggle${todo.isCompleted ? ' is-completed' : ''}${isBlocked ? ' is-blocked' : ''}`}
          type="button"
          onClick={() => void onToggle(todo)}
          disabled={isProcessing}
          aria-pressed={todo.isCompleted}
          aria-label={
            todo.isCompleted ? t('todoItem.markAsIncomplete') : t('todoItem.markAsComplete')
          }
          title={todo.isCompleted ? t('todoItem.markAsIncomplete') : t('todoItem.markAsComplete')}
        >
          {todo.isCompleted ? '✓' : ''}
        </button>
        <div
          className={`todo-content${formattedDeadline ? ' todo-content--with-deadline' : ''}`}
          role="button"
          tabIndex={isProcessing ? -1 : 0}
          style={{ cursor: isProcessing ? 'default' : 'pointer' }}
          onClick={() => { if (!isProcessing) onStartEdit(todo) }}
          onKeyDown={(event) => { if (!isProcessing && (event.key === 'Enter' || event.key === ' ')) onStartEdit(todo) }}
          aria-label={t('buttons.edit') + ': ' + todo.name}
        >
          <div className="todo-text">
            <div className="todo-title-row">
              <span className="todo-title" title={todo.name}>
                {todo.name}
              </span>
              {attachments.length > 0 ? (
                <span className="todo-attachment-indicator" title={t('todoItem.hasAttachments')}>
                  📎
                </span>
              ) : null}
              {hasPendingReminder ? (
                <span className="todo-reminder-indicator" title={t('todoItem.hasReminders')}>
                  🔔
                </span>
              ) : null}
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

      {hasChildren && !isCollapsed ? (
        <ul className="todo-children">
          <li
            className={`todo-drop-zone${isDropZoneActive(null, todo.id) ? ' is-active' : ''}`}
            onDragOver={(event) => {
              if (draggingTodoId === null) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              onDragOverZone(null, todo.id)
            }}
            onDragEnter={(event) => {
              if (draggingTodoId === null) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              onDragOverZone(null, todo.id)
            }}
            onDragLeave={(event) => {
              if (draggingTodoId === null) {
                return
              }

              const nextHoverTarget = event.relatedTarget
              if (nextHoverTarget instanceof Node && event.currentTarget.contains(nextHoverTarget)) {
                return
              }

              onDragOverZone(null, todo.id)
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onDropOnZone(null, todo.id)
            }}
            aria-hidden="true"
          />
          {todo.children.map((child) => (
            <Fragment key={child.id}>
              <TodoItem
                todo={child}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
                onStartEdit={onStartEdit}
                onAddSubtask={onAddSubtask}
                onToggleCollapsed={onToggleCollapsed}
                onDownloadAttachment={onDownloadAttachment}
                onDeleteAttachment={onDeleteAttachment}
                draggingTodoId={draggingTodoId}
                activeDropTodoId={activeDropTodoId}
                activeDropZone={activeDropZone}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOverTodo={onDragOverTodo}
                onDropOnTodo={onDropOnTodo}
                onDragOverZone={onDragOverZone}
                onDropOnZone={onDropOnZone}
                descendantMap={descendantMap}
                collapsedTodoIds={collapsedTodoIds}
                highlightedTodoIds={highlightedTodoIds}
                isProcessing={processingIds.includes(child.id)}
                processingIds={processingIds}
                depth={depth + 1}
              />
              <li
                className={`todo-drop-zone${isDropZoneActive(child.id, todo.id) ? ' is-active' : ''}`}
                onDragOver={(event) => {
                  if (draggingTodoId === null) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  onDragOverZone(child.id, todo.id)
                }}
                onDragEnter={(event) => {
                  if (draggingTodoId === null) {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  onDragOverZone(child.id, todo.id)
                }}
                onDragLeave={(event) => {
                  if (draggingTodoId === null) {
                    return
                  }

                  const nextHoverTarget = event.relatedTarget
                  if (nextHoverTarget instanceof Node && event.currentTarget.contains(nextHoverTarget)) {
                    return
                  }

                  onDragOverZone(child.id, todo.id)
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onDropOnZone(child.id, todo.id)
                }}
                aria-hidden="true"
              />
            </Fragment>
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default TodoItem

