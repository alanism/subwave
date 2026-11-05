import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ang, polar, Spring, SNAP } from './interaction';

test('the authored atlas CSS and reference snapshots remain unmodified', () => {
  const hashes = {
    'controls.css': 'a673dc924139b8d46e6967a0b594d8fbff6498978097e21c421a3f4e3082e8ca',
    'controls.reference.js.txt': 'c6829d0d7f9c8a4745bb1961a536f3f1af140df8839919ccdadc58c1ffef519b',
    'atlas.reference.html.txt': 'da779194fb5a0cf8a7a4400f17ae8328afe833408997e47d8c16e378208cbd35',
  };
  for (const [file, hash] of Object.entries(hashes)) {
    const bytes = readFileSync(new URL(file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, file);
  }
});

test('the dial retains the authored sweep and tick coordinates', () => {
  assert.deepEqual([ang(0), ang(.5), ang(1)], [-135, 0, 135]);
  const [x, y] = polar(110, 110, 96, 0);
  assert.equal(x, 110);
  assert.equal(y, 14);
  const [endX, endY] = polar(110, 110, 102, 135);
  assert.ok(Math.abs(endX - 182.12489168102786) < 1e-10);
  assert.ok(Math.abs(endY - 182.12489168102786) < 1e-10);
});

test('the original spring settles, cancels on teardown and respects reduced motion', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = id => { frames.delete(id); };
  try {
    let value = -1;
    const spring = new Spring(0, SNAP, x => { value = x; }, false, .0005);
    spring.to(1);
    let now = spring.last;
    for (let i = 0; i < 1000 && frames.size; i++) {
      const [id, callback] = frames.entries().next().value!;
      frames.delete(id); now += 1000 / 60; callback(now);
    }
    assert.equal(value, 1);
    assert.equal(frames.size, 0);
    spring.to(0);
    assert.equal(frames.size, 1);
    spring.destroy();
    assert.equal(frames.size, 0);
    const reduced = new Spring(0, SNAP, x => { value = x; }, true);
    reduced.to(.72);
    assert.equal(value, .72);
    assert.equal(frames.size, 0);
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  }
});
