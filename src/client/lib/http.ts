/** A failed API call, carrying the status and the `code` from the server's error body. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

/** A request that hangs longer than this fails, instead of blocking the UI forever. */
const REQUEST_TIMEOUT_MS = 10_000

/** Calls the API on this origin and returns the JSON body. Throws ApiError on a non-2xx status. */
export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options
  const response = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const payload: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const { code = 'HTTP_ERROR', message = response.statusText } = (payload ?? {}) as {
      code?: string
      message?: string
    }
    throw new ApiError(response.status, code, message)
  }
  return payload as T
}
