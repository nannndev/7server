export interface SshKeyItem {
  id: string;
  type: string;
  key: string;
  comment: string;
  raw: string;
}

export interface SecurityHardeningStatus {
  passwordAuth: boolean;
  rootLogin: string; // 'yes' | 'no' | 'prohibit-password'
  sshPort: number;
  fail2banInstalled: boolean;
  fail2banActive: boolean;
  bannedIps: string[];
}

export interface DeployUserStatus {
  exists: boolean;
  hasSshKey: boolean;
  /** Whether /var/www is owned by the deploy user. */
  ownsWebRoot: boolean;
  /** Current owner of /var/www, for display. */
  webRootOwner: string;
}

