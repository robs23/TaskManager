import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchWithAuth } from '../api/fetchWithAuth'

type AuthMode = 'login' | 'register'

interface LoginResponse {
  token: string
  username: string
}

interface AuthFormProps {
  onAuthenticated: (token: string, username: string) => void
}

function AuthForm({ onAuthenticated }: AuthFormProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<AuthMode>('login')
  const [username, setUsername] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [error, setError] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  const isLoginMode = mode === 'login'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const payload = {
        username: username.trim(),
        password,
      }

      if (isLoginMode) {
        const loginResponse = await fetchWithAuth('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (!loginResponse.ok) {
          throw new Error(t('auth.errors.loginFailed'))
        }

        const data = (await loginResponse.json()) as LoginResponse
        if (!data.token || !data.username) {
          throw new Error(t('auth.errors.loginFailed'))
        }

        onAuthenticated(data.token, data.username)
        return
      }

      const registerResponse = await fetchWithAuth('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!registerResponse.ok) {
        throw new Error(t('auth.errors.registerFailed'))
      }

      setMode('login')
      setPassword('')
      setError(t('auth.messages.registerSuccess'))
    } catch (submitError) {
      console.error(submitError)
      setError((submitError as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleMode = (): void => {
    setMode((previous) => (previous === 'login' ? 'register' : 'login'))
    setError('')
    setPassword('')
  }

  return (
    <section className="auth-panel" aria-live="polite">
      <h2 className="auth-title">{isLoginMode ? t('auth.loginTitle') : t('auth.registerTitle')}</h2>
      <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="todo-field-label" htmlFor="auth-username">
          {t('auth.username')}
        </label>
        <input
          id="auth-username"
          className="todo-input"
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          required
          disabled={isSubmitting}
        />

        <label className="todo-field-label" htmlFor="auth-password">
          {t('auth.password')}
        </label>
        <input
          id="auth-password"
          className="todo-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={isLoginMode ? 'current-password' : 'new-password'}
          required
          disabled={isSubmitting}
        />

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="auth-actions">
          <button className="primary-button auth-submit-button" type="submit" disabled={isSubmitting}>
            {isLoginMode
              ? isSubmitting
                ? t('auth.loggingIn')
                : t('auth.login')
              : isSubmitting
                ? t('auth.registering')
                : t('auth.register')}
          </button>
          <button className="secondary-button auth-toggle-button" type="button" onClick={toggleMode}>
            {isLoginMode ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </button>
        </div>
      </form>
    </section>
  )
}

export default AuthForm
