export type GitProvider = 'github' | 'gitlab' | 'bitbucket';

export interface GitIntegration {
  id: string;
  provider: GitProvider;
  account_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  scopes: string[];
  access_token: string; // encrypted
  refresh_token?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeGitIntegration {
  id: string;
  provider: GitProvider;
  account_id: string;
  username: string;
  display_name: string;
  avatar_url: string;
  scopes: string[];
  has_token: boolean;
  created_at: string;
  updated_at: string;
}

export interface GitOAuthConfig {
  githubClientId?: string;
  githubClientSecret?: string;
}

export interface NormalizedRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  updated_at: string;
  language: string | null;
  description: string | null;
  owner?: {
    login: string;
    avatar_url?: string;
    type?: string;
  };
}

export type DetectedEngine = 'docker' | 'native_node' | 'native_php' | 'native_python' | 'native_go' | 'static';

export interface SuggestedConfig {
  root_dir: string;
  install_command: string;
  build_command: string;
  start_command: string;
  internal_port: number;
}

export interface InspectResult {
  detected_engine: DetectedEngine;
  framework: string;
  build_preset: string;
  suggested_config: SuggestedConfig;
  available_directories?: string[];
  /** Directories in the repository that contain a deployable project manifest (package.json, Dockerfile, composer.json, etc.) */
  project_roots?: string[];
  /** Environment variables parsed from .env.example / .env.sample in this directory */
  suggested_env?: Array<{ key: string; value: string }>;
  /** Lowest Node major the repo declares (engines.node, .nvmrc, .node-version), if any */
  node_version?: number;
  /** Repo has a compose file that only provides services (db, cache) for the app; deploy starts it first. */
  compose_sidecar?: boolean;
}

