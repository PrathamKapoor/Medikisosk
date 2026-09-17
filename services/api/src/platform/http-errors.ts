/**
 * HTTP error mapping.
 *
 * One place converts every throwable into the contract's error envelope, so no route can leak a
 * stack trace, SQL text, an internal path or a provider payload to a client. The envelope shape is
 * fixed by `docs/api/CONTRACT.md`.
 *
 * Unexpected errors are logged with their real message server-side and reported to the client as a
 * generic internal error. That asymmetry is the point: operators need the cause, clients must not
 * receive it.
 */

import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { MediKioskError, ERROR_STATUS } from '@medikiosk/shared-types';
import type { AppLogger } from './logger';

export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly requestId: string;
    readonly details?: Record<string, unknown>;
  };
}

export function envelope(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
): ErrorEnvelope {
  return details === undefined
    ? { error: { code, message, requestId } }
    : { error: { code, message, requestId, details } };
}

/**
 * Translate a Zod failure into a machine-readable validation error.
 *
 * Field paths are included because a client needs to know which field is wrong. Values are not,
 * because a rejected value may be clinical text or a credential.
 */
export function validationDetails(error: ZodError): Record<string, unknown> {
  return {
    fields: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

export function registerErrorHandler(app: FastifyInstance, logger: AppLogger): void {
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = String(request.id ?? 'unknown');

    if (MediKioskError.is(error)) {
      // Expected, categorised application error. Safe to return verbatim.
      reply.status(error.status).send(envelope(error.code, error.message, requestId, error.details));
      return;
    }

    if (error instanceof ZodError) {
      reply
        .status(ERROR_STATUS.VALIDATION_FAILED)
        .send(
          envelope(
            'VALIDATION_FAILED',
            'The request did not match the expected shape.',
            requestId,
            validationDetails(error),
          ),
        );
      return;
    }

    if ('statusCode' in error && typeof error.statusCode === 'number' && error.statusCode < 500) {
      // Fastify's own 4xx errors (bad JSON, unsupported media type, body too large). The message is
      // Fastify's and contains no application internals, but it is not part of our catalogue, so it
      // is reported under a generic code with the specific reason preserved.
      const code = error.statusCode === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'VALIDATION_FAILED';
      reply.status(error.statusCode).send(envelope(code, error.message, requestId));
      return;
    }

    // Unknown failure. Log everything, return almost nothing.
    logger.error({ requestId, route: request.url }, 'Unhandled request failure', {
      name: error.name,
      message: error.message,
    });
    reply
      .status(ERROR_STATUS.INTERNAL_ERROR)
      .send(
        envelope(
          'INTERNAL_ERROR',
          'An unexpected internal error occurred. The incident has been recorded.',
          requestId,
        ),
      );
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply
      .status(ERROR_STATUS.NOT_FOUND)
      .send(envelope('NOT_FOUND', `No route matches ${request.method} ${request.url}.`, String(request.id)));
  });
}

/** Echo or generate a request id, so a client can quote it when reporting a problem. */
export function registerRequestIdHeader(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', String(request.id));
  });
}

/** Reject any inbound tenant hint. The tenant is derived from the principal, never from a header. */
export function registerTenantHeaderGuard(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    if (request.headers['x-tenant-id'] !== undefined) {
      reply
        .status(400)
        .send(
          envelope(
            'VALIDATION_FAILED',
            'A tenant header is not accepted. The tenant is derived from the authenticated session.',
            String(request.id),
          ),
        );
    }
  });
}