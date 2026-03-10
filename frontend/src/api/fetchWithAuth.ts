const AUTH_EXCLUDED_PREFIX = '/api/auth/'

const resolvePathname = (input: RequestInfo | URL): string | null => {
  if (typeof input === 'string') {
    if (input.startsWith('/')) {
      return input.split('?')[0]
    }

    if (input.startsWith('http://') || input.startsWith('https://')) {
      return new URL(input).pathname
    }

    return null
  }

  if (input instanceof URL) {
    return input.pathname
  }

  if (input instanceof Request) {
    return new URL(input.url).pathname
  }

  return null
}

const getAccessTokenWithRefreshPlaceholder = (): string => {
  const token = localStorage.getItem('token') ?? ''
  // Placeholder: add refresh token flow here when OAuth/token refresh is implemented.
  return token
}

const clearAuthAndRedirectToLogin = (): void => {
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  window.location.reload()
}

export const fetchWithAuth = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const pathname = resolvePathname(input)
  const isApiRequest = pathname?.startsWith('/api/') ?? false
  const isAuthEndpoint = pathname?.startsWith(AUTH_EXCLUDED_PREFIX) ?? false

  const headers = new Headers(init?.headers ?? undefined)
  const token = getAccessTokenWithRefreshPlaceholder()
  if (isApiRequest && token.length > 0) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(input, {
    ...init,
    headers,
  })

  if (isApiRequest && !isAuthEndpoint && response.status === 401) {
    clearAuthAndRedirectToLogin()
  }

  return response
}
