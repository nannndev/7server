export type GitProvider = 'github' | 'gitlab' | 'bitbucket';

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
  githubConfigured: boolean;
  githubClientId: string;
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
}

