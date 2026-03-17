import { useTranslation } from 'react-i18next'

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
        className={`filter-toggle-button${filters.showDoableOnly ? ' is-active' : ''}`}
        aria-pressed={filters.showDoableOnly}
        onClick={() => handleToggle('showDoableOnly')}
      >
        {filters.showDoableOnly ? t('filters.showAll') : t('filters.showDoable')}
      </button>

      <button
        type="button"
        className={`filter-toggle-button${filters.hideCompleted ? ' is-active' : ''}`}
        aria-pressed={filters.hideCompleted}
        onClick={() => handleToggle('hideCompleted')}
      >
        {t('filters.hideCompleted')}
      </button>

      <button
        type="button"
        className={`filter-toggle-button${filters.hasAttachmentsOnly ? ' is-active' : ''}`}
        aria-pressed={filters.hasAttachmentsOnly}
        onClick={() => handleToggle('hasAttachmentsOnly')}
      >
        {t('filters.hasAttachments')}
      </button>

      <div className="filter-date-group">
        <label htmlFor="filter-due-date">{t('filters.dueDate')}</label>
        <input
          id="filter-due-date"
          className="filter-date-input"
          type="date"
          value={filters.dueDate ?? ''}
          onChange={(event) => handleDueDateChange(event.target.value)}
        />
        {filters.dueDate ? (
          <button type="button" className="filter-toggle-button" onClick={clearDueDate}>
            {t('filters.clearDate')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default FilterPanel
