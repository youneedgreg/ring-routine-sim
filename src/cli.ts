#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { generate, type GenerateOptions } from './generate.ts';
import { PRESETS } from './presets.ts';
import { replay } from './replay.ts';
import type { SimEvent } from './ring.ts';

const HELP = `ring-routine-sim: weeks of realistic Ring-shaped household events

Usage:
  ring-routine-sim presets
  ring-routine-sim generate --preset demo [--days N] [--seed N] [--until ISO] [--out file.ndjson]
  ring-routine-sim replay --file file.ndjson --url http://localhost:8787/ring/webhook --key <hmac> [--speed 3600]

Without --out, generate prints NDJSON to stdout. Replay signs every body with
HMAC-SHA256 (hex, "sha256=" prefix) in the X-Signature header, like Ring does.`;

function args(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const next = argv[i + 1];
      out[a.slice(2)] = next && !next.startsWith('--') ? (i++, next) : 'true';
    }
  }
  return out;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = args(rest);

  if (cmd === 'presets') {
    for (const [name, p] of Object.entries(PRESETS)) console.log(`${name.padEnd(16)} ${p.description}`);
    return;
  }

  if (cmd === 'generate') {
    const preset = PRESETS[opt.preset ?? 'normal'];
    if (!preset) throw new Error(`Unknown preset "${opt.preset}". Run: ring-routine-sim presets`);
    const options: GenerateOptions = { ...preset.options };
    if (opt.days) options.days = Number(opt.days);
    if (opt.seed) options.seed = Number(opt.seed);
    if (opt.start) options.start = opt.start;
    if (opt.tz) options.timeZone = opt.tz;
    if (opt.until) options.until = opt.until;
    if (opt.until === 'none') delete options.until;
    const events = generate(options);
    const ndjson = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    if (opt.out) {
      mkdirSync(dirname(opt.out), { recursive: true });
      writeFileSync(opt.out, ndjson);
      console.error(`Wrote ${events.length} events to ${opt.out}`);
    } else {
      process.stdout.write(ndjson);
    }
    return;
  }

  if (cmd === 'replay') {
    if (!opt.file || !opt.url || !opt.key) throw new Error('replay needs --file, --url and --key');
    const events: SimEvent[] = readFileSync(opt.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const summary = await replay(events, {
      url: opt.url,
      hmacKey: opt.key,
      speed: opt.speed ? Number(opt.speed) : 0,
      onEvent: (ev, status) => {
        if (opt.verbose) console.error(`${status} ${ev.at} ${ev.type} ${ev.label ?? ''}`);
      },
    });
    console.error(`Replayed ${summary.sent} ok, ${summary.failed} failed`, summary.statuses);
    if (summary.failed) process.exitCode = 1;
    return;
  }

  console.log(HELP);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
