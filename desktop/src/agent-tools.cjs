'use strict';

// One catalog for the local browser, JSON CLI and MCP transport. All writes
// delegate to the same station/renderer operations used by the desktop UI.
const { z } = require('zod');
const string = max => z.string().trim().min(1).max(max);
const trackId = z.string().regex(/^[a-f0-9]{32}$/);
const sourceId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/);
const jobId = z.string().uuid();
const playlistId = z.string().regex(/^pl-[a-f0-9]{8}$/);
const limit = z.number().int().min(1).max(50).default(20);
const object = shape => z.strictObject(shape);
const tools = [];
function define(name, description, shape, readOnly, run) {
  tools.push({ name: `subwave_${name}`, description, input: object(shape), readOnly, run });
}
function publicJob(job) {
  if (!job) throw new Error('Download not found. Use subwave_recent_downloads to get its jobId.');
  const { id, videoId, video, state, progress, createdAt, updatedAt, error, suggestedStationId } = job;
  return { id, videoId, video, state, progress, createdAt, updatedAt, error, suggestedStationId,
    copies: job.copies.map(({ stationId, genre }) => ({ stationId, genre })) };
}
define('status', 'Read the actual desktop playback state, selected collection and local library counts. Subwave must be open.', {}, true, async c => {
  const [library, playback, now] = await Promise.all([c.api('GET', '/local/library'), c.player('status', {}), c.api('GET', '/now-playing')]);
  return { playback, selected: library.selected, trackCount: library.allTracks.length,
    stationCount: library.stations.length, internetStationCount: library.internetStations?.length || 0, playlistCount: library.playlists.filter(p => !p.deletedAt).length,
    nowPlaying: now.nowPlaying, error: library.error };
});
define('search_library', 'Find existing local songs by title, artist or genre. Return exact track IDs for playback or adding to a playlist.',
  { query: z.string().trim().max(200).default(''), stationId: sourceId.optional(), limit }, true, async (c, a) => {
    const library = await c.api('GET', '/local/library');
    if (a.stationId && !library.stations.some(s => s.id === a.stationId)) throw new Error('Unknown genre station. Use subwave_list_stations.');
    const query = a.query.toLocaleLowerCase();
    const found = library.allTracks.filter(t => (!a.stationId || a.stationId === 'all' || t.stationId === a.stationId)
      && `${t.title} ${t.artist} ${t.genre}`.toLocaleLowerCase().includes(query));
    return { tracks: found.slice(0, a.limit), total: found.length };
  });
define('list_stations', 'List separate local genre stations, their IDs and track counts. All music is an aggregate view.', {}, true,
  async c => { const v = await c.api('GET', '/local/library'); return { selected: v.selected, stations: v.stations, internetStations:v.internetStations || [] }; });
define('search_radio', 'Search the live Radio Browser directory by station name, genre and country. Does not save a preset or start playback.',
  { name:z.string().trim().max(120).default(''), genre:z.string().trim().max(80).default(''), country:z.string().trim().max(80).default(''), offset:z.number().int().min(0).max(3000).default(0) }, true,
  (c,a)=>c.api('POST','/local/radio/search',a));
define('list_radio_presets', 'List saved live internet-radio presets and exact source IDs for tuning. Local genres are listed separately by list_stations.', {}, true,
  async c=>{const v=await c.api('GET','/local/library');return {selected:v.selected,presets:v.internetStations || []};});
define('save_radio_preset', 'Save a selected public audio stream as an internet-radio preset without starting playback. Prefer a result from search_radio.',
  { name:string(120),url:string(2048),country:z.string().max(80).default(''),tags:z.string().max(300).default(''),codec:z.string().max(30).default(''),providerId:z.string().max(80).default('') }, false,
  (c,a)=>c.api('POST','/local/radio/presets',a));
define('remove_radio_preset', 'Remove one explicitly chosen saved radio preset. Does not delete local audio. If selected, playback is stopped.',
  { sourceId:z.string().regex(/^net-[a-f0-9]{16}$/) }, false,async(c,a)=>{const v=await c.api('GET','/local/library');if(v.selected===a.sourceId)await c.player('stop',{});return c.api('DELETE',`/local/radio/presets/${a.sourceId}`,{});});
define('search_youtube', 'Search YouTube without downloading. Inspect title, uploader, duration and video URL before choosing the intended recording.',
  { query: string(200) }, true, (c, a) => c.api('POST', '/youtube/search', a));
define('download_youtube', 'Queue one chosen YouTube video URL as a retained MP3. Returns a job, not a completed download. Poll subwave_download_status. Does not start playback.',
  { url: string(2048), stationId: sourceId.optional(), autoImport: z.boolean().default(false) }, false,
  async (c, a) => ({ job: publicJob((await c.api('POST', '/youtube/downloads', a)).job) }));
define('download_status', 'Read one download by jobId. Only ready/imported files can be played or added. Failed jobs include the actionable error.',
  { jobId }, true, async (c, a) => ({ job: publicJob((await c.api('GET', '/youtube/downloads')).jobs.find(j => j.id === a.jobId)) }));
define('recent_downloads', 'List retained YouTube download records, including pending/failed jobs. Originals remain after genre copies.', { limit }, true,
  async (c, a) => { const { jobs } = await c.api('GET', '/youtube/downloads'); return { jobs: jobs.slice(0, a.limit).map(publicJob), total: jobs.length }; });
define('retry_download', 'Retry a failed/interrupted YouTube job. Poll its status; do not report success before the MP3 is ready.', { jobId }, false,
  async (c, a) => ({ job: publicJob((await c.api('POST', `/youtube/downloads/${a.jobId}/retry`, {})).job) }));
define('add_download', 'Copy a completed MP3 into the chosen genre station while preserving its Recent original and current playback source.', { jobId, stationId: sourceId }, false,
  async (c, a) => ({ job: publicJob((await c.api('POST', `/youtube/downloads/${a.jobId}/add`, { stationId: a.stationId })).job) }));
define('import_files', 'Import explicit absolute audio-file paths supplied by the user into a genre. Preserves source files. Maximum 50 files, 250 MiB each. No directory or general filesystem access.',
  { paths: z.array(string(4096).regex(/^\//)).min(1).max(50), stationId: sourceId.optional() }, false,
  (c, a) => c.importFiles(a.paths, a.stationId));
define('create_station', 'Create a separate genre radio collection, up to eight genres. This adds a collection without switching playback.',
  { name: string(40), genre: string(60) }, false,
  async (c, a) => { const v = await c.api('POST', '/local/stations', a); return { stations: v.stations, selected: v.selected }; });
define('copy_track', 'Copy an existing track to another genre, preserving the original and playlist memberships.', { trackId, stationId: sourceId }, false,
  async (c, a) => { const v = await c.api('POST', `/local/tracks/${a.trackId}/copy`, { stationId: a.stationId }); return { stations: v.stations, trackCount: v.allTracks.length }; });
define('list_playlists', 'Read saved playlist IDs, names and ordered track IDs. Use this before replacing playlist contents.',
  { includeDeleted: z.boolean().default(false), limit }, true,
  async (c, a) => { const v = await c.api('GET', '/local/library'); const rows = v.playlists.filter(p => a.includeDeleted || !p.deletedAt); return { playlists: rows.slice(0, a.limit), total: rows.length }; });
define('create_playlist', 'Create an empty named local playlist. Add tracks with subwave_update_playlist after reading the existing contents.', { name: string(80) }, false,
  (c, a) => c.api('POST', '/local/playlists', a));
define('update_playlist', 'Replace the complete playlist name and ordered track ID list. Read current contents first and preserve every track the user did not ask to remove. Does not delete audio.',
  { playlistId, name: string(80), trackIds: z.array(trackId).max(5000) }, false,
  (c, a) => c.api('PUT', `/local/playlists/${a.playlistId}`, { name: a.name, trackIds: a.trackIds }));
define('play_track', 'Play an exact local track in the actual native player. Returns observed audio state, not just a queued selection.', { trackId }, false,
  (c, a) => c.player('play-track', a));
define('play_station', 'Select and play a genre station, ordered playlist or saved live internet-radio preset in the native window. Use an exact station/playlist ID.', { sourceId }, false,
  async (c, a) => {
    const library = await c.api('GET', '/local/library');
    const source = library.stations.find(s => s.id === a.sourceId) || library.playlists.find(p => p.id === a.sourceId && !p.deletedAt) || library.internetStations?.find(p => p.id === a.sourceId);
    if (!source) throw new Error('Unknown collection. List stations or playlists and use an exact source ID.');
    if (!source.id.startsWith('net-') && !source.count) throw new Error('This collection is empty. Add songs before playing it.');
    return c.player('play-source', a);
  });
define('play_download', 'Play a completed retained MP3 in the native window. If not yet in a genre, add it to Local files first.', { jobId }, false,
  (c, a) => c.player('play-download', a));
define('stop', 'Stop actual native playback, including an earlier pending track selection.', {}, false, c => c.player('stop', {}));
define('next', 'Advance the current collection. If stopped, remain stopped.', {}, false, async c => {const v=await c.api('GET','/local/library');if(v.internetStations?.some(row=>row.id===v.selected))throw new Error('Live radio cannot skip songs. Tune another saved station.');return c.player('next', {});});
define('set_volume', 'Set the native player volume from 0 to 100. Zero silences playback. This is not the system output volume.',
  { volume: z.number().min(0).max(100) }, false, (c, a) => c.player('set-volume', a));

function listTools() {
  return tools.map(t => {
    const inputSchema = z.toJSONSchema(t.input, { io: 'input' }); delete inputSchema.$schema;
    return { name: t.name, description: t.description, inputSchema,
      annotations: { readOnlyHint: t.readOnly, destructiveHint: t.name === 'subwave_update_playlist',
        openWorldHint: /youtube|download/.test(t.name) } };
  });
}
async function callTool(context, name, args) {
  const tool = tools.find(t => t.name === name);
  if (!tool) throw new Error('Unknown Subwave tool. Use tools/list to discover supported actions.');
  return tool.run(context, tool.input.parse(args ?? {}));
}
module.exports = { listTools, callTool };
