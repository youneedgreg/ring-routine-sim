# Changelog

## 0.1.0

First release.

- `generate()`: weeks of Ring-shaped events for one household (four contact sensors and a doorbell), written in the household's local time and converted to UTC correctly across daylight saving. Deterministic: the same seed gives the same events.
- Modifiers: `drift` (move a routine parameter across days), `away`, `missedMorning`, `offline`.
- Presets: `normal`, `drift`, `away`, `missed-morning`, `offline`, `demo`.
- `toEnvelope()` and `sign()`: Ring's documented webhook v1.1 payload (event name in `data.type`, device in `attributes.source`, epoch-millisecond `timestamp`, `meta.account_id`), signed with HMAC-SHA256 (`X-Signature: sha256=<hex>`). Every event has a unique `request_id`.
- `replay()`: posts events to a webhook, back to back or at a chosen speed, and reports the status codes.
- CLI: `ring-routine-sim presets | generate | replay`.
- Zero runtime dependencies; Node 20+; ESM with type declarations.
