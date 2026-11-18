import type { ZombieKind } from '../types/game';

/**
 * Procedural Web Audio API synthesizer for Agra Quarantine.
 * Generates all combat, parkour, gadget, UI, and infected vocal SFX with zero external audio assets.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private ready(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  public playPipeSwing(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(520, now);
    filter.frequency.exponentialRampToValueAtTime(190, now + 0.19);
    filter.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.22);
  }

  public playPipeHit(heavy = false, blocked = false): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (blocked) {
      // Heavy metallic deflection against Brute armor
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.16);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
      return;
    }

    // Sub punch thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(heavy ? 135 : 175, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + (heavy ? 0.24 : 0.14));

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.45 : 0.34, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.26 : 0.16));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.27);

    // Metallic pipe resonance
    const ring = ctx.createOscillator();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(heavy ? 410 : 540, now);
    ring.frequency.exponentialRampToValueAtTime(210, now + 0.12);
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(0.14, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
    ring.connect(ringGain);
    ringGain.connect(ctx.destination);
    ring.start(now);
    ring.stop(now + 0.14);
  }

  public playCounterClang(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [880, 1320, 1975];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx === 0 ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(f, now);
      osc.frequency.exponentialRampToValueAtTime(f * 0.88, now + 0.32);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(idx === 0 ? 0.16 : 0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    });
  }

  public playComboChime(combo: number): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;
    const scale = [330, 392, 440, 523.25, 659.25, 783.99, 880];
    const baseFreq = scale[Math.min(combo - 1, scale.length - 1)] || 440;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.03, now + 0.18);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.13, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);

    if (combo === 5) {
      // Takedown ready fifth harmony
      const fifth = ctx.createOscillator();
      fifth.type = 'sine';
      fifth.frequency.setValueAtTime(baseFreq * 1.5, now + 0.04);
      const fifthGain = ctx.createGain();
      fifthGain.gain.setValueAtTime(0.16, now + 0.04);
      fifthGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      fifth.connect(fifthGain);
      fifthGain.connect(ctx.destination);
      fifth.start(now + 0.04);
      fifth.stop(now + 0.46);
    }
  }

  public playHeavyTakedown(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // Shockwave sub boom
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    // Impact crunch noise
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(140, now + 0.45);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.32, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
    src.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.48);
  }

  public playFirecrackerFuse(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.96);
  }

  public playFirecrackerBang(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // 3 rapid Diwali-style firecracker pops
    [0, 0.08, 0.18].forEach((offset, idx) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer!;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1200 - idx * 150, now + offset);
      bp.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.38 - idx * 0.06, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now + offset);
      src.stop(now + offset + 0.17);
    });
  }

  public playZombieGroan(kind: ZombieKind): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (kind === 'dog') {
      // Raspy feral growl + double bark snarl
      const growl = ctx.createOscillator();
      growl.type = 'sawtooth';
      growl.frequency.setValueAtTime(145 + Math.random() * 25, now);
      growl.frequency.exponentialRampToValueAtTime(92, now + 0.24);
      growl.frequency.exponentialRampToValueAtTime(240, now + 0.34);
      growl.frequency.exponentialRampToValueAtTime(88, now + 0.48);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(640, now);
      bp.frequency.linearRampToValueAtTime(1150, now + 0.28);
      bp.Q.value = 2.6;

      const gGain = ctx.createGain();
      gGain.gain.setValueAtTime(0.001, now);
      gGain.gain.linearRampToValueAtTime(0.16, now + 0.04);
      gGain.gain.linearRampToValueAtTime(0.06, now + 0.22);
      gGain.gain.linearRampToValueAtTime(0.2, now + 0.3);
      gGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

      growl.connect(bp);
      bp.connect(gGain);
      gGain.connect(ctx.destination);
      growl.start(now);
      growl.stop(now + 0.52);
      return;
    }

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';

    const base = kind === 'brute' ? 72 : kind === 'runner' ? 210 : 112;
    const dur = kind === 'brute' ? 0.55 : kind === 'runner' ? 0.34 : 0.48;
    osc.frequency.setValueAtTime(base + Math.random() * 16, now);
    osc.frequency.linearRampToValueAtTime(base * (kind === 'runner' ? 1.25 : 0.78), now + dur);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.setValueAtTime(kind === 'runner' ? 880 : 380, now);
    formant.Q.value = 3.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(kind === 'brute' ? 0.16 : 0.11, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    osc.connect(formant);
    formant.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  public playPlayerHurt(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.25);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.36, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.29);
  }

  public playScavenge(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.065);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now + idx * 0.065);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.065 + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.065);
      osc.stop(now + idx * 0.065 + 0.29);
    });
  }

  public playFlashlightClick(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.03);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playMantle(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(480, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    src.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.19);
  }

  public playKick(hitTarget = false): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // Air snap whoosh
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(420, now);
    bp.frequency.exponentialRampToValueAtTime(160, now + 0.16);
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.22, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.18);

    if (hitTarget) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(145, now);
      osc.frequency.exponentialRampToValueAtTime(36, now + 0.2);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.23);
    }
  }

  public playTarpLand(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(950, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.23);
  }

  public playWindRush(intensity = 0.6): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(340 + intensity * 380, now);
    bp.frequency.exponentialRampToValueAtTime(170, now + 0.26);
    bp.Q.value = 1.2;

    const gain = ctx.createGain();
    const vol = Math.min(0.2, 0.06 + intensity * 0.12);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.29);
  }

  public playLedgeGrab(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    // Sharp palm slap
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(620, now);
    bp.frequency.exponentialRampToValueAtTime(220, now + 0.12);
    bp.Q.value = 1.4;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.28, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.15);

    // Body weight catch thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.14);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  }

  public playSlideScrape(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1650, now);
    bp.frequency.exponentialRampToValueAtTime(640, now + 0.44);
    bp.Q.value = 0.9;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);

    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.48);
  }

  public playLandingThud(heavy = false): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(heavy ? 110 : 140, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + (heavy ? 0.22 : 0.13));
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.42 : 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (heavy ? 0.24 : 0.14));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);

    if (heavy) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(780, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.22, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      src.connect(lp);
      lp.connect(nGain);
      nGain.connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.2);
    }
  }

  public playVictory(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    [392, 493.88, 587.33, 783.99].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.11 + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.72);
    });
  }

  public playWallStep(stepNum = 0): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(stepNum % 2 === 0 ? 520 : 610, now);
    bp.Q.value = 1.6;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.18, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    src.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.1);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playSafetyRoll(): void {
    const ctx = this.ready();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(720, now);
    bp.frequency.exponentialRampToValueAtTime(240, now + 0.36);
    bp.Q.value = 1.0;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.linearRampToValueAtTime(0.26, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.4);
  }

  public playGameOver(): void {
    const ctx = this.ready();
    if (!ctx) return;
    const now = ctx.currentTime;

    [220, 196, 164.81, 130.81].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.45);
      osc.connect(lp);
      lp.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.48);
    });
  }
}
