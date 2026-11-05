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
export const desktopInternetStationInputSchema = z.object({
  name: z.string().trim().min(1, 'Name this radio station').max(120),
  url: z.string().trim().url().max(2048).refine(value => /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS audio stream'),
  country: z.string().trim().max(80).default(''), tags: z.string().trim().max(300).default(''),
  codec: z.string().trim().max(30).default(''), providerId: z.string().trim().max(80).default(''),
});
export const desktopInternetStationSchema = desktopInternetStationInputSchema.extend({ id: z.string().regex(/^net-[a-f0-9]{16}$/) });
export const desktopRadioSearchSchema = z.object({
  name: z.string().trim().max(120).default(''), genre: z.string().trim().max(80).default(''),
  country: z.string().trim().max(80).default(''), offset: z.number().int().min(0).max(3000).default(0),
});
export type DesktopInternetStationInput = z.infer<typeof desktopInternetStationInputSchema>;
export type DesktopInternetStation = z.infer<typeof desktopInternetStationSchema>;
export const desktopLibrarySchema = z.object({
  selected: z.string(), stations: z.array(desktopGenreStationSchema),
  playlists: z.array(desktopPlaylistSchema), internetStations: z.array(desktopInternetStationSchema).default([]),
  tracks: z.array(desktopTrackSchema), allTracks: z.array(desktopTrackSchema), musicDir: z.string(), downloadsDir: z.string(),
  error: z.string().nullable(),
});
export type DesktopLibrary = z.infer<typeof desktopLibrarySchema>;
export type DesktopTrack = z.infer<typeof desktopTrackSchema>;
export type DesktopPlaylist = z.infer<typeof desktopPlaylistSchema>;
