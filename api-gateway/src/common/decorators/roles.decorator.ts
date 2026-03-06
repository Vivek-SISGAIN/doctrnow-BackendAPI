import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

export enum UserRole {
  PATIENT = 'PATIENT',
  DOCTOR = 'DOCTOR',
  HOSPITAL_ADMIN = 'HOSPITAL_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/**
 * Decorator to specify required roles for a route
 * @param roles - Array of roles allowed to access the route
 * @example @Roles(UserRole.DOCTOR, UserRole.SUPER_ADMIN)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

