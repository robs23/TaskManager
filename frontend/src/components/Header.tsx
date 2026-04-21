import { mdiBell, mdiBellOutline } from '@mdi/js'
import Icon from '@mdi/react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

export interface HeaderReminderItem {
  reminderId: number
  todoId: number
  todoName: string
  reminderDateTimeUtc: string
  isSent: boolean
}

interface HeaderProps {
  onRefresh: () => Promise<void>
  isRefreshing: boolean
  onToggleSettingsView: () => void
  isSettingsView: boolean
  userName: string
  isAuthenticated: boolean
  onLogout: () => void
  reminders: HeaderReminderItem[]
  hasReminderBadge: boolean
  onReminderClick: (reminder: HeaderReminderItem) => void
  onDeleteReminder: (todoId: number, reminderId: number) => void
}

function Header({
  onRefresh,
  isRefreshing,
  onToggleSettingsView,
  isSettingsView,
  userName,
  isAuthenticated,
  onLogout,
  reminders,
  hasReminderBadge,
  onReminderClick,
  onDeleteReminder,
}: HeaderProps) {
  const { t } = useTranslation()
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false)
  const notificationsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isNotificationsOpen) {
      return
    }

    const handleDocumentClick = (event: MouseEvent): void => {
      if (
        notificationsRef.current !== null &&
        event.target instanceof Node &&
        !notificationsRef.current.contains(event.target)
      ) {
        setIsNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
    }
  }, [isNotificationsOpen])

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
            <div className="notification-bell" ref={notificationsRef}>
              <button
                className={`header-action-button header-icon-button${isNotificationsOpen ? ' is-active' : ''}`}
                type="button"
                onClick={() => setIsNotificationsOpen((previous) => !previous)}
                aria-label={t('notifications.title')}
                aria-haspopup="true"
                aria-expanded={isNotificationsOpen}
              >
                <Icon path={isNotificationsOpen ? mdiBell : mdiBellOutline} size={0.82} />
              </button>
              {hasReminderBadge ? <span className="notification-badge" aria-hidden="true" /> : null}
              {isNotificationsOpen ? (
                <div className="notification-dropdown" role="menu" aria-label={t('notifications.title')}>
                  <p className="notification-dropdown-title">{t('notifications.title')}</p>
                  {reminders.length === 0 ? (
                    <p className="notification-empty">{t('notifications.noReminders')}</p>
                  ) : (
                    <ul className="notification-list">
                      {reminders.map((reminder) => (
                        <li key={`${reminder.todoId}-${reminder.reminderId}`} className="notification-item">
                          <button
                            className="notification-item-content"
                            type="button"
                            onClick={() => {
                              setIsNotificationsOpen(false)
                              onReminderClick(reminder)
                            }}
                            role="menuitem"
                          >
                            <span className="notification-item-todo">{reminder.todoName}</span>
                            <span className="notification-item-time">
                              {new Date(reminder.reminderDateTimeUtc).toLocaleString()}
                            </span>
                            <span className={`notification-status ${reminder.isSent ? 'sent' : 'pending'}`}>
                              {reminder.isSent ? t('notifications.sent') : t('notifications.pending')}
                            </span>
                          </button>
                          <button
                            className="notification-item-delete"
                            type="button"
                            aria-label={t('notifications.deleteReminder')}
                            title={t('notifications.deleteReminder')}
                            onClick={() => onDeleteReminder(reminder.todoId, reminder.reminderId)}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
            </div>
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
