import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export type ExtractMode = 'scene' | 'interval' | 'keyframe';

export interface ExtractOptions {
  /** Extraction strategy. scene = only on scene changes (cheapest), interval = every N seconds, keyframe = I-frames only. */
  mode?: ExtractMode;
  /** Seconds between frames. Only used in interval mode. @default 5 */
  interval?: number;
  /** Scene change sensitivity 0-1. Lower = more frames. Only used in scene mode. @default 0.4 */
  sceneThreshold?: number;
  /** Output directory. @default './frames' */
  output?: string;
  /** Output format. @default 'jpg' */
  format?: 'jpg' | 'png';
  /** Start time in seconds. @default 0 */
  start?: number;
  /** Duration in seconds. */
  duration?: number;
  /** Hard limit on number of frames extracted. */
  limit?: number;
  /** Max dimension in pixels. Frames are downscaled to fit. Set to 0 to disable. @default 512 */
  resize?: number;
  /** JPEG quality 1-31 (lower = better). @default 3 */
  quality?: number;
}

export interface ExtractedFrame {
  path: string;
  timestamp: number;
  index: number;
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
}

export async function probeVideo(videoPath: string): Promise<VideoInfo> {
  const proc = Bun.spawn(
    ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', videoPath],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  const data = JSON.parse(output);
  const stream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
  const [num, den] = (stream?.r_frame_rate ?? '30/1').split('/');
  return {
    duration: Number.parseFloat(data.format?.duration ?? '0'),
    width: Number.parseInt(stream?.width ?? '0', 10),
    height: Number.parseInt(stream?.height ?? '0', 10),
    fps: Number.parseFloat(num) / Number.parseFloat(den),
    codec: stream?.codec_name ?? 'unknown',
  };
}

function buildFilter(
  opts: Required<
    Pick<ExtractOptions, 'mode' | 'interval' | 'sceneThreshold' | 'resize' | 'quality'>
  >,
): string {
  const filters: string[] = [];

  switch (opts.mode) {
    case 'scene':
      filters.push(`select='gt(scene,${opts.sceneThreshold})'`);
      break;
    case 'interval':
      filters.push(`fps=1/${opts.interval}`);
      break;
    case 'keyframe':
      filters.push("select='eq(pict_type,I)'");
      break;
  }

  if (opts.resize > 0) {
    filters.push(
      `scale='min(${opts.resize},iw)':'min(${opts.resize},ih)':force_original_aspect_ratio=decrease`,
    );
  }

  return filters.join(',');
}

export async function extractFrames(
  videoPath: string,
  opts: ExtractOptions = {},
): Promise<ExtractedFrame[]> {
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const mode = opts.mode ?? 'scene';
  const interval = opts.interval ?? 5;
  const sceneThreshold = opts.sceneThreshold ?? 0.4;
  const output = opts.output ?? './frames';
  const format = opts.format ?? 'jpg';
  const resize = opts.resize ?? 512;
  const quality = opts.quality ?? 3;

  await mkdir(output, { recursive: true });

  const vf = buildFilter({ mode, interval, sceneThreshold, resize, quality });
  const args = ['ffmpeg', '-y', '-i', videoPath];

  if (opts.start) args.push('-ss', String(opts.start));
  if (opts.duration) args.push('-t', String(opts.duration));

  args.push(
    '-vf',
    vf,
    '-q:v',
    String(quality),
    '-vsync',
    'vfr',
    join(output, `frame_%04d.${format}`),
  );

  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  await proc.exited;

  const files = (await readdir(output))
    .filter((f) => f.startsWith('frame_') && f.endsWith(`.${format}`))
    .sort();

  const info = await probeVideo(videoPath);
  const fps = info.fps || 30;

  let frames: ExtractedFrame[] = files.map((f, i) => ({
    path: join(output, f),
    timestamp: i * (mode === 'interval' ? interval : 1 / fps),
    index: i,
  }));

  if (opts.limit && frames.length > opts.limit) {
    frames = frames.slice(0, opts.limit);
  }

  return frames;
}

export async function extractFramesAtTimestamps(
  videoPath: string,
  timestamps: number[],
  opts: { output?: string; format?: 'jpg' | 'png'; resize?: number; quality?: number } = {},
): Promise<ExtractedFrame[]> {
  if (!existsSync(videoPath)) {
    throw new Error(`Video not found: ${videoPath}`);
  }

  const output = opts.output ?? './frames';
  const format = opts.format ?? 'jpg';
  const resize = opts.resize ?? 512;
  const quality = opts.quality ?? 3;

  await mkdir(output, { recursive: true });

  const frames: ExtractedFrame[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const path = join(output, `frame_${String(i).padStart(4, '0')}.${format}`);

    const args = ['ffmpeg', '-y', '-ss', String(ts), '-i', videoPath, '-frames:v', '1'];
    if (resize > 0) {
      args.push(
        '-vf',
        `scale='min(${resize},iw)':'min(${resize},ih)':force_original_aspect_ratio=decrease`,
      );
    }
    args.push('-q:v', String(quality), path);

    const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
    await proc.exited;

    if (existsSync(path)) {
      frames.push({ path, timestamp: ts, index: i });
    }
  }

  return frames;
}

export function estimateFrameCount(
  info: VideoInfo,
  opts: ExtractOptions = {},
): { estimated: number; note: string } {
  const mode = opts.mode ?? 'scene';
  const duration = opts.duration ?? info.duration;
  const start = opts.start ?? 0;
  const effective = duration - start;

  switch (mode) {
    case 'interval': {
      const interval = opts.interval ?? 5;
      const count = Math.floor(effective / interval);
      return { estimated: count, note: `${count} frames at ${interval}s intervals` };
    }
    case 'keyframe': {
      const estimated = Math.ceil(effective * 2);
      return {
        estimated,
        note: `~${estimated} keyframes (depends on encoder GOP size)`,
      };
    }
    case 'scene': {
      const threshold = opts.sceneThreshold ?? 0.4;
      const estimated = Math.ceil(effective / (threshold * 10 + 2));
      return {
        estimated,
        note: `~${estimated} scene changes at threshold ${threshold} (actual varies)`,
      };
    }
  }
}
