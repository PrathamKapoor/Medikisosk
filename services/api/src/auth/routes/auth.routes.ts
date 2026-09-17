/**
 * Authentication routes.
 *
 * The route layer does three things only: validate the request shape, call the service, and format the
 * response. It makes no authorisation decision of its own, because a route that reasons about roles is
 * how two endpoints end up disagreeing about who may do what.
 *
 * Errors are thrown as typed `MediKioskError`s and converted centrally by the error handler, so no
 * route contains its own error-to-status mapping.
 */

import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../config/env';
import { authenticateStaff } from '../middleware/authenticate';
import type { AuthService } from '../service/auth.service';

export interface AuthRouteDeps {
  readonly authService: AuthService;
  readonly config: AppConfig;
}

/**
 * Login body.
 *
 * `min(1)` on the password rather than the creation policy's `min(8)`: a login endpoint must not
 * disclose the password policy, and a legacy shorter password should produce a normal 401 rather than a
 * 400 that reveals the rule.
 */
const loginBodySchema = z.object({
  tenantSlug: z.string().min(1).max(64),
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthRouteDeps,
): Promise<void> {
  app.post('/api/v1/auth/login', async (request, reply) => {
    const body = loginBodySchema.parse(request.body ?? {});
    const result = await deps.authService.login(body, { requestId: String(request.id) });

    // Result -> throw, so the single error handler owns the envelope.
    if (!result.ok) throw result.error;
    const outcome = result.value;

    reply.status(200).send({
      token: outcome.token,
      expiresAt: outcome.expiresAt,
      user: {
        id: outcome.principal.userId,
        username: outcome.principal.username,
        displayName: outcome.principal.displayName,
        roles: outcome.principal.roles,
      },
      permissions: outcome.permissions,
      tenant: outcome.tenant,
    });
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const principal = await authenticateStaff(request, deps.config);
    await deps.authService.logout(principal, { requestId: String(request.id) });
    reply.status(204).send();
  });

  app.get('/api/v1/auth/me', async (request, reply) => {
    const principal = await authenticateStaff(request, deps.config);

    reply.status(200).send({
      user: {
        id: principal.userId,
        username: principal.username,
        displayName: principal.displayName,
        roles: principal.roles,
      },
      // The tenant is echoed from the verified token, never from a request header.
      tenant: { id: principal.tenantId },
      permissions: deps.authService.permissionsFor(principal),
    });
  });
}