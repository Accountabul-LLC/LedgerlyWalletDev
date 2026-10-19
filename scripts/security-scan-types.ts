/** Shared shape for the daily vulnerability scan. */
export type Verdict = 'PASS' | 'FAIL' | 'ACCEPTED' | 'SKIP';

export type Finding = {
  /** Stable identifier, so an accepted finding stays accepted. */
  id: string;
  area: string;
  verdict: Verdict;
  /** One plain sentence a non-developer can read. */
  evidence: string;
};

export type ScanReport = {
  date: string;
  generatedAt: string;
  passed: number;
  failed: number;
  accepted: number;
  skipped: number;
  /** Failures that were not in yesterday's scan. These are what fail the job. */
  newFailures: string[];
  findings: Finding[];
};
