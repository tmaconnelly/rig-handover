import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

// Temp runs dir only: runs/ is read-only fixtures.
let runsDir: string;

const good = [
  { at: '2026-01-02T22:00:00+01:00', job: 'zeta-backup', status: 'ok', owner: 'ana' },
  { at: '2026-01-02T22:05:00+01:00', job: 'alpha-sync', status: 'retry', owner: null },
  { at: '2026-01-02T22:06:00+01:00', job: 'alpha-sync', status: 'fail', owner: 'ben', error: 'timeout' },
  { at: '2026-01-02T23:00:00+01:00', job: 'mid-report', status: 'ok', owner: 'cy' },
];

const config = () => ({
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir,
});

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, '2026-01-02.jsonl'), good.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(runsDir, '2026-01-03.jsonl'), '');
  writeFileSync(
    join(runsDir, '2026-01-04.jsonl'),
    [JSON.stringify(good[0]), 'not json at all', JSON.stringify(good[3])].join('\n') + '\n',
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night (page)', () => {
  it('renders a table of rows for a night with a file', async () => {
    const res = await createApp(config()).request('/digest/2026-01-02');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table');
    for (const job of ['alpha-sync', 'mid-report', 'zeta-backup']) {
      expect(html).toContain(job);
    }
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config()).request('/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await createApp(config()).request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders 200 with the good rows when a line is bad', async () => {
    const res = await createApp(config()).request('/digest/2026-01-04');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('zeta-backup');
    expect(html).toContain('mid-report');
  });

  it('lists the jobs in the same order as the JSON rows', async () => {
    const app = createApp(config());
    const html = await (await app.request('/digest/2026-01-02')).text();
    const json = (await (await app.request('/api/digest/2026-01-02')).json()) as { rows: { job: string }[] };
    const positions = json.rows.map((r) => html.indexOf(r.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(json.rows.map((r) => r.job)).toEqual(['alpha-sync', 'mid-report', 'zeta-backup']);
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('returns { night, rows, badLines } with readNight rows sorted by job', async () => {
    const res = await createApp(config()).request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    const body = await res.json();
    const expected = readNight(runsDir, '2026-01-02');
    expect(body).toEqual({ night: '2026-01-02', rows: expected?.rows, badLines: 0 });
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config()).request('/api/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('returns rows [] for an empty night', async () => {
    const res = await createApp(config()).request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-01-03', rows: [], badLines: 0 });
  });

  it('counts a bad line as badLines 1 and keeps the good rows', async () => {
    const res = await createApp(config()).request('/api/digest/2026-01-04');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { badLines: number; rows: { job: string }[] };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['mid-report', 'zeta-backup']);
  });
});
