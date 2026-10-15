import type { GenerateOptions } from './generate.ts';

/**
 * Ready-made households. Every preset starts on Monday 2026-09-21 in Columbus,
 * Ohio (America/New_York), so day 26 is Saturday 17 Oct and day 28 is Monday 19 Oct.
 */
const START = '2026-09-21';
const TZ = 'America/New_York';

export const PRESETS: Record<string, { description: string; options: GenerateOptions }> = {
  normal: {
    description: '28 ordinary days: a stable routine with outings, visitors and street noise.',
    options: { start: START, days: 28, seed: 7, timeZone: TZ },
  },
  drift: {
    description: 'Night-time bathroom trips rise from about 1 to about 4 a night over three weeks.',
    options: {
      start: START,
      days: 28,
      seed: 1,
      timeZone: TZ,
      modifiers: [{ kind: 'drift', field: 'nightBathroomRate', from: 1, to: 4, startDay: 7, endDay: 27 }],
    },
  },
  away: {
    description: 'Away at her sister\'s from Saturday 09:00 to Sunday 17:30 (day 26 to 27).',
    options: {
      start: START,
      days: 28,
      seed: 13,
      timeZone: TZ,
      modifiers: [{ kind: 'away', startDay: 26, leaveAt: 9 * 60, endDay: 27, returnAt: 17 * 60 + 30 }],
    },
  },
  'missed-morning': {
    description: 'Day 28 (a Monday): no activity at all until 11:40.',
    options: {
      start: START,
      days: 29,
      seed: 17,
      timeZone: TZ,
      modifiers: [{ kind: 'missedMorning', day: 28, firstActivityAt: 11 * 60 + 40 }],
    },
  },
  offline: {
    description: 'The fridge sensor goes offline on day 20 at 06:00 and returns on day 21 at 14:00.',
    options: {
      start: START,
      days: 28,
      seed: 19,
      timeZone: TZ,
      modifiers: [{ kind: 'offline', device: 'fridge', startDay: 20, startAt: 6 * 60, endDay: 21, endAt: 14 * 60 }],
    },
  },
  demo: {
    description:
      'The Jirani demo story: three weeks of rising night trips, a weekend away, then a silent Monday morning (events stop at 10:05).',
    options: {
      start: START,
      days: 29,
      seed: 42,
      timeZone: TZ,
      modifiers: [
        { kind: 'drift', field: 'nightBathroomRate', from: 1, to: 4, startDay: 7, endDay: 27 },
        { kind: 'away', startDay: 26, leaveAt: 9 * 60, endDay: 27, returnAt: 17 * 60 + 30 },
        { kind: 'missedMorning', day: 28, firstActivityAt: null },
      ],
      until: '2026-10-19T14:05:00.000Z',
    },
  },
};
