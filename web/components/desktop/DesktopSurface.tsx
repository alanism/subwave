'use client';

import { useCallback, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import * as Dialog from '@radix-ui/react-dialog';
import { useQueryClient } from '@tanstack/react-query';
import AdminQueryProvider from '@/components/admin/AdminQueryProvider';
import { usePlayerActions, usePlayerAudio } from '@/components/player/PlayerCore';
import { useSkinSelection } from '@/components/skins/SkinContext';
import { Button } from '@/components/ui/button';
import type { DesktopAgentAction, DesktopCommand, DesktopPanel } from '@/lib/desktop';
import type { DesktopLibrary } from '@/lib/schemas.generated';
import { hasPlayableSource, selectedInternetStation } from '@/lib/local-sources';
import InternetRadioPanel from './InternetRadioPanel';
import { DesktopContext } from './DesktopContext';
import { desktopKeys, useDesktopLibrary, useLocalCommand, type LocalCommand } from './queries';
import { LibraryPanel, SettingsPanel, StationsPanel } from './DesktopPanels';
import styles from './DesktopSurface.module.css';

export { useDesktopSurface } from './DesktopContext';
const YoutubePanel = dynamic(() => import('@/components/admin/youtube/YoutubePanel'), { loading: () => <p role="status">Opening YouTube…</p> });
const titles: Record<DesktopPanel, string> = { youtube: 'YouTube & Recent downloads', library: 'Library & Playlists', stations: 'Genre stations', settings: 'Local settings', radio: 'Internet radio' };
const explain = (error: unknown) => error instanceof Error ? error.message : String(error);
const operationLabels: Record<LocalCommand['kind'], string> = {
  'save-radio': 'Saving radio preset…', 'remove-radio': 'Removing radio preset…',
  select: 'Changing playback source…', play: 'Selecting track…', 'play-download': 'Preparing MP3 playback…',
  copy: 'Copying to genre…', next: 'Selecting next track…', rescan: 'Refreshing library…',
  'create-station': 'Creating genre station…', 'create-playlist': 'Creating playlist…',
  'edit-playlist': 'Saving playlist…', 'delete-playlist': 'Moving playlist to Deleted…', 'restore-playlist': 'Restoring playlist…',
};

export default function DesktopSurface({ children }: { children: ReactNode }) {
  return <AdminQueryProvider><Surface>{children}</Surface></AdminQueryProvider>;
}

function Surface({ children }: { children: ReactNode }) {
  const library = useDesktopLibrary();
  const command = useLocalCommand();
  const cache = useQueryClient();
  const skin = useSkinSelection();
  const { play, stop, toggleMute, setVolume, transportIntent, isTunedIn } = usePlayerActions();
  const { audioRef } = usePlayerAudio();
  const [panel, setPanel] = useState<DesktopPanel | null>(null);
  const [importing, setImporting] = useState(false);
  const [chosenDestination, setImportDestination] = useState('');
  const [newPlaylistRequest, setNewPlaylistRequest] = useState(0);
  const genres = library.data?.stations.filter(station => station.id !== 'all') || [];
  const importDestination = genres.some(station => station.id === chosenDestination) ? chosenDestination : (genres.find(station => station.id === library.data?.selected)?.id || genres.find(station => station.id === 'local-files')?.id || genres[0]?.id || '');
  const importBusy = useRef(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const focusReturn = useRef<HTMLElement | null>(null);
  const playbackRequest = useRef(0);
  const playbackTicket = () => ({ request: ++playbackRequest.current, intent: transportIntent.current });
  const ticketCurrent = (ticket: ReturnType<typeof playbackTicket>) => ticket.request === playbackRequest.current && ticket.intent === transportIntent.current;
  const playerButton = useRef<HTMLButtonElement>(null);
  const openPanel = useCallback((next: DesktopPanel | null) => {
    if (next && document.activeElement instanceof HTMLElement && document.activeElement !== document.body && !document.activeElement.closest('[role="dialog"]')) focusReturn.current = document.activeElement;
    if (next !== 'library') setNewPlaylistRequest(0);
    setPanel(next);
  }, []);

  useEffect(() => {
    const bridge = window.desktopPlayer;
    if (!bridge) return;
    let live = true;
    const unsubscribe = bridge.onPanel(openPanel);
    void bridge.initialPanel().then(next => { if (live && next) openPanel(next); }, error => { if (live) setError(explain(error)); });
    const progress = bridge.onImportProgress?.(value => setNotice(value.name ? `Importing ${value.completed + 1} of ${value.total}: ${value.name}` : `Finished preparing ${value.total} files.`));
    return () => { live = false; unsubscribe(); progress?.(); };
  }, [openPanel]);

  async function run(value: LocalCommand, success?: string) {
    const nextTicket = value.kind === 'next' ? playbackTicket() : null;
    const wasPlaying = isTunedIn();
    if (value.kind === 'remove-radio' && library.data?.selected === value.id) stop();
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const playlistEditor = trigger?.closest<HTMLElement>('[data-playlist-editor]');
    const actionRow = trigger?.closest('li');
    setError(''); setNotice('');
    try {
      const result = await command.mutateAsync(value);
      if (nextTicket && wasPlaying && ticketCurrent(nextTicket)) { stop(); play(); }
      if (success) setNotice(success);
      return result;
    } catch (error) { setError(explain(error)); throw error; }
    finally {
      // A temporarily disabled action loses native focus. Restore it only
      // when the user has not focused something else during the operation.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (document.activeElement === document.body || document.activeElement?.getAttribute('role') === 'dialog') {
          // A completed Add action can remain disabled until another track is
          // chosen. Return to its selector rather than leaving keyboard focus
          // on the dialog container.
          const formTarget = trigger?.isConnected ? trigger.closest('form')?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),button:not(:disabled)') : null;
          const playlistTarget = playlistEditor?.isConnected ? playlistEditor.querySelector<HTMLElement>('input[type="radio"]:checked') || playlistEditor.querySelector<HTMLElement>('select') : null;
          const rowTarget = actionRow?.isConnected ? actionRow.querySelector<HTMLElement>('button:not(:disabled)') : null;
          const target = trigger?.isConnected && !trigger.matches(':disabled') ? trigger : formTarget || playlistTarget || rowTarget;
          target?.focus();
        }
      }));
    }
  }
  async function openFiles(stationId?: string) {
    if (importBusy.current) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    importBusy.current = true; setImporting(true); setError(''); setNotice('Choose audio files. Selected files will be prepared for your library.');
    try {
      if (!window.desktopPlayer) throw new Error('Open files is available in the installed Linux app.');
      const result = await window.desktopPlayer.openFiles(stationId || importDestination || undefined);
      if (result.cancelled) setNotice('No files added.');
      else {
        setNotice(`${result.imported} ${result.imported === 1 ? 'file' : 'files'} added. Existing files are kept once.`);
        if (result.errors.length) setError(result.errors.join('\n'));
        await cache.invalidateQueries({ queryKey: desktopKeys.library });
        if (result.imported) openPanel('library');
      }
    } catch (error) { setError(explain(error)); }
    finally { importBusy.current = false; setImporting(false); requestAnimationFrame(() => { if (previousFocus?.isConnected) previousFocus.focus(); }); }
  }
  async function selectSource(id: string, start = false) {
    const ticket = playbackTicket(), wasPlaying = isTunedIn();
    const selected = await run({ kind: 'select', id }) as DesktopLibrary;
    if (!ticketCurrent(ticket)) return;
    const source = selected.stations.find(s => s.id === id) || selected.playlists.find(p => p.id === id) || selected.internetStations?.find(p => p.id === id);
    if (!hasPlayableSource(selected)) { stop(); setNotice('This collection is empty. Add songs from files or YouTube.'); }
    else {
      // A live MP3 decoder may retain seconds of the previous collection.
      // Rejoin on an explicit source change, retaining the same audio node.
      if (start || wasPlaying) { stop(); play(); }
      setNotice(`${source?.name || 'Music source'} selected.`);
    }
  }
  async function playTrack(id: string) {
    const ticket = playbackTicket();
    await run({ kind: 'play', id });
    if (!ticketCurrent(ticket)) return;
    stop(); play();
    setNotice('Selected track ready.');
  }
  async function playDownload(id: string) {
    const ticket = playbackTicket();
    await run({ kind: 'play-download', id });
    if (!ticketCurrent(ticket)) return;
    stop(); play();
    setNotice('Downloaded MP3 selected.');
  }
  const handleDesktopCommand = useEffectEvent((action: DesktopCommand) => {
    if (action === 'open-files') void openFiles();
    else if (action === 'new-playlist') { openPanel('library'); setNewPlaylistRequest(value => value + 1); }
    else if (action === 'toggle-mute') toggleMute();
    else if (action === 'toggle-playback') {
      if (isTunedIn()) stop();
      else if (hasPlayableSource(library.data)) play();
      else openPanel('library');
    } else if (action === 'next' && !command.isPending && library.data?.tracks.length) void run({ kind: 'next' }).catch(() => {});
  });
  useEffect(() => window.desktopPlayer?.onCommand?.(action => handleDesktopCommand(action)), []);
  const handleAgentCommand = useEffectEvent(async (action: DesktopAgentAction, args: Record<string, unknown>) => {
    const snapshot = () => {
      const audio = audioRef.current;
      return { playing: !!audio && !audio.paused && audio.readyState >= 2, tunedIn: isTunedIn(),
        volume: Math.round((audio?.volume ?? 0) * 100), muted: audio?.volume === 0,
        currentTime: audio?.currentTime || 0, error: audio?.error?.message || null };
    };
    if (action === 'stop') stop();
    else if (action === 'play-track') await playTrack(String(args.trackId));
    else if (action === 'play-source') await selectSource(String(args.sourceId), true);
    else if (action === 'play-download') await playDownload(String(args.jobId));
    else if (action === 'next') await run({ kind: 'next' });
    else if (action === 'set-volume') {
      if (typeof args.volume !== 'number' || args.volume < 0 || args.volume > 100) throw new Error('Volume must be between 0 and 100.');
      setVolume(args.volume / 100);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (action.startsWith('play-')) {
      const intent = transportIntent.current, deadline = Date.now() + 12_000;
      while (!snapshot().playing && Date.now() < deadline && intent === transportIntent.current && isTunedIn()) {
        if (audioRef.current?.error) throw new Error(audioRef.current.error.message || 'Audio could not play.');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!snapshot().playing) throw new Error(isTunedIn() ? 'Playback did not start. Check the selected file and audio output, then retry.' : 'Playback is stopped. The earlier request did not start audio.');
    }
    return snapshot();
  });
  useEffect(() => window.desktopPlayer?.onAgentCommand?.((action, args) => handleAgentCommand(action, args)), []);
  const source = library.data?.stations.find(s => s.id === library.data?.selected)?.name
    || library.data?.playlists.find(p => p.id === library.data?.selected)?.name || selectedInternetStation(library.data)?.name || 'Your local music';
  const visibleError = error || (library.error ? explain(library.error) : library.data?.error);
  const context = { panel, openPanel, library, busy: command.isPending, pendingKind: command.isPending ? command.variables?.kind ?? null : null, importing, importDestination, setImportDestination, newPlaylistRequest, openFiles, run, selectSource, playTrack, playDownload };
  const operationStatus = command.isPending && command.variables ? operationLabels[command.variables.kind] : notice;
  return <DesktopContext.Provider value={context}>
    <div className={styles.surface} data-skin={skin?.effectiveId}>
      <nav className={styles.toolbar} aria-label="Local music">
        <button ref={playerButton} className={styles.brand} type="button" onClick={() => openPanel(null)}>SUB/WAVE <span>LOCAL</span></button>
        <div className={styles.navButtons}>
          {(['youtube', 'radio', 'stations', 'library'] as const).map(id => <Button key={id} type="button" variant="outline" aria-haspopup="dialog" aria-expanded={panel === id} onClick={() => openPanel(id)}>{id === 'youtube' ? 'YouTube' : id === 'radio' ? 'Internet radio' : id === 'stations' ? 'Genre stations' : 'Library & Playlists'}</Button>)}
          <Button type="button" variant="outline" disabled={importing} onClick={() => void openFiles()}>{importing ? 'Importing…' : 'Open files'}</Button>
          {skin?.effectiveId === 'classic' && <Button type="button" variant="outline" disabled={command.isPending || !library.data?.tracks.length} onClick={() => void run({ kind: 'next' }).catch(() => {})}>Next track</Button>}
          <Button type="button" variant="outline" aria-haspopup="dialog" aria-expanded={panel === 'settings'} onClick={() => openPanel('settings')}>Settings</Button>
        </div>
      </nav>
      <div className={styles.statusBar}><span>{source}</span><span role={panel ? undefined : 'status'}>{operationStatus || (library.isPending ? 'Opening your library…' : `${library.data?.allTracks.length ?? 0} local tracks`)}</span></div>
      {visibleError && !panel && <div className={styles.alert} role="alert">{visibleError} <button type="button" disabled={command.isPending} onClick={() => { if (selectedInternetStation(library.data)) void selectSource(library.data!.selected, true).catch(() => {}); else void run({ kind: 'rescan' }, 'Library refreshed.').catch(() => {}); }}>Retry / refresh</button></div>}
      <div className={styles.stage}>{children}</div>
      <Dialog.Root open={panel !== null} onOpenChange={open => { if (!open) openPanel(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.dialog} aria-describedby={undefined} onKeyDown={event => event.stopPropagation()}
            onCloseAutoFocus={event => { event.preventDefault(); (focusReturn.current?.isConnected ? focusReturn.current : playerButton.current)?.focus(); }}>
            <div className={styles.dialogHeader}><Dialog.Title>{panel ? titles[panel] : ''}</Dialog.Title><Dialog.Close asChild><Button type="button" variant="outline" aria-label="Close local panel">Close · Esc</Button></Dialog.Close></div>
            <div className={styles.panelBody} data-skin={skin?.effectiveId}>
              {visibleError && <div className={styles.alert} role="alert">{visibleError} <button type="button" disabled={command.isPending} onClick={() => { if (selectedInternetStation(library.data)) void selectSource(library.data!.selected, true).catch(() => {}); else void run({ kind: 'rescan' }, 'Library refreshed.').catch(() => {}); }}>Retry / refresh</button></div>}
              <p className={styles.operationStatus} role="status">{operationStatus}</p>
              {panel === 'youtube' && <YoutubePanel />}
              {panel === 'library' && <LibraryPanel />}
              {panel === 'stations' && <StationsPanel />}
              {panel === 'radio' && <InternetRadioPanel />}
              {panel === 'settings' && <SettingsPanel />}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  </DesktopContext.Provider>;
}
