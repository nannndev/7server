import { executeCommand } from '../../infra/ssh.js';
import type { ServerCredentials } from '../servers/types.js';
import type { CertificateItem, CertRenewalResult, CertIssueResult } from './types.js';

export function parseCertbotOutput(stdout: string): CertificateItem[] {
  const items: CertificateItem[] = [];

  // Match each certificate block starting with "Certificate Name:"
  const blocks = stdout.split(/Certificate Name:\s*/i).slice(1);

  for (const block of blocks) {
    const lines = block.split('\n');
    const name = lines[0].trim();

    let domains: string[] = [];
    let expiryDate = '';
    let daysRemaining = 0;
    let isValid = false;
    let certPath = '';
    let keyPath = '';

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      const domainsMatch = line.match(/^Domains:\s*(.+)$/i);
      if (domainsMatch) {
        domains = domainsMatch[1].split(/\s+/).filter(Boolean);
        continue;
      }

      // Expiry Date: 2026-12-30 08:34:11+00:00 (VALID: 56 days) or (INVALID: EXPIRED)
      const expiryMatch = line.match(/^Expiry Date:\s*([^(]+)\s*\(([^)]+)\)$/i);
      if (expiryMatch) {
        expiryDate = expiryMatch[1].trim();
        const statusDetail = expiryMatch[2].trim();
        const daysMatch = statusDetail.match(/VALID:\s*(\d+)\s*days/i);
        if (daysMatch) {
          daysRemaining = parseInt(daysMatch[1], 10);
          isValid = true;
        } else if (statusDetail.toLowerCase().includes('valid')) {
          isValid = true;
        } else {
          isValid = false;
          daysRemaining = 0;
        }
        continue;
      }

      const certPathMatch = line.match(/^Certificate Path:\s*(.+)$/i);
      if (certPathMatch) {
        certPath = certPathMatch[1].trim();
        continue;
      }

      const keyPathMatch = line.match(/^Private Key Path:\s*(.+)$/i);
      if (keyPathMatch) {
        keyPath = keyPathMatch[1].trim();
        continue;
      }
    }

    if (name) {
      items.push({
        name,
        domains: domains.length > 0 ? domains : [name],
        expiryDate,
        daysRemaining,
        isValid,
        isExpiringSoon: isValid && daysRemaining <= 30,
        certPath,
        keyPath
      });
    }
  }

  return items;
}

export async function fetchCertificates(target: ServerCredentials): Promise<CertificateItem[]> {
  try {
    const { stdout } = await executeCommand(target, 'timeout 15 certbot certificates 2>/dev/null || true', 18000);
    return parseCertbotOutput(stdout);
  } catch {
    return [];
  }
}

export async function renewCertificates(target: ServerCredentials, dryRun = false): Promise<CertRenewalResult> {
  const flag = dryRun ? '--dry-run' : '';
  const cmd = `timeout 60 certbot renew ${flag} 2>&1`;
  try {
    const { stdout, code } = await executeCommand(target, cmd, 65000);
    return {
      stdout: stdout || '',
      success: (code ?? 0) === 0 || !stdout.toLowerCase().includes('failed to renew'),
      dryRun
    };
  } catch (err: any) {
    return {
      stdout: err.stdout || err.message,
      success: false,
      dryRun
    };
  }
}

export async function issueCertificate(
  target: ServerCredentials,
  domain: string,
  email: string,
  webserver: 'nginx' | 'standalone' = 'nginx'
): Promise<CertIssueResult> {
  // Validate domain format
  const cleanDomain = domain.trim().toLowerCase();
  if (!cleanDomain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(cleanDomain)) {
    throw new Error('Nama domain tidak valid.');
  }

  const cleanEmail = email.trim();
  const emailFlag = cleanEmail ? `-m ${cleanEmail}` : '--register-unsafely-without-email';
  const pluginFlag = webserver === 'nginx' ? '--nginx' : '--standalone';

  const cmd = `timeout 90 certbot ${pluginFlag} -d ${cleanDomain} --non-interactive --agree-tos ${emailFlag} 2>&1`;

  try {
    const { stdout, code } = await executeCommand(target, cmd, 95000);
    const success = (code ?? 0) === 0 || stdout.includes('Congratulations') || stdout.includes('Successfully received certificate');
    return {
      stdout: stdout || '',
      success,
      domain: cleanDomain
    };
  } catch (err: any) {
    return {
      stdout: err.stdout || err.message,
      success: false,
      domain: cleanDomain
    };
  }
}

