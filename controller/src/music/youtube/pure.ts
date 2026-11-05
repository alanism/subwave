// Metadata and routing policy. Unknown/ambiguous genres stay in Recent YT
// downloads for the operator to assign; uploader names are never music genres.
import { youtubeVideoId, type YoutubeRoute, type YoutubeVideo } from '../../schemas/youtube.js';

const text = (v: unknown, limit = 300): string => typeof v === 'string' ? v.trim().slice(0, limit) : '';
const strings = (v: unknown): string[] => Array.isArray(v) ? v.slice(0, 100).map(x => text(x, 100)).filter(Boolean) : [];
export function videoFromInfo(raw: unknown): YoutubeVideo {
  if (!raw || typeof raw !== 'object') throw new Error('YouTube did not return video details');
  const d = raw as Record<string, unknown>;
  const id = youtubeVideoId(`https://www.youtube.com/watch?v=${String(d.id)}`);
  if (!id) throw new Error('YouTube returned an invalid video');
  const duration = typeof d.duration === 'number' && Number.isFinite(d.duration) && d.duration > 0 ? d.duration : null;
  if (d.is_live === true || d.live_status === 'is_live' || d.live_status === 'is_upcoming') throw new Error('Choose a finished video rather than a live stream');
  if (duration !== null && duration > 1800) throw new Error('Choose a song of 30 minutes or less');
  return {
    id, url: `https://www.youtube.com/watch?v=${id}`,
    title: text(d.track) || text(d.title) || id,
    artist: text(d.artist) || strings(d.artists).join(', ') || text(d.uploader) || text(d.channel) || 'Unknown artist',
    channel: text(d.channel) || text(d.uploader), duration,
    genres: [...strings(d.genres), text(d.genre)].filter(g => g && !/^music$/i.test(g)),
    tags: strings(d.tags), description: text(d.description, 4000),
  };
}

export function foldYoutubeGenre(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const contains = (haystack: string, needle: string) => (` ${foldYoutubeGenre(haystack)} `).includes(` ${needle} `);
export function routeYoutubeVideo(video: YoutubeVideo, routes: YoutubeRoute[]): YoutubeRoute | null {
  const ranked = routes.map(route => {
    const words = [route.genre, ...route.aliases].map(foldYoutubeGenre).filter(Boolean);
    const score = Math.max(0, ...words.map(w =>
      (video.genres.some(g => contains(g, w)) ? 12 : 0)
      + (video.tags.some(g => contains(g, w)) ? 6 : 0)
      + (contains(video.title, w) ? 3 : 0)
      + (contains(video.description, w) ? 1 : 0)));
    return { route, score };
  }).sort((a, b) => b.score - a.score);
  if (!ranked[0] || ranked[0].score < 4 || ranked[0].score === ranked[1]?.score) return null;
  return ranked[0].route;
}

export function youtubeFilename(video: YoutubeVideo): string {
  let name = `${video.artist} - ${video.title}`.normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 130).replace(/[. ]+$/g, '');
  while (new TextEncoder().encode(name).length > 180) name = Array.from(name).slice(0, -1).join('');
  return `${name || 'YouTube audio'} [${video.id}].mp3`;
}
