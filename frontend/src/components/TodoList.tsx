import TodoItem from './TodoItem'
import type { Todo } from './TodoItem'
import { useTranslation } from 'react-i18next'

interface TodoListProps {
  todos: Todo[]
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
  isRootDropActive: boolean
  onDragStart: (todoId: number) => void
  onDragEnd: () => void
  onDragOverTodo: (todoId: number | null) => void
  onDropOnTodo: (todoId: number) => void
  onDragOverRoot: () => void
  onDropOnRoot: () => void
  onClearDropTargets: () => void
  processingIds: number[]
}

function TodoList({
  todos,
  allTodos,
  descendantMap,
  collapsedTodoIds,
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
  isRootDropActive,
  onDragStart,
  onDragEnd,
  onDragOverTodo,
  onDropOnTodo,
  onDragOverRoot,
  onDropOnRoot,
  onClearDropTargets,
  processingIds,
}: TodoListProps) {
  const { t } = useTranslation()
  if (todos.length === 0) {
    return <p className="empty-state">{t('common.emptyState')}</p>
  }

  return (
    <ul
      className={`todo-list${isRootDropActive ? ' is-root-drop-target' : ''}`}
      onDragOver={(event) => {
        if (draggingTodoId === null) {
          return
        }

        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOverRoot()
      }}
      onDrop={(event) => {
        if (draggingTodoId === null) {
          return
        }

        event.preventDefault()
        onDropOnRoot()
      }}
      onDragLeave={(event) => {
        if (draggingTodoId === null) {
          return
        }

        const nextHoverTarget = event.relatedTarget
        if (nextHoverTarget instanceof Node && event.currentTarget.contains(nextHoverTarget)) {
          return
        }

        onClearDropTargets()
      }}
    >
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
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
          isProcessing={processingIds.includes(todo.id)}
          processingIds={processingIds}
          depth={0}
        />
      ))}
    </ul>
  )
}

export default TodoList
