// src/shared/api/client.ts

import humps from 'humps'

const BASE_URL = import.meta.env.VITE_API_URL || ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  convertKeys = true,
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const headers = new Headers(options.headers)

  // Set default JSON headers if sending a request body
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  // Inject authentication token if it exists in localStorage
  const token = localStorage.getItem('auth_token')
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(url, { ...options, headers })

  if (!response.ok) {
    let errorData
    try {
      errorData = await response.json()
    } catch {
      errorData = null
    }
    // The Go backend reports failures as {"error": "..."}; other callers use "message".
    throw new ApiError(
      response.status,
      errorData?.message ||
        errorData?.error ||
        `HTTP error! Status: ${response.status}`,
      errorData,
    )
  }

  if (response.status === 204) {
    return null as T
  }

  const json = await response.json()
  return (convertKeys ? humps.camelizeKeys(json) : json) as T
}

export const apiClient = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(humps.decamelizeKeys(body)) : undefined,
    }),
  put: <T>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(humps.decamelizeKeys(body)) : undefined,
    }),
  patch: <T>(path: string, body?: any, options?: RequestInit) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(humps.decamelizeKeys(body)) : undefined,
    }),
  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}

// rawApiClient sends and returns JSON exactly as given, without converting keys
// between camelCase and snake_case. Use it where payloads hold keys the client must
// not rename, such as item props (`is_favorite`, BlockNote's `textColor`).
export const rawApiClient = {
  get: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'GET' }, false),
  post: <T>(path: string, body?: unknown, options?: RequestInit) =>
    request<T>(
      path,
      {
        ...options,
        method: 'POST',
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      false,
    ),
  delete: <T>(path: string, options?: RequestInit) =>
    request<T>(path, { ...options, method: 'DELETE' }, false),
}
