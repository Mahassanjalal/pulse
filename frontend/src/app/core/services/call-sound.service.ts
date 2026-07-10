import { Injectable } from '@angular/core';

/**
 * Plays a ringing tone for incoming calls and a short tone for call events.
 * Uses the Web Audio API so no binary asset is required. The AudioContext is
 * created lazily on first use and resumed in response to a user gesture so it
 * complies with browser autoplay policies.
 */
@Injectable({
  providedIn: 'root',
})
export class CallSoundService {
  private audioContext: AudioContext | null = null;
  private ringInterval: number | null = null;
  private ringOscillators: OscillatorNode[] = [];

  private getContext(): AudioContext {
    if (!this.audioContext) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new Ctx();
    }
    return this.audioContext;
  }

  /** Resume the audio context. Call from a user gesture (e.g. button click). */
  unlock(): void {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  private playRingOnce(): void {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;

    // Two short beeps per ring cycle.
    [0, 0.4].forEach(offset => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
    });
  }

  /** Start a repeating ringtone (e.g. for an incoming call popup). */
  startRinging(): void {
    this.stopRinging();
    this.unlock();
    this.playRingOnce();
    this.ringInterval = window.setInterval(() => this.playRingOnce(), 2000);
  }

  /** Stop the repeating ringtone. */
  stopRinging(): void {
    if (this.ringInterval !== null) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    this.ringOscillators = [];
  }

  /** Short confirmation/feedback beep. */
  playBeep(frequency = 440): void {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }
}
