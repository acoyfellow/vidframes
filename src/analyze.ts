import { type AICredentials, getCredentials, runModel } from './ai';
import type { ExtractOptions, ExtractedFrame, VideoInfo } from './extract';
import {
  estimateFrameCount,
  extractFrames,
  extractFramesAtTimestamps,
  probeVideo,
} from './extract';
import type { TranscribeOptions, TranscriptionResult } from './transcribe';
import { transcribeVideo } from './transcribe';

export interface AnalyzeOptions {
  accountId?: string;
  apiToken?: string;
  /** Workers AI vision model. @default '@cf/meta/llama-3.2-11b-vision-instruct' */
  model?: string;
  /** Prompt for each frame. @default 'Describe what is happening in this image concisely.' */
  prompt?: string;
  /** Parallel API requests. @default 3 */
  concurrency?: number;
  /** Hard limit on frames to analyze. */
  maxFrames?: number;
  /** Estimate cost without calling the API. Returns frame count + model info only. */
  dryRun?: boolean;
  /** Called per-frame as analysis progresses. */
  onProgress?: (current: number, total: number, frame: ExtractedFrame) => void;
}

export interface FrameAnalysis {
  frame: ExtractedFrame;
  description: string;
}

export interface AnalysisEstimate {
  frameCount: number;
  model: string;
  prompt: string;
  resize: number;
  note: string;
}

export interface VideoAnalysis {
  frames: FrameAnalysis[];
  transcription?: TranscriptionResult;
  videoInfo: VideoInfo;
}

export function estimateAnalysis(
  videoInfo: VideoInfo,
  extractOpts: ExtractOptions,
  analyzeOpts: AnalyzeOptions,
): AnalysisEstimate {
  const { estimated, note } = estimateFrameCount(videoInfo, extractOpts);
  const maxFrames = analyzeOpts.maxFrames ?? Number.POSITIVE_INFINITY;
  const frameCount = Math.min(estimated, maxFrames);
  const model = analyzeOpts.model ?? '@cf/meta/llama-3.2-11b-vision-instruct';
  const prompt = analyzeOpts.prompt ?? 'Describe what is happening in this image concisely.';
  const resize = extractOpts.resize ?? 512;

  return { frameCount, model, prompt, resize, note };
}

export async function analyzeFrame(framePath: string, opts: AnalyzeOptions = {}): Promise<string> {
  const creds = getCredentials(opts);
  const model = opts.model ?? '@cf/meta/llama-3.2-11b-vision-instruct';
  const prompt = opts.prompt ?? 'Describe what is happening in this image concisely.';

  const imageData = await Bun.file(framePath).arrayBuffer();
  const base64 = Buffer.from(imageData).toString('base64');

  let input: unknown;
  if (model.includes('llava')) {
    input = { image: Array.from(new Uint8Array(imageData)), prompt };
  } else {
    input = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ],
        },
      ],
    };
  }

  const result = (await runModel(model, input, creds)) as { response?: string };
  return result?.response ?? '';
}

export async function analyzeFrames(
  frames: ExtractedFrame[],
  opts: AnalyzeOptions = {},
): Promise<FrameAnalysis[]> {
  if (opts.dryRun) {
    return [];
  }

  const concurrency = opts.concurrency ?? 3;
  const maxFrames = opts.maxFrames ?? frames.length;
  const toAnalyze = frames.slice(0, maxFrames);
  const results: FrameAnalysis[] = new Array(toAnalyze.length);

  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, toAnalyze.length) }, async () => {
    while (index < toAnalyze.length) {
      const i = index++;
      const frame = toAnalyze[i];
      opts.onProgress?.(i + 1, toAnalyze.length, frame);
      const description = await analyzeFrame(frame.path, opts);
      results[i] = { frame, description };
    }
  });

  await Promise.all(workers);
  return results;
}

export async function analyzeVideo(
  videoPath: string,
  opts: {
    extract?: ExtractOptions;
    analyze?: AnalyzeOptions;
    transcribe?: TranscribeOptions | false;
  } = {},
): Promise<VideoAnalysis> {
  const videoInfo = await probeVideo(videoPath);

  if (opts.analyze?.dryRun) {
    return {
      frames: [],
      videoInfo,
      transcription: undefined,
    };
  }

  const frames = await extractFrames(videoPath, opts.extract);
  const analyses = await analyzeFrames(frames, opts.analyze ?? {});

  let transcription: TranscriptionResult | undefined;
  if (opts.transcribe !== false) {
    transcription = await transcribeVideo(videoPath, opts.transcribe ?? {});
  }

  return {
    frames: analyses,
    transcription,
    videoInfo,
  };
}

export interface TimestampSelection {
  timestamp: number;
  reason: string;
}

export interface SmartAnalyzeOptions {
  accountId?: string;
  apiToken?: string;
  transcribe?: TranscribeOptions;
  /** Text model for timestamp selection. @default '@cf/meta/llama-3.1-8b-instruct' */
  selectorModel?: string;
  /** Custom prompt for timestamp selection. */
  selectorPrompt?: string;
  /** Max timestamps to select. @default 5 */
  maxTimestamps?: number;
  /** Vision analysis options for selected frames. */
  analyze?: Omit<AnalyzeOptions, 'dryRun' | 'maxFrames'>;
  /** Frame extraction options for targeted frames. */
  extract?: { output?: string; format?: 'jpg' | 'png'; resize?: number; quality?: number };
  /** Progress callback: phase + detail. */
  onProgress?: (phase: string, detail?: string) => void;
}

export interface SmartAnalysisResult {
  transcription: TranscriptionResult;
  selectedTimestamps: TimestampSelection[];
  frames: FrameAnalysis[];
  videoInfo: VideoInfo;
}

const DEFAULT_SELECTOR_PROMPT = `You are analyzing a video transcript to identify moments where visual context would add the most value.

Look for moments mentioning:
- Diagrams, charts, or visual aids
- Code examples or screen shares
- Whiteboard drawings
- Physical demonstrations
- Slides or presentations
- "as you can see" or "look at this" type references

Return ONLY a JSON array (no markdown, no explanation) of up to {max} timestamps:
[{{"timestamp": 120, "reason": "whiteboard diagram of system architecture"}}]

Timestamps must be in seconds and within the video duration of {duration}s.

Transcript:
{transcript}`;

function formatTranscriptForSelector(transcription: TranscriptionResult): string {
  return transcription.segments.map((s) => `[${s.start}s-${s.end}s] ${s.text}`).join('\n');
}

function parseTimestamps(
  text: string,
  maxDuration: number,
  maxCount: number,
): TimestampSelection[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[0]) as Array<{ timestamp?: number; reason?: string }>;
    return parsed
      .filter(
        (item) =>
          typeof item.timestamp === 'number' &&
          item.timestamp >= 0 &&
          item.timestamp <= maxDuration,
      )
      .map((item) => ({
        timestamp: Math.round(item.timestamp as number),
        reason: item.reason ?? 'visual context',
      }))
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, maxCount);
  } catch {
    return [];
  }
}

export async function selectTimestamps(
  transcription: TranscriptionResult,
  videoInfo: VideoInfo,
  opts: SmartAnalyzeOptions = {},
): Promise<TimestampSelection[]> {
  const creds = getCredentials(opts);
  const model = opts.selectorModel ?? '@cf/meta/llama-3.1-8b-instruct';
  const maxTimestamps = opts.maxTimestamps ?? 5;
  const promptTemplate = opts.selectorPrompt ?? DEFAULT_SELECTOR_PROMPT;

  const transcript = formatTranscriptForSelector(transcription);
  const prompt = promptTemplate
    .replace('{max}', String(maxTimestamps))
    .replace('{duration}', String(Math.round(videoInfo.duration)))
    .replace('{transcript}', transcript);

  const result = (await runModel(
    model,
    { messages: [{ role: 'user', content: prompt }] },
    creds,
  )) as { response?: string };

  const text = result?.response ?? '';
  return parseTimestamps(text, videoInfo.duration, maxTimestamps);
}

export async function smartAnalyze(
  videoPath: string,
  opts: SmartAnalyzeOptions = {},
): Promise<SmartAnalysisResult> {
  const videoInfo = await probeVideo(videoPath);

  opts.onProgress?.('transcribing', 'extracting audio + whisper transcription...');
  const transcription = await transcribeVideo(videoPath, opts.transcribe ?? {});

  opts.onProgress?.('selecting', 'asking LLM to identify visually meaningful timestamps...');
  const selectedTimestamps = await selectTimestamps(transcription, videoInfo, opts);

  if (selectedTimestamps.length === 0) {
    opts.onProgress?.('skipped', 'no visually meaningful timestamps identified');
    return {
      transcription,
      selectedTimestamps: [],
      frames: [],
      videoInfo,
    };
  }

  opts.onProgress?.(
    'extracting',
    `extracting ${selectedTimestamps.length} frames at targeted timestamps...`,
  );
  const frames = await extractFramesAtTimestamps(
    videoPath,
    selectedTimestamps.map((s) => s.timestamp),
    opts.extract ?? {},
  );

  opts.onProgress?.('analyzing', `analyzing ${frames.length} frames with vision model...`);
  const analyses = await analyzeFrames(frames, {
    ...opts.analyze,
    onProgress: (cur, total, frame) => {
      opts.onProgress?.('analyzing', `[${cur}/${total}] ${frame.timestamp}s`);
    },
  });

  return {
    transcription,
    selectedTimestamps,
    frames: analyses,
    videoInfo,
  };
}
