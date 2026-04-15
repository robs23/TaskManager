import { useTranslation } from 'react-i18next'

interface HeaderProps {
  onRefresh: () => Promise<void>
  isRefreshing: boolean
  onToggleSettingsView: () => void
  isSettingsView: boolean
  userName: string
  isAuthenticated: boolean
  onLogout: () => void
}

function Header({
  onRefresh,
  isRefreshing,
  onToggleSettingsView,
  isSettingsView,
  userName,
  isAuthenticated,
  onLogout,
}: HeaderProps) {
  const { t } = useTranslation()

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <svg
          className="app-logo"
          viewBox="0 0 40 40"
          role="img"
          aria-label={t('header.logoAria')}
          focusable="false"
        >
          <defs>
            <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="36" height="36" rx="10" fill="#0f2543" stroke="#93c5fd" strokeWidth="2" />
          <path
            d="M12 19.5l5.5 5.5L28.5 14"
            fill="none"
            stroke="url(#logo-gradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="app-brand-text">
          <h1>{t('app.title')}</h1>
          <p className="app-subtitle">{t('app.subtitle')}</p>
        </div>
      </div>
      <div className="app-header-controls">
        <div className="app-user-info">
          <span className="app-user-label">{t('header.user')}:</span>
          <span className="app-user-name">
            {isAuthenticated ? userName : t('header.userName')}
          </span>
        </div>
        {isAuthenticated ? (
          <>
            <button
              className={`header-action-button${isSettingsView ? ' is-active' : ''}`}
              type="button"
              onClick={onToggleSettingsView}
              aria-pressed={isSettingsView}
            >
              {isSettingsView ? t('settings.viewTodos') : t('settings.open')}
            </button>
            <button
              className="header-action-button"
              type="button"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
            >
              {t('app.refresh')}
            </button>
            <button className="header-action-button" type="button" onClick={onLogout}>
              {t('header.logout')}
            </button>
          </>
        ) : null}
      </div>
    </header>
  )
}

export default Header
