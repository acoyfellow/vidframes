import { existsSync } from 'node:fs';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { type AICredentials, getCredentials, runModel } from './ai';

export interface TranscribeOptions {
  accountId?: string;
  apiToken?: string;
  /** Workers AI transcription model. @default '@cf/openai/whisper' */
  model?: string;
  /** Seconds per audio chunk. Whisper handles ~30s well. @default 30 */
  segmentDuration?: number;
  /** Output directory for temp audio. @default './frames' */
  output?: string;
  /** Language hint (ISO 639-1). */
  language?: string;
}

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  segments: TranscriptionSegment[];
  fullText: string;
  segmentCount: number;
  totalDuration: number;
}

export async function transcribeVideo(
  videoPath: string,
  opts: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const creds = getCredentials(opts);
  const model = opts.model ?? '@cf/openai/whisper';
  const segmentDuration = opts.segmentDuration ?? 30;
  const output = opts.output ?? './frames';

  const audioDir = join(output, 'audio');
  await mkdir(audioDir, { recursive: true });

  const proc = Bun.spawn(
    [
      'ffmpeg',
      '-y',
      '-i',
      videoPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '16000',
      '-ac',
      '1',
      '-f',
      'segment',
      '-segment_time',
      String(segmentDuration),
      join(audioDir, 'segment_%03d.wav'),
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  await proc.exited;

  const files = (await readdir(audioDir)).filter((f) => f.endsWith('.wav')).sort();

  const segments: TranscriptionSegment[] = [];

  for (let i = 0; i < files.length; i++) {
    const filePath = join(audioDir, files[i]);
    const audioData = await Bun.file(filePath).arrayBuffer();
    const audioBytes = Array.from(new Uint8Array(audioData));

    const input: Record<string, unknown> = { audio: audioBytes };
    if (opts.language) {
      input.language = opts.language;
    }

    const result = (await runModel(model, input, creds)) as { text?: string };
    const text = (result?.text ?? '').trim();

    segments.push({
      start: i * segmentDuration,
      end: (i + 1) * segmentDuration,
      text,
    });
  }

  for (const f of files) {
    await unlink(join(audioDir, f));
  }

  return {
    segments,
    fullText: segments.map((s) => s.text).join(' '),
    segmentCount: segments.length,
    totalDuration: segments.length * segmentDuration,
  };
}

export function estimateTranscriptionSegments(
  durationSeconds: number,
  segmentDuration = 30,
): number {
  return Math.ceil(durationSeconds / segmentDuration);
}
