// YouTube import contracts. Mirrored into web/lib/schemas.generated.ts.
import { z } from 'zod';

export const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const YT_STATION_ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const YT_JOB_ID_RE = /^[a-f0-9-]{36}$/;

export function youtubeVideoId(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (u.username || u.password || u.port) return null;
    const host = u.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.split('/')[1] || null;
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'watch') id = u.searchParams.get('v');
      else if (['shorts', 'embed', 'live'].includes(parts[0] ?? '')) id = parts[1] || null;
    }
    return id && YT_VIDEO_ID_RE.test(id) ? id : null;
  } catch { return null; }
}

export const youtubeSearchSchema = z.object({
  query: z.string().trim().min(2, 'Enter a song, artist or YouTube URL').max(200)
    .refine(query => !/^(?:[a-z][a-z\d+.-]*:\/\/|www\.|(?:m\.|music\.)?youtube\.com\/|youtu\.be\/)/i.test(query) || youtubeVideoId(query) !== null,
      'Paste a valid YouTube video URL, or search by song or artist.'),
});
export const youtubeDownloadSchema = z.object({
  url: z.string().trim().max(2048).refine(v => youtubeVideoId(v) !== null, 'Paste a YouTube video URL'),
  stationId: z.string().regex(YT_STATION_ID_RE).optional(),
  autoImport: z.boolean().default(true),
});
export const youtubeAddSchema = z.object({ stationId: z.string().regex(YT_STATION_ID_RE) });

export const youtubeRouteSchema = z.object({
  stationId: z.string().regex(YT_STATION_ID_RE),
  displayName: z.string().trim().min(1).max(40).optional(),
  genre: z.string().trim().min(1, 'Enter the genre for this station').max(60),
  aliases: z.union([z.string().max(720), z.array(z.string())])
    .transform(v => typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : v)
    .pipe(z.array(z.string().trim().min(1).max(60)).max(12)).default([]),
  folder: z.string().trim().min(1, 'Choose a library folder').max(200).refine(v => {
    const parts = v.replaceAll('\\', '/').split('/');
    return !v.startsWith('/') && !v.includes(':') && !/[\x00-\x1f]/.test(v)
      && parts.every(p => !!p && p !== '.' && p !== '..');
  }, 'Use a relative library folder without dot segments'),
});
export const youtubeRoutingSchema = z.object({
  routes: z.array(youtubeRouteSchema).max(8).superRefine((routes, ctx) => {
    const ids = new Set<string>();
    routes.forEach((r, i) => {
      if (ids.has(r.stationId)) ctx.addIssue({ code: 'custom', path: [i, 'stationId'], message: 'Use one genre rule per station' });
      ids.add(r.stationId);
    });
  }),
});
export type YoutubeRoute = z.output<typeof youtubeRouteSchema>;
export type YoutubeRouting = z.output<typeof youtubeRoutingSchema>;
export type YoutubeDownload = z.output<typeof youtubeDownloadSchema>;
export type YoutubeSearch = z.output<typeof youtubeSearchSchema>;
export const youtubeImportFormSchema = youtubeSearchSchema.extend({
  stationId: z.union([z.literal(''), z.string().regex(YT_STATION_ID_RE)]).default(''),
  autoImport: z.boolean().default(true),
});

export interface YoutubeVideo {
  id: string; url: string; title: string; artist: string; channel: string;
  duration: number | null; genres: string[]; tags: string[]; description: string;
}
export type YoutubeJobState = 'queued' | 'inspecting' | 'downloading' | 'ready' | 'importing' | 'imported' | 'failed';
export interface YoutubeImportCopy {
  stationId: string; genre: string; path: string; addedAt: string; scanWarning: string | null;
}
export interface YoutubeJob {
  id: string; videoId: string; url: string; state: YoutubeJobState; progress: number | null;
  createdAt: string; updatedAt: string; video: YoutubeVideo | null;
  suggestedStationId: string | null; requestedStationId: string | null; autoImport: boolean;
  filename: string | null; error: string | null; copies: YoutubeImportCopy[];
  downloadSha256?: string;
  pendingCopy?: Omit<YoutubeImportCopy, 'scanWarning'> & { sha256: string };
}
