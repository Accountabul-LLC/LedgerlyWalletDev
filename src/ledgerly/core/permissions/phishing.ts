import type { RiskFinding } from '../xrpl/describe';

/**
 * Domains an XRPL user is likely to be impersonated *at*. The list is short and
 * fixed on purpose: it powers lookalike detection, not a blocklist. Shipping a
 * static list of known-bad domains would be stale within a week and would give
 * a false sense of coverage, so the checks here look at the shape of the domain
 * instead of trying to enumerate attackers.
 */
const IMPERSONATION_TARGETS = [
  'xrpl.org',
  'xumm.app',
  'xaman.app',
  'ripple.com',
  'bithomp.com',
  'xrpscan.com',
  'sologenic.com',
  'gatehub.net',
  'ledgerly.app',
];

const SUSPICIOUS_TLDS = new Set(['zip', 'mov', 'top', 'xyz', 'click', 'gq', 'cf', 'tk', 'ml']);

export interface SiteAssessment {
  readonly findings: readonly RiskFinding[];
  readonly firstVisit: boolean;
}

export function assessSite(hostname: string, isSecure: boolean, known: boolean): SiteAssessment {
  const findings: RiskFinding[] = [];

  if (!isSecure) {
    findings.push({
      level: 'danger',
      title: 'Connection is not encrypted',
      detail: 'Anyone on this network can read and alter what this page sends to your wallet.',
    });
  }

  if (hostname.startsWith('xn--') || hostname.includes('.xn--')) {
    findings.push({
      level: 'danger',
      title: 'Domain uses non-Latin characters',
      detail:
        'This name is encoded with Unicode characters that can be drawn to look like ordinary letters. Verify it letter by letter before connecting.',
    });
  }

  const lookalike = findLookalike(hostname);
  if (lookalike) {
    findings.push({
      level: 'danger',
      title: `Very similar to ${lookalike}`,
      detail: `This domain is one or two characters away from ${lookalike}. Check it carefully — this is the most common way wallets are drained.`,
    });
  }

  const tld = hostname.split('.').pop() ?? '';
  if (SUSPICIOUS_TLDS.has(tld)) {
    findings.push({
      level: 'caution',
      title: `Unusual .${tld} domain`,
      detail: 'This top-level domain is disproportionately used for short-lived scam sites.',
    });
  }

  if (!known) {
    findings.push({
      level: 'info',
      title: 'First time connecting here',
      detail: 'You have not approved this site before.',
    });
  }

  return { findings, firstVisit: !known };
}

/** Returns the well-known domain a hostname is suspiciously close to, if any. */
export function findLookalike(hostname: string): string | null {
  const normalized = hostname.replace(/^www\./, '').toLowerCase();
  for (const target of IMPERSONATION_TARGETS) {
    if (normalized === target) return null;
    const distance = editDistance(normalized, target);
    if (distance > 0 && distance <= 2 && Math.abs(normalized.length - target.length) <= 2) {
      return target;
    }
  }
  return null;
}

/** Levenshtein distance over two short strings; bounded input makes the O(nm) cost irrelevant. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] as number) + 1;
      const deletion = (previous[j] as number) + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }

  return previous[b.length] as number;
}
