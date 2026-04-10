import type { ReactNode } from 'react'
import Icon from '@mdi/react'
import { mdiUnfoldLessHorizontal, mdiUnfoldMoreHorizontal } from '@mdi/js'

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
            className="toolbar-collapse-all-button icon-only-button"
            type="button"
            title={collapseAllLabel}
            aria-label={collapseAllLabel}
            onClick={onToggleAllCollapsed}
            disabled={isCollapseToggleDisabled}
          >
            <Icon path={isAllCollapsed ? mdiUnfoldMoreHorizontal : mdiUnfoldLessHorizontal} size={0.85} />
          </button>
        ) : null}
        {children}
      </div>
    </section>
  )
}

export default Toolbar
