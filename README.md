# vidframes

> Cost-aware video frame extraction, vision analysis, and audio transcription via Cloudflare Workers AI.

[![Live site](https://img.shields.io/badge/site-vidframes.coey.dev-000000?style=for-the-badge)](https://vidframes.coey.dev)
[![GitHub](https://img.shields.io/badge/github-acoyfellow/vidframes-181717?style=for-the-badge)](https://github.com/acoyfellow/vidframes)
[![MIT](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

Extract frames from video, analyze them with vision models, and transcribe audio — all through Cloudflare Workers AI. Built-in cost controls keep spending predictable.

**The problem:** A 5-minute video at 60fps is 18,000 frames. Sending all of them to a frontier vision model is prohibitively expensive.

**The fix:** Scene detection by default (10-30x fewer frames), resize before analysis (smaller = cheaper), dry-run estimates (know cost before spending), and hard frame caps (`--max-frames`).

## Quick start

```bash
git clone https://github.com/acoyfellow/vidframes
cd vidframes
bun install
```

```bash
# probe a video — see duration, resolution, frame estimates per mode
bun run src/cli.ts probe video.mp4

# dry-run — see how many frames + API calls before spending
bun run src/cli.ts analyze video.mp4 --dry-run

# extract frames only (scene detection, no API calls)
bun run src/cli.ts extract video.mp4 --output ./frames

# transcribe audio only
CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=xxx \
  bun run src/cli.ts transcribe video.mp4

# full run: extract + analyze + transcribe
CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_API_TOKEN=xxx \
  bun run src/cli.ts run video.mp4 --prompt "Describe what's happening"
```

## Commands

```bash
vidframes probe <video>                    # video info + frame estimates
vidframes extract <video> [opts]           # extract frames (no API needed)
vidframes transcribe <video> [opts]        # extract audio + transcribe via Whisper
vidframes analyze <video> [opts]           # extract + analyze frames via vision model
vidframes smart <video> [opts]             # transcript-first: transcribe → LLM picks timestamps → extract 3-5 frames → analyze
vidframes run <video> [opts]               # everything: frames + analysis + transcription
```

### Key options

| Option | Default | Description |
|--------|---------|-------------|
| `--mode` | `scene` | `scene` \| `interval` \| `keyframe` |
| `--interval` | `5` | Seconds between frames (interval mode) |
| `--scene-threshold` | `0.4` | Scene change sensitivity 0-1 (scene mode, lower = more frames) |
| `--resize` | `512` | Max pixel dimension (0 = no resize) |
| `--max-frames` | — | Hard cap on frames to analyze |
| `--limit` | — | Hard cap on frames to extract |
| `--prompt` | "Describe what is happening..." | Vision model prompt |
| `--model` | `@cf/meta/llama-3.2-11b-vision-instruct` | Workers AI vision model |
| `--concurrency` | `3` | Parallel API requests |
| `--dry-run` | — | Estimate only, no API calls |
| `--no-transcribe` | — | Skip audio transcription (analyze command) |
| `--selector-model` | `@cf/meta/llama-3.1-8b-instruct` | Text model for timestamp selection (smart command) |
| `--max-timestamps` | `5` | Max timestamps to select (smart command) |

## Library API

All logic is in the library. The CLI is a thin wrapper.

```ts
import { probeVideo, extractFrames, analyzeVideo, smartAnalyze, estimateAnalysis } from 'vidframes';

// probe
const info = await probeVideo('video.mp4');

// estimate before spending
const estimate = estimateAnalysis(info, { mode: 'scene' }, { maxFrames: 15 });
console.log(estimate.frameCount); // ~15

// extract only
const frames = await extractFrames('video.mp4', { mode: 'scene', resize: 512 });

// full analysis: extract + analyze + transcribe
const result = await analyzeVideo('video.mp4', {
  extract: { mode: 'scene', resize: 512, limit: 20 },
  analyze: { prompt: 'Describe what is happening', maxFrames: 15, concurrency: 3 },
  transcribe: { segmentDuration: 30 },
});

for (const frame of result.frames) {
  console.log(`[${frame.frame.timestamp}s] ${frame.description}`);
}
console.log(result.transcription?.fullText);

// smart analysis: transcript-first, LLM picks visually meaningful timestamps
const smart = await smartAnalyze('video.mp4', {
  maxTimestamps: 5,
  analyze: { prompt: 'Describe the diagram or visual shown' },
  onProgress: (phase, detail) => console.log(`${phase}: ${detail}`),
});
// 1. transcribes audio (cheap whisper)
// 2. asks text LLM: "which timestamps have visual value?"
// 3. extracts 3-5 frames at those exact timestamps
// 4. analyzes only those frames with vision model
console.log(smart.selectedTimestamps); // [{timestamp: 120, reason: "whiteboard diagram"}, ...]
```

## Requirements

- [ffmpeg](https://ffmpeg.org/) (installed and on PATH)
- [Bun](https://bun.sh/) runtime
- Cloudflare account with Workers AI (for analysis + transcription only; frame extraction needs no API)

## Deploy

The site deploys to `vidframes.coey.dev`:

```bash
bun run deploy
```

Worker config is in `wrangler.jsonc`. The Worker serves the static site from `site/dist` and exposes `/health`.

## More docs

- [`docs/architecture.md`](docs/architecture.md) — system design, module layout, design decisions
- [`docs/costs.md`](docs/costs.md) — cost scenarios, frame count comparisons, resize impact

## Why this exists

Vision models can "watch" a video by analyzing its frames, but naively extracting every frame is prohibitively expensive. This tool makes the cost explicit and controllable: scene detection minimizes frames, resize minimizes tokens, dry-run shows the bill before you pay it, and hard caps prevent surprises.

MIT. Built by [@acoyfellow](https://x.com/acoyfellow).
