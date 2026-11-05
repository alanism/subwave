// Adapted from the user's /UIUX/controls.js (snapshot beside this file).
// Preserve its spring integration, geometry, drag distances and key increments.
// Changes: typed DOM refs, controlled-value callbacks, listener/RAF cleanup,
// and the host app's reduced-motion/lite flag. No demo audio or global IDs.
import { animate } from 'motion';

export const SNAP = { stiffness: 700, damping: 35, mass: 0.8 };
export const PRESS = { stiffness: 720, damping: 32, mass: 0.55 };
export const HEAVY = { type: 'spring' as const, stiffness: 300, damping: 30, mass: 1.2 };
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ang = (v: number) => -135 + v * 270;
export function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
}

// Original compact-controls Spring, including its 1/240 integration step.
export class Spring {
  x: number; v = 0; t: number; raf = 0; last = 0;
  constructor(value: number, public cfg: typeof SNAP, public on: (x: number) => void, public reduce: boolean, public prec = 0.01) {
    this.x = this.t = value; on(value);
  }
  to(target: number, cfg?: typeof SNAP) {
    if (cfg) this.cfg = cfg;
    this.t = target;
    if (this.reduce) { this.x = target; this.v = 0; this.on(target); return; }
    if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.step); }
  }
  set(value: number) {
    this.x = this.t = value; this.v = 0;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    this.on(value);
  }
  step = (now: number) => {
    let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    const { stiffness: k, damping: c, mass: m } = this.cfg;
    while (dt > 0) {
      const h = Math.min(1 / 240, dt);
      const a = (-k * (this.x - this.t) - c * this.v) / m;
      this.v += a * h; this.x += this.v * h; dt -= h;
    }
    if (Math.abs(this.x - this.t) < this.prec && Math.abs(this.v) < this.prec * 4) {
      this.x = this.t; this.v = 0; this.on(this.x); this.raf = 0; return;
    }
    this.on(this.x); this.raf = requestAnimationFrame(this.step);
  };
  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; }
}

export interface ValueControl { set: (value: number) => void; destroy: () => void }

/** Original driveDial: 150px full travel; 2% arrow increments; ±135°. */
export function driveDial(el: HTMLElement, knob: HTMLElement, value: number, onChange: (v: number) => void, reduce: boolean, options?: { steps?: number; valueText?: (v: number) => string; onCommit?: (v: number) => void }): ValueControl {
  let v = value, sy = 0, sv = 0, dragging = false;
  let animation: ReturnType<typeof animate> | undefined;
  const events = new AbortController();
  function render(instant = false) {
    animation?.stop();
    if (instant || reduce) knob.style.transform = `rotate(${ang(v)}deg)`;
    else animation = animate(knob, { rotate: ang(v) }, HEAVY);
    el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    el.setAttribute('aria-valuetext', options?.valueText?.(v) ?? Math.round(v * 100) + ' percent');
  }
  function set(next: number, instant = false) {
    const bounded = clamp(next);
    v = options?.steps && options.steps > 1 ? Math.round(bounded * (options.steps - 1)) / (options.steps - 1) : bounded;
    render(instant); onChange(v);
  }
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragging = true; sy = e.clientY; sv = v; el.focus(); el.setPointerCapture(e.pointerId);
  }, { signal: events.signal });
  el.addEventListener('pointermove', e => {
    if (!dragging) return;
    set(sv + (sy - e.clientY) / 150, true);
  }, { signal: events.signal });
  const up = () => { if (!dragging) return; dragging = false; render(); options?.onCommit?.(v); };
  el.addEventListener('pointerup', up, { signal: events.signal });
  el.addEventListener('pointercancel', () => { if (!options?.steps) { up(); return; } dragging = false; v = sv; render(true); onChange(v); }, { signal: events.signal });
  el.addEventListener('keydown', e => {
    const increment = options?.steps && options.steps > 1 ? 1 / (options.steps - 1) : .02;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(v + increment); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(v - increment); e.preventDefault(); }
    if (e.key === 'Home') { set(0); e.preventDefault(); }
    if (e.key === 'End') { set(1); e.preventDefault(); }
    if (['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End'].includes(e.key)) options?.onCommit?.(v);
  }, { signal: events.signal });
  render(true);
  return {
    set(next) { if (Math.abs(next - v) < 1e-8) return; v = clamp(next); render(dragging); },
    destroy() { events.abort(); animation?.stop(); },
  };
}

/** Original makeHSlider, continuous branch. Thumb grab offset and SNAP unchanged. */
export function makeHSlider(el: HTMLElement, value: number, onChange: (v: number) => void, reduce: boolean): ValueControl {
  const th = el.querySelector<HTMLElement>('.hs-th')!;
  const fill = el.querySelector<HTMLElement>('.hs-fill')!;
  const travel = () => el.clientWidth - th.offsetWidth;
  let v = value, drag = false, off = 0;
  const events = new AbortController();
  const sp = new Spring(v, SNAP, x => {
    const t = travel();
    th.style.transform = `translateX(${(x * t).toFixed(2)}px)`;
    fill.style.width = (x * t + th.offsetWidth / 2) + 'px';
  }, reduce, .0005);
  function set(x: number, mode?: string) {
    v = clamp(x);
    if (mode === 'raw') sp.set(v); else sp.to(v);
    el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    el.setAttribute('aria-valuetext', String(Math.round(v * 100)));
    onChange(v);
  }
  const move = (e: PointerEvent, mode?: string) => {
    const r = el.getBoundingClientRect();
    set((e.clientX - off - r.left - th.offsetWidth / 2) / travel(), mode);
  };
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = true; el.focus(); el.setPointerCapture(e.pointerId);
    const r = th.getBoundingClientRect();
    off = (e.clientX >= r.left && e.clientX <= r.right) ? e.clientX - (r.left + r.width / 2) : 0;
    move(e, off ? 'raw' : 'jump');
  }, { signal: events.signal });
  el.addEventListener('pointermove', e => { if (drag) move(e, 'raw'); }, { signal: events.signal });
  const up = () => { if (!drag) return; drag = false; set(v); };
  el.addEventListener('pointerup', up, { signal: events.signal });
  el.addEventListener('pointercancel', up, { signal: events.signal });
  el.addEventListener('keydown', e => {
    const d: Record<string, number> = { ArrowRight: .01, ArrowUp: .01, ArrowLeft: -.01, ArrowDown: -.01, PageUp: .1, PageDown: -.1 };
    if (d[e.key] !== undefined) { e.preventDefault(); set(v + d[e.key]!); }
    else if (e.key === 'Home') { e.preventDefault(); set(0); }
    else if (e.key === 'End') { e.preventDefault(); set(1); }
  }, { signal: events.signal });
  const resize = new ResizeObserver(() => sp.on(sp.x)); resize.observe(el);
  return {
    set(next) { if (Math.abs(next - v) < 1e-8) return; v = clamp(next); sp.to(v); },
    destroy() { events.abort(); resize.disconnect(); sp.destroy(); },
  };
}

/** Original makeToggle, standard horizontal branch: 44px throw, 3px drag threshold. */
export function makeToggle(btn: HTMLElement, knob: HTMLElement, value: boolean, onChange: (on: boolean) => void, reduce: boolean) {
  let on = value, drag = false, s0 = 0, x0 = 0, moved = 0;
  const events = new AbortController();
  const draw = (x: number) => { knob.style.transform = `translateX(${(x * 44).toFixed(2)}px) scaleX(1.000)`; };
  const sp = new Spring(on ? 1 : 0, SNAP, draw, reduce, .001);
  function set(v: boolean) { on = v; btn.setAttribute('aria-checked', String(on)); sp.to(on ? 1 : 0); onChange(on); }
  btn.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = true; s0 = e.clientX; x0 = sp.x; moved = 0; btn.setPointerCapture(e.pointerId);
  }, { signal: events.signal });
  btn.addEventListener('pointermove', e => {
    if (!drag) return;
    const d = e.clientX - s0; moved = Math.max(moved, Math.abs(d));
    if (moved > 3) sp.set(clamp(x0 + d / 44));
  }, { signal: events.signal });
  btn.addEventListener('pointerup', () => { if (!drag) return; drag = false; set(moved > 3 ? sp.x > .5 : !on); }, { signal: events.signal });
  btn.addEventListener('pointercancel', () => { drag = false; sp.to(on ? 1 : 0); }, { signal: events.signal });
  btn.addEventListener('click', e => { if (e.detail === 0) set(!on); }, { signal: events.signal });
  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); set(true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); set(false); }
  }, { signal: events.signal });
  return {
    set(next: boolean) { if (next === on) return; on = next; sp.to(on ? 1 : 0); },
    destroy() { events.abort(); sp.destroy(); },
  };
}
