# Alfred

**Connectors grant broad access. Alfred is the leash.**

A personal agent on a Fly.io Sprite. Policy gates every spend and tool call. Credentials never live on the Sprite.

Built for [Hacksgiving 2026](https://fly.io/hacksgiving/).

## Live

https://alfred-b6vev.sprites.app

## Tests

```bash
npm test
```

20 tests passing (policy, agent loop, SSRF guards, calculate).

## Safety model

- Policy checked before every model call and tool use. A blocked agent makes zero model calls.
- SSRF guards: DNS resolution + private/loopback/metadata/internal host blocks before every fetch.
- Admin endpoints require `ALFRED_TOKEN` (timing-safe compare). `/ask` is public but rate-limited and budget-bounded.
- Tool output wrapped as untrusted. UI escapes all interpolated text and renders markdown after escaping.
- Atomic state writes to `~/.alfred/state.json`.

## Phase 3 connectors (scaffolded)

- **Search:** set `EXA_GATEWAY_URL` to an Exa (or similar) Sprites connector. Falls back to DuckDuckGo.
- **Box:** `agent/box.ts` — reads from an allowlist of folder IDs; writes only into one Alfred-Outbox. Set `BOX_GATEWAY_URL`. Policy check lives in `checkBoxTool`.
- **Approvals:** `agent/approvals.ts` — risky calls can pause instead of failing. Wire into the agent loop + UI when ready.

Create the connectors in the Fly.io dashboard, then set the gateway env vars on the Sprite.

## Run

```bash
npm run web
```

On a Sprite:

```bash
sprite exec -s alfred -- bash -c "cd Alfred && npm run web"
```

Set `ALFRED_TOKEN` before the demo.

## Config

See `.env.example`.

## Hackathon

- Runs on a Sprite
- Uses a Sprites Custom API connector (xAI/Grok)
- Built during Nov 23–29, 2026
