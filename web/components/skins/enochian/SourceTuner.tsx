'use client';

import { useLayoutEffect, useRef } from 'react';
import { useSkinCalm } from '../sharedHooks';
import { atlas as a } from './vendor/classes';
import { CHANNEL_MARGIN, CHANNEL_PITCH, driveTuner } from './vendor/tuner-interaction';
import type { ValueControl } from './vendor/interaction';
import styles from './SourceTuner.module.css';

type Channel = { id: string; name: string };
export default function SourceTuner({ channels, value, disabled, onPreview, onCommit }: {
  channels: Channel[]; value: number; disabled?: boolean; onPreview: (index: number) => void; onCommit: (index: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null), strip = useRef<HTMLDivElement>(null), control = useRef<ValueControl | null>(null);
  const current = useRef({ value, channels, onPreview, onCommit });
  const calm = useSkinCalm();
  const count = channels.length;
  useLayoutEffect(() => { current.current = { value, channels, onPreview, onCommit }; }, [value, channels, onPreview, onCommit]);
  useLayoutEffect(() => {
    const c = driveTuner(root.current!, strip.current!, current.current.value, count,
      index => current.current.onPreview(index), index => current.current.onCommit(index),
      index => `Channel ${index + 1}, ${current.current.channels[index]?.name || 'No station'}`, calm);
    control.current = c;
    return () => { c.destroy(); control.current = null; };
  }, [count, calm]);
  useLayoutEffect(() => { control.current?.set(value); }, [value, calm]);
  const width = Math.max(1, count - 1) * CHANNEL_PITCH + CHANNEL_MARGIN * 2;
  return <div className={styles.mount}><div className={a.instruments}>
    <div className={a.tuner} data-finish="obsidian" data-enochian-component="radio-tuner">
      <div ref={root} className={a.tunerWindow} role="slider" tabIndex={disabled ? -1 : 0} aria-disabled={disabled || undefined}
        title="Drag left/right to tune · Arrow keys: one channel · Page Up/Down: seek · Home/End: first/last" aria-label="Radio channel tuning" aria-valuemin={1} aria-valuemax={Math.max(1, count)} aria-valuenow={Math.round(value) + 1}
        aria-valuetext={`Channel ${Math.round(value) + 1}, ${channels[Math.round(value)]?.name || 'No station'}`}>
        <div ref={strip} className={a.tunerStrip}><svg width={width} height={128} viewBox={`0 0 ${width} 128`} aria-hidden="true">
          <line x1={CHANNEL_MARGIN} y1={98} x2={CHANNEL_MARGIN + Math.max(0, count - 1) * CHANNEL_PITCH} y2={98} className={a.tunerTick} strokeWidth={1} />
          {channels.map((channel, index) => {
            const x = CHANNEL_MARGIN + index * CHANNEL_PITCH;
            return <g key={channel.id}><line x1={x} y1={76} x2={x} y2={98} className={a.tunerTick} strokeWidth={1.6} />
              <text x={x} y={64} textAnchor="middle" className={a.tunerNumber}>{String(index + 1).padStart(2, '0')}</text>
              <circle cx={x} cy={108} r={2.6} className={a.tunerStation} /></g>;
          })}
        </svg></div>
        <div className={a.tunerFade} /><div className={a.tunerGlass} /><span className={a.tunerBand}>CH</span><div className={a.tunerNeedle} />
      </div>
    </div>
  </div></div>;
}
