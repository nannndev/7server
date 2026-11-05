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

