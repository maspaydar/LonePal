const SP_ID_KEY = "sp_service_provider_id";
const SP_ENTITY_KEY = "sp_entity_id";

export interface ServiceProviderIdentity {
  serviceProviderId: number;
  entityId: number;
}

export function getServiceProviderIdentity(): ServiceProviderIdentity | null {
  const sp = localStorage.getItem(SP_ID_KEY);
  const entity = localStorage.getItem(SP_ENTITY_KEY);
  if (!sp || !entity) return null;
  const serviceProviderId = Number(sp);
  const entityId = Number(entity);
  if (!Number.isInteger(serviceProviderId) || !Number.isInteger(entityId)) return null;
  return { serviceProviderId, entityId };
}

export function setServiceProviderIdentity(identity: ServiceProviderIdentity): void {
  localStorage.setItem(SP_ID_KEY, String(identity.serviceProviderId));
  localStorage.setItem(SP_ENTITY_KEY, String(identity.entityId));
}

export function clearServiceProviderIdentity(): void {
  localStorage.removeItem(SP_ID_KEY);
  localStorage.removeItem(SP_ENTITY_KEY);
}

export function isServiceProviderAuthenticated(): boolean {
  return getServiceProviderIdentity() !== null;
}
