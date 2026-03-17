import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import './RichTextEditor.css'

export interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  disabled?: boolean
  placeholder?: string
}

function RichTextEditor({ content, onChange, disabled = false, placeholder }: RichTextEditorProps) {
  const { t } = useTranslation()
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
    ],
    content,
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.getHTML())
    },
    editorProps: {
      attributes: {
        'data-placeholder': placeholder ?? '',
      },
    },
  })

  useEffect(() => {
    if (!editor) {
      return
    }

    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) {
      return
    }

    const currentHtml = editor.getHTML()
    if (content !== currentHtml) {
      editor.commands.setContent(content || '', false)
    }
  }, [content, editor])

  const handleLink = () => {
    if (!editor) {
      return
    }

    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }

    const url = window.prompt(t('editor.linkPrompt'))
    const trimmed = url?.trim() ?? ''
    if (!trimmed) {
      return
    }

    editor.chain().focus().setLink({ href: trimmed }).run()
  }

  return (
    <div className="rich-editor-wrapper">
      <div className="rich-editor-toolbar">
        <button
          type="button"
          className={editor?.isActive('bold') ? 'is-active' : ''}
          aria-pressed={editor?.isActive('bold') ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
          disabled={disabled || !editor}
        >
          {t('editor.bold')}
        </button>
        <button
          type="button"
          className={editor?.isActive('italic') ? 'is-active' : ''}
          aria-pressed={editor?.isActive('italic') ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          disabled={disabled || !editor}
        >
          {t('editor.italic')}
        </button>
        <button
          type="button"
          className={editor?.isActive('underline') ? 'is-active' : ''}
          aria-pressed={editor?.isActive('underline') ?? false}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          disabled={disabled || !editor}
        >
          {t('editor.underline')}
        </button>
        <button
          type="button"
          className={editor?.isActive('strike') ? 'is-active' : ''}
          aria-pressed={editor?.isActive('strike') ?? false}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
          disabled={disabled || !editor}
        >
          {t('editor.strikethrough')}
        </button>
        <button
          type="button"
          className={editor?.isActive('bulletList') ? 'is-active' : ''}
          aria-pressed={editor?.isActive('bulletList') ?? false}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          disabled={disabled || !editor}
        >
          {t('editor.bulletList')}
        </button>
        <button
          type="button"
          className={editor?.isActive('orderedList') ? 'is-active' : ''}
          aria-pressed={editor?.isActive('orderedList') ?? false}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          disabled={disabled || !editor}
        >
          {t('editor.orderedList')}
        </button>
        <button
          type="button"
          className={editor?.isActive('taskList') ? 'is-active' : ''}
          aria-pressed={editor?.isActive('taskList') ?? false}
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
          disabled={disabled || !editor}
        >
          {t('editor.taskList')}
        </button>
        <button
          type="button"
          className={editor?.isActive('link') ? 'is-active' : ''}
          aria-pressed={editor?.isActive('link') ?? false}
          onClick={handleLink}
          disabled={disabled || !editor}
        >
          {t('editor.link')}
        </button>
      </div>
      <EditorContent editor={editor} className="rich-editor-content" />
    </div>
  )
}

export default RichTextEditor
