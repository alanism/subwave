import type { AdminAuth } from './adminAuth';

// The installed desktop is a local application session, not an operator login.
// The marker keys its query cache; it is never a password or HTTP credential.
// Backend errors remain errors and never replace the app with a sign-in page.
export function createDesktopAdminSession(apiUrl: string, request: typeof fetch = fetch): AdminAuth {
  return {
    auth: 'desktop-local',
    needsAuth: false,
    hydrated: true,
    lockedUntil: null,
    signIn: async () => ({ ok: true }),
    signOut: () => {},
    adminFetch: (path, init = {}) => {
      const headers = new Headers(init.headers);
      headers.delete('Authorization');
      headers.set('X-Subwave-Console', '1');
      return request(`${apiUrl}${path}`, { ...init, headers });
    },
  };
}
