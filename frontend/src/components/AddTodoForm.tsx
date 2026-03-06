import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

export interface TodoDraft {
  name: string
  description: string
  deadline: string
  notes: string
  parentId: number | null
}

export interface ParentOption {
  id: number
  name: string
}

export interface AddTodoFormProps {
  onAdd: (todoDraft: TodoDraft) => Promise<boolean>
  isSubmitting: boolean
  parentOptions: ParentOption[]
  parentId: number | null
  onParentChange: (parentId: number | null) => void
  onCancel?: () => void
}

const parseParentId = (value: string): number | null => {
  if (!value) {
    return null
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function AddTodoForm({
  onAdd,
  isSubmitting,
  parentOptions,
  parentId,
  onParentChange,
  onCancel,
}: AddTodoFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState<string>('')
  const [description, setDescription] = useState<string>('')
  const [deadline, setDeadline] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [formError, setFormError] = useState<string>('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const trimmed = name.trim()

    if (!trimmed) {
      setFormError(t('form.nameRequired'))
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
        {t('form.newTask')}
      </label>
      <div className="todo-controls">
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-name">
            {t('form.taskName')}
          </label>
          <input
            id="todo-name"
            className="todo-input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('form.taskName')}
            disabled={isSubmitting}
            required
          />
        </div>
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-deadline">
            {t('form.deadline')}
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
            {t('form.parentTask')}
          </label>
          <select
            id="todo-parent"
            className="todo-input todo-select"
            value={parentId ? String(parentId) : ''}
            onChange={(event) => onParentChange(parseParentId(event.target.value))}
            disabled={isSubmitting}
          >
            <option value="">{t('form.noParentTopLevel')}</option>
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
            {t('form.description')}
          </label>
          <textarea
            id="todo-description"
            className="todo-input todo-textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('form.descriptionOptional')}
            rows={3}
            disabled={isSubmitting}
          />
        </div>
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-notes">
            {t('form.notes')}
          </label>
          <textarea
            id="todo-notes"
            className="todo-input todo-textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t('form.notesOptional')}
            rows={2}
            disabled={isSubmitting}
          />
        </div>
      </div>
      <div className="todo-controls">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('buttons.adding') : t('buttons.add')}
        </button>
        {onCancel ? (
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isSubmitting}>
            {t('buttons.cancel')}
          </button>
        ) : null}
      </div>
      {formError ? <p className="form-error">{formError}</p> : null}
    </form>
  )
}

export default AddTodoForm
