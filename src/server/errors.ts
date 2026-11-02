import { STATUS_CODES } from 'node:http'
import type { FastifyError, FastifyInstance } from 'fastify'
import type { z } from 'zod'

/** An error the client caused or should know about, sent as the standard error body. */
export class HttpError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly issues: ValidationIssue[] | undefined

  constructor(statusCode: number, code: string, message: string, issues?: ValidationIssue[]) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = code
    this.issues = issues
  }
}

export interface ValidationIssue {
  path: string
  message: string
}

/** The body of every error response. */
export interface ErrorBody {
  statusCode: number
  error: string
  message: string
  code: string
  issues?: ValidationIssue[]
}

export function errorBody(
  statusCode: number,
  code: string,
  message: string,
  issues?: ValidationIssue[],
): ErrorBody {
  return {
    statusCode,
    error: STATUS_CODES[statusCode] ?? 'Error',
    message,
    code,
    ...(issues ? { issues } : {}),
  }
}

/** The 404 for a room id that matches no room. */
export function roomNotFound(roomId: number): HttpError {
  return new HttpError(404, 'ROOM_NOT_FOUND', `Room ${roomId} does not exist.`)
}

/** Parses untrusted input, or throws a 400 VALIDATION_FAILED that lists what was wrong. */
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const issues = result.error.issues.map(({ path, message }) => ({
    path: path.join('.'),
    message,
  }))
  throw new HttpError(400, 'VALIDATION_FAILED', 'The request is not valid.', issues)
}

/** Sends every error in the standard shape. Server errors are logged, never shown in detail. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .code(error.statusCode)
        .send(errorBody(error.statusCode, error.code, error.message, error.issues))
    }

    const statusCode = error.statusCode ?? 500
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed')
      return reply
        .code(500)
        .send(errorBody(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.'))
    }

    // Fastify's own client errors, such as malformed JSON or a body over the size limit.
    return reply.code(statusCode).send(errorBody(statusCode, error.code, error.message))
  })
}
