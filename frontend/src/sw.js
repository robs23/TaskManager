/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

const DEFAULT_NOTIFICATION_TITLE = 'Task reminder'
const NOTIFICATION_ICON = '/icons/icon-192x192.png'
const PUSH_MESSAGE_TYPE = 'push-notification'

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({
        maxAgeSeconds: 24 * 60 * 60,
      }),
    ],
  }),
)

const parsePushPayload = (event) => {
  if (!event.data) {
    return {}
  }

  try {
    return event.data.json()
  } catch {
    return {}
  }
}

const getTodoId = (payload) => {
  if (typeof payload.todoId === 'number' && Number.isFinite(payload.todoId)) {
    return payload.todoId
  }

  if (typeof payload.todoId === 'string') {
    const parsed = Number(payload.todoId)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event)
  const title =
    typeof payload.title === 'string' && payload.title.trim().length > 0
      ? payload.title.trim()
      : DEFAULT_NOTIFICATION_TITLE
  const body = typeof payload.body === 'string' ? payload.body : ''
  const todoId = getTodoId(payload)

  const notificationPromise = self.registration.showNotification(title, {
    body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    data: { todoId },
  })

  const postMessagePromise = self.clients
    .matchAll({ type: 'window', includeUncontrolled: true })
    .then((windowClients) => {
      windowClients.forEach((client) => {
        client.postMessage({
          type: PUSH_MESSAGE_TYPE,
          payload: {
            title,
            body,
            todoId,
          },
        })
      })
    })

  event.waitUntil(Promise.all([notificationPromise, postMessagePromise]))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      if (windowClients.length > 0) {
        return windowClients[0].focus()
      }

      return self.clients.openWindow('/')
    }),
  )
})
