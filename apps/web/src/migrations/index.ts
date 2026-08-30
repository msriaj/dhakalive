import * as migration_20260810_043149_initial from './20260810_043149_initial'
import * as migration_20260810_045718_add_user_roles from './20260810_045718_add_user_roles'
import * as migration_20260810_054426_editorial_content from './20260810_054426_editorial_content'
import * as migration_20260810_060319_pages_and_globals from './20260810_060319_pages_and_globals'
import * as migration_20260810_092502_jobs_infrastructure from './20260810_092502_jobs_infrastructure'
import * as migration_20260810_093000_search_documents from './20260810_093000_search_documents'
import * as migration_20260810_094311_search_index_task from './20260810_094311_search_index_task'
import * as migration_20260810_095314_scheduled_tasks from './20260810_095314_scheduled_tasks'
import * as migration_20260810_100138_drop_job_schedules from './20260810_100138_drop_job_schedules'
import * as migration_20260810_100853_revalidate_task from './20260810_100853_revalidate_task'
import * as migration_20260810_104804_redirects from './20260810_104804_redirects'
import * as migration_20260810_105719_advertisements from './20260810_105719_advertisements'
import * as migration_20260811_033509_article_source from './20260811_033509_article_source'
import * as migration_20260811_073709_homepage_sections_and_footer_bands from './20260811_073709_homepage_sections_and_footer_bands'
import * as migration_20260811_090414_lead_columns_take_a_source from './20260811_090414_lead_columns_take_a_source'
import * as migration_20260811_092641_footer_apps_toggle from './20260811_092641_footer_apps_toggle'
import * as migration_20260811_112353_article_view_count from './20260811_112353_article_view_count'
import * as migration_20260830_033524_social_posts from './20260830_033524_social_posts'
import * as migration_20260830_035104_social_platforms from './20260830_035104_social_platforms'
import * as migration_20260830_083012_social_approval from './20260830_083012_social_approval'
import * as migration_20260830_120000_search_url_text from './20260830_120000_search_url_text'

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
  {
    up: migration_20260810_095314_scheduled_tasks.up,
    down: migration_20260810_095314_scheduled_tasks.down,
    name: '20260810_095314_scheduled_tasks',
  },
  {
    up: migration_20260810_100138_drop_job_schedules.up,
    down: migration_20260810_100138_drop_job_schedules.down,
    name: '20260810_100138_drop_job_schedules',
  },
  {
    up: migration_20260810_100853_revalidate_task.up,
    down: migration_20260810_100853_revalidate_task.down,
    name: '20260810_100853_revalidate_task',
  },
  {
    up: migration_20260810_104804_redirects.up,
    down: migration_20260810_104804_redirects.down,
    name: '20260810_104804_redirects',
  },
  {
    up: migration_20260810_105719_advertisements.up,
    down: migration_20260810_105719_advertisements.down,
    name: '20260810_105719_advertisements',
  },
  {
    up: migration_20260811_033509_article_source.up,
    down: migration_20260811_033509_article_source.down,
    name: '20260811_033509_article_source',
  },
  {
    up: migration_20260811_073709_homepage_sections_and_footer_bands.up,
    down: migration_20260811_073709_homepage_sections_and_footer_bands.down,
    name: '20260811_073709_homepage_sections_and_footer_bands',
  },
  {
    up: migration_20260811_090414_lead_columns_take_a_source.up,
    down: migration_20260811_090414_lead_columns_take_a_source.down,
    name: '20260811_090414_lead_columns_take_a_source',
  },
  {
    up: migration_20260811_092641_footer_apps_toggle.up,
    down: migration_20260811_092641_footer_apps_toggle.down,
    name: '20260811_092641_footer_apps_toggle',
  },
  {
    up: migration_20260811_112353_article_view_count.up,
    down: migration_20260811_112353_article_view_count.down,
    name: '20260811_112353_article_view_count',
  },
  {
    up: migration_20260830_033524_social_posts.up,
    down: migration_20260830_033524_social_posts.down,
    name: '20260830_033524_social_posts',
  },
  {
    up: migration_20260830_035104_social_platforms.up,
    down: migration_20260830_035104_social_platforms.down,
    name: '20260830_035104_social_platforms',
  },
  {
    up: migration_20260830_083012_social_approval.up,
    down: migration_20260830_083012_social_approval.down,
    name: '20260830_083012_social_approval',
  },
  {
    up: migration_20260830_120000_search_url_text.up,
    down: migration_20260830_120000_search_url_text.down,
    name: '20260830_120000_search_url_text',
  },
]
