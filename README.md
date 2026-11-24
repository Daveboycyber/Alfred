# Alfred

**Personal agent on a Fly.io Sprite that does useful work under policy.**

Built for [Hacksgiving 2026](https://fly.io/hacksgiving/).

## What it is

Alfred is a personal agent that lives on a [Fly.io Sprite](https://fly.io/sprites). It performs useful work (summarization, research, light automation) while a lightweight, chain-agnostic policy layer enforces limits (single-action cost, daily budget, freeze).

It uses a Sprites **Custom API connector** to call Grok (xAI) so the agent can reason without the Sprite holding credentials.

## Demo path

Running the agent shows:
1. **Useful work under policy** — Grok summarizes a topic (allowed).
2. **Policy block** — An oversized action is rejected with a clear reason.

## Run on Sprite

```bash
sprite exec -s alfred -- bash -c "cd Alfred && npm install && npm start"
```

## Hackathon requirements

- Runs on a Sprite
- Uses ≥1 Sprites connector (xAI Custom API)
- Built during Hacksgiving week (Nov 23–29, 2026)

## License

MIT
