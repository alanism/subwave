'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useDynamicStyle } from '@/hooks/useDynamicStyle';
import styles from './Enochian.module.css';

/** A drag-up dial with the same keyboard semantics as a native range input. */
export default function VolumeDial({ value, muted, onChange, onMute }: {
  value: number;
  muted: boolean;
  onChange: (value: number) => void;
  onMute: () => void;
}) {
  const cap = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ id: number; y: number; value: number } | null>(null);
  useDynamicStyle(cap, { transform: `rotate(${-135 + value * 270}deg)` });
  const set = (next: number) => onChange(Math.min(1, Math.max(0, Math.round(next * 100) / 100)));
  const keyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const next = {
      ArrowUp: value + step, ArrowRight: value + step,
      ArrowDown: value - step, ArrowLeft: value - step,
      PageUp: value + 0.1, PageDown: value - 0.1, Home: 0, End: 1,
    }[e.key];
    if (next == null) return;
    e.preventDefault();
    set(next);
  };
  const pointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, y: e.clientY, value };
  };

  return (
    <div className={styles.volume}>
      <div
        className={styles.dial}
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={`${Math.round(value * 100)} percent${muted ? ', muted' : ''}`}
        onKeyDown={keyDown}
        onPointerDown={pointerDown}
        onPointerMove={e => {
          const start = drag.current;
          if (start?.id === e.pointerId) set(start.value + (start.y - e.clientY) / 180);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onLostPointerCapture={() => { drag.current = null; }}
      >
        <svg viewBox="0 0 140 140" className={styles.ticks} aria-hidden="true">
          {Array.from({ length: 19 }, (_, i) => {
            const angle = ((-225 + i * 15) * Math.PI) / 180;
            return <circle key={i} cx={70 + Math.cos(angle) * 64} cy={70 + Math.sin(angle) * 64} r="1.7" />;
          })}
        </svg>
        <span className={styles.knob} ref={cap}><span className={styles.marker} /></span>
      </div>
      <button className={styles.volumeLabel} type="button" onClick={onMute} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'}>
        {muted ? 'MUTED' : `VOLUME ${Math.round(value * 100)}%`}
      </button>
    </div>
  );
}
