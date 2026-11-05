'use client';

// The receiver's Radio Player power head and Input Selector keys, from the
// authored atlas snapshots. Keep their DOM, 30/36/46px geometry and materials.
// Only labels, controlled state and callbacks belong to Subwave.
import { useLayoutEffect, useRef, type KeyboardEvent, type RefCallback } from 'react';
import { useSkinCalm } from '../sharedHooks';
import type { Finish } from './SourceControls';
import { atlas as a } from './vendor/classes';
import { PRESS, SNAP, Spring } from './vendor/interaction';
import type { ClickKind } from './vendor/feedback';

export function ReceiverPower({ on, status, finish, onToggle, feedback, disabled }: {
  on: boolean; status: string; finish: Finish; onToggle: () => void; feedback: (kind: ClickKind) => void; disabled?: boolean;
}) {
  const dot = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => { dot.current!.style.background = on ? 'var(--r-power-on)' : 'var(--r-power-off)'; }, [on]);
  return <div className={a.foundation}>
    <div className={a.radio} data-theme={finish === 'obsidian' ? 'black' : 'light'} data-enochian-component="receiver-power">
      <div className={a.radioHead}>
        <button type="button" className={a.power} role="switch" aria-checked={on} disabled={disabled} aria-label={on ? 'Tune out' : 'Tune in'}
          onClick={() => { feedback(on ? 'clack' : 'thock'); onToggle(); }}>
          <span className={a.powerRing}><span ref={dot} className={a.powerDot} /></span>
        </button>
        <div className={a.radioDisplay}><div className={a.radioLine}>{on ? 'TUNE OUT' : 'TUNE IN'}</div><div className={a.radioSubline}>{status}</div></div>
      </div>
    </div>
  </div>;
}

type KeyProps = {
  label: string; index?: number; active?: boolean; disabled?: boolean; onClick?: () => void; submit?: boolean;
  ariaLabel?: string;
  mode?: 'momentary' | 'toggle' | 'radio'; tabIndex?: number;
  buttonRef?: RefCallback<HTMLButtonElement>; onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

function ReceiverKey({ label, ariaLabel, index = 0, active = false, disabled, onClick, submit, mode = 'toggle', tabIndex, buttonRef, onKeyDown }: KeyProps) {
  // Actions release after a press; source choices and independent toggles latch.
  const latched = mode !== 'momentary' && active;
  const row = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLButtonElement>(null);
  const spring = useRef<Spring | null>(null);
  const initial = useRef(latched);
  const calm = useSkinCalm();
  useLayoutEffect(() => { row.current!.style.setProperty('--i', String(index)); }, [index]);
  useLayoutEffect(() => { initial.current = latched; }, [latched]);
  useLayoutEffect(() => {
    const sp = new Spring(initial.current ? .15 : 1, SNAP, x => cap.current!.style.setProperty('--lift', x.toFixed(3)), calm, .002);
    spring.current = sp;
    return () => { sp.destroy(); spring.current = null; };
  }, [calm]);
  useLayoutEffect(() => { spring.current?.to(latched ? .15 : 1, latched ? PRESS : SNAP); }, [latched, calm]);
  const release = () => spring.current?.to(latched ? .15 : 1, latched ? PRESS : SNAP);
  return <div ref={row} className={a.selectorRow}>
    <span className={a.selectorSocket}>
      <button ref={element => { cap.current = element; buttonRef?.(element); }} type={submit ? 'submit' : 'button'} className={a.selectorCap}
        aria-label={ariaLabel || label} role={mode === 'radio' ? 'radio' : undefined} aria-checked={mode === 'radio' ? active : undefined}
        aria-pressed={mode === 'toggle' ? active : undefined} tabIndex={tabIndex} disabled={disabled}
        onPointerDown={e => { if (e.button === 0) { e.currentTarget.setPointerCapture(e.pointerId); spring.current?.to(.15, PRESS); } }}
        onPointerUp={release} onPointerCancel={release} onBlur={release}
        onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') spring.current?.to(.15, PRESS); onKeyDown?.(e); }}
        onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') release(); }} onClick={onClick} />
    </span>
    <span className={latched ? a.selectedSelectorLabel : a.selectorLabel}>{label}</span>
  </div>;
}

type Action = 'request' | 'timeline' | 'schedule';
export function ReceiverButtonBank({ active, finish, onSelect, feedback }: {
  active: string | null; finish: Finish; onSelect: (key: Action) => void; feedback: (kind: ClickKind) => void;
}) {
  return <div className={a.instruments}>
    <div className={a.selector} data-finish={finish} data-enochian-component="receiver-input-selector">
      <div className={a.selectorColumn} role="group" aria-label="Station panels">
        {(['request', 'timeline', 'schedule'] as const).map((key, index) => <ReceiverKey key={key} label={key} index={index} active={active === key}
          onClick={() => { feedback(active === key ? 'tick' : 'thock'); onSelect(key); }} />)}
      </div>
    </div>
  </div>;
}

/** The authored exclusive source column, controlled by the local playback owner. */
export function ReceiverStationBank({ options, value, onChange, finish }: {
  options: { id: string; label: string }[]; value: string | null; onChange: (id: string) => void; finish: Finish;
}) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  // All music plus the eight genre sources supported by the local library.
  const sources = options.slice(0, 9);
  // A missing selection leaves the first available source reachable without
  // silently changing playback. The owner supplies the selected source.
  const tabStop = sources.some(source => source.id === value) ? value : sources[0]?.id;
  const select = (id: string) => {
    if (id !== value) onChange(id);
    buttons.current.get(id)?.focus();
  };
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    switch (event.key) {
      case 'ArrowRight': case 'ArrowDown': next = (index + 1) % sources.length; break;
      case 'ArrowLeft': case 'ArrowUp': next = (index - 1 + sources.length) % sources.length; break;
      case 'Home': next = 0; break;
      case 'End': next = sources.length - 1; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    select(sources[next]!.id);
  };
  return <div className={a.instruments}>
    <div className={a.selector} data-finish={finish} data-enochian-component="receiver-station-selector">
      <div className={a.selectorColumn} role="radiogroup" aria-label="Genre stations" aria-orientation="vertical">
        <span className={a.selectorHeading} aria-hidden="true">source</span>
        {sources.map((source, index) => <ReceiverKey key={source.id} label={source.label} index={index} mode="radio"
          active={source.id === value} tabIndex={source.id === tabStop ? 0 : -1}
          buttonRef={element => { if (element) buttons.current.set(source.id, element); else buttons.current.delete(source.id); }}
          onClick={() => select(source.id)} onKeyDown={event => navigate(event, index)} />)}
      </div>
    </div>
  </div>;
}

export function SourceAction({ finish, ...props }: KeyProps & { finish: Finish }) {
  return <div className={a.instruments}><div className={a.selector} data-finish={finish} data-enochian-component="receiver-action">
    <div className={a.selectorColumn}><ReceiverKey {...props} mode="momentary" /></div>
  </div></div>;
}

export function ReceiverNavigationBank<K extends string>({ items, finish, onSelect }: {
  items: readonly { id: K; label: string; ariaLabel?: string; disabled?: boolean }[]; finish: Finish; onSelect: (id: K) => void;
}) {
  return <div className={a.instruments}><div className={a.selector} data-finish={finish} data-enochian-component="receiver-local-navigation">
    <div className={a.selectorColumn} role="group" aria-label="Local music panels">
      {items.map((item, index) => <ReceiverKey key={item.id} label={item.label} ariaLabel={item.ariaLabel} index={index} disabled={item.disabled} mode="momentary" onClick={() => onSelect(item.id)} />)}
    </div>
  </div></div>;
}
