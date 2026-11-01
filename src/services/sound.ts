class SoundService {
  private ctx: AudioContext | null = null;
  private ringtoneInterval: number | null = null;
  private dialInterval: number | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Play a soft message sent ping
  playSent() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch (e) {
      console.warn('Sound play error', e);
    }
  }

  // Play a smooth message received chime
  playReceived() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      
      // Dual note chime (WhatsApp / iOS style subtle double pulse)
      [
        { freq: 523.25, time: 0, duration: 0.1 }, // C5
        { freq: 659.25, time: 0.07, duration: 0.14 } // E5
      ].forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, now + note.time);

        gain.gain.setValueAtTime(0.12, now + note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + note.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + note.time);
        osc.stop(now + note.time + note.duration);
      });
    } catch (e) {
      console.warn('Sound play error', e);
    }
  }

  // Start incoming call ringtone loop
  startRingtone() {
    this.stopRingtone();
    const ctx = this.getContext();
    if (!ctx) return;

    const playChimePattern = () => {
      const c = this.getContext();
      if (!c) return;
      const now = c.currentTime;
      const notes = [
        { f: 659.25, t: 0 },
        { f: 783.99, t: 0.15 },
        { f: 880.00, t: 0.3 },
        { f: 1046.50, t: 0.45 },
      ];

      notes.forEach(({ f, t }) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + t);
        gain.gain.setValueAtTime(0.15, now + t);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.3);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(now + t);
        osc.stop(now + t + 0.3);
      });
    };

    playChimePattern();
    this.ringtoneInterval = window.setInterval(playChimePattern, 2400);
  }

  stopRingtone() {
    if (this.ringtoneInterval !== null) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  // Start outgoing dial tone
  startDialTone() {
    this.stopDialTone();
    const playTone = () => {
      const c = this.getContext();
      if (!c) return;
      const now = c.currentTime;
      const osc1 = c.createOscillator();
      const osc2 = c.createOscillator();
      const gain = c.createGain();

      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.setValueAtTime(0.08, now + 1.2);
      gain.gain.linearRampToValueAtTime(0.001, now + 1.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(c.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.25);
      osc2.stop(now + 1.25);
    };

    playTone();
    this.dialInterval = window.setInterval(playTone, 3000);
  }

  stopDialTone() {
    if (this.dialInterval !== null) {
      clearInterval(this.dialInterval);
      this.dialInterval = null;
    }
  }

  playEndCall() {
    this.stopRingtone();
    this.stopDialTone();
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.25);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }
}

export const sounds = new SoundService();
