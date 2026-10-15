// WebAudio の合成音(ファイル不要)+ ミュート永続化 + 最初の操作で unlock。
// ファイル音源を使う場合は Phaser の this.sound を使い、ミュートは isMuted()、音量は sfxVolume() / bgmVolume() を掛ける。
// 音量は効果音と BGM で別のつまみ(src/tuning.ts の audio.*)。既定は控えめ(AI が決める音量は大きめになりがち)。
import { load, save } from './save';
import { tune } from './tuning';

let ctx: AudioContext | null = null;
let muted = load().muted;

function ensure(): AudioContext | null {
  if (!ctx) {
    try { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/** 最初のタップ / キーで呼ぶ。以後 beep が鳴るようになる */
export function unlock() { ensure(); }

export function isMuted() { return muted; }
export function setMuted(m: boolean) { muted = m; save({ muted: m }); }
export function toggleMuted() { setMuted(!muted); return muted; }
/** 効果音・BGM の全体音量(0〜1)。例: this.sound.play('bgm', { loop: true, volume: bgmVolume() }) */
export function sfxVolume() { return tune('audio.sfx'); }
export function bgmVolume() { return tune('audio.bgm'); }

/** 短い合成音。freq Hz、dur 秒、type 波形 */
export function beep(freq = 440, dur = 0.08, type: OscillatorType = 'square', gain = 0.08) {
  if (muted) return;
  const c = ensure();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(Math.max(0.0001, gain * sfxVolume()), c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
  o.connect(g).connect(c.destination);
  o.start();
  o.stop(c.currentTime + dur);
}

export const sfx = {
  tap: () => beep(880, 0.05),
  score: () => beep(1320, 0.08, 'triangle'),
  over: () => { beep(220, 0.25, 'sawtooth'); setTimeout(() => beep(110, 0.35, 'sawtooth'), 120); },
  ui: () => beep(660, 0.04, 'sine'),
};
