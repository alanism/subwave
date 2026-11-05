'use client';

// Original filtered-noise click engine from controls.js. A skin owns and closes
// its context; audio is created only by a gesture. Broadcast audio stays separate.
import { useEffect, useRef } from 'react';
export type ClickKind = 'tick' | 'thock' | 'clack';
export function useSourceFeedback(enabled: boolean) {
  const context = useRef<AudioContext | null>(null);
  const noise = useRef<AudioBuffer | null>(null);
  useEffect(() => () => { void context.current?.close(); }, []);
  return (kind: ClickKind) => {
    if (!enabled) return;
    if (!context.current || context.current.state === 'closed') {
      try { context.current = new AudioContext(); noise.current = null; } catch { return; }
    }
    const ac = context.current;
    if (ac.state === 'suspended') void ac.resume();
    if (!noise.current) {
      noise.current = ac.createBuffer(1, Math.floor(ac.sampleRate * .08), ac.sampleRate);
      const d = noise.current.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 5);
    }
    const click = (freq: number, gain: number, q: number, delay = 0) => {
      const src = ac.createBufferSource(); src.buffer = noise.current;
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ac.createGain(); g.gain.value = gain;
      src.connect(f); f.connect(g); g.connect(ac.destination); src.start(ac.currentTime + delay);
      src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
    };
    if (kind === 'tick') click(4200, .07, 2);
    if (kind === 'thock') click(1100, .22, 1.1);
    if (kind === 'clack') { click(1700, .16, 1.2); click(3600, .06, 2, .028); }
  };
}
