import { Fragment } from 'react'
import TodoItem from './TodoItem'
import type { Todo } from './TodoItem'
import { useTranslation } from 'react-i18next'

interface TodoListProps {
  todos: Todo[]
  parentId?: number | null
  descendantMap: Map<number, Set<number>>
  collapsedTodoIds: Set<number>
  highlightedTodoIds: Set<number>
  onToggle: (todo: Todo) => Promise<void>
  onDelete: (todo: Todo) => Promise<void>
  onEdit: (todo: Todo, nextParentId: number | null) => Promise<void>
  onStartEdit: (todo: Todo) => void
  onAddSubtask: (todoId: number) => void
  onToggleCollapsed: (todoId: number) => void
  onDownloadAttachment: (todoId: number, attachment: Todo['attachments'][number]) => Promise<void>
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
  onClearDropTargets: () => void
  processingIds: number[]
}

function TodoList({
  todos,
  parentId = null,
  descendantMap,
  collapsedTodoIds,
  highlightedTodoIds,
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
  onClearDropTargets,
  processingIds,
}: TodoListProps) {
  const { t } = useTranslation()
  const normalizedParentId = parentId ?? null

  const isZoneActive = (afterTodoId: number | null): boolean =>
    draggingTodoId !== null &&
    activeDropZone?.afterTodoId === afterTodoId &&
    activeDropZone?.parentId === normalizedParentId

  if (todos.length === 0) {
    return <p className="empty-state">{t('common.emptyState')}</p>
  }

  return (
    <ul className="todo-list">
      <li
        className={`todo-drop-zone${isZoneActive(null) ? ' is-active' : ''}`}
        onDragOver={(event) => {
          if (draggingTodoId === null) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          onDragOverZone(null, normalizedParentId)
        }}
        onDragEnter={(event) => {
          if (draggingTodoId === null) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          onDragOverZone(null, normalizedParentId)
        }}
        onDragLeave={(event) => {
          if (draggingTodoId === null) {
            return
          }

          const nextHoverTarget = event.relatedTarget
          if (nextHoverTarget instanceof Node && event.currentTarget.contains(nextHoverTarget)) {
            return
          }

          onDragOverZone(null, normalizedParentId)
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onDropOnZone(null, normalizedParentId)
          onClearDropTargets()
        }}
        aria-hidden="true"
      />
      {todos.map((todo) => (
        <Fragment key={todo.id}>
          <TodoItem
            todo={todo}
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
            isProcessing={processingIds.includes(todo.id)}
            processingIds={processingIds}
            depth={0}
          />
          <li
            className={`todo-drop-zone${isZoneActive(todo.id) ? ' is-active' : ''}`}
            onDragOver={(event) => {
              if (draggingTodoId === null) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              onDragOverZone(todo.id, normalizedParentId)
            }}
            onDragEnter={(event) => {
              if (draggingTodoId === null) {
                return
              }

              event.preventDefault()
              event.stopPropagation()
              onDragOverZone(todo.id, normalizedParentId)
            }}
            onDragLeave={(event) => {
              if (draggingTodoId === null) {
                return
              }

              const nextHoverTarget = event.relatedTarget
              if (nextHoverTarget instanceof Node && event.currentTarget.contains(nextHoverTarget)) {
                return
              }

              onDragOverZone(todo.id, normalizedParentId)
            }}
            onDrop={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onDropOnZone(todo.id, normalizedParentId)
              onClearDropTargets()
            }}
            aria-hidden="true"
          />
        </Fragment>
      ))}
    </ul>
  )
}

export default TodoList
