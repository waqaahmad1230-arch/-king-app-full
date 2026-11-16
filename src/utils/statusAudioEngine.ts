export interface RoyaltyFreeTrackPreset {
  id: string;
  title: string;
  mood: string;
  bpm: number;
  notesHz: number[];
  waveform: OscillatorType;
}

/**
 * 100% original synthesized Web Audio ambient tracks owned by KING App.
 * Zero external copyrighted audio URLs or licensing risk.
 */
export const KING_ROYALTY_FREE_TRACKS: readonly RoyaltyFreeTrackPreset[] = [
  {
    id: 'royal_gold_lofi',
    title: 'Royal Gold Chill',
    mood: 'Warm Lo-Fi',
    bpm: 78,
    notesHz: [261.63, 329.63, 392.0, 493.88],
    waveform: 'sine',
  },
  {
    id: 'midnight_synth',
    title: 'Midnight Crown',
    mood: 'Deep Synth',
    bpm: 96,
    notesHz: [220.0, 261.63, 329.63, 440.0],
    waveform: 'triangle',
  },
  {
    id: 'acoustic_calm',
    title: 'Golden Horizon',
    mood: 'Soft Ambient',
    bpm: 70,
    notesHz: [293.66, 369.99, 440.0, 587.33],
    waveform: 'sine',
  },
  {
    id: 'pulse_beat',
    title: 'Cyber Pulse',
    mood: 'Upbeat Groove',
    bpm: 112,
    notesHz: [196.0, 246.94, 293.66, 392.0],
    waveform: 'triangle',
  },
] as const;

export class StatusRoyaltyFreePlayer {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private timer: number | null = null;
  private stepIdx = 0;
  private isPlaying = false;
  private volume = 0.7;
  private muted = false;

  start(presetId: string, volume = 0.7, muted = false) {
    this.stop();
    const preset = KING_ROYALTY_FREE_TRACKS.find((t) => t.id === presetId);
    if (!preset || typeof window === 'undefined') return;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.volume = volume;
      this.muted = muted;
      this.masterGain.gain.value = muted ? 0 : Math.max(0, Math.min(1, volume)) * 0.16;
      this.masterGain.connect(this.ctx.destination);

      this.isPlaying = true;
      this.stepIdx = 0;

      const stepMs = Math.round((60 / preset.bpm) * 1000);
      const triggerNote = () => {
        if (!this.isPlaying || !this.ctx || !this.masterGain) return;
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const noteGain = this.ctx.createGain();

        const freq = preset.notesHz[this.stepIdx % preset.notesHz.length];
        this.stepIdx++;

        osc.type = preset.waveform;
        osc.frequency.setValueAtTime(freq, now);

        noteGain.gain.setValueAtTime(0.001, now);
        noteGain.gain.exponentialRampToValueAtTime(0.9, now + 0.06);
        noteGain.gain.exponentialRampToValueAtTime(0.001, now + (stepMs / 1000) * 0.85);

        osc.connect(noteGain);
        noteGain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + (stepMs / 1000) * 0.9);
      };

      triggerNote();
      this.timer = window.setInterval(triggerNote, stepMs);
    } catch {
      this.stop();
    }
  }

  setVolume(volume: number, muted: boolean) {
    this.volume = volume;
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        muted ? 0 : Math.max(0, Math.min(1, volume)) * 0.16,
        this.ctx.currentTime
      );
    }
  }

  pause() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.masterGain = null;
  }
}
