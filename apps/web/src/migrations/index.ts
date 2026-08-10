import * as migration_20260810_043149_initial from './20260810_043149_initial'
import * as migration_20260810_045718_add_user_roles from './20260810_045718_add_user_roles'

export const migrations = [
  {
    up: migration_20260810_043149_initial.up,
    down: migration_20260810_043149_initial.down,
    name: '20260810_043149_initial',
  },
  {
    up: migration_20260810_045718_add_user_roles.up,
    down: migration_20260810_045718_add_user_roles.down,
    name: '20260810_045718_add_user_roles',
  },
]
