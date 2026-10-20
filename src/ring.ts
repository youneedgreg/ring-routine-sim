import { createHmac } from 'node:crypto';

/**
 * Ring-shaped output. Self-contained on purpose: this package has zero runtime
 * dependencies so any Ring partner app (any language behind the webhook) can use it.
 *
 * The envelope follows the Ring webhook v1.1 payload in the Ring Partner API docs
 * (https://developer.amazon.com/docs/ring/api-documentation.html#sensor-webhook-payload):
 * the event name in `data.type`, the device in `data.attributes.source`, and
 * `timestamp` in Unix epoch milliseconds. Contact sensors use Ring's names:
 * `contact_sensor_faulted` when the contact opens, `contact_sensor_cleared` when
 * it closes. Sensor events are Early Access in Ring's docs and may change.
 */

/** Placeholder for `meta.account_id`; Ring sends the linked user's account ID. */
export const SIM_ACCOUNT_ID = 'ava1.ring.account.SIMULATED';

export type SimEventType =
  | 'motion_detected'
  | 'button_press'
  | 'device_online'
  | 'device_offline'
  | 'contact_sensor_faulted'
  | 'contact_sensor_cleared';

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

export function toEnvelope(ev: SimEvent, accountId: string = SIM_ACCOUNT_ID) {
  return {
    meta: { version: '1.1', time: ev.at, request_id: ev.requestId, account_id: accountId },
    data: {
      id: ev.id,
      type: ev.type,
      attributes: {
        source: ev.deviceId,
        source_type: 'devices',
        timestamp: Date.parse(ev.at),
        ...(ev.subType ? { sub_type: ev.subType } : {}),
      },
      relationships: { devices: { links: { self: `/v1/devices/${ev.deviceId}` } } },
    },
  };
}

/** HMAC-SHA256 over the raw body, hex, `sha256=` prefix: Ring's webhook format. */
export function sign(rawBody: string, hmacKey: string): string {
  return `sha256=${createHmac('sha256', hmacKey).update(rawBody).digest('hex')}`;
}
