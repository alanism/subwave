import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDesktopAdminSession } from './desktop-admin';

test('desktop controls start ready without credentials and cannot be signed out', async () => {
  const session = createDesktopAdminSession('/api');
  assert.equal(session.hydrated, true);
  assert.equal(session.needsAuth, false);
  assert.ok(session.auth);
  session.signOut();
  assert.equal(session.needsAuth, false);
  assert.equal((await session.signIn('', '')).ok, true);
});

test('desktop requests preserve writes and cancellation while sending no Basic credentials', async () => {
  const signal = new AbortController().signal;
  let called = false;
  const session = createDesktopAdminSession('/api', async (url, init) => {
    called = true;
    assert.equal(url, '/api/youtube/downloads');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.body, '{"url":"song"}');
    assert.equal(init?.signal, signal);
    const headers = new Headers(init?.headers);
    assert.equal(headers.has('Authorization'), false);
    assert.equal(headers.get('X-Subwave-Console'), '1');
    assert.equal(headers.get('Content-Type'), 'application/json');
    return Response.json({ ok: true });
  });
  await session.adminFetch('/youtube/downloads', { method: 'POST', body: '{"url":"song"}', signal,
    headers: { Authorization: 'Basic old-browser-credentials', 'Content-Type': 'application/json' } });
  assert.equal(called, true);
});

test('an unavailable or protected station never turns desktop controls into a login gate', async () => {
  for (const status of [401, 429, 503]) {
    const session = createDesktopAdminSession('/api', async () => Response.json({ error: 'station unavailable' }, { status }));
    assert.equal((await session.adminFetch('/settings')).status, status);
    assert.equal(session.needsAuth, false);
    assert.equal(session.hydrated, true);
  }
});
