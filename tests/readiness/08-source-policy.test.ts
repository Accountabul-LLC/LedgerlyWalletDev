import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(relative, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(relative);
  }
  return out;
}

const SOURCE_FILES = walk('src').filter((file) => !file.includes('/core/'));
const ALL_SOURCE = walk('src');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

describe('readiness: source policy', () => {
  it('T60 no secret material is written to web storage', () => {
    const offenders = ALL_SOURCE.filter((file) => {
      const text = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
      return /(localStorage|sessionStorage)\.setItem\([^)]*(seed|mnemonic|phrase|privateKey|secret)/i.test(
        text,
      );
    });
    expect(offenders).toEqual([]);
  });

  it('T61 no secret material is logged', () => {
    const offenders = ALL_SOURCE.filter((file) =>
      /console\.(log|info|warn|error)\([^)]*(mnemonic|seedPhrase|privateKey|familySeed)/i.test(
        read(file),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it('T62 no service-role key or database password appears in app code', () => {
    // The generated backend clients read the key from server-only environment
    // variables; nothing outside that folder may mention it at all.
    const offenders = ALL_SOURCE.filter(
      (file) =>
        !file.startsWith('src/integrations/supabase/') &&
        /SERVICE_ROLE_KEY|service_role_key|sb_secret_|SUPABASE_DB_PASSWORD/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('T63 no hardcoded private keys or seeds are committed', () => {
    const offenders = ALL_SOURCE.filter((file) => {
      const text = read(file);
      return /['"]s[a-zA-Z0-9]{28}['"]/.test(text) && !file.includes('tests');
    });
    expect(offenders).toEqual([]);
  });

  it('T64 UI code never derives keys directly, only the worker engine does', () => {
    const offenders = SOURCE_FILES.filter((file) =>
      /from ['"].*keyring\/(derive|mnemonic)['"]/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('T65 no network calls carry wallet secrets', () => {
    const offenders = ALL_SOURCE.filter((file) =>
      /fetch\([^)]*\b(mnemonic|seed|privateKey)\b/i.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('T66 no dangerous DOM sinks are used', () => {
    const offenders = ALL_SOURCE.filter((file) => {
      const text = read(file);
      return /dangerouslySetInnerHTML|\.innerHTML\s*=|eval\(|new Function\(/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it('T67 every external link opens with noreferrer', () => {
    const offenders = SOURCE_FILES.filter((file) => {
      const text = read(file);
      if (!/target="_blank"/.test(text)) return false;
      const tags = text.match(/<a\b[^>]*target="_blank"[^>]*>/g) ?? [];
      return tags.some((tag) => !tag.includes('noreferrer'));
    });
    expect(offenders).toEqual([]);
  });

  it('T68 every route file declares head metadata with a title', () => {
    const routes = walk('src/routes').filter(
      (file) => !file.includes('/api/') && !/__root|routeTree/.test(file),
    );
    const missing = routes.filter((file) => {
      const text = read(file);
      return text.includes('createFileRoute') && !/head:\s*\(/.test(text);
    });
    expect(missing).toEqual([]);
  });

  it('T69 no route title uses the default Lovable placeholder', () => {
    const offenders = walk('src/routes').filter((file) =>
      /Lovable App|Lovable Generated Project/.test(read(file)),
    );
    expect(offenders).toEqual([]);
  });

  it('T70 the generated Supabase client is imported, never hand-rolled in the browser', () => {
    const offenders = SOURCE_FILES.filter(
      (file) =>
        /createClient\(/.test(read(file)) &&
        !file.startsWith('src/integrations/supabase/') &&
        !file.endsWith('.server.ts'),
    );
    expect(offenders).toEqual([]);
  });
});
