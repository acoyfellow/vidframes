# Architecture

## Overview

```
video.mp4
    │
    ├──► ffmpeg (frame extraction)
    │       modes: scene | interval | keyframe
    │       resize → 512px max (configurable)
    │       limit → hard cap on frame count
    │
    ├──► ffmpeg (audio extraction)
    │       split into 30s WAV chunks
    │       │
    │       └──► Workers AI (@cf/openai/whisper)
    │               per-chunk transcription
    │               reassembled with timestamps
    │
    └──► Workers AI (vision model)
            per-frame analysis
            concurrency-limited (default 3)
            maxFrames hard cap
```

## Library structure

| Module | Responsibility |
|--------|---------------|
| `src/ai.ts` | Shared Workers AI client (credentials, model invocation) |
| `src/extract.ts` | Frame extraction via ffmpeg (3 modes, resize, limit, probe) |
| `src/transcribe.ts` | Audio extraction + chunked Whisper transcription |
| `src/analyze.ts` | Cost-aware frame analysis (dry-run, concurrency, maxFrames) |
| `src/index.ts` | Public API exports |
| `src/cli.ts` | Thin CLI wrapper — no logic, just argv parsing + library calls |
| `src/worker/index.ts` | Minimal Worker — serves static site + `/health` |

## Design decisions

### Scene detection by default

Fixed-interval extraction at 1fps on a 5-minute video produces 300 frames, which is 300 vision calls. Scene detection (`ffmpeg select='gt(scene,0.4)'`) emits a frame only when the inter-frame difference crosses the threshold, so the count tracks visual change instead of duration. How much it drops depends on the content: a static screen-share yields a handful, a fast-cut montage yields many.

### Resize before analysis

A 1080p frame is ~2MB as JPEG. Resized to 512px max dimension, it's ~30KB. Fewer pixels mean fewer input tokens per call. 512px holds enough detail for "describe what's happening" prompts; raise it with `--resize 1024` when the task is OCR or reading small UI text.

### Dry-run first

`--dry-run` calls `estimateAnalysis()` which probes the video, estimates frame count based on mode/threshold, and prints the model + frame count — all without a single API call. You know the cost before you commit.

### Hard frame cap

`--max-frames` is a hard ceiling. Even if scene detection produces 200 frames, `--max-frames 50` stops at 50. This is the answer to "how much are you willing to spend?"

### Audio is the minor cost

Whisper runs one call per 30-second chunk: a 5-minute video is 10 calls. That count is far below the per-frame vision count on most videos, so the cost controls focus on the vision side.

### Smart analysis (transcript-first)

The `smartAnalyze` function flips the traditional flow. Instead of extracting frames first and analyzing all of them, it:

1. **Transcribes** the audio (cheap Whisper calls)
2. **Asks a text LLM** (cheap, e.g. llama-3.1-8b) to read the transcript and identify timestamps where visual context adds value — diagrams, slides, code, "as you can see" references
3. **Extracts 3-5 frames** at only those specific timestamps
4. **Analyzes** only those frames with the vision model

The call breakdown is Whisper chunks + 1 text call + one vision call per flagged timestamp. The transcript already carries the spoken content; the frames add visual context only where the speaker points at something. The vision count then tracks the number of visual references, not the video's length, so the gap from blind extraction widens as videos get longer.

## Worker

The deployed Worker (`src/worker/index.ts`) is minimal:
- Serves the static site from `site/dist`
- `/health` endpoint for uptime checks
- No bindings, no database, no secrets

The actual video processing happens locally via the CLI/library. The Worker exists to host the docs site at `vidframes.coey.dev`.
