import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  EMAIL_VERIFIED_TITLE,
  confirmationFailureCopy,
  confirmEmailFromLink,
  confirmEmailWithAuth,
  confirmationEmailHref,
  emailConfirmRedirect,
  type ConfirmEmailResult,
} from '@/lib/confirm-email';
import { isEmailConfirmed, isVerifiedSession } from '@/lib/email-confirmed';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const confirmedSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  user: {
    email: 'ada@ledgerly.test',
    email_confirmed_at: '2026-10-14T00:00:00.000Z',
    user_metadata: {},
  },
};

describe('email confirmation route', () => {
  it('verifies a signup token and returns a confirmed session', async () => {
    const verifyOtp = vi.fn(async () => ({
      data: { session: confirmedSession },
      error: null,
    }));
    const result = await confirmEmailWithAuth(
      { verifyOtp },
      { tokenHash: 'abcXYZ_token-hash.12', type: 'email' },
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: 'abcXYZ_token-hash.12',
      type: 'email',
    });
    expect(result).toEqual({
      ok: true,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      email: 'ada@ledgerly.test',
      provider: null,
    });
  });

  it('reports an expired confirmation link', async () => {
    const result = await confirmEmailFromLink(
      {
        verifyToken: async () =>
          confirmEmailWithAuth(
            {
              verifyOtp: async () => ({
                data: { session: null },
                error: { message: 'Email link is invalid or has expired', code: 'otp_expired' },
              }),
            },
            { tokenHash: 'expired-token-hash', type: 'signup' },
          ),
        exchangeCode: async () => {
          throw new Error('code exchange should not run');
        },
      },
      { tokenHash: 'expired-token-hash', type: 'signup' },
    );
    expect(result).toEqual({ ok: false, reason: 'expired' });
    expect(confirmationFailureCopy('expired').title).toMatch(/expired/i);
  });

  it('reports an invalid confirmation link', async () => {
    const verifyOtp = vi.fn();
    const missing = await confirmEmailFromLink(
      {
        verifyToken: (input) => confirmEmailWithAuth({ verifyOtp }, input),
        exchangeCode: async () => ({ ok: false, reason: 'invalid' }) satisfies ConfirmEmailResult,
      },
      {},
    );
    const malformed = await confirmEmailWithAuth(
      { verifyOtp },
      { tokenHash: 'not a token', type: 'email' },
    );
    const rejected = await confirmEmailWithAuth(
      {
        verifyOtp: async () => ({
          data: { session: null },
          error: { message: 'Invalid authentication credentials', code: 'validation_failed' },
        }),
      },
      { tokenHash: 'invalid-token-hash', type: 'recovery' },
    );
    expect(missing).toEqual({ ok: false, reason: 'invalid' });
    expect(malformed).toEqual({ ok: false, reason: 'invalid' });
    expect(rejected).toEqual({ ok: false, reason: 'invalid' });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(confirmationFailureCopy('invalid').title).toMatch(/invalid/i);
  });

  it('reports a confirmation link that was already used', async () => {
    const result = await confirmEmailWithAuth(
      {
        verifyOtp: async () => ({
          data: { session: null },
          error: { message: 'This confirmation link has already been used', code: 'otp_expired' },
        }),
      },
      { tokenHash: 'used-token-hash', type: 'email' },
    );
    expect(result).toEqual({ ok: false, reason: 'already_used' });
    expect(confirmationFailureCopy('already_used').title).toMatch(/already used/i);
  });

  it('does not treat an unconfirmed session as verified', async () => {
    const result = await confirmEmailWithAuth(
      {
        verifyOtp: async () => ({
          data: {
            session: {
              ...confirmedSession,
              user: { ...confirmedSession.user, email_confirmed_at: null },
            },
          },
          error: null,
        }),
      },
      { tokenHash: 'unconfirmed-token-hash', type: 'email' },
    );
    expect(result).toEqual({ ok: false, reason: 'invalid' });
    expect(isEmailConfirmed({ email_confirmed_at: null })).toBe(false);
    expect(isEmailConfirmed({ email_confirmed_at: '2026-10-14T00:00:00.000Z' })).toBe(true);
    expect(isVerifiedSession({ user: { email_confirmed_at: null } })).toBe(false);
    expect(isVerifiedSession(null)).toBe(false);
  });

  it('wires the confirm route, template, and confirmation gate', () => {
    const route = read('src/routes/auth_.confirm.tsx');
    const auth = read('src/routes/auth.tsx');
    const wallet = read('src/routes/wallet.tsx');
    const balances = read('src/routes/balances.tsx');
    const config = read('supabase/config.toml');
    const template = read('supabase/templates/confirmation.html');
    const server = read('src/lib/confirm-email.server.ts');
    const fn = read('src/lib/confirm-email.functions.ts');

    expect(EMAIL_VERIFIED_TITLE).toBe('Email verified');
    expect(route).toContain('EMAIL_VERIFIED_TITLE');
    expect(route).toContain('verifyEmailToken');
    expect(route).toContain('Resend confirmation email');
    expect(route).toContain('confirmationFailureCopy');
    expect(auth).toContain('emailConfirmRedirect');
    expect(auth).toContain('Check your email');
    expect(auth).toContain('isEmailConfirmed');
    expect(auth).not.toContain('/auth/callback');
    expect(wallet).toContain('isEmailConfirmed');
    expect(balances).toContain('isEmailConfirmed');
    expect(emailConfirmRedirect('https://ledgerlywallet.com')).toBe(
      'https://ledgerlywallet.com/auth/confirm',
    );
    expect(config).toMatch(/\[auth\.email\][\s\S]*enable_confirmations = true/);
    expect(config).toContain('content_path = "./supabase/templates/confirmation.html"');
    const compact = template.replace(/\s+/g, ' ');
    expect(compact).toContain('{{ $site := .SiteURL }}');
    expect(compact).toContain('{{ $target := printf "%s/auth/confirm" $site }}');
    expect(compact).not.toContain('{{ $target := printf "%s/auth/confirm" .SiteURL }}');
    expect(compact).toContain('(eq (slice $site 0 1) "/")');
    expect(compact).toContain('{{ $site = slice $site 0 0 }}');
    expect(compact).toContain('(eq (slice $site 255 256) "/")');
    expect(compact).toContain('{{ $site = slice $site 0 255 }}');
    expect(compact.match(/\(eq \(slice \$site 27 28\) "\/"\)/g)).toHaveLength(2);
    expect(compact).toContain(
      '{{ if and .RedirectTo (ne .RedirectTo .SiteURL) (ne .RedirectTo $site) (ne .RedirectTo (printf "%s/" $site)) (ne (printf "%s/" .RedirectTo) .SiteURL) (ne (printf "%s/" .RedirectTo) $site) }}',
    );
    expect(compact).toContain('{{ $target = .RedirectTo }}');
    expect(compact).not.toContain('{{ else if and .RedirectTo');
    expect(compact).toContain('href="{{ $target }}?token_hash={{ .TokenHash }}&type=email"');
    expect(compact).toContain('href="{{ $target }}&token_hash={{ .TokenHash }}&type=email"');
    expect(template).not.toContain('{{ .SiteURL }}/auth/confirm?token_hash=');
    const positions = [...template.matchAll(/slice\s+\$target\s+(\d+)\s+(\d+)/g)].map((match) =>
      Number(match[1]),
    );
    expect(positions).toContain(0);
    expect(Math.max(...positions)).toBeGreaterThanOrEqual(400);
    const longRedirect = `https://${'a'.repeat(360)}.example/auth/confirm?next=1`;
    const cases = [
      { siteUrl: 'https://ledgerlywallet.com', redirectTo: '', label: 'omitted' },
      {
        siteUrl: 'https://ledgerlywallet.com',
        redirectTo: 'https://ledgerlywallet.com',
        label: 'site',
      },
      {
        siteUrl: 'https://ledgerlywallet.com/',
        redirectTo: '',
        label: 'slash site omitted redirect',
      },
      {
        siteUrl: 'https://ledgerlywallet.com/',
        redirectTo: 'https://ledgerlywallet.com/',
        label: 'both trailing slash',
      },
      {
        siteUrl: 'https://ledgerlywallet.com/',
        redirectTo: 'https://ledgerlywallet.com',
        label: 'site slash',
      },
      {
        siteUrl: 'https://ledgerlywallet.com',
        redirectTo: 'https://ledgerlywallet.com/',
        label: 'redirect slash',
      },
      {
        siteUrl: 'https://ledgerlywallet.com//',
        redirectTo: 'https://ledgerlywallet.com//',
        label: 'double slash',
      },
      {
        siteUrl: 'https://ledgerlywallet.com',
        redirectTo: 'https://preview.example/auth/confirm',
        label: 'explicit',
      },
      {
        siteUrl: 'https://ledgerlywallet.com/',
        redirectTo: 'https://preview.example/auth/confirm',
        label: 'explicit with slashed site',
      },
      {
        siteUrl: 'https://ledgerlywallet.com',
        redirectTo: 'https://www.ledgerlywallet.com/auth/confirm',
        label: 'www',
      },
      {
        siteUrl: 'http://127.0.0.1:3000',
        redirectTo: 'http://127.0.0.1:3000/auth/confirm?flow=native&x=1',
        label: 'local query',
      },
      {
        siteUrl: 'https://ledgerlywallet.com/',
        redirectTo: 'http://127.0.0.1:3000/auth/confirm?flow=native&x=1',
        label: 'local query slashed site',
      },
      {
        siteUrl: 'https://ledgerlywallet.com',
        redirectTo: longRedirect,
        label: 'long query',
      },
    ];
    for (const item of cases) {
      const expected = confirmationEmailHref({ ...item, tokenHash: 'synthetic-hash' });
      const target = expected.split(/[?&]token_hash=/)[0];
      const scanned = positions.some((index) => target[index] === '?');
      const rendered = `${target}${scanned ? '&' : '?'}token_hash=synthetic-hash&type=email`;
      expect(rendered, item.label).toBe(expected);
      expect(expected).toContain('/auth/confirm');
      expect(expected).toContain('token_hash=synthetic-hash');
      expect(expected).not.toMatch(/\/\?token_hash=/);
      expect(expected, item.label).not.toMatch(/[^:]\/\/auth\/confirm/);
    }
    for (const file of ['apps/mobile/App.tsx', 'mobile/src/app/sign-in.tsx']) {
      const source = read(file);
      const start = source.indexOf('.signUp(');
      expect(start, file).toBeGreaterThan(-1);
      const block = source.slice(start, start + 400);
      expect(block, file).not.toMatch(/emailRedirectTo\s*:/);
    }
    expect(server).not.toMatch(/SERVICE_ROLE|supabaseAdmin/);
    expect(server).toContain('verifyOtp');
    expect(fn).toContain('confirm-email.server');
  });

  it('renders the confirmation template with Go html/template', () => {
    try {
      execFileSync('go', ['version'], { stdio: 'ignore' });
    } catch {
      throw new Error('Go is required to render the confirmation template matrix');
    }

    const longRedirect = `https://${'a'.repeat(360)}.example/auth/confirm?next=1`;
    const cases = [
      { siteUrl: 'https://ledgerlywallet.com', redirectTo: '' },
      { siteUrl: 'https://ledgerlywallet.com', redirectTo: 'https://ledgerlywallet.com' },
      { siteUrl: 'https://ledgerlywallet.com/', redirectTo: '' },
      { siteUrl: 'https://ledgerlywallet.com/', redirectTo: 'https://ledgerlywallet.com/' },
      { siteUrl: 'https://ledgerlywallet.com/', redirectTo: 'https://ledgerlywallet.com' },
      { siteUrl: 'https://ledgerlywallet.com', redirectTo: 'https://ledgerlywallet.com/' },
      { siteUrl: 'https://ledgerlywallet.com//', redirectTo: 'https://ledgerlywallet.com//' },
      { siteUrl: 'https://ledgerlywallet.com', redirectTo: 'https://preview.example/auth/confirm' },
      {
        siteUrl: 'https://ledgerlywallet.com/',
        redirectTo: 'https://www.ledgerlywallet.com/auth/confirm',
      },
      {
        siteUrl: 'http://127.0.0.1:3000/',
        redirectTo: 'http://127.0.0.1:3000/auth/confirm?flow=native&x=1',
      },
      { siteUrl: 'https://ledgerlywallet.com/', redirectTo: longRedirect },
    ];
    const dir = mkdtempSync(join(tmpdir(), 'confirm-template-'));
    try {
      writeFileSync(join(dir, 'go.mod'), 'module confirmrender\n\ngo 1.22\n');
      writeFileSync(
        join(dir, 'main.go'),
        `package main

import (
  "encoding/json"
  "html/template"
  "os"
  "regexp"
  "strings"
)

type input struct {
  SiteURL    string \`json:"siteUrl"\`
  RedirectTo string \`json:"redirectTo"\`
  TokenHash  string \`json:"tokenHash"\`
  Email      string \`json:"email"\`
}

func main() {
  tpl := template.Must(template.ParseFiles(os.Args[1]))
  var cases []input
  if err := json.NewDecoder(os.Stdin).Decode(&cases); err != nil {
    panic(err)
  }
  href := regexp.MustCompile(\`href="([^"]+)"\`)
  out := json.NewEncoder(os.Stdout)
  for _, item := range cases {
    var b strings.Builder
    if err := tpl.Execute(&b, item); err != nil {
      panic(err)
    }
    match := href.FindStringSubmatch(b.String())
    if match == nil {
      panic("missing href")
    }
    if err := out.Encode(match[1]); err != nil {
      panic(err)
    }
  }
}
`,
      );
      const templatePath = join(process.cwd(), 'supabase/templates/confirmation.html');
      const stdout = execFileSync('go', ['run', '.', templatePath], {
        cwd: dir,
        input: JSON.stringify(
          cases.map((item) => ({
            ...item,
            tokenHash: 'synthetic-hash',
            email: 'ada@ledgerly.test',
          })),
        ),
        encoding: 'utf8',
      });
      const hrefs = stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as string);
      expect(hrefs).toHaveLength(cases.length);
      for (const [index, item] of cases.entries()) {
        const decoded = hrefs[index].replaceAll('&amp;', '&');
        const expected = confirmationEmailHref({ ...item, tokenHash: 'synthetic-hash' });
        expect(decoded, item.redirectTo || item.siteUrl).toBe(expected);
        expect(decoded).not.toMatch(/[^:]\/\/auth\/confirm/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
