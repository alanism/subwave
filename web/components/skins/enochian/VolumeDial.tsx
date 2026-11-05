'use client';

import { useLayoutEffect, useRef } from 'react';
import { useSkinCalm } from '../sharedHooks';
import { atlas as a } from './vendor/classes';
import { driveDial, polar, type ValueControl } from './vendor/interaction';

/** Enochian Rotary Knob 01: original .dial/.dark-base/.dark-knob/.dash DOM.
 * Source: /UIUX/controls.js drawDarkTicks + driveDial; styling is vendored verbatim. */
export default function VolumeDial({ value, finish, onChange }: {
  value: number; finish: 'ivory' | 'obsidian'; onChange: (value: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const control = useRef<ValueControl | null>(null);
  const change = useRef(onChange);
  const initial = useRef(value);
  const calm = useSkinCalm();
  useLayoutEffect(() => { change.current = onChange; initial.current = value; }, [onChange, value]);
  useLayoutEffect(() => {
    const c = driveDial(root.current!, knob.current!, initial.current, v => change.current(v), calm);
    control.current = c;
    return () => { c.destroy(); control.current = null; };
  }, [calm]);
  useLayoutEffect(() => { control.current?.set(value); }, [value, calm]);
  return (
    <div className={a.foundation}>
      <div ref={root} className={a.dial} data-finish={finish} data-enochian-component="rotary-knob-01"
        role="slider" tabIndex={0} aria-label="Volume knob" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)} aria-valuetext={`${Math.round(value * 100)} percent`}>
        <svg className={a.ticks} viewBox="0 0 220 220" aria-hidden="true">
          {Array.from({ length: 15 }, (_, i) => {
            const [x, y] = polar(110, 110, 96, -135 + i * (270 / 16));
            return <circle key={i} cx={x} cy={y} r="2.4" fill="#111" />;
          })}
          {[-135, 135].map(d => {
            const [x1, y1] = polar(110, 110, 88, d), [x2, y2] = polar(110, 110, 102, d);
            return <line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#111" strokeWidth="2.4" />;
          })}
        </svg>
        <div className={a.darkBase} />
        <div className={a.darkKnob} ref={knob}><div className={a.dash} /></div>
      </div>
    </div>
  );
}
