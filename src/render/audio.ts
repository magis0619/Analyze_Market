// WebAudio による効果音。外部アセットなし・全て合成音。
// ユーザー操作（タイトルのタップ）で unlock する。

type SfxName =
  | 'tap' | 'confirm' | 'deny' | 'depart' | 'unlock'
  | 'loot' | 'rare' | 'damage' | 'death' | 'letter' | 'levelup';

let actx: AudioContext | null = null;

export function unlockAudio(): void {
  if (!actx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    actx = new Ctor();
  }
  if (actx.state === 'suspended') void actx.resume();
}

function tone(
  freq: number, dur: number, type: OscillatorType, vol: number, delay = 0,
  slide = 0
): void {
  if (!actx || actx.state !== 'running') return;
  const t0 = actx.currentTime + delay;
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide !== 0) osc.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(actx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function sfx(name: SfxName): void {
  switch (name) {
    case 'tap': tone(660, 0.05, 'square', 0.12); break;
    case 'confirm': tone(523, 0.06, 'square', 0.12); tone(784, 0.09, 'square', 0.12, 0.06); break;
    case 'deny': tone(196, 0.12, 'sawtooth', 0.12); break;
    case 'depart': tone(392, 0.08, 'triangle', 0.15); tone(494, 0.08, 'triangle', 0.15, 0.08); tone(587, 0.14, 'triangle', 0.15, 0.16); break;
    case 'unlock': tone(880, 0.05, 'square', 0.1); tone(1175, 0.1, 'square', 0.1, 0.05); break;
    case 'loot': tone(784, 0.05, 'square', 0.12); tone(988, 0.08, 'square', 0.12, 0.05); break;
    case 'rare':
      tone(523, 0.08, 'square', 0.16);
      tone(659, 0.08, 'square', 0.16, 0.08);
      tone(784, 0.08, 'square', 0.16, 0.16);
      tone(1047, 0.25, 'square', 0.16, 0.24);
      break;
    case 'damage': tone(150, 0.12, 'sawtooth', 0.16, 0, -60); break;
    case 'death': tone(220, 0.5, 'sawtooth', 0.14, 0, -160); tone(110, 0.8, 'triangle', 0.14, 0.15, -60); break;
    case 'letter': tone(440, 0.06, 'triangle', 0.12); tone(554, 0.1, 'triangle', 0.12, 0.07); break;
    case 'levelup': tone(659, 0.07, 'square', 0.13); tone(831, 0.07, 'square', 0.13, 0.07); tone(988, 0.16, 'square', 0.13, 0.14); break;
  }
}
