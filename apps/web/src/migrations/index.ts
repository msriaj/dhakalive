import * as migration_20260810_043149_initial from './20260810_043149_initial'
import * as migration_20260810_045718_add_user_roles from './20260810_045718_add_user_roles'
import * as migration_20260810_054426_editorial_content from './20260810_054426_editorial_content'
import * as migration_20260810_060319_pages_and_globals from './20260810_060319_pages_and_globals'
import * as migration_20260810_092502_jobs_infrastructure from './20260810_092502_jobs_infrastructure'
import * as migration_20260810_093000_search_documents from './20260810_093000_search_documents'
import * as migration_20260810_094311_search_index_task from './20260810_094311_search_index_task'

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
  {
    up: migration_20260810_054426_editorial_content.up,
    down: migration_20260810_054426_editorial_content.down,
    name: '20260810_054426_editorial_content',
  },
  {
    up: migration_20260810_060319_pages_and_globals.up,
    down: migration_20260810_060319_pages_and_globals.down,
    name: '20260810_060319_pages_and_globals',
  },
  {
    up: migration_20260810_092502_jobs_infrastructure.up,
    down: migration_20260810_092502_jobs_infrastructure.down,
    name: '20260810_092502_jobs_infrastructure',
  },
  {
    up: migration_20260810_093000_search_documents.up,
    down: migration_20260810_093000_search_documents.down,
    name: '20260810_093000_search_documents',
  },
  {
    up: migration_20260810_094311_search_index_task.up,
    down: migration_20260810_094311_search_index_task.down,
    name: '20260810_094311_search_index_task',
  },
]
