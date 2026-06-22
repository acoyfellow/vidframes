# Contributing

PRs welcome. Keep it small and single-purpose.

## Setup

```sh
bun install
```

## Checks before PR

```sh
bun run lint
bun run typecheck
```

## Style

- Biome for lint + format (2-space, single quotes, trailing commas, semicolons, lineWidth 100)
- TypeScript ESM, strict
- No mocks. Real ffmpeg, real Workers AI.
- README stays understandable in 7 minutes.
