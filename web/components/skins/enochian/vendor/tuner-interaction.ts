// Typed adapter of the authored atlas Aperture Scale: original 70px unit,
// fixed needle, SNAP spring, 3.2/s glide friction and release-to-detent feel.
// Actual collection indices replace the demo FM/MW numbers. Only a settled
// choice commits to the playback owner; cancel/unmount must never tune.
import { SNAP, Spring, type ValueControl } from './interaction';

const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
export const CHANNEL_PITCH = 70;
export const CHANNEL_MARGIN = 60;

export function driveTuner(element: HTMLElement, strip: HTMLElement, initial: number, count: number,
  preview: (value: number) => void, commit: (value: number) => void, text: (value: number) => string, calm: boolean): ValueControl {
  const max = Math.max(0, count - 1), events = new AbortController();
  let value = initial, saved = initial, drag = false, gliding = false, startX = 0, startValue = initial;
  let samples: [number, number][] = [], velocity = 0, frame = 0, lastFrame = 0, wheelTimer: ReturnType<typeof setTimeout> | undefined;
  let lastPreview = Math.round(initial);
  const disabled = () => element.getAttribute('aria-disabled') === 'true';
  const render = (next: number) => {
    value = clamp(next, max);
    strip.style.transform = `translateX(${(element.clientWidth / 2 - CHANNEL_MARGIN - value * CHANNEL_PITCH).toFixed(2)}px)`;
    const index = Math.round(value);
    element.setAttribute('aria-valuenow', String(index + 1));
    element.setAttribute('aria-valuetext', text(index));
    if (lastPreview !== index) { lastPreview = index; if (drag || gliding) preview(index); }
  };
  const spring = new Spring(initial, SNAP, render, calm, .0005);
  const cancelMotion = () => { gliding = false; cancelAnimationFrame(frame); frame = 0; clearTimeout(wheelTimer); };
  const tune = (next: number) => {
    cancelMotion();
    const target = Math.round(clamp(next, max));
    saved = target; spring.to(target); preview(target); commit(target);
  };
  const glide = (now: number) => {
    if (!gliding) return;
    const dt = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now;
    let next = value + velocity * dt;
    velocity *= Math.exp(-3.2 * dt);
    if (next <= 0 || next >= max) { next = clamp(next, max); velocity = 0; }
    render(next); spring.x = value;
    if (Math.abs(velocity) < 2) { gliding = false; tune(value); }
    else frame = requestAnimationFrame(glide);
  };
  element.addEventListener('pointerdown', event => {
    if (event.button !== 0 || disabled()) return;
    cancelMotion(); drag = true; startX = event.clientX; startValue = value; saved = Math.round(value);
    samples = [[event.clientX, performance.now()]]; element.focus(); element.setPointerCapture(event.pointerId); spring.set(value);
  }, { signal: events.signal });
  element.addEventListener('pointermove', event => {
    if (!drag) return;
    spring.set(startValue - (event.clientX - startX) / CHANNEL_PITCH);
    samples.push([event.clientX, performance.now()]); if (samples.length > 6) samples.shift();
  }, { signal: events.signal });
  element.addEventListener('pointerup', () => {
    if (!drag) return; drag = false;
    const first = samples[0]!, last = samples[samples.length - 1]!, elapsed = (last[1] - first[1]) / 1000;
    velocity = elapsed > .005 && performance.now() - last[1] < 80 ? -(last[0] - first[0]) / elapsed / CHANNEL_PITCH : 0;
    if (!calm && Math.abs(velocity) > 6) { gliding = true; lastFrame = performance.now(); frame = requestAnimationFrame(glide); }
    else tune(value);
  }, { signal: events.signal });
  element.addEventListener('pointercancel', () => { drag = false; cancelMotion(); spring.set(saved); preview(saved); }, { signal: events.signal });
  element.addEventListener('keydown', event => {
    if (disabled()) return;
    let next: number;
    switch (event.key) {
      case 'PageUp': next = (Math.round(value) + 1) % Math.max(1, count); break;
      case 'PageDown': next = (Math.round(value) - 1 + Math.max(1, count)) % Math.max(1, count); break;
      case 'ArrowRight': case 'ArrowUp': next = Math.round(value) + (event.shiftKey ? 5 : 1); break;
      case 'ArrowLeft': case 'ArrowDown': next = Math.round(value) - (event.shiftKey ? 5 : 1); break;
      case 'Home': next = 0; break;
      case 'End': next = max; break;
      default: return;
    }
    event.preventDefault(); tune(next);
  }, { signal: events.signal });
  element.addEventListener('wheel', event => {
    if (disabled() || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault(); cancelMotion(); spring.set(value + event.deltaX / CHANNEL_PITCH);
    wheelTimer = setTimeout(() => tune(value), 140);
  }, { signal: events.signal, passive: false });
  const resize = new ResizeObserver(() => render(value)); resize.observe(element);
  return {
    set(next) { if (drag || gliding || Math.abs(next - saved) < 1e-8) return; cancelMotion(); saved = next; lastPreview = Math.round(next); spring.to(clamp(next, max)); },
    destroy() { drag = false; events.abort(); cancelMotion(); resize.disconnect(); spring.destroy(); },
  };
}
