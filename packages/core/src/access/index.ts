export { ROLES, ROLE_RANK, isRole, toRoles } from './roles.js'
export type { Role } from './roles.js'

export {
  CAPABILITIES,
  capabilitiesForRole,
  capabilitiesForRoles,
  roleHasCapability,
} from './capabilities.js'
export type { Capability } from './capabilities.js'

export {
  can,
  canAll,
  canAny,
  canAssignRole,
  canManageUser,
  capabilitiesOf,
  effectiveRank,
  isSameUser,
  isSuperAdmin,
  rolesOf,
  validateRoleAssignment,
} from './user.js'
export type { AuthUser, RoleAssignmentResult } from './user.js'
