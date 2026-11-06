'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadSource = require('./load-source.cjs');
test('radio failures and brief decodes back off to 30 seconds; stable playback resets the delay', async t => {
  const { nextRadioReconnect } = await loadSource(t, 'service/radio-reconnect.ts');
  let failures = 0;
  const delays = [0, 100, 3999, 10, 500].map(playedMs => {
    const retry = nextRadioReconnect(failures, playedMs); failures = retry.failures; return retry.delay;
  });
  assert.deepEqual(delays, [5000, 10000, 20000, 30000, 30000]);
  assert.deepEqual(nextRadioReconnect(failures, 4000), { delay: 5000, failures: 1 });
  assert.deepEqual(nextRadioReconnect(0), { delay: 5000, failures: 1 });
});
