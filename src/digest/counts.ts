import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';
import type { RunStatus } from './types.js';

export type StatusCounts = Record<RunStatus, number> & { bad: number };

// Every log line of a night counted by its status; unparseable lines count as `bad`.
// Returns null when the night can't be read.
export function countStatuses(runsDir: string, night: string): StatusCounts | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const c: StatusCounts = { ok: 0, retry: 0, fail: 0, bad: 0 };
  for (const t of text.split('\n')) {
    if (t.trim() === '') continue;
    const l = parseLine(t);
    if (l) c[l.status] += 1;
    else c.bad += 1;
  }
  return c;
}
