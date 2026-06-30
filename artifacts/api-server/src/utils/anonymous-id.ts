import { v4 as uuidv4 } from "uuid";

export function generateAnonymousUsername(prefix = "Resident"): string {
  const numericId = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}_${numericId}`;
}

export function generateAnonymousId(): string {
  return uuidv4();
}

export function generateStaffUsername(prefix = "Staff"): string {
  const numericId = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}_${numericId}`;
}
