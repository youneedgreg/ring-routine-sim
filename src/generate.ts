import { Rng } from './random.ts';
import type { SimEvent, SimEventType } from './ring.ts';
import { addDays, localToUtc } from './time.ts';

export interface Devices {
  frontDoor: string;
  fridge: string;
  bathroom: string;
  medicine: string;
  /** Doorbell camera at the front door: motion + button presses. */
  doorbell: string;
}

export type DeviceKey = keyof Devices;

/** All times are minutes after local midnight. */
export interface Routine {
  wakeMean: number;
  wakeSd: number;
  bedMean: number;
  bedSd: number;
  /** Expected bathroom visits between 01:00 and wake-up. */
  nightBathroomRate: number;
  /** Expected extra daytime bathroom visits. */
  dayBathroomRate: number;
  /** Expected extra fridge openings (drinks, snacks) between meals. */
  fridgeExtraRate: number;
  /** Chance of a weekday or Saturday outing (shopping, a walk). */
  outingProb: number;
  /** Goes out on Sunday mornings (church, family). */
  sundayOuting: boolean;
  /** Chance of a visitor ringing the doorbell on a given day. */
  visitorProb: number;
  /** Takes morning and evening medication from the medicine cabinet. */
  medication: boolean;
}

export type DriftField = 'nightBathroomRate' | 'wakeMean' | 'outingProb' | 'visitorProb';

export type Modifier =
  /** Linearly move a routine parameter from `from` to `to` across [startDay, endDay]. */
  | { kind: 'drift'; field: DriftField; from: number; to: number; startDay: number; endDay: number }
  /** Nobody home: leaves on startDay at leaveAt, returns on endDay at returnAt. */
  | { kind: 'away'; startDay: number; leaveAt: number; endDay: number; returnAt: number }
  /** No activity on `day` until `firstActivityAt` (or none at all if null). */
  | { kind: 'missedMorning'; day: number; firstActivityAt: number | null }
  /** A sensor goes offline (dead battery, Wi-Fi). */
  | { kind: 'offline'; device: DeviceKey; startDay: number; startAt: number; endDay: number; endAt: number };

export interface GenerateOptions {
  /** First local calendar date, YYYY-MM-DD. */
  start: string;
  days: number;
  seed?: number;
  /** IANA time zone of the household. */
  timeZone?: string;
  devices?: Partial<Devices>;
  routine?: Partial<Routine>;
  modifiers?: Modifier[];
  /** Drop events after this instant (ISO). Useful to simulate "now". */
  until?: string;
}

export const DEFAULT_DEVICES: Devices = {
  frontDoor: 'ava1.ring.device.sim-front-door-contact',
  fridge: 'ava1.ring.device.sim-fridge-contact',
  bathroom: 'ava1.ring.device.sim-bathroom-contact',
  medicine: 'ava1.ring.device.sim-medicine-contact',
  doorbell: 'ava1.ring.device.sim-front-doorbell',
};

export const DEFAULT_ROUTINE: Routine = {
  wakeMean: 7 * 60 + 10,
  wakeSd: 18,
  bedMean: 22 * 60 + 15,
  bedSd: 20,
  nightBathroomRate: 1,
  dayBathroomRate: 4,
  fridgeExtraRate: 3,
  outingProb: 0.45,
  sundayOuting: true,
  visitorProb: 0.25,
  medication: true,
};

interface Draft {
  device: DeviceKey;
  type: SimEventType;
  minute: number;
  dayOffset: number;
  subType?: string;
  label: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function routineFor(day: number, base: Routine, modifiers: Modifier[]): Routine {
  const r = { ...base };
  for (const m of modifiers) {
    if (m.kind !== 'drift' || day < m.startDay) continue;
    const t = m.endDay === m.startDay ? 1 : clamp((day - m.startDay) / (m.endDay - m.startDay), 0, 1);
    r[m.field] = m.from + (m.to - m.from) * t;
  }
  return r;
}

export function generate(opts: GenerateOptions): SimEvent[] {
  const rng = new Rng(opts.seed ?? 42);
  const tz = opts.timeZone ?? 'America/New_York';
  const devices: Devices = { ...DEFAULT_DEVICES, ...opts.devices };
  const base: Routine = { ...DEFAULT_ROUTINE, ...opts.routine };
  const modifiers = opts.modifiers ?? [];
  const drafts: Draft[] = [];

  const contact = (device: DeviceKey, dayOffset: number, minute: number, label: string, holdSec: [number, number] = [3, 40]) => {
    drafts.push({ device, type: 'contact_sensor_faulted', minute, dayOffset, label });
    drafts.push({ device, type: 'contact_sensor_cleared', minute: minute + rng.between(...holdSec) / 60, dayOffset, label });
  };
  const doorbell = (dayOffset: number, minute: number, type: 'motion_detected' | 'button_press', label: string, subType?: string) => {
    const d: Draft = { device: 'doorbell', type, minute, dayOffset, label };
    if (subType) d.subType = subType;
    drafts.push(d);
  };

  for (let day = 0; day < opts.days; day++) {
    const date = addDays(opts.start, day);
    const r = routineFor(day, base, modifiers);
    const indoorStart = drafts.length;

    const wake = clamp(rng.normal(r.wakeMean, r.wakeSd), 5 * 60, 10 * 60);
    const bed = clamp(rng.normal(r.bedMean, r.bedSd), 20 * 60, 23 * 60 + 45);

    // Night bathroom trips, 01:00 until shortly before waking.
    const nightTrips = rng.poisson(r.nightBathroomRate);
    for (let i = 0; i < nightTrips; i++) contact('bathroom', day, rng.between(60, Math.max(90, wake - 20)), 'night bathroom trip');

    // Morning.
    contact('bathroom', day, wake + rng.between(2, 8), 'morning bathroom');
    contact('fridge', day, wake + rng.between(15, 35), 'breakfast');
    if (r.medication && rng.bool(0.95)) contact('medicine', day, wake + rng.between(35, 55), 'morning medication', [5, 25]);

    // Meals and snacks.
    contact('fridge', day, rng.normal(12 * 60 + 30, 25), 'lunch');
    contact('fridge', day, rng.normal(18 * 60 + 15, 25), 'dinner');
    if (rng.bool(0.6)) contact('fridge', day, rng.between(15 * 60, 16 * 60 + 30), 'afternoon snack');
    if (rng.bool(0.4)) contact('fridge', day, rng.between(20 * 60, 21 * 60), 'evening snack');
    const drinks = rng.poisson(r.fridgeExtraRate);
    for (let i = 0; i < drinks; i++) contact('fridge', day, rng.between(wake + 90, bed - 60), 'drink');

    // Daytime bathroom and bedtime.
    const dayTrips = rng.poisson(r.dayBathroomRate);
    for (let i = 0; i < dayTrips; i++) contact('bathroom', day, rng.between(wake + 60, bed - 30), 'bathroom');
    if (r.medication && rng.bool(0.9)) contact('medicine', day, rng.normal(21 * 60, 20), 'evening medication', [5, 25]);
    contact('bathroom', day, bed - rng.between(5, 15), 'bedtime bathroom');

    // Outings: leaving and returning through the front door, seen by the doorbell.
    let out: [number, number] | null = null;
    if (date.weekday === 0 && r.sundayOuting && rng.bool(0.9)) {
      out = [rng.normal(9 * 60 + 15, 10), rng.normal(12 * 60 + 10, 15)];
    } else if (date.weekday !== 0 && rng.bool(r.outingProb)) {
      const leave = rng.between(10 * 60, 11 * 60 + 30);
      out = [leave, leave + rng.between(60, 180)];
    }

    // Remove indoor activity that would fall while she is out.
    if (out) {
      const [leave, back] = out;
      for (let i = drafts.length - 1; i >= indoorStart; i--) {
        const d = drafts[i]!;
        if (d.minute > leave - 2 && d.minute < back + 2) drafts.splice(i, 1);
      }
      contact('frontDoor', day, leave, 'leaves home', [5, 20]);
      doorbell(day, leave + 0.3, 'motion_detected', 'leaves home', 'human');
      doorbell(day, back - 0.4, 'motion_detected', 'returns home', 'human');
      contact('frontDoor', day, back, 'returns home', [5, 20]);
    }

    // A visitor rings the bell (never while she is out).
    if (rng.bool(r.visitorProb)) {
      let at = rng.between(10 * 60, 17 * 60);
      if (out && at > out[0] - 15 && at < out[1] + 15) at = out[1] + rng.between(30, 90);
      doorbell(day, at - 0.5, 'motion_detected', 'visitor', 'human');
      doorbell(day, at, 'button_press', 'visitor');
      contact('frontDoor', day, at + rng.between(0.3, 1.2), 'visitor', [5, 20]);
    }

    // Street noise: cars and animals the doorbell sees.
    const noise = rng.int(0, 3);
    for (let i = 0; i < noise; i++) {
      doorbell(day, rng.between(7 * 60, 21 * 60), 'motion_detected', 'street motion', rng.bool(0.7) ? 'vehicle' : 'other');
    }
  }

  applyAway(drafts, modifiers, rng);
  applyMissedMornings(drafts, modifiers);
  applyOffline(drafts, modifiers);

  const cutoff = opts.until ? Date.parse(opts.until) : Infinity;
  const events: SimEvent[] = drafts
    .map((d) => {
      const date = addDays(opts.start, d.dayOffset);
      const at = localToUtc(tz, date.year, date.month, date.day, d.minute);
      return { d, at };
    })
    .filter(({ at }) => at <= cutoff)
    .sort((a, b) => a.at - b.at)
    .map(({ d, at }) => {
      const ev: SimEvent = {
        id: rng.id('evt'),
        requestId: rng.id('req'),
        deviceId: devices[d.device],
        type: d.type,
        at: new Date(at).toISOString(),
        label: d.label,
      };
      if (d.subType) ev.subType = d.subType;
      return ev;
    });
  return events;
}

const absMinute = (dayOffset: number, minute: number) => dayOffset * 1440 + minute;

function applyAway(drafts: Draft[], modifiers: Modifier[], rng: Rng) {
  for (const m of modifiers) {
    if (m.kind !== 'away') continue;
    const from = absMinute(m.startDay, m.leaveAt);
    const to = absMinute(m.endDay, m.returnAt);
    for (let i = drafts.length - 1; i >= 0; i--) {
      const d = drafts[i]!;
      const t = absMinute(d.dayOffset, d.minute);
      const streetNoise = d.device === 'doorbell' && d.subType !== 'human';
      if (t > from - 2 && t < to + 2 && !streetNoise) drafts.splice(i, 1);
    }
    const push = (dayOffset: number, minute: number, label: string) => {
      drafts.push({ device: 'frontDoor', type: 'contact_sensor_faulted', minute, dayOffset, label });
      drafts.push({ device: 'frontDoor', type: 'contact_sensor_cleared', minute: minute + rng.between(5, 20) / 60, dayOffset, label });
      drafts.push({ device: 'doorbell', type: 'motion_detected', subType: 'human', minute: minute + 0.3, dayOffset, label });
    };
    push(m.startDay, m.leaveAt, 'leaves for a trip');
    push(m.endDay, m.returnAt, 'back from a trip');
  }
}

function applyMissedMornings(drafts: Draft[], modifiers: Modifier[]) {
  for (const m of modifiers) {
    if (m.kind !== 'missedMorning') continue;
    const limit = m.firstActivityAt ?? 24 * 60;
    for (let i = drafts.length - 1; i >= 0; i--) {
      const d = drafts[i]!;
      const indoor = d.device !== 'doorbell' || d.subType === 'human' || d.type === 'button_press';
      if (d.dayOffset === m.day && d.minute < limit && indoor) drafts.splice(i, 1);
    }
  }
}

function applyOffline(drafts: Draft[], modifiers: Modifier[]) {
  for (const m of modifiers) {
    if (m.kind !== 'offline') continue;
    const from = absMinute(m.startDay, m.startAt);
    const to = absMinute(m.endDay, m.endAt);
    for (let i = drafts.length - 1; i >= 0; i--) {
      const d = drafts[i]!;
      const t = absMinute(d.dayOffset, d.minute);
      if (d.device === m.device && t >= from && t <= to) drafts.splice(i, 1);
    }
    drafts.push({ device: m.device, type: 'device_offline', minute: m.startAt, dayOffset: m.startDay, label: 'sensor offline' });
    drafts.push({ device: m.device, type: 'device_online', minute: m.endAt, dayOffset: m.endDay, label: 'sensor back online' });
  }
}
