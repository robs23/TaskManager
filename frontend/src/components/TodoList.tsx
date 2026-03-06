import TodoItem from './TodoItem'
import type { Todo } from './TodoItem'
import { useTranslation } from 'react-i18next'

interface TodoListProps {
  todos: Todo[]
  allTodos: Todo[]
  descendantMap: Map<number, Set<number>>
  onToggle: (todo: Todo) => Promise<void>
  onDelete: (todo: Todo) => Promise<void>
  onEdit: (todo: Todo, nextParentId: number | null) => Promise<void>
  onAddSubtask: (todoId: number) => void
  onAddDependency: (todo: Todo, dependsOnId: number) => Promise<void>
  onRemoveDependency: (todo: Todo, dependsOnId: number) => Promise<void>
  processingIds: number[]
}

function TodoList({
  todos,
  allTodos,
  descendantMap,
  onToggle,
  onDelete,
  onEdit,
  onAddSubtask,
  onAddDependency,
  onRemoveDependency,
  processingIds,
}: TodoListProps) {
  const { t } = useTranslation()
  if (todos.length === 0) {
    return <p className="empty-state">{t('common.emptyState')}</p>
  }

  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
          onEdit={onEdit}
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

export default TodoList
