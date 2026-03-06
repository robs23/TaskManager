import type { ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'

interface HeaderProps {
  onRefresh: () => Promise<void>
  isRefreshing: boolean
  onToggleCreate: () => void
  isCreateVisible: boolean
}

const normalizeLanguage = (language: string | undefined): 'en' | 'pl' => {
  if (language?.toLowerCase().startsWith('pl')) {
    return 'pl'
  }

  return 'en'
}

function Header({ onRefresh, isRefreshing, onToggleCreate, isCreateVisible }: HeaderProps) {
  const { t, i18n } = useTranslation()
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language)

  const handleLanguageChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const nextLanguage = event.target.value === 'pl' ? 'pl' : 'en'
    void i18n.changeLanguage(nextLanguage)
  }

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <h1>{t('app.title')}</h1>
        <p className="app-subtitle">{t('app.subtitle')}</p>
      </div>
      <div className="app-header-controls">
        <div className="app-user-info">
          <span className="app-user-label">{t('header.user')}:</span>
          <span className="app-user-name">{t('header.userName')}</span>
        </div>
        <div className="app-language-control">
          <label className="sr-only" htmlFor="language-selector">
            {t('header.language')}
          </label>
          <select
            id="language-selector"
            className="header-select"
            aria-label={t('header.language')}
            value={currentLanguage}
            onChange={handleLanguageChange}
          >
            <option value="en">EN</option>
            <option value="pl">PL</option>
          </select>
        </div>
        <button
          className="header-action-button header-action-button--create"
          type="button"
          onClick={onToggleCreate}
        >
          {isCreateVisible ? t('buttons.cancel') : t('buttons.create')}
        </button>
        <button
          className="header-action-button"
          type="button"
          onClick={() => void onRefresh()}
          disabled={isRefreshing}
        >
          {t('app.refresh')}
        </button>
      </div>
    </header>
  )
}

export default Header
