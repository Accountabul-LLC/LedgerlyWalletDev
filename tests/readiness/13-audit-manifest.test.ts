/**
 * The daily code report is only meaningful if the fingerprint taken from the
 * running build matches the one committed to the audit repository. If these
 * ever drift, the published report would describe code nobody can read.
 */
import { expect, test } from 'vitest';
import { deployedManifest } from '@/lib/audit-watch.server';
import committed from '../../docs/security/reports/manifest.json';

test('the deployed fingerprint covers the same files as the committed one', async () => {
  const files = await deployedManifest();
  const mine = Object.keys(files).sort();
  const theirs = Object.keys(committed.files as Record<string, string>).sort();
  expect(mine).toEqual(theirs);
});

test('every watched file hashes the same in the build as in the repository', async () => {
  const files = await deployedManifest();
  const source = committed.files as Record<string, string>;
  const mismatched = Object.keys(source).filter((path) => files[path] !== source[path]);
  expect(mismatched).toEqual([]);
});
