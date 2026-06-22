#!/usr/bin/env bun
import { analyzeFrames, analyzeVideo, estimateAnalysis } from './analyze';
import { estimateFrameCount, extractFrames, probeVideo } from './extract';
import type { ExtractMode } from './extract';
import { estimateTranscriptionSegments, transcribeVideo } from './transcribe';

function parseArgs(argv: string[]): {
  command: string;
  video: string;
  opts: Record<string, string>;
} {
  const [command, video, ...rest] = argv;
  if (!command || !video) {
    console.error('Usage: vidframes <command> <video> [options]');
    console.error('Commands: probe, extract, transcribe, analyze, run');
    process.exit(1);
  }
  const opts: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i].slice(2);
      const val = rest[i + 1]?.startsWith('--') ? 'true' : rest[++i];
      opts[key] = val;
    }
  }
  return { command, video, opts };
}

function num(v: string | undefined, fallback: number): number {
  return v ? Number(v) : fallback;
}

async function main() {
  const { command, video, opts } = parseArgs(process.argv.slice(2));

  switch (command) {
    case 'probe': {
      const info = await probeVideo(video);
      console.log('Video info:');
      console.log(`  duration: ${info.duration.toFixed(1)}s`);
      console.log(`  resolution: ${info.width}x${info.height}`);
      console.log(`  fps: ${info.fps.toFixed(1)}`);
      console.log(`  codec: ${info.codec}`);

      for (const mode of ['scene', 'interval', 'keyframe'] as ExtractMode[]) {
        const { estimated, note } = estimateFrameCount(info, {
          mode,
          interval: num(opts.interval, 5),
          sceneThreshold: num(opts['scene-threshold'], 0.4),
        });
        console.log(`  ${mode}: ~${estimated} frames (${note})`);
      }
      break;
    }

    case 'extract': {
      const frames = await extractFrames(video, {
        mode: opts.mode as ExtractMode,
        interval: num(opts.interval, 5),
        sceneThreshold: num(opts['scene-threshold'], 0.4),
        output: opts.output ?? './frames',
        format: opts.format as 'jpg' | 'png',
        limit: opts.limit ? num(opts.limit, 0) : undefined,
        resize: num(opts.resize, 512),
      });
      console.log(`Extracted ${frames.length} frames to ${opts.output ?? './frames'}`);
      for (const f of frames) {
        console.log(`  [${f.index}] ${f.timestamp.toFixed(1)}s ${f.path}`);
      }
      break;
    }

    case 'transcribe': {
      const result = await transcribeVideo(video, {
        segmentDuration: num(opts['segment-duration'], 30),
        model: opts.model,
      });
      console.log(`Transcribed ${result.segmentCount} segments (${result.totalDuration}s)`);
      for (const seg of result.segments) {
        console.log(`  [${seg.start}s-${seg.end}s] ${seg.text}`);
      }
      console.log(`\nFull text:\n${result.fullText}`);
      break;
    }

    case 'analyze': {
      if (opts['dry-run']) {
        const info = await probeVideo(video);
        const estimate = estimateAnalysis(
          info,
          {
            mode: opts.mode as ExtractMode,
            interval: num(opts.interval, 5),
            sceneThreshold: num(opts['scene-threshold'], 0.4),
            resize: num(opts.resize, 512),
          },
          {
            model: opts.model,
            prompt: opts.prompt,
            maxFrames: opts['max-frames'] ? num(opts['max-frames'], 0) : undefined,
          },
        );
        console.log('Dry run — cost estimate:');
        console.log(`  frames: ${estimate.frameCount}`);
        console.log(`  model: ${estimate.model}`);
        console.log(`  resize: ${estimate.resize}px max dimension`);
        console.log(`  prompt: ${estimate.prompt}`);
        console.log(`  note: ${estimate.note}`);
        console.log(`  transcription segments: ~${estimateTranscriptionSegments(info.duration)}`);
        console.log('  Run without --dry-run to execute.');
        break;
      }

      const result = await analyzeVideo(video, {
        extract: {
          mode: opts.mode as ExtractMode,
          interval: num(opts.interval, 5),
          sceneThreshold: num(opts['scene-threshold'], 0.4),
          output: opts.output ?? './frames',
          resize: num(opts.resize, 512),
          limit: opts.limit ? num(opts.limit, 0) : undefined,
        },
        analyze: {
          model: opts.model,
          prompt: opts.prompt,
          concurrency: num(opts.concurrency, 3),
          maxFrames: opts['max-frames'] ? num(opts['max-frames'], 0) : undefined,
          onProgress: (cur, total, frame) => {
            console.log(`  [${cur}/${total}] ${frame.timestamp.toFixed(1)}s analyzing...`);
          },
        },
        transcribe: opts['no-transcribe'] === 'true' ? false : {},
      });

      console.log(`\nAnalyzed ${result.frames.length} frames:`);
      for (const f of result.frames) {
        console.log(`  [${f.frame.timestamp.toFixed(1)}s] ${f.description}`);
      }

      if (result.transcription) {
        console.log(`\nTranscription (${result.transcription.segmentCount} segments):`);
        console.log(result.transcription.fullText);
      }
      break;
    }

    case 'run': {
      opts['no-transcribe'] = 'false';
      // fall through to analyze
      const result = await analyzeVideo(video, {
        extract: {
          mode: opts.mode as ExtractMode,
          interval: num(opts.interval, 5),
          sceneThreshold: num(opts['scene-threshold'], 0.4),
          output: opts.output ?? './frames',
          resize: num(opts.resize, 512),
        },
        analyze: {
          model: opts.model,
          prompt: opts.prompt,
          concurrency: num(opts.concurrency, 3),
          maxFrames: opts['max-frames'] ? num(opts['max-frames'], 0) : undefined,
          onProgress: (cur, total, frame) => {
            console.log(`  [${cur}/${total}] ${frame.timestamp.toFixed(1)}s analyzing...`);
          },
        },
        transcribe: {},
      });

      console.log(`\nAnalyzed ${result.frames.length} frames:`);
      for (const f of result.frames) {
        console.log(`  [${f.frame.timestamp.toFixed(1)}s] ${f.description}`);
      }

      if (result.transcription) {
        console.log(`\nTranscription (${result.transcription.segmentCount} segments):`);
        console.log(result.transcription.fullText);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Commands: probe, extract, transcribe, analyze, run');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
