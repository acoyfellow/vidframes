# Cost model

> "You CAN do this, but how much are you willing to spend?"

This doc answers that question with numbers.

## The problem

A 5-minute video at 60fps = 18,000 frames, which is 18,000 vision calls if you analyze each one. Most of those frames are near-duplicates: the same scene a fraction of a second apart.

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

The `Every frame` and `Interval` rows are exact math. The `Scene` and `Keyframe` rows are content-dependent estimates: a static screen-share produces far fewer frames than a fast-cut montage. With `--max-frames`, the worst case is fixed regardless of content.

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

Whisper calls scale linearly at one per 30-second chunk, independent of resolution. They sit well below vision calls per unit cost, so transcription is rarely the line item to optimize.

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
- Total: 120 API calls (all Whisper)

### Scenario 4: Smart analysis of a 30-minute meeting recording

```sh
bun run src/cli.ts smart meeting.mp4 --max-timestamps 5 --prompt "Describe the diagram or visual shown"
```

- 60 whisper calls (30s chunks)
- 1 text LLM call (timestamp selection)
- 5 vision calls (targeted frames only)
- Total: 66 API calls, 5 of them vision

Blind `analyze` with scene detection on the same 30-minute recording produces an estimated 75-150 vision calls (content-dependent). Smart mode fixes the vision count at `--max-timestamps` instead, trading it for one text LLM call. The difference grows with video length, since the vision count stops tracking duration.

## Dry-run before model calls

```sh
bun run src/cli.ts analyze video.mp4 --dry-run
```

Prints:
- Estimated frame count
- Model being used
- Resize dimension
- Whisper segment count

No API calls made. Use this to check the call count before every run.
