import { useEffect } from 'react'

interface ToastProps {
  message: string
  onDismiss: () => void
}

function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      onDismiss()
    }, 3000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [onDismiss])

  return (
    <div className="toast" role="status" aria-live="polite">
      {message}
    </div>
  )
}

export default Toast
