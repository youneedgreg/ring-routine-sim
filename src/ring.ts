import { createHmac } from 'node:crypto';

/**
 * Ring-shaped output. Self-contained on purpose: this package has zero runtime
 * dependencies so any Ring partner app (any language behind the webhook) can use it.
 *
 * The envelope follows the Ring webhook v1.1 structure in the public Partner API
 * docs (meta.request_id + JSON:API `data`). Contact-sensor event names are an
 * assumption until Ring publishes them for partner webhooks; if your integration
 * uses different values, map `event_type` in `toEnvelope` below.
 */

export type SimEventType =
  | 'motion_detected'
  | 'button_press'
  | 'device_online'
  | 'device_offline'
  | 'contact_sensor_opened'
  | 'contact_sensor_closed';

export interface SimEvent {
  id: string;
  requestId: string;
  deviceId: string;
  type: SimEventType;
  subType?: string;
  /** ISO 8601, UTC */
  at: string;
  /** Not sent to the webhook: a human-readable label for debugging and demos. */
  label?: string;
}

export function toEnvelope(ev: SimEvent) {
  return {
    meta: { version: '1.1', request_id: ev.requestId, time: ev.at },
    data: {
      type: 'events',
      id: ev.id,
      attributes: {
        event_type: ev.type,
        device_id: ev.deviceId,
        timestamp: ev.at,
        ...(ev.subType ? { sub_type: ev.subType } : {}),
      },
    },
  };
}

/** HMAC-SHA256 over the raw body, hex, `sha256=` prefix: Ring's webhook format. */
export function sign(rawBody: string, hmacKey: string): string {
  return `sha256=${createHmac('sha256', hmacKey).update(rawBody).digest('hex')}`;
}
