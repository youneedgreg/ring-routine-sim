# ring-routine-sim

Weeks of realistic, Ring-shaped household events, and a replayer that posts them to your webhook with valid HMAC signatures.

The Ring Developer Playground gives partner apps simulated live-view streams, but it sends no motion, doorbell or sensor events. That makes event-driven apps hard to build and harder to test: you can't wait four weeks for a routine to form. `ring-routine-sim` generates that history in milliseconds, deterministically, with the changes you want to detect built in (slow drift, a weekend away, a missed morning, a sensor going offline).

It was written for [Jirani](https://github.com/youneedgreg/jirani), a caregiving agent that learns an older adult's routine from Ring signals, and is published separately so any Ring partner app can use it.

- **Zero runtime dependencies.** Node 20+.
- **Deterministic.** Same seed, same events.
- **Local time aware.** Routines are written in the household's time zone and converted to UTC correctly across DST.
- **Signed like Ring.** HMAC-SHA256 over the raw body, hex, `sha256=` prefix, in `X-Signature`.

## Install

```bash
npm install --save-dev ring-routine-sim
```

## CLI

```bash
npx ring-routine-sim presets
npx ring-routine-sim generate --preset drift --out events.ndjson
npx ring-routine-sim replay --file events.ndjson --url http://localhost:8787/ring/webhook --key <your-hmac-key>
```

| Command | Options |
| --- | --- |
| `presets` | Lists the built-in households |
| `generate` | `--preset <name>` `--days N` `--seed N` `--start YYYY-MM-DD` `--tz <IANA zone>` `--until <ISO or none>` `--out <file>` (default: NDJSON to stdout) |
| `replay` | `--file` `--url` `--key` (all required), `--speed N` (0 = back to back; 3600 = one hour per second), `--verbose` |

`replay` exits non-zero if any delivery gets a non-2xx response.

## Presets

All presets start on Monday 2026-09-21 in `America/New_York`.

| Preset | What happens |
| --- | --- |
| `normal` | 28 ordinary days: a stable routine with outings, visitors and street noise |
| `drift` | Night-time bathroom trips rise from about 1 to about 4 a night over three weeks |
| `away` | Away from Saturday 09:00 to Sunday 17:30 (days 26 to 27) |
| `missed-morning` | Day 28 (a Monday): no activity at all until 11:40 |
| `offline` | The fridge sensor goes offline on day 20 at 06:00 and returns on day 21 at 14:00 |
| `demo` | Drift + a weekend away + a silent Monday morning; events stop at 10:05 local time |

## Library

```ts
import { generate, replay, toEnvelope, sign, PRESETS } from 'ring-routine-sim';

const events = generate({
  start: '2026-09-21',
  days: 28,
  seed: 7,
  timeZone: 'Africa/Nairobi',
  routine: { wakeMean: 6 * 60 + 30 },            // minutes after local midnight
  modifiers: [
    { kind: 'drift', field: 'wakeMean', from: 390, to: 480, startDay: 7, endDay: 27 },
    { kind: 'offline', device: 'medicine', startDay: 14, startAt: 600, endDay: 15, endAt: 600 },
  ],
});

const summary = await replay(events, { url: 'http://localhost:8787/ring/webhook', hmacKey: 'dev-only' });
// { sent, failed, statuses: { 200: n, ... } }
```

### Devices

Five simulated devices; rename any of them with `devices: { fridge: 'your-device-id' }`.

| Key | Default id | Emits |
| --- | --- | --- |
| `frontDoor` | `ava1.ring.device.sim-front-door-contact` | `contact_sensor_opened` / `contact_sensor_closed` |
| `fridge` | `ava1.ring.device.sim-fridge-contact` | same |
| `bathroom` | `ava1.ring.device.sim-bathroom-contact` | same |
| `medicine` | `ava1.ring.device.sim-medicine-contact` | same |
| `doorbell` | `ava1.ring.device.sim-front-doorbell` | `motion_detected` (`sub_type` human / vehicle / other), `button_press` |

Any sensor can also emit `device_offline` / `device_online` through the `offline` modifier.

### Routine

`routine` overrides any of: `wakeMean`, `wakeSd`, `bedMean`, `bedSd` (minutes), `nightBathroomRate`, `dayBathroomRate`, `fridgeExtraRate` (Poisson means per day), `outingProb`, `visitorProb` (daily probabilities), `sundayOuting`, `medication` (booleans).

### Modifiers

| Kind | Fields | Effect |
| --- | --- | --- |
| `drift` | `field` (`nightBathroomRate`, `wakeMean`, `outingProb`, `visitorProb`), `from`, `to`, `startDay`, `endDay` | Moves the parameter linearly across the days |
| `away` | `startDay`, `leaveAt`, `endDay`, `returnAt` | Leaves by the front door, silence inside, returns. Street motion still happens |
| `missedMorning` | `day`, `firstActivityAt` (minutes, or `null` for none) | No indoor activity, visitors or doorbell presses until that time |
| `offline` | `device`, `startDay`, `startAt`, `endDay`, `endAt` | Offline/online events and no readings in between |

## What gets posted

Each event becomes one POST in the Ring webhook v1.1 envelope shape:

```json
{
  "meta": { "version": "1.1", "request_id": "req_c2ed63f6f05290e8", "time": "2026-09-21T10:52:01.948Z" },
  "data": {
    "type": "events",
    "id": "evt_5ee9c8a92751af03",
    "attributes": {
      "event_type": "contact_sensor_opened",
      "device_id": "ava1.ring.device.sim-bathroom-contact",
      "timestamp": "2026-09-21T10:52:01.948Z"
    }
  }
}
```

with `X-Signature: sha256=<hex HMAC-SHA256 of the raw body>`. Every event has a unique `request_id`, so you can test idempotent handling by replaying a file twice. The `label` field in the NDJSON ("breakfast", "night bathroom trip") is for debugging and is never sent.

Verifying on the receiving side (Node):

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody: string, header: string | undefined, key: string) {
  if (!header?.startsWith('sha256=')) return false;
  const got = Buffer.from(header.slice(7), 'hex');
  const want = createHmac('sha256', key).update(rawBody).digest();
  return got.length === want.length && timingSafeEqual(got, want);
}
```

## Limits, stated plainly

- **Contact-sensor event names are an assumption.** The envelope follows Ring's public webhook v1.1 structure, but `contact_sensor_opened` / `contact_sensor_closed` are this package's names until Ring documents sensor events for partner webhooks. If yours differ, map `event_type` in your handler or change `toEnvelope`.
- **It models one person living alone**, with a plausible but invented routine. It is test data, not a model of any real household or condition.
- **It doesn't emulate the Ring REST API.** For that, see [ring-sandbox](https://pypi.org/project/ring-sandbox/), a Python Ring API emulator. The two fit together: ring-sandbox for API calls, this package for long event histories.

## Develop

```bash
pnpm install
pnpm test        # 10 tests: determinism, local time, every modifier, envelope shape, signing, replay
pnpm typecheck
pnpm build       # emits dist/ (ESM + .d.ts)
pnpm sim presets # run the CLI from source
```

## License

MIT. See [LICENSE](LICENSE).
