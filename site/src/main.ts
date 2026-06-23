const duration = document.getElementById('duration') as HTMLInputElement;
const mode = document.getElementById('mode') as HTMLSelectElement;
const threshold = document.getElementById('threshold') as HTMLInputElement;
const interval = document.getElementById('interval') as HTMLInputElement;
const smartTs = document.getElementById('smartTs') as HTMLInputElement;
const maxFrames = document.getElementById('maxFrames') as HTMLInputElement;
const thresholdLabel = document.getElementById('threshold-label') as HTMLElement;
const intervalLabel = document.getElementById('interval-label') as HTMLElement;
const smartLabel = document.getElementById('smart-label') as HTMLElement;
const estFrames = document.getElementById('est-frames') as HTMLElement;
const estVision = document.getElementById('est-vision') as HTMLElement;
const estWhisper = document.getElementById('est-whisper') as HTMLElement;
const estLlm = document.getElementById('est-llm') as HTMLElement;
const estTotal = document.getElementById('est-total') as HTMLElement;

function estimate(): void {
  const dur = Number(duration.value) || 0;
  const m = mode.value;
  const mf = Number(maxFrames.value) || 0;

  let frames: number;
  let llmCalls = 0;

  switch (m) {
    case 'interval':
      frames = Math.floor(dur / (Number(interval.value) || 5));
      break;
    case 'keyframe':
      frames = Math.ceil(dur * 2);
      break;
    case 'smart': {
      const ts = Number(smartTs.value) || 5;
      frames = ts;
      llmCalls = 1;
      break;
    }
    case 'scene':
    default: {
      const t = Number(threshold.value) || 0.4;
      frames = Math.ceil(dur / (t * 10 + 2));
      break;
    }
  }

  const capped = Math.min(frames, mf);
  const whisper = Math.ceil(dur / 30);
  const total = capped + whisper + llmCalls;

  estFrames.textContent = String(capped);
  estVision.textContent = String(capped);
  estWhisper.textContent = String(whisper);
  estLlm.textContent = String(llmCalls);
  estTotal.textContent = String(total);
}

function toggleMode(): void {
  thresholdLabel.style.display = mode.value === 'scene' ? '' : 'none';
  intervalLabel.style.display = mode.value === 'interval' ? '' : 'none';
  smartLabel.style.display = mode.value === 'smart' ? '' : 'none';
}

[duration, mode, threshold, interval, smartTs, maxFrames].forEach((el) => {
  el.addEventListener('input', () => {
    toggleMode();
    estimate();
  });
});

toggleMode();
estimate();
