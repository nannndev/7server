export interface CertificateItem {
  name: string;
  domains: string[];
  expiryDate: string;
  daysRemaining: number;
  isValid: boolean;
  isExpiringSoon: boolean;
  certPath: string;
  keyPath: string;
}

export interface CertRenewalResult {
  stdout: string;
  success: boolean;
  dryRun?: boolean;
}

export interface CertIssueResult {
  stdout: string;
  success: boolean;
  domain: string;
}

