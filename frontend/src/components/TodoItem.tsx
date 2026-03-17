import { useState } from 'react'
import DOMPurify from 'dompurify'
import { useTranslation } from 'react-i18next'
import TodoSearchSelect from './TodoSearchSelect'

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
  relatedTodos: TodoRelatedSummary[]
  attachments: AttachmentSummary[]
  children: Todo[]
}

export interface TodoItemProps {
  todo: Todo
  allTodos: Todo[]
  descendantMap: Map<number, Set<number>>
  collapsedTodoIds: Set<number>
  highlightedTodoIds: Set<number>
  onToggle: (todo: Todo) => Promise<void>
  onDelete: (todo: Todo) => Promise<void>
  onEdit: (todo: Todo, nextParentId: number | null) => Promise<void>
  onStartEdit: (todo: Todo) => void
  onAddSubtask: (todoId: number) => void
  onToggleCollapsed: (todoId: number) => void
  onAddDependency: (todo: Todo, dependsOnId: number) => Promise<void>
  onRemoveDependency: (todo: Todo, dependsOnId: number) => Promise<void>
  onAddRelated: (todo: Todo, relatedTodoId: number) => Promise<void>
  onRemoveRelated: (todo: Todo, relatedTodoId: number) => Promise<void>
  onDownloadAttachment: (todoId: number, attachment: AttachmentSummary) => Promise<void>
  onDeleteAttachment: (todoId: number, attachmentId: number) => Promise<void>
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

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof Element) || node.tagName !== 'A') {
    return
  }

  node.setAttribute('target', '_blank')
  node.setAttribute('rel', 'noopener noreferrer')
})

const sanitizeNotesHtml = (html: string): string =>
  DOMPurify.sanitize(html, {
    ADD_ATTR: ['target'],
  })

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
  onAddRelated,
  onRemoveRelated,
  onDownloadAttachment,
  onDeleteAttachment,
  draggingTodoId,
  activeDropTodoId,
  onDragStart,
  onDragEnd,
  onDragOverTodo,
  onDropOnTodo,
  allTodos,
  descendantMap,
  collapsedTodoIds,
  highlightedTodoIds,
  isProcessing,
  processingIds,
  depth,
}: TodoItemProps) {
  const { t, i18n } = useTranslation()
  const maxVisibleTags = 3
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [isDraggingHandle, setIsDraggingHandle] = useState<boolean>(false)
  const invalidParents = descendantMap.get(todo.id) ?? new Set<number>()
  const availableParents = allTodos.filter(
    (option) => option.id !== todo.id && (!invalidParents.has(option.id) || option.id === todo.parentId),
  )
  const dependencyExcludeIds = [todo.id, ...(todo.dependencies ?? []).map((dependency) => dependency.id)]
  const relatedExcludeIds = [todo.id, ...(todo.relatedTodos ?? []).map((relatedTodo) => relatedTodo.id)]
  const isBlocked = !todo.doable && !todo.isCompleted
  const hasChildren = todo.children.length > 0
  const isHighlighted = highlightedTodoIds.has(todo.id)
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
  const attachments = todo.attachments ?? []

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
        ) : (
          <span className="todo-collapse-placeholder" aria-hidden="true" />
        )}
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
        <div className={`todo-content${formattedDeadline ? ' todo-content--with-deadline' : ''}`}>
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
              <div className="todo-detail">
                <span className="todo-detail-label">{t('form.notes')}:</span>
                <div
                  className="todo-notes-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeNotesHtml(todo.notes) }}
                />
              </div>
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
            <div className="todo-dependencies">
              <p className="todo-detail">
                <span className="todo-detail-label">{t('common.relatedTodos')}:</span>{' '}
                {(todo.relatedTodos ?? []).length === 0 ? t('common.noRelatedTodos') : ''}
              </p>
              {(todo.relatedTodos ?? []).length > 0 ? (
                <ul className="dependency-list">
                  {todo.relatedTodos.map((relatedTodo) => (
                    <li
                      key={relatedTodo.id}
                      className={`dependency-item${relatedTodo.isCompleted ? ' is-completed' : ''}`}
                    >
                      <span>{relatedTodo.name}</span>
                      <span className={`dependency-status${relatedTodo.isCompleted ? ' is-completed' : ''}`}>
                        {relatedTodo.isCompleted ? t('common.complete') : t('common.pending')}
                      </span>
                      <button
                        className="dependency-remove"
                        type="button"
                        onClick={() => void onRemoveRelated(todo, relatedTodo.id)}
                        disabled={isProcessing}
                      >
                        {t('buttons.removeRelated')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div className="todo-attachments">
              <p className="todo-detail">
                <span className="todo-detail-label">{t('form.attachments')}:</span>{' '}
                {attachments.length === 0 ? t('todoItem.noAttachments') : ''}
              </p>
              {attachments.length > 0 ? (
                <ul className="todo-attachment-list">
                  {attachments.map((attachment) => {
                    const uploadedDate = new Date(attachment.uploadedAt)
                    const formattedUploadedAt = Number.isNaN(uploadedDate.getTime())
                      ? attachment.uploadedAt
                      : new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(uploadedDate)

                    return (
                      <li key={attachment.id} className="todo-attachment-item">
                        <span className="todo-attachment-name" title={attachment.fileName}>
                          {attachment.fileName}
                        </span>
                        <span className="todo-attachment-meta">
                          {formatFileSize(attachment.fileSize)} • {formattedUploadedAt}
                        </span>
                        <div className="todo-attachment-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => void onDownloadAttachment(todo.id, attachment)}
                            disabled={isProcessing}
                          >
                            {t('todoItem.downloadAttachment')}
                          </button>
                          <button
                            className="secondary-button todo-attachment-delete"
                            type="button"
                            onClick={() => {
                              if (!window.confirm(t('todoItem.confirmDeleteAttachment'))) {
                                return
                              }

                              void onDeleteAttachment(todo.id, attachment.id)
                            }}
                            disabled={isProcessing}
                          >
                            {t('todoItem.deleteAttachment')}
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
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
              <label className="todo-field-label">
                {t('common.addDependency')}
              </label>
              <div className="todo-dependency-controls">
                <TodoSearchSelect
                  selectedItems={[]}
                  onSelect={(item) => {
                    void onAddDependency(todo, item.id)
                  }}
                  onDeselect={() => {}}
                  excludeIds={dependencyExcludeIds}
                  placeholder={t('common.selectTodo')}
                />
              </div>
            </div>
            <div className="todo-field todo-field--compact">
              <label className="todo-field-label">{t('common.relatedTodos')}</label>
              <div className="todo-dependency-controls">
                <TodoSearchSelect
                  selectedItems={[]}
                  onSelect={(item) => {
                    void onAddRelated(todo, item.id)
                  }}
                  onDeselect={() => {}}
                  excludeIds={relatedExcludeIds}
                  placeholder={t('common.selectTodo')}
                />
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
              onAddRelated={onAddRelated}
              onRemoveRelated={onRemoveRelated}
              onDownloadAttachment={onDownloadAttachment}
              onDeleteAttachment={onDeleteAttachment}
              draggingTodoId={draggingTodoId}
              activeDropTodoId={activeDropTodoId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverTodo={onDragOverTodo}
              onDropOnTodo={onDropOnTodo}
              allTodos={allTodos}
              descendantMap={descendantMap}
              collapsedTodoIds={collapsedTodoIds}
              highlightedTodoIds={highlightedTodoIds}
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

