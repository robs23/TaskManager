import { useTranslation } from 'react-i18next'
import Icon from '@mdi/react'
import { mdiBolt, mdiEyeOff, mdiPaperclip, mdiCalendar, mdiClose } from '@mdi/js'

export interface FilterState {
  showDoableOnly: boolean
  hideCompleted: boolean
  hasAttachmentsOnly: boolean
  dueDate: string | null
}

interface FilterPanelProps {
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
}

export function FilterPanel({ filters, onFilterChange }: FilterPanelProps) {
  const { t } = useTranslation()

  const handleToggle = (key: 'showDoableOnly' | 'hideCompleted' | 'hasAttachmentsOnly'): void => {
    onFilterChange({
      ...filters,
      [key]: !filters[key],
    })
  }

  const handleDueDateChange = (value: string): void => {
    onFilterChange({
      ...filters,
      dueDate: value.trim().length > 0 ? value : null,
    })
  }

  const clearDueDate = (): void => {
    onFilterChange({
      ...filters,
      dueDate: null,
    })
  }

  return (
    <div className="filter-panel">
      <button
        type="button"
        className={`filter-toggle-button icon-only-button${filters.showDoableOnly ? ' is-active' : ''}`}
        aria-pressed={filters.showDoableOnly}
        title={filters.showDoableOnly ? t('filters.showAll') : t('filters.showDoable')}
        aria-label={filters.showDoableOnly ? t('filters.showAll') : t('filters.showDoable')}
        onClick={() => handleToggle('showDoableOnly')}
      >
        <Icon path={mdiBolt} size={0.85} />
      </button>

      <button
        type="button"
        className={`filter-toggle-button icon-only-button${filters.hideCompleted ? ' is-active' : ''}`}
        aria-pressed={filters.hideCompleted}
        title={t('filters.hideCompleted')}
        aria-label={t('filters.hideCompleted')}
        onClick={() => handleToggle('hideCompleted')}
      >
        <Icon path={mdiEyeOff} size={0.85} />
      </button>

      <button
        type="button"
        className={`filter-toggle-button icon-only-button${filters.hasAttachmentsOnly ? ' is-active' : ''}`}
        aria-pressed={filters.hasAttachmentsOnly}
        title={t('filters.hasAttachments')}
        aria-label={t('filters.hasAttachments')}
        onClick={() => handleToggle('hasAttachmentsOnly')}
      >
        <Icon path={mdiPaperclip} size={0.85} />
      </button>

      <div className="filter-date-group">
        <label htmlFor="filter-due-date" aria-label={t('filters.dueDate')}>
          <Icon path={mdiCalendar} size={0.85} />
        </label>
        <input
          id="filter-due-date"
          className="filter-date-input"
          type="date"
          value={filters.dueDate ?? ''}
          onChange={(event) => handleDueDateChange(event.target.value)}
        />
        {filters.dueDate ? (
          <button
            type="button"
            className="filter-toggle-button icon-only-button"
            title={t('filters.clearDate')}
            aria-label={t('filters.clearDate')}
            onClick={clearDueDate}
          >
            <Icon path={mdiClose} size={0.85} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default FilterPanel
