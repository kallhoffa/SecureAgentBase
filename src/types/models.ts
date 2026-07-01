export interface Post {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  replyCount: number;
  createdAt: Date;
}

export interface Reply {
  id: string;
  postId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  createdAt: Date;
}

export interface UserApp {
  id: string;
  user_id: string;
  app_name: string;
  app_description?: string;
  github_repo: string;
  github_repo_url: string;
  gcp_project_id: string;
  discord_webhook?: string;
  discord_channel_id?: string;
  vm_ip?: string;
  vm_name?: string;
  status: AppStatus;
  created_at: string;
  error?: string;
}

export type AppStatus = 'provisioning' | 'ready' | 'provisioning_failed';

export interface InfraConfig {
  user_id: string;
  github_repo_url?: string;
  github_forked_at?: string;
  github_app_installed?: boolean;
  github_installation_id?: string;
  github_installed_at?: string;
  gcp_project_id?: string;
  gcp_access_token?: string;
  service_account_configured?: boolean;
  service_account_key?: string;
}

export interface UserPreferences {
  beta_enabled?: boolean;
}
