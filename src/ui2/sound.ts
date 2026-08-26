// 効果音（改善指示書 §1）。
//
// **音源ファイルは持たない。** 数個の音のために取得・ライセンス・
// 読み込み失敗の面倒を抱えるより、その場で合成するほうが安い。
// 必要なのは「並・上質・稀少以上で手応えが違う」ことだけで、
// それは倍音と長さを変えれば足りる。
//
// 音は**操作の確認**と**開封の段**にしか使わない。移動や描画では鳴らさない
// （この作品は放置して眺めるものなので、鳴り続ける音は害になる）。

export type Sfx = 'tap' | 'open' | 'fine' | 'rare' | 'relic' | 'coin' | 'deny';

const KEY = 'delvers.mute.v1';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try { muted = localStorage.getItem(KEY) === '1'; } catch { /* 続行 */ }

/**
 * 音を出せる状態にする。
 *
 * ブラウザは操作なしに音を鳴らさせないので、最初のタップで作る。
 * ここを省くと、開封の演出だけ無音になる（しかも例外は出ないので気づかない）。
 */
export function unlockAudio(): void {
  if (ctx) { void ctx.resume(); return; }
  try {
    const C = window.AudioContext ?? (window as unknown as {
      webkitAudioContext?: typeof AudioContext
    }).webkitAudioContext;
    if (!C) return;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

export function isMuted(): boolean { return muted; }

export function toggleMute(): boolean {
  muted = !muted;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* 続行 */ }
  return muted;
}

interface Tone {
  /** 周波数の並び。順に鳴らす（和音ではなく分散させると安っぽくならない） */
  freqs: number[];
  /** 1音の長さ（秒） */
  dur: number;
  /** 音の間隔（秒）。0 なら和音 */
  gap: number;
  type: OscillatorType;
  gain: number;
}

/**
 * レアリティで**段が3つ以上あること**が指示書の要求（並／上質／稀少以上）。
 * ここでは4段に分けてある。上へ行くほど音が長く、上に伸びる。
 */
const TONES: Record<Sfx, Tone> = {
  tap: { freqs: [520], dur: 0.045, gap: 0, type: 'triangle', gain: 0.35 },
  deny: { freqs: [180, 140], dur: 0.09, gap: 0.06, type: 'square', gain: 0.28 },
  coin: { freqs: [880, 1320], dur: 0.07, gap: 0.05, type: 'triangle', gain: 0.4 },
  open: { freqs: [330, 440], dur: 0.10, gap: 0.07, type: 'triangle', gain: 0.5 },
  fine: { freqs: [440, 587, 740], dur: 0.12, gap: 0.075, type: 'triangle', gain: 0.6 },
  rare: { freqs: [523, 659, 784, 1047], dur: 0.16, gap: 0.09, type: 'sine', gain: 0.75 },
  relic: { freqs: [392, 523, 659, 784, 1047, 1319], dur: 0.22, gap: 0.10, type: 'sine', gain: 0.9 }
};

export function play(kind: Sfx): void {
  if (muted || !ctx || !master) return;
  const t = TONES[kind];
  const now = ctx.currentTime;
  t.freqs.forEach((f, i) => {
    if (!ctx || !master) return;
    const at = now + i * t.gap;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = t.type;
    osc.frequency.setValueAtTime(f, at);
    // 立ち上がりを一瞬にすると「プチッ」と鳴るので、ごく短い傾斜を付ける
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(t.gain, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + t.dur);
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + t.dur + 0.02);
  });
}

/** レアリティに対応する開封音。 */
export function openSfx(rarity: string): Sfx {
  if (rarity === 'relic') return 'relic';
  if (rarity === 'rare') return 'rare';
  if (rarity === 'fine') return 'fine';
  return 'open';
}
