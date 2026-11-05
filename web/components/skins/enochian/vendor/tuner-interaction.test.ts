import assert from 'node:assert/strict';
import test from 'node:test';
import { driveTuner } from './tuner-interaction';

test('authored tuner selects real channel stops, previews drag and cancels without tuning', () => {
  const oldObserver = globalThis.ResizeObserver, oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
  globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
  class Tuner extends EventTarget {
    attributes = new Map<string, string>();
    style = { transform: '' };
    clientWidth = 400;
    setAttribute(key: string, value: string) { this.attributes.set(key, value); }
    getAttribute(key: string) { return this.attributes.get(key) || null; }
    focus() {}
    setPointerCapture() {}
    send(type: string, props: Record<string, unknown>) { this.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), props)); }
  }
  try {
    const root = new Tuner(), strip = new Tuner(), preview: number[] = [], commits: number[] = [];
    const control = driveTuner(root as unknown as HTMLElement, strip as unknown as HTMLElement, 0, 6,
      index => preview.push(index), index => commits.push(index), index => ['All', 'Jazz', 'House', 'Rock', 'Ambient', 'Local'][index]!, true);
    root.send('keydown', { key: 'ArrowRight' });
    assert.deepEqual(commits, [1]);
    assert.equal(root.attributes.get('aria-valuetext'), 'Jazz');
    root.send('pointerdown', { button: 0, clientX: 200, pointerId: 1 });
    root.send('pointermove', { clientX: 130 });
    assert.equal(preview.at(-1), 2);
    assert.deepEqual(commits, [1], 'preview must not change the station');
    root.send('pointercancel', {});
    assert.equal(preview.at(-1), 1);
    assert.deepEqual(commits, [1]);
    root.send('pointerdown', { button: 0, clientX: 200, pointerId: 1 });
    root.send('pointermove', { clientX: 60 });
    root.send('pointerup', {});
    root.send('pointerup', {});
    assert.deepEqual(commits, [1, 3], 'release commits one real channel');
    root.setAttribute('aria-disabled', 'true');
    root.send('keydown', { key: 'End' });
    root.send('pointerdown', { button: 0, clientX: 200, pointerId: 1 });
    root.send('pointermove', { clientX: 0 }); root.send('pointerup', {});
    assert.deepEqual(commits, [1, 3], 'busy/disabled tuner ignores all input');
    root.setAttribute('aria-disabled', 'false');
    control.set(5);
    assert.equal(root.attributes.get('aria-valuetext'), 'Local');
    assert.deepEqual(commits, [1, 3], 'external source changes update the scale without issuing another command');
    root.send('keydown', { key: 'Home' });
    assert.equal(commits.at(-1), 0);
    root.send('keydown', { key: 'PageDown' });
    assert.equal(commits.at(-1), 5, 'seek down wraps from the first actual channel');
    root.send('keydown', { key: 'PageUp' });
    assert.equal(commits.at(-1), 0, 'seek up wraps from the last actual channel');
    control.destroy(); root.send('keydown', { key: 'End' });
    assert.equal(commits.at(-1), 0, 'unmount removes listeners');
  } finally { globalThis.ResizeObserver = oldObserver; globalThis.requestAnimationFrame = oldRaf; globalThis.cancelAnimationFrame = oldCancel; }
});
