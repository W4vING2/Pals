/**
 * Programmatic ringtone & calling tone using Web Audio API.
 */

// ── Incoming ringtone ──────────────────────────────────────

let ringtoneCtx: AudioContext | null = null;
let ringtoneActive = false;
let ringtoneTimeout: ReturnType<typeof setTimeout> | null = null;

// E5 → G5 two-note melody
const RING_PATTERN: [number, number][] = [
  [659.25, 0.15], // E5
  [783.99, 0.15], // G5
  [0, 0.1],       // pause
  [659.25, 0.15], // E5
  [783.99, 0.15], // G5
  [0, 0.6],       // long pause between rings
];

const RING_CYCLE = RING_PATTERN.reduce((sum, [, d]) => sum + d, 0) * 1000;

function playRingCycle() {
  if (!ringtoneCtx || !ringtoneActive) return;

  let offset = 0;
  for (const [freq, dur] of RING_PATTERN) {
    if (freq === 0) { offset += dur; continue; }

    const osc = ringtoneCtx.createOscillator();
    const gain = ringtoneCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, ringtoneCtx.currentTime + offset);
    gain.gain.linearRampToValueAtTime(0.3, ringtoneCtx.currentTime + offset + 0.02);
    gain.gain.setValueAtTime(0.3, ringtoneCtx.currentTime + offset + dur - 0.03);
    gain.gain.linearRampToValueAtTime(0, ringtoneCtx.currentTime + offset + dur);

    osc.connect(gain);
    gain.connect(ringtoneCtx.destination);
    osc.start(ringtoneCtx.currentTime + offset);
    osc.stop(ringtoneCtx.currentTime + offset + dur);
    offset += dur;
  }

  ringtoneTimeout = setTimeout(() => {
    if (ringtoneActive) playRingCycle();
  }, RING_CYCLE);
}

export function startRingtone() {
  if (ringtoneActive) return;
  try {
    ringtoneCtx = new AudioContext();
    ringtoneActive = true;
    playRingCycle();
  } catch { /* not available */ }
}

export function stopRingtone() {
  ringtoneActive = false;
  if (ringtoneTimeout) { clearTimeout(ringtoneTimeout); ringtoneTimeout = null; }
  if (ringtoneCtx) { ringtoneCtx.close().catch(() => {}); ringtoneCtx = null; }
}

// ── Outgoing calling tone (caller hears while waiting) ─────

let callingCtx: AudioContext | null = null;
let callingActive = false;
let callingTimeout: ReturnType<typeof setTimeout> | null = null;

// Classic "ring-back" tone: 440 Hz for 1s, silence for 3s
function playCallingCycle() {
  if (!callingCtx || !callingActive) return;

  const osc = callingCtx.createOscillator();
  const gain = callingCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 440;

  // Fade in
  gain.gain.setValueAtTime(0, callingCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.12, callingCtx.currentTime + 0.05);
  // Sustain
  gain.gain.setValueAtTime(0.12, callingCtx.currentTime + 0.95);
  // Fade out
  gain.gain.linearRampToValueAtTime(0, callingCtx.currentTime + 1.0);

  osc.connect(gain);
  gain.connect(callingCtx.destination);
  osc.start(callingCtx.currentTime);
  osc.stop(callingCtx.currentTime + 1.0);

  // 1s tone + 3s silence = 4s cycle
  callingTimeout = setTimeout(() => {
    if (callingActive) playCallingCycle();
  }, 4000);
}

export function startCallingTone() {
  if (callingActive) return;
  try {
    callingCtx = new AudioContext();
    callingActive = true;
    playCallingCycle();
  } catch { /* not available */ }
}

export function stopCallingTone() {
  callingActive = false;
  if (callingTimeout) { clearTimeout(callingTimeout); callingTimeout = null; }
  if (callingCtx) { callingCtx.close().catch(() => {}); callingCtx = null; }
}
