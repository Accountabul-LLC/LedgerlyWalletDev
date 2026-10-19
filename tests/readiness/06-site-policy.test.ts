import { describe, expect, it } from 'vitest';
import { displayOrigin, isCanonicalOrigin, parseOrigin } from '@/ledgerly/core/permissions/origin';
import { assessSite, findLookalike } from '@/ledgerly/core/permissions/phishing';

describe('readiness: connected-site policy', () => {
  it('T47 only http and https URLs become origins', () => {
    expect(parseOrigin('https://example.com/path?q=1')?.origin).toBe('https://example.com');
    expect(parseOrigin('file:///tmp/evil.html')).toBeNull();
    expect(parseOrigin('chrome-extension://abc/popup.html')).toBeNull();
    expect(parseOrigin('javascript:alert(1)')).toBeNull();
    expect(parseOrigin('data:text/html,<script>')).toBeNull();
    expect(parseOrigin(undefined)).toBeNull();
    expect(parseOrigin('not a url')).toBeNull();
  });

  it('T48 http is insecure except on loopback', () => {
    expect(parseOrigin('http://example.com')?.isSecure).toBe(false);
    expect(parseOrigin('http://localhost:8080')?.isSecure).toBe(true);
    expect(parseOrigin('http://127.0.0.1:3000')?.isSecure).toBe(true);
    expect(parseOrigin('https://example.com')?.isSecure).toBe(true);
  });

  it('T49 stored origins must be canonical', () => {
    expect(isCanonicalOrigin('https://example.com')).toBe(true);
    expect(isCanonicalOrigin('https://example.com/')).toBe(false);
    expect(isCanonicalOrigin('https://example.com/path')).toBe(false);
    expect(isCanonicalOrigin('example.com')).toBe(false);
    expect(isCanonicalOrigin('https://user:pass@example.com')).toBe(false);
    expect(displayOrigin('https://example.com:8443')).toBe('example.com:8443');
  });

  it('T50 punycode hostnames raise a danger finding', () => {
    const findings = assessSite('xn--xrpl-9na.org', true, false).findings;
    expect(findings.some((finding) => finding.level === 'danger')).toBe(true);
  });

  it('T51 insecure transport raises a danger finding', () => {
    expect(assessSite('example.com', false, true).findings.some((f) => f.level === 'danger')).toBe(
      true,
    );
    expect(assessSite('example.com', true, true).findings.length).toBe(0);
  });

  it('T52 lookalike domains of well-known XRPL sites are caught', () => {
    expect(findLookalike('xrp1.org')).toBe('xrpl.org');
    expect(findLookalike('xamam.app')).toBeTruthy();
    expect(findLookalike('xrpl.org')).toBeNull();
    expect(findLookalike('www.xrpl.org')).toBeNull();
    expect(findLookalike('completely-unrelated-site.com')).toBeNull();
  });

  it('T53 suspicious TLDs and first visits are surfaced', () => {
    const risky = assessSite('airdrop.zip', true, false);
    expect(risky.findings.some((finding) => finding.level === 'caution')).toBe(true);
    expect(risky.firstVisit).toBe(true);
    expect(assessSite('example.com', true, true).firstVisit).toBe(false);
  });

  it('T54 fuzz: site assessment never throws on hostile hostnames', () => {
    const chars = 'abcxyz.-0189xn--*/\\ %@:';
    for (let i = 0; i < 2_000; i += 1) {
      let hostname = '';
      const length = Math.floor(Math.random() * 30);
      for (let j = 0; j < length; j += 1)
        hostname += chars[Math.floor(Math.random() * chars.length)];
      const assessment = assessSite(hostname, Math.random() > 0.5, Math.random() > 0.5);
      expect(Array.isArray(assessment.findings)).toBe(true);
      for (const finding of assessment.findings) {
        expect(['danger', 'caution', 'info']).toContain(finding.level);
      }
    }
  });
});
