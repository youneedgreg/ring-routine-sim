import { sign, toEnvelope, type SimEvent } from './ring.ts';

export interface ReplayOptions {
  url: string;
  hmacKey: string;
  /** Header that carries the signature. Ring uses X-Signature. */
  signatureHeader?: string;
  /**
   * 0 = send back-to-back. N > 0 = replay in compressed real time, N times faster
   * than life (e.g. 3600 turns one hour into one second).
   */
  speed?: number;
  fetchImpl?: typeof fetch;
  onEvent?: (ev: SimEvent, status: number) => void;
}

export interface ReplaySummary {
  sent: number;
  failed: number;
  statuses: Record<number, number>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** POST each event to a webhook URL as a signed, Ring-shaped envelope. */
export async function replay(events: SimEvent[], opts: ReplayOptions): Promise<ReplaySummary> {
  const doFetch = opts.fetchImpl ?? fetch;
  const header = opts.signatureHeader ?? 'X-Signature';
  const summary: ReplaySummary = { sent: 0, failed: 0, statuses: {} };
  let prev: number | null = null;

  for (const ev of events) {
    const at = Date.parse(ev.at);
    if (opts.speed && prev !== null) await sleep(Math.max(0, (at - prev) / opts.speed));
    prev = at;

    const body = JSON.stringify(toEnvelope(ev));
    let status = 0;
    try {
      const res = await doFetch(opts.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [header]: sign(body, opts.hmacKey) },
        body,
      });
      status = res.status;
    } catch {
      status = 0;
    }
    summary.statuses[status] = (summary.statuses[status] ?? 0) + 1;
    if (status >= 200 && status < 300) summary.sent++;
    else summary.failed++;
    opts.onEvent?.(ev, status);
  }
  return summary;
}
