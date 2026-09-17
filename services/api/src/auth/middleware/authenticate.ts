/**
 * Staff authentication guard.
 *
 * Called at the top of any route that requires a signed-in user. It verifies the bearer token against
 * the expected audience and returns the principal, or throws a typed error that the error handler
 * converts into the contract envelope.
 *
 * The audience check is the security-relevant part: a kiosk session token must never be accepted as a
 * staff token, because the two grant very different access. `verifyToken` enforces the audience and
 * this guard additionally enforces the `kind` claim, so a token issued for one purpose cannot be
 * replayed for another even if both were signed with the same secret.
 */

import { errors } from "@medikiosk/shared-types";
import {
  bearerToken,
  verifyToken,
  type StaffTokenClaims,
} from "@medikiosk/auth";
import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../../config/env";
import type { AuthenticatedPrincipal } from "../types";

export async function authenticateStaff(
  request: FastifyRequest,
  config: AppConfig,
  now?: Date,
): Promise<AuthenticatedPrincipal> {
  const token = bearerToken(request.headers.authorization);
  if (!token) {
    throw errors.unauthenticated("Authentication is required.");
  }

  const result = await verifyToken<StaffTokenClaims>(
    token,
    config.MEDIKIOSK_JWT_SECRET,
    "STAFF",
    { now },
  );
  if (!result.ok) {
    // Distinguish expiry from every other rejection so a client can refresh or re-prompt, without
    // disclosing whether the signature or the audience was at fault.
    if (result.reason === "EXPIRED") {
      throw errors.unauthenticated(
        "Your session has expired. Please sign in again.",
      );
    }
    throw errors.unauthenticated("Authentication is required.");
  }

  const claims = result.claims;
  return {
    userId: claims.sub,
    tenantId: claims.tenantId,
    username: claims.username,
    displayName: claims.displayName,
    roles: claims.roles,
  };
}
