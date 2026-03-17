import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchWithAuth } from '../api/fetchWithAuth'
import RichTextEditor from './RichTextEditor'
import TagInput from './TagInput'
import TodoSearchSelect from './TodoSearchSelect'

export interface TodoDraft {
  name: string
  description: string
  deadline: string
  notes: string
  parentId: number | null
  tags: string[]
  files: File[]
}

export interface AddTodoFormProps {
  onSubmit: (todoDraft: TodoDraft) => Promise<boolean>
  isSubmitting: boolean
  parentId: number | null
  parentName?: string
  onParentChange: (parentId: number | null) => void
  attachments?: AttachmentSummary[]
  uploadProgress?: UploadProgress
  attachmentError?: string
  maxFileSizeBytes?: number
  onAttachmentDeleted?: (attachmentId: number) => void
  onCancel?: () => void
  isEditMode?: boolean
  initialDraft?: Partial<Omit<TodoDraft, 'parentId'>> & { id?: number; parentName?: string }
}

export interface AttachmentSummary {
  id: number
  fileName: string
  fileSize: number
  uploadedAt: string
  contentType: string
}

export interface UploadProgress {
  total: number
  completed: number
  currentFileName: string | null
  isUploading: boolean
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

function AddTodoForm({
  onSubmit,
  isSubmitting,
  parentId,
  parentName,
  onParentChange,
  attachments = [],
  uploadProgress,
  attachmentError = '',
  maxFileSizeBytes = 10 * 1024 * 1024,
  onAttachmentDeleted,
  onCancel,
  isEditMode = false,
  initialDraft,
}: AddTodoFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState<string>(initialDraft?.name ?? '')
  const [description, setDescription] = useState<string>(initialDraft?.description ?? '')
  const [deadline, setDeadline] = useState<string>(initialDraft?.deadline ?? '')
  const [notes, setNotes] = useState<string>(initialDraft?.notes ?? '')
  const [selectedParentName, setSelectedParentName] = useState<string>(
    parentName ?? initialDraft?.parentName ?? '',
  )
  const [tags, setTags] = useState<string[]>(initialDraft?.tags ?? [])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [existingAttachments, setExistingAttachments] = useState<AttachmentSummary[]>(attachments)
  const [formError, setFormError] = useState<string>('')
  const [fileError, setFileError] = useState<string>('')
  const [attachmentActionError, setAttachmentActionError] = useState<string>('')

  useEffect(() => {
    setName(initialDraft?.name ?? '')
    setDescription(initialDraft?.description ?? '')
    setDeadline(initialDraft?.deadline ?? '')
    setNotes(initialDraft?.notes ?? '')
    setSelectedParentName(parentName ?? initialDraft?.parentName ?? '')
    setTags(initialDraft?.tags ?? [])
    setSelectedFiles([])
    setFormError('')
    setFileError('')
    setAttachmentActionError('')
  }, [initialDraft, isEditMode, parentName])

  useEffect(() => {
    if (parentId === null) {
      setSelectedParentName('')
      return
    }

    if (parentName) {
      setSelectedParentName(parentName)
    }
  }, [parentId, parentName])

  useEffect(() => {
    setExistingAttachments(attachments)
  }, [attachments])

  const handleDownloadAttachment = async (attachment: AttachmentSummary): Promise<void> => {
    const todoId = initialDraft?.id
    if (!todoId) {
      return
    }

    setAttachmentActionError('')

    try {
      const response = await fetchWithAuth(`/api/todos/${todoId}/attachments/${attachment.id}`)
      if (!response.ok) {
        throw new Error(t('errors.downloadAttachment'))
      }

      const blob = await response.blob()
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = attachment.fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(downloadUrl)
    } catch (downloadError) {
      console.error(downloadError)
      setAttachmentActionError(t('errors.downloadAttachmentMessage'))
    }
  }

  const handleDeleteAttachment = async (attachmentId: number): Promise<void> => {
    const todoId = initialDraft?.id
    if (!todoId) {
      return
    }

    if (!window.confirm(t('todoItem.confirmDeleteAttachment'))) {
      return
    }

    setAttachmentActionError('')

    try {
      const response = await fetchWithAuth(`/api/todos/${todoId}/attachments/${attachmentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(t('errors.deleteAttachment'))
      }

      setExistingAttachments((previous) =>
        previous.filter((attachment) => attachment.id !== attachmentId),
      )
      onAttachmentDeleted?.(attachmentId)
    } catch (deleteError) {
      console.error(deleteError)
      setAttachmentActionError(t('errors.deleteAttachmentMessage'))
    }
  }

  const handleFilesChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? [])
    const oversized = files.find((file) => file.size > maxFileSizeBytes)

    if (oversized) {
      setSelectedFiles([])
      setFileError(
        t('form.fileTooLarge', {
          fileName: oversized.name,
          maxSize: formatFileSize(maxFileSizeBytes),
        }),
      )
      event.target.value = ''
      return
    }

    setFileError('')
    setSelectedFiles(files)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const trimmed = name.trim()

    if (!trimmed) {
      setFormError(t('form.nameRequired'))
      return
    }

    setFormError('')
    const didSave = await onSubmit({
      name: trimmed,
      description,
      deadline,
      notes,
      parentId,
      tags,
      files: selectedFiles,
    })

    if (didSave) {
      setName('')
      setDescription('')
      setDeadline('')
      setNotes('')
      setTags([])
      setSelectedFiles([])
      setFileError('')
    }
  }

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <label className="todo-label" htmlFor="todo-name">
        {isEditMode ? t('form.editTask') : t('form.newTask')}
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
          <label className="todo-field-label">
            {t('form.parentTask')}
          </label>
          <TodoSearchSelect
            selectedItems={parentId ? [{ id: parentId, name: selectedParentName }] : []}
            onSelect={(item) => {
              onParentChange(item.id)
              setSelectedParentName(item.name)
            }}
            onDeselect={() => {
              onParentChange(null)
              setSelectedParentName('')
            }}
            excludeIds={initialDraft?.id ? [initialDraft.id] : []}
            singleSelect
            placeholder={t('form.noParentTopLevel')}
          />
        </div>
      </div>
      <div className="todo-controls todo-controls--stacked">
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-description">
            {t('form.description')}
          </label>
          <input
            id="todo-description"
            className="todo-input"
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('form.descriptionOptional')}
            disabled={isSubmitting}
          />
        </div>
        <div className="todo-field">
          <label className="todo-field-label">
            {t('form.notes')}
          </label>
          <RichTextEditor
            content={notes}
            onChange={setNotes}
            placeholder={t('form.notesOptional')}
            disabled={isSubmitting}
          />
        </div>
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-tags">
            {t('form.tags')}
          </label>
          <TagInput
            id="todo-tags"
            value={tags}
            onChange={setTags}
            placeholder={t('form.tagsPlaceholder')}
            disabled={isSubmitting}
          />
        </div>
        <div className="todo-field">
          <label className="todo-field-label" htmlFor="todo-files">
            {t('form.attachments')}
          </label>
          <input
            id="todo-files"
            className="todo-input todo-file-input"
            type="file"
            multiple
            onChange={handleFilesChange}
            disabled={isSubmitting}
          />
          <p className="todo-field-hint">
            {t('form.attachmentSizeLimit', { maxSize: formatFileSize(maxFileSizeBytes) })}
          </p>
          {selectedFiles.length > 0 ? (
            <ul className="todo-file-list">
              {selectedFiles.map((file) => (
                <li key={`${file.name}-${file.lastModified}`} className="todo-file-list-item">
                  <span className="todo-file-name">{file.name}</span>
                  <span className="todo-file-size">{formatFileSize(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="todo-field">
          <p className="todo-field-label">{t('form.attachmentList')}</p>
          {existingAttachments.length === 0 ? (
            <p className="todo-field-hint">{t('form.noAttachments')}</p>
          ) : (
            <ul className="todo-file-list">
              {existingAttachments.map((attachment) => (
                <li key={attachment.id} className="todo-file-list-item">
                  <span className="todo-file-name" title={attachment.fileName}>
                    {attachment.fileName}
                  </span>
                  <span className="todo-file-size">
                    {formatFileSize(attachment.fileSize)}
                  </span>
                  <div className="todo-attachment-actions">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void handleDownloadAttachment(attachment)}
                      disabled={isSubmitting}
                    >
                      {t('todoItem.downloadAttachment')}
                    </button>
                    <button
                      className="secondary-button todo-attachment-delete"
                      type="button"
                      onClick={() => void handleDeleteAttachment(attachment.id)}
                      disabled={isSubmitting}
                    >
                      {t('todoItem.deleteAttachment')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {uploadProgress?.isUploading ? (
            <p className="todo-field-hint">
              {t('form.uploadProgress', {
                completed: uploadProgress.completed,
                total: uploadProgress.total,
                fileName: uploadProgress.currentFileName ?? '',
              })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="todo-controls">
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditMode
              ? t('buttons.saving')
              : t('buttons.adding')
            : isEditMode
              ? t('buttons.save')
              : t('buttons.add')}
        </button>
        {onCancel ? (
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isSubmitting}>
            {t('buttons.cancel')}
          </button>
        ) : null}
      </div>
      {formError ? <p className="form-error">{formError}</p> : null}
      {fileError ? <p className="form-error">{fileError}</p> : null}
      {attachmentError ? <p className="form-error">{attachmentError}</p> : null}
      {attachmentActionError ? <p className="form-error">{attachmentActionError}</p> : null}
    </form>
  )
}

export default AddTodoForm
