import { expect, test } from 'vitest';
import { canPublishLiveReport, canWriteRepositoryReport } from '@/lib/report-publish';

test('only the scheduled job on main may write repository reports', () => {
  expect(
    canWriteRepositoryReport({ GITHUB_EVENT_NAME: 'schedule', GITHUB_REF: 'refs/heads/main' }, [
      'bun',
      'scripts/daily-audit.ts',
    ]),
  ).toBe(true);
  expect(
    canWriteRepositoryReport({ GITHUB_EVENT_NAME: 'schedule', GITHUB_REF: 'refs/heads/main' }, [
      'bun',
      'scripts/daily-audit.ts',
      '--check',
    ]),
  ).toBe(false);
  expect(
    canWriteRepositoryReport(
      { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main' },
      [],
    ),
  ).toBe(false);
  expect(
    canWriteRepositoryReport(
      { GITHUB_EVENT_NAME: 'schedule', GITHUB_REF: 'refs/heads/feature' },
      [],
    ),
  ).toBe(false);
  expect(canWriteRepositoryReport({ GITHUB_EVENT_NAME: 'pull_request' }, [])).toBe(false);
  expect(canWriteRepositoryReport({}, [])).toBe(false);
});

test('only the production deployment may publish a live report', () => {
  expect(canPublishLiveReport({ VERCEL_ENV: 'production' })).toBe(true);
  expect(canPublishLiveReport({ VERCEL_ENV: 'preview' })).toBe(false);
  expect(canPublishLiveReport({ VERCEL_ENV: 'development' })).toBe(false);
  expect(canPublishLiveReport({})).toBe(false);
});
