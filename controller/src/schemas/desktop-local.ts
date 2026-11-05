// Local desktop station contracts; the web mirror is generated, never edited.
import { z } from 'zod';

export const desktopGenreCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name your genre station').max(40),
  genre: z.string().trim().min(1, 'Enter its genre').max(60),
});
export const desktopPlaylistCreateSchema = z.object({ name: z.string().trim().min(1, 'Name your playlist').max(80) });
export const desktopPlaylistEditSchema = desktopPlaylistCreateSchema.extend({
  trackIds: z.array(z.string().regex(/^[a-f0-9]{32}$/)).max(5000),
});
export const desktopPlaylistSchema = z.object({
  id: z.string(), name: z.string(), trackIds: z.array(z.string()), count: z.number(),
  deletedAt: z.string().nullable(),
});
export const desktopStationSelectSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
});
export const desktopTrackSchema = z.object({
  id: z.string(), stationId: z.string(), title: z.string(), artist: z.string(),
  genre: z.string(), duration: z.number(), filename: z.string(),
});
export const desktopGenreStationSchema = z.object({
  id: z.string(), name: z.string(), genre: z.string(), count: z.number(),
});
export const desktopLibrarySchema = z.object({
  selected: z.string(), stations: z.array(desktopGenreStationSchema),
  playlists: z.array(desktopPlaylistSchema),
  tracks: z.array(desktopTrackSchema), allTracks: z.array(desktopTrackSchema), musicDir: z.string(), downloadsDir: z.string(),
  error: z.string().nullable(),
});
export type DesktopLibrary = z.infer<typeof desktopLibrarySchema>;
export type DesktopTrack = z.infer<typeof desktopTrackSchema>;
export type DesktopPlaylist = z.infer<typeof desktopPlaylistSchema>;
