'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useSkinSelection } from '@/components/skins/SkinContext';
import { useThemeSwitcher } from '@/components/ThemeProvider';
import { ReceiverStationBank } from '@/components/skins/enochian/ReceiverControls';
import { useZodForm } from '@/lib/form';
import { TextField } from '@/lib/form-fields';
import { desktopGenreCreateSchema, desktopPlaylistCreateSchema, type DesktopPlaylist, type DesktopTrack } from '@/lib/schemas.generated';
import { DesktopAction } from './DesktopAction';
import { useDesktopSurface } from './DesktopContext';
import styles from './DesktopSurface.module.css';

const duration = (seconds: number) => seconds > 0 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '—';
const ignore = () => {};

function LibraryStatus() {
  const desktop = useDesktopSurface()!;
  return <div className={styles.empty} role="status">{desktop.library.isPending ? 'Opening your local library…' : 'Your library could not be read. Use Retry / refresh above.'}</div>;
}

export function StationsPanel() {
  const desktop = useDesktopSurface()!;
  const { data } = desktop.library;
  const skin = useSkinSelection();
  const themes = useThemeSwitcher();
  const form = useZodForm(desktopGenreCreateSchema, { name: '', genre: '' });
  const uid = useId();
  if (!data) return <LibraryStatus />;
  const selected = data.stations.find(station => station.id === data.selected);
  return <div className={styles.panel}>
    <header className={styles.panelIntro}><p className={styles.eyebrow}>Your music, separated by genre</p><h2>Choose a station.</h2><p>Each station plays its own collection. Add files or send a YouTube download to the genre you choose.</p></header>
    <div className={styles.stationLayout}>
      <section aria-label="Choose a genre station">
        {skin?.effectiveId === 'classic' ? <fieldset className={styles.stationChoices}><legend>Playing source</legend>{data.stations.map(station => <label key={station.id}><input type="radio" name={`${uid}-station`} checked={data.selected === station.id} onChange={() => { if (!desktop.busy) void desktop.selectSource(station.id).catch(ignore); }} /> <span>{station.name}<small>{station.count} {station.count === 1 ? 'track' : 'tracks'} · {station.genre}</small></span></label>)}</fieldset>
          : <ReceiverStationBank finish={themes?.effectiveId === 'enochian-obsidian' ? 'obsidian' : 'ivory'} value={selected?.id || null}
            options={data.stations.map(station => ({ id: station.id, label: `${station.name} · ${station.count}` }))}
            onChange={id => { if (!desktop.busy) void desktop.selectSource(id).catch(ignore); }} />}
      </section>
      <section className={styles.card} aria-label="Current genre collection">
        <p className={styles.eyebrow}>Selected source</p><h3>{selected?.name || data.playlists.find(p => p.id === data.selected)?.name || 'Choose a station'}</h3>
        <p>{data.tracks.length ? `${data.tracks.length} ${data.tracks.length === 1 ? 'track' : 'tracks'} ready to play.` : 'No tracks here yet. Add files to this genre or download a song from YouTube.'}</p>
        <div className={styles.actions}><DesktopAction label="Play station" disabled={desktop.busy || !data.tracks.length} onClick={() => void desktop.selectSource(data.selected, true).catch(ignore)} />
          <DesktopAction label="Add audio files" disabled={desktop.importing} onClick={() => void desktop.openFiles(selected?.id === 'all' ? undefined : selected?.id)} />
          <DesktopAction label="YouTube" onClick={() => desktop.openPanel('youtube')} /></div>
      </section>
    </div>
    <section className={styles.section}><h3>Create a genre station</h3><p>Give it a name and the genre you want it to hold. You can keep up to eight genre stations.</p>
      <form className={styles.form} onSubmit={form.handleSubmit(async values => { try { await desktop.run({ kind: 'create-station', ...values }, `${values.name} created.`); form.reset(); } catch {} })}>
        <TextField control={form.control} name="name" label="Station name" placeholder="Soul Radio" />
        <TextField control={form.control} name="genre" label="Genre" placeholder="Soul" />
        <DesktopAction label="Create station" submit disabled={desktop.busy || data.stations.length >= 9} />
      </form>
    </section>
  </div>;
}

export function LibraryPanel() {
  const desktop = useDesktopSurface()!;
  const { data } = desktop.library;
  const uid = useId();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const { importDestination, setImportDestination } = desktop;
  const [playlistId, setPlaylistId] = useState('');
  const [copyTrack, setCopyTrack] = useState('');
  const [copyDestination, setCopyDestination] = useState('');
  const playlistSelect = useRef<HTMLSelectElement>(null);
  const newPlaylistForm = useRef<HTMLFormElement>(null);
  const form = useZodForm(desktopPlaylistCreateSchema, { name: '' });
  const hasData = !!data;
  useEffect(() => {
    if (desktop.newPlaylistRequest && hasData) newPlaylistForm.current?.querySelector('input')?.focus();
  }, [desktop.newPlaylistRequest, hasData]);
  if (!data) return <LibraryStatus />;
  const genres = data.stations.filter(station => station.id !== 'all');
  const destination = genres.some(g => g.id === importDestination) ? importDestination : (genres.find(g => g.id === data.selected)?.id || genres.find(g => g.genre === 'Local files')?.id || genres[0]?.id || '');
  const playlists = data.playlists.filter(playlist => !playlist.deletedAt);
  const selectedPlaylist = playlists.find(playlist => playlist.id === playlistId);
  const tracks = data.allTracks.filter(track => (filter === 'all' || track.stationId === filter) && `${track.title} ${track.artist} ${track.genre}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className={styles.panel}>
    <header className={styles.panelIntro}><p className={styles.eyebrow}>Files stay on this computer</p><h2>Your music library.</h2><p>Open audio files, build playlists, and choose what plays next.</p></header>
    <section className={styles.card} aria-label="Import local audio files">
      <div className={styles.importRow}><label htmlFor={`${uid}-destination`}>Add files to genre<select id={`${uid}-destination`} value={destination} onChange={event => setImportDestination(event.target.value)}>{genres.map(genre => <option key={genre.id} value={genre.id}>{genre.name}</option>)}</select></label>
        <DesktopAction label={desktop.importing ? 'Importing…' : 'Open audio files'} disabled={desktop.importing || !destination} onClick={() => void desktop.openFiles(destination)} />
        <DesktopAction label={desktop.pendingKind === 'rescan' ? 'Refreshing…' : 'Refresh library'} disabled={desktop.busy || desktop.importing} onClick={() => void desktop.run({ kind: 'rescan' }, 'Library refreshed.').catch(ignore)} /></div>
      <p>MP3, FLAC, WAV, M4A and OGG · choose up to 50 files. Original files are preserved. Choosing a destination does not change playback.</p>
    </section>
    <div className={styles.libraryLayout}>
      <section className={styles.section} aria-labelledby={`${uid}-tracks`}>
        <h3 id={`${uid}-tracks`}>Library tracks <span className={styles.count}>{data.allTracks.length}</span></h3>
        <div className={styles.filters}><label htmlFor={`${uid}-search`}>Find a track<input id={`${uid}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, artist or genre" /></label>
          <label htmlFor={`${uid}-filter`}>Show collection<select id={`${uid}-filter`} value={filter} onChange={event => setFilter(event.target.value)}>{data.stations.map(station => <option key={station.id} value={station.id}>{station.name}</option>)}</select></label></div>
        {!tracks.length ? <p className={styles.empty}>{data.allTracks.length ? 'No tracks match this search or collection.' : 'No audio files yet. Open files above or download a song from YouTube.'}</p>
          : <ul className={styles.trackList}>{tracks.map(track => <li key={track.id}><TrackInfo track={track} /><DesktopAction label="Play" ariaLabel={`Play ${track.title}`} disabled={desktop.busy} onClick={() => void desktop.playTrack(track.id).catch(ignore)} /></li>)}</ul>}
        <details className={styles.details}><summary>Copy an existing track to another genre</summary><p>The original and its playlist memberships are kept.</p>
          <form className={styles.form} onSubmit={event => { event.preventDefault(); if (copyTrack && copyDestination) void desktop.run({ kind: 'copy', id: copyTrack, stationId: copyDestination }, 'Track added to the genre station.').catch(ignore); }}>
            <label htmlFor={`${uid}-copy-track`}>Track<select id={`${uid}-copy-track`} required value={copyTrack} onChange={event => setCopyTrack(event.target.value)}><option value="">Choose a track</option>{data.allTracks.map(track => <option key={track.id} value={track.id}>{track.title} — {track.artist} · {track.genre}</option>)}</select></label>
            <label htmlFor={`${uid}-copy-genre`}>Genre station<select id={`${uid}-copy-genre`} required value={copyDestination} onChange={event => setCopyDestination(event.target.value)}><option value="">Choose a genre</option>{genres.map(genre => <option key={genre.id} value={genre.id}>{genre.name}</option>)}</select></label>
            <DesktopAction label="Copy to genre" submit disabled={desktop.busy || !copyTrack || !copyDestination} />
          </form>
        </details>
      </section>
      <section className={styles.section} aria-labelledby={`${uid}-playlists`}>
        <h3 id={`${uid}-playlists`}>Playlists</h3>
        <form ref={newPlaylistForm} className={styles.form} onSubmit={form.handleSubmit(async values => { try { const result = await desktop.run({ kind: 'create-playlist', ...values }, `${values.name} created.`) as { id: string }; setPlaylistId(result.id); form.reset(); } catch {} })}>
          <TextField control={form.control} name="name" label="New playlist name" placeholder="Sunday afternoon" /><DesktopAction label="Create playlist" submit disabled={desktop.busy} />
        </form>
        <label htmlFor={`${uid}-playlist`}>Edit playlist<select ref={playlistSelect} id={`${uid}-playlist`} value={selectedPlaylist?.id || ''} onChange={event => setPlaylistId(event.target.value)}><option value="">Choose a playlist</option>{playlists.map(playlist => <option key={playlist.id} value={playlist.id}>{playlist.name} · {playlist.count} {playlist.count === 1 ? 'track' : 'tracks'}</option>)}</select></label>
        {!playlists.length && <p className={styles.empty}>Create your first playlist, then add tracks from your library.</p>}
        {selectedPlaylist && <PlaylistEditor key={selectedPlaylist.id} playlist={selectedPlaylist} onDeleted={() => { setPlaylistId(''); playlistSelect.current?.focus(); }} />}
        <details className={styles.details}><summary>Deleted playlists · {data.playlists.filter(p => p.deletedAt).length}</summary><p>Deleting a playlist keeps your audio files. Restore returns its name, tracks and order.</p>
          {data.playlists.filter(p => p.deletedAt).map(playlist => <div className={styles.deletedRow} key={playlist.id}><span>{playlist.name} · {playlist.count} {playlist.count === 1 ? 'track' : 'tracks'}</span><DesktopAction label="Restore" ariaLabel={`Restore ${playlist.name}`} disabled={desktop.busy} onClick={() => void desktop.run({ kind: 'restore-playlist', id: playlist.id }, `${playlist.name} restored.`).then(() => { setPlaylistId(playlist.id); playlistSelect.current?.focus(); }).catch(ignore)} /></div>)}
          {!data.playlists.some(p => p.deletedAt) && <p>No deleted playlists.</p>}
        </details>
      </section>
    </div>
  </div>;
}

function TrackInfo({ track }: { track: DesktopTrack }) {
  return <div className={styles.trackInfo}><strong>{track.title}</strong><span>{track.artist || 'Unknown artist'}</span><small>{track.genre} · {duration(track.duration)}</small></div>;
}

function PlaylistEditor({ playlist, onDeleted }: { playlist: DesktopPlaylist; onDeleted: () => void }) {
  const desktop = useDesktopSurface()!;
  const data = desktop.library.data!;
  const uid = useId();
  const [addId, setAddId] = useState('');
  const [selectedTrack, setSelectedTrack] = useState('');
  const form = useZodForm(desktopPlaylistCreateSchema, { name: playlist.name });
  const tracksById = new Map([...data.allTracks, ...data.tracks].map(track => [track.id, track]));
  const update = (trackIds: string[], success: string) => desktop.run({ kind: 'edit-playlist', id: playlist.id, name: playlist.name, trackIds }, success);
  const move = (delta: number) => {
    const index = playlist.trackIds.indexOf(selectedTrack), nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || nextIndex >= playlist.trackIds.length) return;
    const ids = [...playlist.trackIds];
    [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!];
    void update(ids, 'Playlist order saved.').catch(ignore);
  };
  const index = playlist.trackIds.indexOf(selectedTrack);
  return <div className={styles.playlistEditor} data-playlist-editor>
    <h4>{playlist.name}</h4><p>{data.selected === playlist.id ? 'Current playback source · ' : ''}{playlist.count} {playlist.count === 1 ? 'track' : 'tracks'} · plays in the order below, then repeats.</p>
    <div className={styles.actions}><DesktopAction label="Play playlist" disabled={desktop.busy || !playlist.count} onClick={() => void desktop.selectSource(playlist.id, true).catch(ignore)} />
      <DesktopAction label="Delete playlist" disabled={desktop.busy} onClick={() => void desktop.run({ kind: 'delete-playlist', id: playlist.id }, `${playlist.name} moved to Deleted playlists. Your audio files are kept.`).then(onDeleted).catch(ignore)} /></div>
    <form className={styles.form} onSubmit={form.handleSubmit(async values => { try { await desktop.run({ kind: 'edit-playlist', id: playlist.id, name: values.name, trackIds: playlist.trackIds }, 'Playlist renamed.'); } catch {} })}>
      <TextField control={form.control} name="name" label="Playlist name" /><DesktopAction label="Save name" submit disabled={desktop.busy} />
    </form>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); if (addId && !playlist.trackIds.includes(addId)) void update([...playlist.trackIds, addId], 'Track added to playlist.').then(() => setAddId('')).catch(ignore); }}>
      <label htmlFor={`${uid}-add`}>Add from library<select id={`${uid}-add`} value={addId} required onChange={event => setAddId(event.target.value)}><option value="">Choose a track</option>{data.allTracks.map(track => <option key={track.id} value={track.id} disabled={playlist.trackIds.includes(track.id)}>{track.title} · {track.genre}{playlist.trackIds.includes(track.id) ? ' · already added' : ''}</option>)}</select></label>
      <DesktopAction label="Add to playlist" submit disabled={desktop.busy || !addId || playlist.trackIds.includes(addId)} />
    </form>
    {!playlist.trackIds.length ? <p className={styles.empty}>This playlist is empty. Add a track above.</p> : <fieldset className={styles.playlistOrder}><legend>Select a track to reorder, remove or play</legend>
      {playlist.trackIds.map((id, position) => <label key={id}><input type="radio" name={`${uid}-order`} checked={selectedTrack === id} onChange={() => setSelectedTrack(id)} /><span>{position + 1}. {tracksById.get(id)?.title || 'Unavailable track'}<small>{tracksById.get(id)?.artist || 'The audio file is not currently available'}</small></span></label>)}
    </fieldset>}
    {index >= 0 && <div className={styles.actions}><DesktopAction label="Play selected track" disabled={desktop.busy || !tracksById.has(selectedTrack)} onClick={() => void desktop.selectSource(playlist.id).then(() => desktop.playTrack(selectedTrack)).catch(ignore)} />
      <DesktopAction label="Move up" disabled={desktop.busy || index === 0} onClick={() => move(-1)} /><DesktopAction label="Move down" disabled={desktop.busy || index === playlist.trackIds.length - 1} onClick={() => move(1)} />
      <DesktopAction label="Remove from playlist" disabled={desktop.busy} onClick={() => void update(playlist.trackIds.filter(id => id !== selectedTrack), 'Track removed from playlist. Its audio file is kept.').catch(ignore)} /></div>}
  </div>;
}

export function SettingsPanel() {
  const desktop = useDesktopSurface()!;
  const skin = useSkinSelection();
  const themes = useThemeSwitcher();
  const uid = useId();
  const [folderError, setFolderError] = useState('');
  return <div className={styles.panel}>
    <header className={styles.panelIntro}><p className={styles.eyebrow}>Only on this computer</p><h2>Make yourself at home.</h2><p>Your library works without a login or a separate radio server.</p></header>
    <div className={styles.settingsGrid}><label htmlFor={`${uid}-skin`}>Player skin<select id={`${uid}-skin`} value={skin?.effectiveId || 'enochian'} onChange={event => skin?.setOverride(event.target.value)}><option value="classic">Original</option><option value="enochian">Enochian</option></select></label>
      <label htmlFor={`${uid}-palette`}>Color palette<select id={`${uid}-palette`} value={themes?.effectiveId || ''} onChange={event => themes?.setOverride(event.target.value)}>{themes?.themes.map(theme => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label></div>
    <section className={styles.section}><h3>Local storage</h3><p>Audio files and playlists stay on your computer. YouTube downloads remain in Recent after you add them to a genre station.</p>
      <dl className={styles.paths}><dt>Music folder</dt><dd>{desktop.library.data?.musicDir || 'Opening…'}</dd><dt>Recent YT downloads</dt><dd>{desktop.library.data?.downloadsDir || 'Opening…'}</dd></dl>
      <div className={styles.actions}><DesktopAction label="Open music folder" onClick={() => { setFolderError(''); void window.desktopPlayer?.openMusicFolder().catch(error => setFolderError(error instanceof Error ? error.message : String(error))); }} />
        <DesktopAction label="Open audio files" disabled={desktop.importing} onClick={() => void desktop.openFiles()} />
        <DesktopAction label="Refresh library" disabled={desktop.busy || desktop.importing} onClick={() => void desktop.run({ kind: 'rescan' }, 'Library refreshed.').catch(ignore)} /></div>
      {folderError && <p role="alert" className={styles.alert}>{folderError}</p>}
    </section>
  </div>;
}
