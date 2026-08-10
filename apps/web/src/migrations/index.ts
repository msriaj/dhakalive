import * as migration_20260810_043149_initial from './20260810_043149_initial'

export const migrations = [
  {
    up: migration_20260810_043149_initial.up,
    down: migration_20260810_043149_initial.down,
    name: '20260810_043149_initial',
  },
]
