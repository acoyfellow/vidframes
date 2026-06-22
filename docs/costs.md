# Cost model

> "You CAN do this, but how much are you willing to spend?"

This doc answers that question with numbers.

## The problem

A 5-minute video at 60fps = 18,000 frames. Sending all of them to a frontier vision model is prohibitively expensive. Most of those frames are near-duplicates — the same scene from a slightly different moment.

## The solution: extract less, resize smaller, cap hard

### Frame count comparison (5-minute video)

| Mode | Setting | Frames | Vision API calls |
|------|---------|--------|-----------------|
| Every frame | 60fps | 18,000 | 18,000 |
| Interval | 1s | 300 | 300 |
| Interval | 5s | 60 | 60 |
| **Scene (default)** | **threshold 0.4** | **~15-25** | **~15-25** |
| Keyframe | auto | ~30-60 | ~30-60 |
| Scene + cap | threshold 0.4, max 10 | 10 | 10 |

Scene detection with a hard cap of 10 frames on a 5-minute video = 10 vision API calls. That's a coffee.

### Resize impact

| Source | Resolution | JPEG size | Tokens (approx) |
|--------|-----------|-----------|-----------------|
| No resize | 1920x1080 | ~500KB | high |
| Resize 512px | 512x288 | ~25KB | low |
| Resize 256px | 256x144 | ~8KB | minimal |

Default resize is 512px. Sufficient for "describe what's happening" prompts. Increase with `--resize 1024` for detail work (OCR, small text).

### Whisper transcription

| Video length | Segments (30s) | Whisper calls |
|-------------|----------------|---------------|
| 1 min | 2 | 2 |
| 5 min | 10 | 10 |
| 30 min | 60 | 60 |
| 1 hour | 120 | 120 |

Whisper is cheap. Don't worry about it.

## Example scenarios

### Scenario 1: Quick summary of a 5-minute demo video

```sh
bun run src/cli.ts analyze video.mp4 \
  --mode scene --scene-threshold 0.4 \
  --max-frames 15 --resize 512 \
  --prompt "Summarize what's shown in this frame"
```

- ~15 vision calls (capped)
- 10 whisper calls
- Total: ~25 API calls

### Scenario 2: Detailed analysis of a 1-minute clip

```sh
bun run src/cli.ts analyze clip.mp4 \
  --mode interval --interval 2 \
  --max-frames 30 --resize 768 \
  --prompt "Describe all text and UI elements visible"
```

- ~30 vision calls (capped)
- 2 whisper calls
- Total: ~32 API calls

### Scenario 3: Just transcribe a 1-hour lecture

```sh
bun run src/cli.ts transcribe lecture.mp4 --segment-duration 30
```

- 0 vision calls
- 120 whisper calls
- Total: 120 API calls (all cheap Whisper)

### Scenario 4: Smart analysis of a 30-minute meeting recording

```sh
bun run src/cli.ts smart meeting.mp4 --max-timestamps 5 --prompt "Describe the diagram or visual shown"
```

- 60 whisper calls (30s chunks)
- 1 text LLM call (timestamp selection)
- 5 vision calls (targeted frames only)
- Total: 66 API calls, only 5 are expensive vision calls

Compare to blind `analyze` with scene detection on the same video: ~75-150 vision calls. Smart analysis uses 30x fewer vision calls.

## Dry-run before every spend

```sh
bun run src/cli.ts analyze video.mp4 --dry-run
```

Prints:
- Estimated frame count
- Model being used
- Resize dimension
- Whisper segment count

No API calls made. Use this to sanity-check before every run.
