import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Recovery phrase containment.
 *
 * The recovery phrase and the family seed are the whole wallet. These checks
 * read the shipped source and fail the release if any code path could write
 * one to storage, put one on the wire, log one, hand one to a browser's
 * autofill cache, or leave one in a URL.
 */

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(relative, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relative);
  }
  return out;
}

const APP_FILES = [...walk('src'), ...walk('extension/src')].filter(
  (file) => !file.endsWith('routeTree.gen.ts'),
);
/** Wallet screens: the only place key material is ever typed or shown. */
const WALLET_FILES = APP_FILES.filter(
  (file) => file.startsWith('src/ledgerly/') || file.startsWith('extension/src/'),
);
const UI_FILES = APP_FILES.filter((file) => file.endsWith('.tsx'));
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');

/** Identifier fragments that name key material anywhere in the codebase. */
const SECRET_WORD =
  '(mnemonic|recoveryPhrase|seedPhrase|familySeed|privateKey|passphrase|\\bseed\\b|\\bphrase\\b|\\bsecret\\b|\\bpassword\\b)';

/** Extracts each self-closing JSX element of the given component names. */
function jsxElements(text: string, names: string[]): string[] {
  const pattern = new RegExp(`<(?:${names.join('|')})\\b[\\s\\S]*?/>`, 'g');
  return text.match(pattern) ?? [];
}

describe('readiness: recovery phrase containment', () => {
  it('T93 no secret material is written to any web storage or cookie', () => {
    const offenders = APP_FILES.filter((file) => {
      const text = stripComments(read(file));
      const writes = [
        new RegExp(`(localStorage|sessionStorage)\\.setItem\\([^)]*${SECRET_WORD}`, 'i'),
        new RegExp(`document\\.cookie\\s*=[^;\\n]*${SECRET_WORD}`, 'i'),
        new RegExp(`(indexedDB|objectStore|store)\\.(put|add)\\([^)]*${SECRET_WORD}`, 'i'),
      ];
      return writes.some((pattern) => pattern.test(text));
    });
    expect(offenders).toEqual([]);
  });

  it('T94 no secret material leaves the device over the network', () => {
    const offenders = APP_FILES.filter((file) => {
      const text = stripComments(read(file));
      const sinks = [
        new RegExp(`fetch\\([^)]*${SECRET_WORD}`, 'i'),
        new RegExp(`sendBeacon\\([^)]*${SECRET_WORD}`, 'i'),
        new RegExp(`\\.(send|open)\\([^)]*${SECRET_WORD}`, 'i'),
        new RegExp(`new WebSocket\\([^)]*${SECRET_WORD}`, 'i'),
        new RegExp(`\\.(from|rpc|insert|upsert|update)\\([^)]*${SECRET_WORD}`, 'i'),
      ];
      return sinks.some((pattern) => pattern.test(text));
    });
    expect(offenders).toEqual([]);
  });

  it('T95 secret material is never logged or attached to an error report', () => {
    const offenders = APP_FILES.filter((file) => {
      const text = stripComments(read(file));
      const sinks = [
        new RegExp(`console\\.[a-z]+\\([^)]*${SECRET_WORD}`, 'i'),
        new RegExp(`new Error\\([^)]*\\$\\{[^}]*${SECRET_WORD}`, 'i'),
        new RegExp(`captureError\\([^)]*${SECRET_WORD}`, 'i'),
        new RegExp(`recordPlatformEvent\\([^)]*${SECRET_WORD}`, 'i'),
      ];
      return sinks.some((pattern) => pattern.test(text));
    });
    expect(offenders).toEqual([]);
  });

  it('T96 the field primitive hardens every secret input against autofill', () => {
    const text = read('src/ledgerly/ui/components/primitives.tsx');
    for (const attribute of [
      'autoComplete',
      'autoCorrect',
      'autoCapitalize',
      'spellCheck',
      'data-1p-ignore',
      'data-lpignore',
    ]) {
      expect(text).toContain(attribute);
    }
    // Any field typed as a password is hardened without the call site asking.
    expect(text).toMatch(/secret === true \|\| type === 'password'/);
  });

  it('T97 every phrase, seed or password field opts into the secret treatment', () => {
    const sensitiveLabel = /label=\{?["'`][^"'`]*(phrase|seed|secret|password|Word \$\{)/i;
    const offenders: string[] = [];
    for (const file of UI_FILES) {
      for (const element of jsxElements(read(file), ['TextField', 'TextAreaField'])) {
        if (!sensitiveLabel.test(element)) continue;
        const hardened = /\bsecret\b/.test(element) || /type="password"/.test(element);
        if (!hardened) offenders.push(`${file}: ${element.slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('T98 no raw input or textarea collects a secret outside the primitives', () => {
    // Scoped to the wallet screens. The profile sign-in pages take an account
    // password, never key material, and deliberately work with password
    // managers.
    const offenders = WALLET_FILES.filter(
      (file) =>
        file.endsWith('.tsx') &&
        !file.endsWith('components/primitives.tsx') &&
        /<(input|textarea)\b[^>]*type="password"/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('T99 no secret can be carried in a URL, route param or form action', () => {
    const offenders = APP_FILES.filter((file) => {
      const text = stripComments(read(file));
      const sinks = [
        new RegExp(`searchParams\\.(set|append)\\(\\s*["'\`][^"'\`]*${SECRET_WORD}`, 'i'),
        new RegExp(`(navigate|href|to)\\s*[:=]\\s*[^;\\n]*\\$\\{[^}]*${SECRET_WORD}`, 'i'),
        /<form\b[^>]*\baction=/i,
        /encodeURIComponent\([^)]*(mnemonic|phrase|seed|privateKey)/i,
      ];
      return sinks.some((pattern) => pattern.test(text));
    });
    expect(offenders).toEqual([]);
  });

  it('T100 the wallet screens embed no third-party script, iframe or pixel', () => {
    const offenders = UI_FILES.filter((file) => {
      const text = stripComments(read(file));
      return (
        /<iframe\b/i.test(text) ||
        /<script\b[^>]*src=["']https?:/i.test(text) ||
        /document\.createElement\(['"]script['"]\)/.test(text)
      );
    });
    expect(offenders).toEqual([]);
  });

  it('T101 copying a phrase is user-initiated and lives in one place', () => {
    const writers = APP_FILES.filter((file) => /clipboard\.writeText/.test(read(file)));
    expect(writers).toEqual(['src/ledgerly/ui/components/primitives.tsx']);
    const text = read('src/ledgerly/ui/components/primitives.tsx');
    // The only caller is a click handler, never an effect or a render path.
    expect(text).toMatch(/onClick[\s\S]{0,200}writeText/);
    expect(text).not.toMatch(/useEffect\([^)]*writeText/);
  });

  it('T102 the revealed phrase starts hidden and is never auto-revealed', () => {
    const onboarding = read('src/ledgerly/ui/views/Onboarding.tsx');
    expect(onboarding).toMatch(/useState\(false\)/);
    expect(onboarding).toMatch(/blurred/);
    expect(onboarding).toMatch(/onClick=\{\(\) => setRevealed\(true\)\}/);
    expect(onboarding).not.toMatch(/useEffect\([^)]*setRevealed\(true\)/);
    // CSS blur is not a control: the word must not be in the DOM until Reveal.
    expect(onboarding).toMatch(/\{revealed \? words\.current\[index\] : null\}/);
    expect(onboarding).not.toMatch(/key=\{`\$\{index\}-\$\{word\}`\}/);
  });

  it('T103 resuming a half-finished backup costs the password again', () => {
    const onboarding = read('src/ledgerly/ui/views/Onboarding.tsx');
    expect(onboarding).toMatch(/exportRecoveryPhrase\(\{\s*password\s*\}\)/);
    // The revealed phrase is only ever component state, never persisted.
    expect(onboarding).not.toMatch(/setItem\([^)]*mnemonic/i);
  });

  it('T113 the confirm step is never handed the phrase', () => {
    const onboarding = read('src/ledgerly/ui/views/Onboarding.tsx');
    // It takes a challenge, not words, and the step state carries no phrase.
    expect(onboarding).toMatch(/function VerifyStep\(\{\s*challenge/);
    expect(onboarding).not.toMatch(/<VerifyStep[^>]*mnemonic/);
    expect(onboarding).not.toMatch(/name:\s*'verify';\s*mnemonic/);
  });

  it('T114 answers are graded against salted digests, not stored words', () => {
    const onboarding = read('src/ledgerly/ui/views/Onboarding.tsx');
    expect(onboarding).toMatch(/crypto\.subtle\.digest\('SHA-256'/);
    expect(onboarding).toMatch(/\$\{salt\}:\$\{word\}/);
    // A fresh salt per challenge keeps digests off the public wordlist.
    expect(onboarding).toMatch(/function randomSalt/);
  });

  it('T115 the only way back to the phrase from confirm is a password reveal', () => {
    const onboarding = read('src/ledgerly/ui/views/Onboarding.tsx');
    // The confirm step's back action routes through the reveal screen, which
    // decrypts the phrase again rather than reading a copy left in the page.
    expect(onboarding).toMatch(
      /<VerifyStep[\s\S]{0,120}onBack=\{\(\) => setStep\(\{ name: 'reveal' \}\)\}/,
    );
    expect(onboarding).toMatch(/step\.name === 'reveal'[\s\S]{0,160}ResumeBackup/);
  });

  it('T116 the backup screen drops its copy of the words when it goes away', () => {
    const onboarding = read('src/ledgerly/ui/views/Onboarding.tsx');
    // The words live in a ref, not in state, so an unmounted fiber cannot keep
    // them alive. Both the unmount path and the advance path wipe the array.
    expect(onboarding).toMatch(/words\.current = \(phrase\.value \?\? ''\)\.split\(' '\)/);
    expect(onboarding).toMatch(/words\.current\.fill\(''\);\s*\n\s*words\.current\.length = 0;/g);
    expect(onboarding).toMatch(/phrase\.current\.value = null/);
  });

  it('T117 the unlinked-phrase confirm step is never handed the phrase', () => {
    const dialogs = read('src/ledgerly/ui/views/AccountDialogs.tsx');
    expect(dialogs).toMatch(/function OwnPhraseVerifyStep\(\{\s*challenge/);
    expect(dialogs).not.toMatch(/<OwnPhraseVerifyStep[^>]*mnemonic/);
    expect(dialogs).not.toMatch(/useAsyncData\([\s\S]{0,200}generateRecoveryPhrase/);
  });

  it('T118 unlinked-phrase answers are graded against salted digests', () => {
    const dialogs = read('src/ledgerly/ui/views/AccountDialogs.tsx');
    expect(dialogs).toMatch(/crypto\.subtle\.digest\('SHA-256'/);
    expect(dialogs).toMatch(/\$\{salt\}:\$\{word\}/);
    expect(dialogs).toMatch(/function randomSalt/);
  });

  it('T119 the only way back to an unlinked phrase from confirm is a password reveal', () => {
    const dialogs = read('src/ledgerly/ui/views/AccountDialogs.tsx');
    expect(dialogs).toMatch(/onBack=\{\(\) => setStep\('reveal'\)\}/);
    expect(dialogs).toMatch(/exportAccountSecret\(\{\s*password,\s*accountId/);
    expect(dialogs).toMatch(/addAccountWithOwnPhrase/);
  });

  it('T120 the unlinked backup screen drops its copy of the words when it goes away', () => {
    const dialogs = read('src/ledgerly/ui/views/AccountDialogs.tsx');
    expect(dialogs).toMatch(/words\.current = \(phrase\.value \?\? ''\)\.split\(' '\)/);
    expect(dialogs).toMatch(/phrase\.value = null/);
    expect(dialogs).toMatch(/CopyButton getValue=\{\(\) => phrase\.value/);
  });

  it('T121 import confirm does not keep the pasted secret in the input field', () => {
    const dialogs = read('src/ledgerly/ui/views/AccountDialogs.tsx');
    expect(dialogs).toMatch(/held\.current\.value = trimmed/);
    expect(dialogs).toMatch(/held\.current\.value = null/);
    // The confirm path reads the box, not the emptied field.
    expect(dialogs).toMatch(/const raw = held\.current\.value/);
  });

  it('T122 cloud sync uploads labels and addresses only', () => {
    const text = stripComments(read('src/ledgerly/ui/cloud/sync.ts'));
    expect(text).not.toMatch(/\b(mnemonic|privateKey|familySeed|recoveryPhrase|seedPhrase)\b/);
    expect(text).toMatch(/\.select\('address, name'\)/);
  });

  it('T123 durable device storage never writes the session snapshot', () => {
    const web = stripComments(read('src/ledgerly/web/storage.ts'));
    expect(web).toMatch(/indexedDB\.open/);
    expect(web).not.toMatch(/\blocalStorage\b|\bsessionStorage\b/);
    const ext = stripComments(read('extension/src/storage.ts'));
    expect(ext).toMatch(/chrome\.storage\.local\.(get|set|remove|clear)/);
    expect(ext).toMatch(/chrome\.storage\.session\.(get|set|remove)/);
    expect(ext).not.toMatch(/chrome\.storage\.sync/);
    const worker = stripComments(read('src/ledgerly/web/worker.ts'));
    expect(worker).toMatch(/session: new MemorySessionStore\(\)/);
    expect(worker).toMatch(/store: new IndexedDbStore\(\)/);
  });

  it('T124 a connected site cannot export a phrase or seed', () => {
    const protocol = read('src/ledgerly/core/rpc/protocol.ts');
    expect(protocol).toMatch(/PROVIDER_METHODS[\s\S]*'ping'/);
    expect(protocol).not.toMatch(
      /PROVIDER_METHODS[\s\S]*?(exportRecoveryPhrase|exportAccountSeed|exportAccountSecret|createWallet|generateRecoveryPhrase)/,
    );
  });

  it('T126 unlinked backup does not put words in the DOM or in React keys until reveal', () => {
    const dialogs = read('src/ledgerly/ui/views/AccountDialogs.tsx');
    expect(dialogs).toMatch(/\{revealed \? words\.current\[index\] : null\}/);
    expect(dialogs).not.toMatch(/key=\{`\$\{index\}-\$\{word\}`\}/);
    expect(dialogs).toMatch(/<div className="seed-word" key=\{index\}>/);
  });

  it('T127 settings reveal does not keep the secret in React state or in a word key', () => {
    const settings = read('src/ledgerly/ui/views/Settings.tsx');
    expect(settings).toMatch(/const material = useRef<AccountSecretExport \| null>\(null\)/);
    expect(settings).not.toMatch(/useState<AccountSecretExport/);
    expect(settings).not.toMatch(/key=\{`\$\{index\}-\$\{word\}`\}/);
    expect(settings).toMatch(/getValue=\{\(\) => material\.current\?\.secret/);
  });
});
