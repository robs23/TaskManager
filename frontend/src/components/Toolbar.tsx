import type { ReactNode } from 'react'

interface ToolbarProps {
  children?: ReactNode
  collapseAllLabel?: string
  ariaLabel?: string
  isAllCollapsed?: boolean
  isCollapseToggleDisabled?: boolean
  onToggleAllCollapsed?: () => void
}

function Toolbar({
  children,
  collapseAllLabel,
  ariaLabel,
  isAllCollapsed = false,
  isCollapseToggleDisabled = false,
  onToggleAllCollapsed,
}: ToolbarProps) {
  const hasCollapseToggle = typeof onToggleAllCollapsed === 'function' && Boolean(collapseAllLabel)

  return (
    <section className="app-toolbar" aria-label={ariaLabel ?? 'Todo toolbar'}>
      <div className="app-toolbar-content">
        {hasCollapseToggle ? (
          <button
            className="toolbar-collapse-all-button"
            type="button"
            onClick={onToggleAllCollapsed}
            disabled={isCollapseToggleDisabled}
          >
            <span className="toolbar-collapse-all-icon" aria-hidden="true">
              {isAllCollapsed ? '⇈' : '⇊'}
            </span>
            <span>{collapseAllLabel}</span>
          </button>
        ) : null}
        {children}
      </div>
    </section>
  )
}

export default Toolbar
