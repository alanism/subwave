import type { DesktopLibrary } from './schemas.generated';
export const selectedInternetStation = (library?: DesktopLibrary) => library?.internetStations?.find(station => station.id === library.selected) || null;
export const hasPlayableSource = (library?: DesktopLibrary) => !!selectedInternetStation(library) || !!library?.tracks.length;
export function playbackSources(library?: DesktopLibrary) {
  return [...(library?.stations || []), ...(library?.playlists.filter(row => !row.deletedAt) || []), ...(library?.internetStations || [])];
}
