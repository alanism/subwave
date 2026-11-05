'use client';

// Presentation only: the shell retains the audio element, station gate and
// remote controls. The power key is also the browser's initial audio gesture.
import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useThemeSwitcher } from '@/components/ThemeProvider';
import { Sheet } from '@/components/ui/sheet';
import { usePlayerActions, usePlayerAudio, usePlayerFeed } from '@/components/player/PlayerCore';
import { useTuneInGate } from '@/components/player/useTuneInGate';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { hasPlayableSource } from '@/lib/local-sources';
import { DESKTOP_EDITION } from '@/lib/desktop';
import { useDesktopSurface } from '@/components/desktop/DesktopContext';
import type { SkinProps } from '../types';
import { listenPhase, stationIdentity } from '../shared';
import VolumeDial from './VolumeDial';
import DesktopReceiver from './DesktopReceiver';
import { SourceDisplay, SourceSlider, SourceMute, type Finish } from './SourceControls';
import { ReceiverPower, ReceiverButtonBank } from './ReceiverControls';
import { useSourceFeedback } from './vendor/feedback';
import './vendor/fonts.css';
import './vendor/controls.css';
import styles from './Enochian.module.css';

const ReceiverPanel = dynamic(() => import('./ReceiverPanel'));
type Panel = 'request' | 'timeline' | 'schedule' | 'booth';
const TITLES: Record<Panel, string> = {
  request: 'Make a request', timeline: 'Timeline', schedule: 'Schedule', booth: 'Booth feed',
};

export default function EnochianSkin({ contained, portalNode }: SkinProps) {
  const { nowPlaying, dj, activeShow, context } = usePlayerFeed();
  const { tunedIn, status, volume, muted, offline } = usePlayerAudio();
  const { setVolume, toggleMute } = usePlayerActions();
  const { handleTune, showOverlay, tuneInFromOverlay } = useTuneInGate();
  const themes = useThemeSwitcher();
  const desktop = useDesktopSurface();
  const [panel, setPanel] = useState<Panel | null>(null);
  const { stationName } = stationIdentity(dj, activeShow, context);
  const phase = listenPhase({ tunedIn, status, offline });
  const localEmpty = !!desktop?.library.data && !hasPlayableSource(desktop.library.data);
  const phaseLabel = desktop
    ? (localEmpty ? 'NO TRACKS' : status === 'playing' ? 'PLAYING' : tunedIn ? 'STARTING' : 'STOPPED')
    : { offline: 'OFF AIR', standby: 'STANDBY', connecting: 'TUNING', live: 'ON AIR' }[phase];
  const feedback = useSourceFeedback(!muted);
  const power = showOverlay ? tuneInFromOverlay : handleTune;
  const localPower = () => { if (desktop && !tunedIn && !hasPlayableSource(desktop.library.data)) desktop.openPanel('library'); else power(); };
  const finish: Finish = themes?.effectiveId === 'enochian-obsidian' ? 'obsidian' : 'ivory';

  useKeyboardShortcuts({
    space: desktop ? localPower : handleTune, k: desktop ? localPower : handleTune, m: toggleMute,
    arrowup: () => setVolume(v => Math.min(1, v + 0.05)),
    arrowdown: () => setVolume(v => Math.max(0, v - 0.05)),
    r: () => { if (desktop) desktop.openPanel('library'); else setPanel('request'); },
  }, { disabled: panel !== null || !!desktop?.panel });

  if (desktop) return <DesktopReceiver desktop={desktop} finish={finish} title={nowPlaying?.title} artist={nowPlaying?.artist}
    tunedIn={tunedIn} phaseLabel={phaseLabel} volume={volume} muted={muted} onPower={localPower} onVolume={setVolume} onMute={toggleMute} feedback={feedback} />;

  return (
    <div className={styles.page} data-contained={contained || undefined}  onKeyDown={e => {
      // Native buttons and the dial own their keys; a focused REQUEST key must
      // open requests on Space rather than toggling the broadcast underneath it.
      if (e.target instanceof HTMLElement && e.target.closest('button, a, [role="slider"]')) e.stopPropagation();
    }}>
      <header className={styles.header}>
        <h1>{stationName}</h1>
        <div className={styles.headerTools}><span>Enochian</span><ThemeSwitcher /></div>
      </header>
      <main className={styles.main}>
        <section className={styles.nowPlaying} aria-label="Now playing">
          <div className={styles.sectionHead}><h2>Now playing</h2><span role="status">{phaseLabel}</span></div>
          <SourceDisplay>{[
            offline ? 'The station is off air' : (nowPlaying?.title || 'Waiting for the broadcast'),
            offline ? 'Waiting for the station to return.' : (nowPlaying?.artist || 'Tune in to hear what is on.'),
          ].join('\n')}</SourceDisplay>
        </section>
        <div className={styles.instruments}>
          <section className={styles.instrument} aria-label="Volume controls">
            <div className={styles.sectionHead}><h2>Volume</h2><span>{Math.round(volume * 100)}%</span></div>
            <div className={styles.volumeStage}>
              <VolumeDial value={volume} finish={finish} onChange={setVolume} />
              <SourceSlider value={volume} finish={finish} onChange={setVolume} />
            </div>
          </section>
          <section className={styles.instrument} aria-label="Playback and station controls">
            <div className={styles.sectionHead}><h2>Playback</h2><span>{muted ? 'MUTED' : 'SOUND ON'}</span></div>
            <div className={styles.transportStage}>
              <div className={styles.transportRow}>
                <ReceiverPower on={tunedIn} status={phaseLabel} finish={finish} onToggle={power} feedback={feedback} />
                <div className={styles.controlColumn}><SourceMute on={muted} finish={finish} onChange={next => { if (next !== muted) { feedback(next ? 'thock' : 'tick'); toggleMute(); } }} /><span>MUTE</span></div>
              </div>
              <ReceiverButtonBank active={panel} finish={finish} onSelect={setPanel} feedback={feedback} />
            </div>
          </section>
        </div>
      </main>
      <footer className={styles.footer}><span>SUB/WAVE · ENOCHIAN</span><nav aria-label="Station"><button type="button" onClick={() => setPanel('booth')}>BOOTH</button><a href={DESKTOP_EDITION ? '/admin/settings' : '/admin'}>{DESKTOP_EDITION ? 'SETTINGS' : 'ADMIN'}</a></nav></footer>
      <Sheet open={panel !== null} onOpenChange={open => { if (!open) setPanel(null); }} title={panel ? TITLES[panel] : ''} container={portalNode}>
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          {panel && <ReceiverPanel panel={panel} onClose={() => setPanel(null)} />}
        </Suspense>
      </Sheet>
    </div>
  );
}
