import type { Request } from "express";
import { storage } from "../storage";
import { log } from "../logger-util";
import type { ServiceProvider, ServiceProviderStatus, ServiceProviderType } from "@workspace/db";

/**
 * Service-provider authorization guards.
 *
 * Service providers are entity-scoped operators who set up the platform for a
 * facility. They earn a `status` of `registered` -> `in_training` -> `certified`
 * -> `approved`. Privileged setup actions (configuring a facility environment,
 * spinning up onboarding intake agents for seniors) must only run for providers
 * who have cleared certification, i.e. `certified` or `approved`.
 *
 * Every denial logs a clear warning to the system console so unauthorized
 * attempts are visible in operations logs.
 */

const LOG_SOURCE = "provider-auth";

// A provider must be at least certified to perform privileged setup work.
export const SETUP_ALLOWED_STATUSES: ServiceProviderStatus[] = ["certified", "approved"];

export interface ProviderAuthResult {
  ok: boolean;
  /** HTTP status to return on failure (401 missing identity, 403 not authorized). */
  httpStatus?: number;
  /** Client-safe error message. */
  error?: string;
  /** The authorized provider, present only when ok === true. */
  provider?: ServiceProvider;
}

/**
 * Reads the acting service provider's id from the request. Callers identify
 * themselves with the `x-service-provider-id` header (preferred) or a
 * `serviceProviderId` field in the JSON body. Returns undefined when absent or
 * not a positive integer.
 */
export function extractRequestingProviderId(req: Request): number | undefined {
  const headerValue = req.header("x-service-provider-id");
  const raw = headerValue ?? (req.body as Record<string, unknown> | undefined)?.serviceProviderId;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/**
 * Authorizes a specific requesting provider for a privileged action. Looks the
 * provider up scoped to `entityId` (tenant isolation), then enforces the allowed
 * statuses and, when given, the required type. Logs a warning on every denial.
 */
export async function authorizeServiceProvider(opts: {
  entityId: number | undefined;
  serviceProviderId: number | undefined;
  allowedStatuses: ServiceProviderStatus[];
  requiredType?: ServiceProviderType;
  action: string;
}): Promise<ProviderAuthResult> {
  const { entityId, serviceProviderId, allowedStatuses, requiredType, action } = opts;

  if (!serviceProviderId) {
    log(`Unauthorized ${action}: no service provider id supplied on the request`, LOG_SOURCE);
    return { ok: false, httpStatus: 401, error: "A requesting service provider must be identified for this action." };
  }

  if (!entityId) {
    log(`Unauthorized ${action}: could not resolve an entity scope for provider ${serviceProviderId}`, LOG_SOURCE);
    return { ok: false, httpStatus: 403, error: "Service provider is not authorized for this action." };
  }

  const provider = await storage.getServiceProvider(entityId, serviceProviderId);

  if (!provider) {
    log(`Unauthorized ${action}: provider ${serviceProviderId} not found for entity ${entityId}`, LOG_SOURCE);
    return { ok: false, httpStatus: 403, error: "Service provider is not authorized for this action." };
  }

  if (requiredType && provider.type !== requiredType) {
    log(
      `Unauthorized ${action}: provider ${provider.id} (entity ${entityId}) is type '${provider.type}', requires '${requiredType}'`,
      LOG_SOURCE,
    );
    return { ok: false, httpStatus: 403, error: "Service provider is not authorized for this action." };
  }

  if (!allowedStatuses.includes(provider.status)) {
    log(
      `Unauthorized ${action}: provider ${provider.id} (entity ${entityId}) has status '${provider.status}', requires one of [${allowedStatuses.join(", ")}]`,
      LOG_SOURCE,
    );
    return { ok: false, httpStatus: 403, error: "Service provider is not authorized for this action." };
  }

  return { ok: true, provider };
}

/**
 * Authorizes by capability rather than identity: confirms the entity has at
 * least one provider of `type` with an allowed status. Used for senior-triggered
 * flows (e.g. onboarding intake) where the request carries no provider identity,
 * but the action must still be backed by a certified/approved provider for that
 * facility. Logs a warning when no such provider exists.
 */
export async function authorizeEntityProviderCapability(opts: {
  entityId: number;
  requiredType: ServiceProviderType;
  allowedStatuses: ServiceProviderStatus[];
  action: string;
}): Promise<ProviderAuthResult> {
  const { entityId, requiredType, allowedStatuses, action } = opts;

  const providers = await storage.getServiceProvidersByType(entityId, requiredType);
  const authorized = providers.find((p) => allowedStatuses.includes(p.status));

  if (!authorized) {
    log(
      `Unauthorized ${action}: entity ${entityId} has no '${requiredType}' provider with status in [${allowedStatuses.join(", ")}]`,
      LOG_SOURCE,
    );
    return {
      ok: false,
      httpStatus: 403,
      error: "This facility has no certified provider authorized for this action.",
    };
  }

  return { ok: true, provider: authorized };
}
