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

Fixed-interval extraction at 1fps on a 5-minute video produces 300 frames. At frontier vision model pricing, that's expensive. Scene detection (`ffmpeg select='gt(scene,0.4)'`) typically yields 10-30x fewer frames because it only fires when the visual content actually changes.

### Resize before analysis

A 1080p frame is ~2MB as JPEG. Resized to 512px max dimension, it's ~30KB. Smaller images mean fewer input tokens, faster API responses, and lower cost — with negligible quality loss for "describe what's happening" prompts.

### Dry-run first

`--dry-run` calls `estimateAnalysis()` which probes the video, estimates frame count based on mode/threshold, and prints the model + frame count — all without a single API call. You know the cost before you commit.

### Hard frame cap

`--max-frames` is a hard ceiling. Even if scene detection produces 200 frames, `--max-frames 50` stops at 50. This is the answer to "how much are you willing to spend?"

### Audio is cheap

Whisper transcription is significantly cheaper than vision analysis. A 5-minute video = 10 Whisper calls (30s chunks). The cost concern is almost entirely on the vision side, which is why the cost controls focus there.

### Smart analysis (transcript-first)

The `smartAnalyze` function flips the traditional flow. Instead of extracting frames first and analyzing all of them, it:

1. **Transcribes** the audio (cheap Whisper calls)
2. **Asks a text LLM** (cheap, e.g. llama-3.1-8b) to read the transcript and identify timestamps where visual context adds value — diagrams, slides, code, "as you can see" references
3. **Extracts 3-5 frames** at only those specific timestamps
4. **Analyzes** only those frames with the vision model

This is the cheapest path: Whisper + 1 text call + 3-5 vision calls, vs. 15-50 vision calls for blind extraction. The transcript already tells you what's happening — the frames just add visual context where the speaker references something visual.

## Worker

The deployed Worker (`src/worker/index.ts`) is minimal:
- Serves the static site from `site/dist`
- `/health` endpoint for uptime checks
- No bindings, no database, no secrets

The actual video processing happens locally via the CLI/library. The Worker exists to host the docs site at `vidframes.coey.dev`.
