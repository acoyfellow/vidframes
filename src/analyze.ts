import { type AICredentials, getCredentials, runModel } from './ai';
import type { ExtractOptions, ExtractedFrame, VideoInfo } from './extract';
import { estimateFrameCount, extractFrames } from './extract';
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
  const { extractFrames: ef } = await import('./extract');
  const { probeVideo } = await import('./extract');

  const videoInfo = await probeVideo(videoPath);

  if (opts.analyze?.dryRun) {
    const estimate = estimateAnalysis(videoInfo, opts.extract ?? {}, opts.analyze);
    return {
      frames: [],
      videoInfo,
      transcription: undefined,
    };
  }

  const frames = await ef(videoPath, opts.extract);
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
