export interface FirewallRule {
  number: number;
  to: string;
  action: string;
  from: string;
  comment?: string;
  isV6?: boolean;
}

export interface FirewallStatus {
  active: boolean;
  raw: string;
  defaultIncoming: string;
  defaultOutgoing: string;
  rules: FirewallRule[];
  sshPort: number;
  sshProtected: boolean;
}

export interface RulePreview {
  allowed: boolean;
  reason?: string;
  command: string;
  activeSshPort: number;
  willBlockSsh: boolean;
}

