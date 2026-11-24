# Alfred

**Personal agent on a Fly.io Sprite that does useful work under policy.**

Built for [Hacksgiving 2026](https://fly.io/hacksgiving/).

## What it is

Alfred is a personal agent that lives on a [Fly.io Sprite](https://fly.io/sprites). It performs useful work (research, summarization, light automation, etc.) while a lightweight, chain-agnostic policy layer keeps it inside defined limits (budget, rate, freeze).

It uses at least one Sprites connector (starting with an LLM connector) so the agent can reason and act without holding credentials.

## Current status

- Sprite `alfred` is live
- Starter agent + policy engine runs on the Sprite
- Next: wire LLM connector and add useful work under policy

## Run on Sprite

```bash
sprite exec -s alfred -- bash -c "cd Alfred && npm install && npm start"
```

## Hackathon requirements

- Runs on a Sprite
- Uses ≥1 Sprites connector
- Built during Hacksgiving week (Nov 23–29, 2026)

## License

MIT
