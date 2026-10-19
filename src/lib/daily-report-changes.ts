type Change = {
  path: string;
  kind: 'added' | 'modified' | 'removed' | 'now watched';
  area: string;
};

export function changeCounts(changes: Change[]): { modified: number; newlyWatched: number } {
  let modified = 0;
  let newlyWatched = 0;
  for (const change of changes) {
    if (change.kind === 'now watched') newlyWatched += 1;
    else modified += 1;
  }
  return { modified, newlyWatched };
}

function areaList(areas: string[]): string {
  if (areas.length <= 1) return areas[0] ?? '';
  return `${areas.slice(0, -1).join(', ')} and ${areas.at(-1)}`;
}

function uniqueAreas(changes: Change[]): string[] {
  return [...new Set(changes.map((change) => change.area))];
}

/**
 * Identical wording for the repository report and the live Security Center.
 * "Now watched" means the file joined the watch list. It is not a modification
 * of code that was already watched, so headlines and summaries count it apart
 * from real changes.
 */
export function reportText(
  status: 'baseline' | 'changed' | 'unchanged',
  changes: Change[],
  areas: string[],
): { headline: string; summary: string } {
  const modified = changes.filter((change) => change.kind !== 'now watched');
  const watched = changes.filter((change) => change.kind === 'now watched');
  const watchedSentence = `${watched.length} more ${watched.length === 1 ? 'file is' : 'files are'} now watched every day`;
  let headline = '';
  let summary =
    'No file that handles your keys, your recovery phrase or your transactions changed today. The wallet behaves exactly as it did in the last published audit.';
  if (modified.length === 0 && watched.length > 0) {
    const list = areaList(uniqueAreas(watched).length ? uniqueAreas(watched) : areas);
    headline = `${watchedSentence}.`;
    summary = `${watchedSentence}, covering ${list}. Nothing already under watch changed today.`;
  } else if (modified.length > 0) {
    const modAreas = uniqueAreas(modified);
    const list = areaList(modAreas.length ? modAreas : areas);
    const watchedNote = watched.length ? ` ${watchedSentence}.` : '';
    const areaCount = modAreas.length || areas.length;
    headline = `Changes in ${areaCount} ${areaCount === 1 ? 'area' : 'areas'} of the code that protects your keys.`;
    summary = `${modified.length} security-sensitive ${modified.length === 1 ? 'file' : 'files'} changed today, covering ${list}.${watchedNote} Every change is in the code we publish, so you can read the difference yourself in the audit repository.`;
  }
  if (status === 'baseline') {
    headline = 'First report. This is the baseline we compare against from now on.';
  }
  return { headline, summary };
}

/** Keep the day's earlier evidence when refreshing its manifest/report. */
export function cumulativeChanges(
  date: string,
  earlier: { date: string; changes: Change[] } | null,
  latest: Change[],
): Change[] {
  const changes = new Map<string, Change>();
  if (earlier?.date === date) {
    for (const change of earlier.changes) changes.set(change.path, change);
  }
  for (const change of latest) {
    const prior = changes.get(change.path);
    if (!prior || change.kind === 'removed') changes.set(change.path, change);
    else if (prior.kind === 'removed') changes.set(change.path, { ...change, kind: 'modified' });
    // A newly watched file remains newly watched if edited again that same day.
  }
  return [...changes.values()].sort((a, b) => a.path.localeCompare(b.path));
}
