'use client';

import { useAdminAuth } from '@/lib/adminAuth';
import { adminJson, useAdminMutation, useAdminQuery } from '@/lib/admin-query';
import type { DesktopLibrary, DesktopInternetStationInput } from '@/lib/schemas.generated';
import { youtubeKeys } from '@/components/admin/youtube/queries';

export const desktopKeys = { library: ['desktop', 'library'] as const };
export type LocalCommand =
  | { kind: 'select'; id: string }
  | { kind: 'save-radio'; station: DesktopInternetStationInput }
  | { kind: 'remove-radio'; id: string }
  | { kind: 'play'; id: string }
  | { kind: 'play-download'; id: string }
  | { kind: 'copy'; id: string; stationId: string }
  | { kind: 'next' }
  | { kind: 'rescan' }
  | { kind: 'create-station'; name: string; genre: string }
  | { kind: 'create-playlist'; name: string }
  | { kind: 'edit-playlist'; id: string; name: string; trackIds: string[] }
  | { kind: 'delete-playlist' | 'restore-playlist'; id: string };

export function useDesktopLibrary() {
  const { adminFetch } = useAdminAuth();
  return useAdminQuery<DesktopLibrary>({ adminFetch, key: desktopKeys.library, staleTime: 0,
    refetchInterval: 3000, refetchOnMount: 'always',
    request: (fetcher, signal) => adminJson(fetcher, '/local/library', undefined, signal) });
}

export function useLocalCommand() {
  const { adminFetch } = useAdminAuth();
  return useAdminMutation<unknown, LocalCommand>({ adminFetch, toastOnError: false,
    request: (command, fetcher) => {
      let path: string;
      let value: unknown = {};
      let method = 'POST';
      switch (command.kind) {
        case 'save-radio': path = '/local/radio/presets'; value = command.station; break;
        case 'remove-radio': path = `/local/radio/presets/${command.id}`; method = 'DELETE'; break;
        case 'select': path = '/local/stations/select'; value = { id: command.id }; break;
        case 'create-station': path = '/local/stations'; value = { name: command.name, genre: command.genre }; break;
        case 'create-playlist': path = '/local/playlists'; value = { name: command.name }; break;
        case 'edit-playlist': path = `/local/playlists/${command.id}`; method = 'PUT'; value = { name: command.name, trackIds: command.trackIds }; break;
        case 'delete-playlist': path = `/local/playlists/${command.id}`; method = 'DELETE'; break;
        case 'restore-playlist': path = `/local/playlists/${command.id}/restore`; break;
        case 'play': path = `/local/tracks/${command.id}/play`; break;
        case 'play-download': path = `/youtube/downloads/${command.id}/play`; break;
        case 'copy': path = `/local/tracks/${command.id}/copy`; value = { stationId: command.stationId }; break;
        case 'next': path = '/local/next'; break;
        case 'rescan': path = '/local/scan'; break;
      }
      return adminJson(fetcher, path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    },
    onDone: async (_data, command, client) => {
      await client.invalidateQueries({ queryKey: desktopKeys.library });
      if (command.kind === 'create-station') await client.invalidateQueries({ queryKey: youtubeKeys.routing });
      if (command.kind === 'play-download') await client.invalidateQueries({ queryKey: youtubeKeys.downloads });
    },
  });
}
