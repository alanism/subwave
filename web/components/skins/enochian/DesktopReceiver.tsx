'use client';

// The JBL reference defines the enclosure and hierarchy, not replacement
// controls. All tactile parts below are the user's actual atlas adapters.
import { useLayoutEffect, useState } from 'react';
import { hasPlayableSource, playbackSources, selectedInternetStation } from '@/lib/local-sources';
import { usePlayerAudio, usePlayerFeed } from '@/components/player/PlayerCore';
import Waveform from '../classic/Waveform';
import SourceTuner from './SourceTuner';
import type { DesktopSurfaceContext } from '@/components/desktop/DesktopContext';
import VolumeDial from './VolumeDial';
import { SourceDisplay, SourceMute, SourceSlider, type Finish } from './SourceControls';
import { ReceiverNavigationBank, ReceiverPower } from './ReceiverControls';
import type { ClickKind } from './vendor/feedback';
import styles from './DesktopReceiver.module.css';

type Props = {
  desktop: DesktopSurfaceContext; finish: Finish; title?: string | null; artist?: string | null;
  tunedIn: boolean; phaseLabel: string; volume: number; muted: boolean;
  onPower: () => void; onVolume: (value: number) => void; onMute: () => void; feedback: (kind: ClickKind) => void;
};

export default function DesktopReceiver({ desktop, finish, title, artist, tunedIn, phaseLabel, volume, muted, onPower, onVolume, onMute, feedback }: Props) {
  const { audioRef } = usePlayerAudio();
  const { trackStartedAt, nowPlaying } = usePlayerFeed();
  const library = desktop.library.data;
  const sources = playbackSources(library);
  const internet = selectedInternetStation(library);
  const selectedIndex = Math.max(0, sources.findIndex(source => source.id === library?.selected));
  const max = Math.max(1, sources.length - 1);
  const [input, setInput] = useState(selectedIndex / max);
  useLayoutEffect(() => { setInput(selectedIndex / max); }, [selectedIndex, max]);
  const sourceAt = (value: number) => sources[Math.round(value * max)];
  const selected = sources[selectedIndex];
  const empty = !hasPlayableSource(library);
  const selectInput = (value: number) => {
    const source = sourceAt(value);
    if (source && source.id !== library?.selected) void desktop.selectSource(source.id).catch(() => setInput(selectedIndex / max));
  };
  return <main className={styles.room} data-enochian-receiver={finish} onKeyDown={event => {
    if (event.target instanceof HTMLElement && event.target.closest('button, a, [role="slider"]')) event.stopPropagation();
  }}>
    <div className={styles.receiver} aria-label="Enochian audio receiver">
      <div className={styles.cabinet} aria-hidden="true"><div className={styles.vents} /></div>
      <div className={styles.faceplate}>
        <header className={styles.identity}><strong>SUB/WAVE</strong><span>ENOCHIAN</span><small>LOCAL RECEIVER</small></header>
        <section className={styles.input} aria-label="Input source">
          <div className={styles.dialMount}><VolumeDial label="Input source knob" value={input} steps={Math.max(2, sources.length)} valueText={value => sourceAt(value)?.name || 'Opening library'} onChange={setInput} onCommit={selectInput} disabled={desktop.busy || sources.length < 2} finish={finish} /></div>
          <div className={styles.dialLabel}><span>TUNING</span><strong title={sourceAt(input)?.name}>{sourceAt(input)?.name || 'Opening library'}</strong></div>
        </section>
        <section className={styles.screen} aria-label="Now playing">
          <SourceDisplay>
            <span className={styles.displayTop}><span>{selected?.name || 'LOCAL MUSIC'}</span><span role="status">{phaseLabel}</span></span>
            <strong className={styles.trackTitle} title={title || undefined}>{title || internet?.name || (empty ? 'No tracks in this source' : 'Ready to play')}</strong>
            <span className={styles.artist} title={artist || undefined}>{artist || (internet ? 'Live internet radio' : empty ? 'Open files or find music on YouTube' : 'Press power to listen')}</span>
            <Waveform audioRef={audioRef} tunedIn={tunedIn} trackStartedAt={trackStartedAt} duration={nowPlaying?.duration || 0} presentation="receiver" className={styles.spectrum} />
            <SourceTuner channels={sources} value={Math.round(input * max)} disabled={desktop.busy || sources.length < 2}
              onPreview={index => setInput(index / max)} onCommit={index => { feedback('thock'); selectInput(index / max); }} />
            <span className={styles.displayBottom}><span>{internet ? `LIVE · ${internet.country || 'INTERNET'}` : `${library?.tracks.length ?? 0} ${library?.tracks.length === 1 ? 'TRACK' : 'TRACKS'}`}</span><span>{muted ? 'MUTED' : `VOL ${Math.round(volume * 100)}`}</span></span>
          </SourceDisplay>
        </section>
        <section className={styles.volume} aria-label="Volume controls">
          <div className={styles.dialMount}><VolumeDial value={volume} finish={finish} onChange={onVolume} /></div>
          <div className={styles.dialLabel}><span>VOLUME</span><strong>{muted ? 'MUTED' : `${Math.round(volume * 100)}%`}</strong></div>
        </section>
        <div className={styles.power}><ReceiverPower on={tunedIn} status={phaseLabel} finish={finish} onToggle={onPower} feedback={feedback} /><span>POWER</span></div>
        <nav className={styles.functionKeys} aria-label="Receiver functions"><ReceiverNavigationBank finish={finish} items={[
          { id: 'files', label: desktop.importing ? 'Importing…' : 'Open files', disabled: desktop.importing },
          { id: 'library', label: 'Library', ariaLabel: 'Library & Playlists' },
          { id: 'stations', label: 'Genres', ariaLabel: 'Genre stations' },
          { id: 'youtube', label: 'YouTube' }, { id: 'radio', label: 'Radio', ariaLabel: 'Internet radio' },
          { id: 'next', label: 'Next', ariaLabel: 'Next track', disabled: desktop.busy || !library?.tracks.length },
          { id: 'settings', label: 'Settings' },
        ] as const} onSelect={id => { feedback('thock'); if (id === 'files') void desktop.openFiles(); else if (id === 'next') void desktop.run({ kind: 'next' }).catch(() => {}); else desktop.openPanel(id); }} /></nav>
        <div className={styles.mute}><SourceMute on={muted} finish={finish} onChange={next => { if (next !== muted) { feedback('tick'); onMute(); } }} /><span>MUTE</span></div>
      </div>
      <div className={styles.plinth} aria-hidden="true" /><div className={styles.feet} aria-hidden="true"><i /><i /></div>
    </div>
    <details className={styles.fineVolume}><summary>Fine volume control</summary><div><SourceSlider value={volume} finish={finish} onChange={onVolume} /><span>{Math.round(volume * 100)}%</span></div></details>
  </main>;
}
