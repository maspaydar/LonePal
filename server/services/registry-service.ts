import { storage } from "../storage";
import { provisionEntityFolder } from "../tenant-folders";
import { dailyLogger } from "../daily-logger";
import { generateAnonymousUsername } from "../utils/anonymous-id";
import { insertEntitySchema, insertResidentSchema } from "@shared/schema";
import type { Entity, Resident, InsertEntity, InsertResident } from "@shared/schema";

export interface CreateEntityInput {
  name: string;
  type?: string;
  address?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface AddUserInput {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  roomNumber?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  medicalNotes?: string;
  preferredName?: string;
  communicationStyle?: string;
  intakeInterviewData?: Record<string, any>;
  digitalTwinPersona?: Record<string, any>;
}

export interface RegistryUser {
  id: number;
  entityId: number;
  anonymousUsername: string;
  firstName: string;
  lastName: string;
  roomNumber: string | null;
  preferredName: string | null;
  status: string;
  isActive: boolean;
  createdAt: Date | null;
}

function toRegistryUser(resident: Resident): RegistryUser {
  return {
    id: resident.id,
    entityId: resident.entityId,
    anonymousUsername: resident.anonymousUsername || `Resident_${String(resident.id).padStart(4, "0")}`,
    firstName: resident.firstName,
    lastName: resident.lastName,
    roomNumber: resident.roomNumber,
    preferredName: resident.preferredName,
    status: resident.status,
    isActive: resident.isActive,
    createdAt: resident.createdAt,
  };
}

export const registryService = {
  async createEntity(input: CreateEntityInput): Promise<Entity> {
    const parsed = insertEntitySchema.safeParse({
      name: input.name,
      type: input.type || "facility",
      address: input.address || null,
      contactPhone: input.contactPhone || null,
      contactEmail: input.contactEmail || null,
    });

    if (!parsed.success) {
      throw new Error(`Validation failed: ${JSON.stringify(parsed.error.flatten())}`);
    }

    const entity = await storage.createEntity(parsed.data);
    provisionEntityFolder(entity.id);

    dailyLogger.info("registry", `Entity created: ${entity.name} (ID: ${entity.id})`, {
      entityId: entity.id,
      entityName: entity.name,
    });

    return entity;
  },

  async addUser(entityId: number, input: AddUserInput): Promise<RegistryUser> {
    const entity = await storage.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }

    const anonymousUsername = generateAnonymousUsername();

    const parsed = insertResidentSchema.safeParse({
      entityId,
      anonymousUsername,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth || null,
      roomNumber: input.roomNumber || null,
      emergencyContact: input.emergencyContact || null,
      emergencyPhone: input.emergencyPhone || null,
      medicalNotes: input.medicalNotes || null,
      preferredName: input.preferredName || null,
      communicationStyle: input.communicationStyle || null,
      intakeInterviewData: input.intakeInterviewData || null,
      digitalTwinPersona: input.digitalTwinPersona || null,
      status: "safe",
      isActive: true,
    });

    if (!parsed.success) {
      throw new Error(`Validation failed: ${JSON.stringify(parsed.error.flatten())}`);
    }

    const resident = await storage.createResident(parsed.data);

    dailyLogger.info("registry", `User added to entity ${entityId}: ${anonymousUsername}`, {
      entityId,
      residentId: resident.id,
      anonymousUsername,
      room: resident.roomNumber,
    });

    return toRegistryUser(resident);
  },

  async listUsers(entityId: number): Promise<RegistryUser[]> {
    const entity = await storage.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }

    const residents = await storage.getResidents(entityId);
    return residents.map(toRegistryUser);
  },

  async getUser(userId: number): Promise<RegistryUser | null> {
    const resident = await storage.getResident(userId);
    if (!resident) return null;
    return toRegistryUser(resident);
  },
};
