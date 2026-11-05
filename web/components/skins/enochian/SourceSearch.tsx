'use client';

// The atlas's rolling search markup and 160/20/1 spring. Only the controlled
// input and form submission belong to Subwave; no search surface is redrawn.
import { useLayoutEffect, useRef, useState, type InputHTMLAttributes, type RefCallback } from 'react';
import { useSkinCalm } from '../sharedHooks';
import { atlas as a } from './vendor/classes';
import { Spring } from './vendor/interaction';
import type { Finish } from './SourceControls';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'ref'> & {
  searchLabel?: string; value: string; onChange: (value: string) => void; inputRef?: RefCallback<HTMLInputElement>; finish: Finish;
};
export default function SourceSearch({ value, onChange, inputRef, finish, searchLabel = 'YouTube search', ...props }: Props) {
  const bar = useRef<HTMLDivElement>(null), field = useRef<HTMLDivElement>(null), ball = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const spring = useRef<Spring | null>(null);
  const [open, setOpen] = useState(false);
  const currentOpen = useRef(open);
  const calm = useSkinCalm();
  useLayoutEffect(() => { currentOpen.current = open; }, [open]);
  useLayoutEffect(() => {
    const travel = () => bar.current!.clientWidth - ball.current!.offsetWidth;
    const draw = (x: number) => {
      const t = travel();
      ball.current!.style.transform = `translateX(${(x * t).toFixed(1)}px) rotate(${(x * t / 30).toFixed(3)}rad)`;
      field.current!.style.width = (56 + x * t) + 'px';
    };
    const sp = new Spring(currentOpen.current ? 1 : 0, { stiffness: 160, damping: 20, mass: 1 }, draw, calm, .001);
    spring.current = sp;
    const resize = new ResizeObserver(() => draw(sp.x)); resize.observe(bar.current!);
    return () => { resize.disconnect(); sp.destroy(); spring.current = null; };
  }, [calm]);
  useLayoutEffect(() => {
    spring.current?.to(open ? 1 : 0);
    if (!open) return;
    const focus = setTimeout(() => input.current?.focus({ preventScroll: true }), calm ? 0 : 280);
    return () => clearTimeout(focus);
  }, [open, calm]);
  return <div className={a.compact}><div className={a.search} data-finish={finish} data-open={open} data-enochian-component="search-field">
    <div className={a.searchBar} ref={bar}>
      <div className={a.searchField} ref={field}><input {...props} type="search" role="searchbox" autoComplete="off" enterKeyHint="search"
        tabIndex={open ? 0 : -1} value={value} onChange={e => onChange(e.target.value)}
        ref={element => { input.current = element; inputRef?.(element); }}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); onChange(''); ball.current?.focus(); } }} /></div>
      <button ref={ball} type="button" className={a.searchBall} aria-expanded={open} aria-label={`${open ? 'Close' : 'Open'} ${searchLabel}`} onClick={() => {
        setOpen(!open); if (open) onChange('');
      }}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 4.5 4.5" /></svg></button>
    </div>
  </div></div>;
}
