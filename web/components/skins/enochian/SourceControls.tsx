'use client';

// These DOM trees are the user's atlas components. Only labels, values and
// application callbacks differ. controls.css is an unmodified source snapshot.
import { useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type RefCallback } from 'react';
import { useSkinCalm } from '../sharedHooks';
import { atlas as a } from './vendor/classes';
import { makeHSlider, makeToggle, type ValueControl } from './vendor/interaction';

export type Finish = 'ivory' | 'obsidian';

export function SourceDisplay({ children }: { children: ReactNode }) {
  return <div className={a.foundation}><output className={a.display} aria-live="polite" data-enochian-component="keyboard-display">{children}</output></div>;
}

export function SourceSlider({ value, finish, onChange }: { value: number; finish: Finish; onChange: (v: number) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const control = useRef<ValueControl | null>(null);
  const change = useRef(onChange);
  const initial = useRef(value);
  const calm = useSkinCalm();
  useLayoutEffect(() => { change.current = onChange; initial.current = value; }, [onChange, value]);
  useLayoutEffect(() => {
    const c = makeHSlider(root.current!, initial.current, v => change.current(v), calm);
    control.current = c;
    return () => { c.destroy(); control.current = null; };
  }, [calm]);
  useLayoutEffect(() => { control.current?.set(value); }, [value, calm]);
  return <div className={a.compact}>
    <div className={a.fx} data-finish={finish}>
      <div ref={root} className={a.slider} role="slider" tabIndex={0} aria-label="Volume slider"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} data-enochian-component="slider-01">
        <span className={a.line} /><span className={a.fill} />
        <span className={a.thumb}><i /><i /><i /><i /><i /></span>
      </div>
    </div>
  </div>;
}

export function SourceMute({ on, finish, onChange, label = 'Mute', controlProps, inputRef }: { on: boolean; finish: Finish; onChange: (on: boolean) => void; label?: string; controlProps?: ButtonHTMLAttributes<HTMLButtonElement>; inputRef?: RefCallback<HTMLButtonElement> }) {
  const root = useRef<HTMLButtonElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const control = useRef<ReturnType<typeof makeToggle> | null>(null);
  const change = useRef(onChange);
  const initial = useRef(on);
  const calm = useSkinCalm();
  useLayoutEffect(() => { change.current = onChange; initial.current = on; }, [onChange, on]);
  useLayoutEffect(() => {
    const c = makeToggle(root.current!, knob.current!, initial.current, v => change.current(v), calm);
    control.current = c;
    return () => { c.destroy(); control.current = null; };
  }, [calm]);
  useLayoutEffect(() => { control.current?.set(on); }, [on, calm]);
  return <div className={a.compact}><div className={a.fx} data-finish={finish}>
    <button {...controlProps} ref={element => { root.current = element; inputRef?.(element); }} type="button" className={a.toggle} role="switch" aria-checked={on} aria-label={label}
      data-enochian-component="toggle-switch-01"><span className={a.toggleKnob} ref={knob} /></button>
  </div></div>;
}
