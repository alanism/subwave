import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackRequests } from './playback-requests';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('Stop during preset saving keeps the saved result but cancels its later Tune in', async () => {
  const intent = { current: 0 }, requests = createPlaybackRequests(intent), saved = deferred<string>();
  const played: string[] = [];
  const action = requests.run(() => saved.promise, source => { played.push(source); });
  intent.current++; // Stop belongs to the shared audio owner.
  saved.resolve('net-saved-preset');
  assert.equal(await action, 'net-saved-preset');
  assert.equal(played.length, 0);
  await requests.run(async () => 'new-explicit-choice', source => { played.push(source); });
  assert.deepEqual(played, ['new-explicit-choice']);
});

test('a newer source choice supersedes a pending save-and-play action', async () => {
  const requests = createPlaybackRequests({ current: 0 }), saved = deferred<string>();
  const played: string[] = [];
  const older = requests.run(() => saved.promise, source => { played.push(source); });
  await requests.run(async () => 'jazz', source => { played.push(source); });
  saved.resolve('older-radio'); await older;
  assert.deepEqual(played, ['jazz']);
});

test('successful preparation commits once; failed preparation never starts playback', async () => {
  const requests = createPlaybackRequests({ current: 0 });
  const played: string[] = [];
  assert.equal(await requests.run(async () => 'house', async source => { played.push(source); }), 'house');
  await assert.rejects(requests.run(async () => { throw new Error('Disk full'); }, source => { played.push(String(source)); }), /Disk full/);
  assert.deepEqual(played, ['house']);
});
