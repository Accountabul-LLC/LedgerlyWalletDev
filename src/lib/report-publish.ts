/**
 * Who is allowed to publish a daily code report.
 *
 * Repository files under docs/security/reports are written only by the
 * scheduled GitHub Action on main. The live table is written only by the
 * production deployment. Feature branches, pull-request CI, manual
 * dispatches and preview deployments print the diff and leave both
 * histories alone.
 */
export function canWriteRepositoryReport(
  env: Record<string, string | undefined> = process.env,
  argv: readonly string[] = process.argv,
): boolean {
  if (argv.includes('--check')) return false;
  return env.GITHUB_EVENT_NAME === 'schedule' && env.GITHUB_REF === 'refs/heads/main';
}

export function canPublishLiveReport(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.VERCEL_ENV === 'production';
}
