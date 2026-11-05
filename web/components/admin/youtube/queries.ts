'use client';

import { useAdminMutation, useAdminQuery, adminJson, type AdminFetch } from '@/lib/admin-query';
import type { YoutubeDownload, YoutubeJob, YoutubeRouting, YoutubeVideo } from '@/lib/schemas.generated';

export interface YoutubeStation { id: string; name: string; active: boolean; configured: boolean }
export interface YoutubeTools {
  ytDlp: { available: boolean; version: string | null };
  ffmpeg: { available: boolean; version: string | null };
  libraryConfigured: boolean; libraryWritable: boolean; downloadsDir: string; libraryRoot: string | null;
}
export interface YoutubeDestinations extends YoutubeRouting { stations: YoutubeStation[] }
export const youtubeKeys = {
  downloads: ['youtube', 'downloads'] as const,
  routing: ['youtube', 'routing'] as const,
  status: ['youtube', 'status'] as const,
};
const json = (body: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function useYoutubeDownloads(adminFetch: AdminFetch, enabled: boolean) {
  return useAdminQuery<{ jobs: YoutubeJob[] }>({
    adminFetch, enabled, key: youtubeKeys.downloads,
    request: (fetcher, signal) => adminJson(fetcher, '/youtube/downloads', undefined, signal),
    refetchInterval: q => q.state.data?.jobs.some(j => ['queued', 'inspecting', 'downloading', 'importing'].includes(j.state)) ? 2000 : false,
  });
}
export function useYoutubeDestinations(adminFetch: AdminFetch, enabled: boolean) {
  return useAdminQuery<YoutubeDestinations>({ adminFetch, enabled, key: youtubeKeys.routing, refetchOnMount: 'always',
    request: (fetcher, signal) => adminJson(fetcher, '/youtube/routing', undefined, signal) });
}
export function useYoutubeTools(adminFetch: AdminFetch, enabled: boolean) {
  return useAdminQuery<YoutubeTools>({ adminFetch, enabled, key: youtubeKeys.status,
    request: (fetcher, signal) => adminJson(fetcher, '/youtube/status', undefined, signal) });
}
export function useYoutubeSearch(adminFetch: AdminFetch) {
  return useAdminMutation<{ videos: YoutubeVideo[] }, { query: string }>({ adminFetch,
    request: (values, fetcher) => adminJson(fetcher, '/youtube/search', json(values)), toastOnError: false });
}
export function useYoutubeDownload(adminFetch: AdminFetch) {
  return useAdminMutation<{ job: YoutubeJob }, YoutubeDownload>({ adminFetch,
    request: (values, fetcher) => adminJson(fetcher, '/youtube/downloads', json(values)),
    onDone: async (_data, _vars, client) => { await client.invalidateQueries({ queryKey: youtubeKeys.downloads }); } });
}
export function useYoutubeAdd(adminFetch: AdminFetch) {
  return useAdminMutation<{ job: YoutubeJob }, { id: string; stationId: string }>({ adminFetch,
    request: ({ id, stationId }, fetcher) => adminJson(fetcher, `/youtube/downloads/${id}/add`, json({ stationId })),
    onDone: async (_data, _vars, client) => { await client.invalidateQueries({ queryKey: youtubeKeys.downloads }); } });
}
export function useYoutubeRetry(adminFetch: AdminFetch) {
  return useAdminMutation<{ job: YoutubeJob }, string>({ adminFetch,
    request: (id, fetcher) => adminJson(fetcher, `/youtube/downloads/${id}/retry`, json({})),
    onDone: async (_data, _vars, client) => { await client.invalidateQueries({ queryKey: youtubeKeys.downloads }); } });
}
export function useSaveYoutubeRoutes(adminFetch: AdminFetch) {
  return useAdminMutation<YoutubeRouting, YoutubeRouting>({ adminFetch,
    request: (values, fetcher) => adminJson(fetcher, '/youtube/routing', json(values, 'PUT')),
    onDone: async (_data, _vars, client) => { await client.invalidateQueries({ queryKey: youtubeKeys.routing }); } });
}
