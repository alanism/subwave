'use client';

// Presentation only: the shell retains the audio element, station gate and
// remote controls. The power key is also the browser's initial audio gesture.
import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { Power } from 'lucide-react';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import { useThemeSwitcher } from '@/components/ThemeProvider';
import { Sheet } from '@/components/ui/sheet';
import { usePlayerActions, usePlayerAudio, usePlayerFeed } from '@/components/player/PlayerCore';
import { useTuneInGate } from '@/components/player/useTuneInGate';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import type { SkinProps } from '../types';
import { listenPhase, stationIdentity } from '../shared';
import VolumeDial from './VolumeDial';
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
  const [panel, setPanel] = useState<Panel | null>(null);
  const { stationName } = stationIdentity(dj, activeShow, context);
  const phase = listenPhase({ tunedIn, status, offline });
  const phaseLabel = { offline: 'OFF AIR', standby: 'STANDBY', connecting: 'TUNING', live: 'ON AIR' }[phase];
  const power = showOverlay ? tuneInFromOverlay : handleTune;

  useKeyboardShortcuts({
    space: handleTune, k: handleTune, m: toggleMute,
    arrowup: () => setVolume(v => Math.min(1, v + 0.05)),
    arrowdown: () => setVolume(v => Math.max(0, v - 0.05)),
    r: () => setPanel('request'),
  }, { disabled: panel !== null });

  return (
    <div className={styles.page} data-contained={contained || undefined} onKeyDown={e => {
      // Native buttons and the dial own their keys; a focused REQUEST key must
      // open requests on Space rather than toggling the broadcast underneath it.
      if (e.target instanceof HTMLElement && e.target.closest('button, a, [role="slider"]')) e.stopPropagation();
    }}>
      <header className={styles.header}>
        <a href="/listen" className={styles.brand}><span className={styles.brandDot} aria-hidden="true" />{stationName}</a>
        <div className={styles.headerRight}><span>Personal radio</span>{!!themes?.themes.length && <div className={styles.appearance}><ThemeSwitcher /><span aria-hidden="true">Appearance</span></div>}</div>
      </header>

      <main className={styles.main}>
        <section className={styles.receiver} aria-label="Enochian radio receiver">
          <div className={styles.nameplate}>
            <div className={styles.identity}><strong>{stationName}</strong><span>ENOCHIAN RECEIVER</span></div>
            <span className={styles.status} role="status"><i className={styles.lamp} data-on={phase === 'live' || phase === 'connecting'} aria-hidden="true" />{phaseLabel}</span>
          </div>

          <div className={styles.face}>
            <div className={styles.grille} aria-hidden="true" />
            <div className={styles.display}>
              <span className={styles.legend}>NOW PLAYING</span>
              <h1>{offline ? 'The station is off air' : (nowPlaying?.title || 'Waiting for the broadcast')}</h1>
              <p>{offline ? 'The receiver will reconnect when it returns.' : (nowPlaying?.artist || 'Tune in to hear what is on.')}</p>
              <div className={styles.signalRule} />
              <span className={styles.displayFooter}>ONE STATION / ONE SHARED STREAM</span>
            </div>
          </div>

          <div className={styles.controls}>
            <div className={styles.powerGroup}>
              <button type="button" className={styles.power} onClick={power} aria-label={tunedIn ? 'Tune out' : 'Tune in'} aria-pressed={tunedIn}><Power aria-hidden="true" /></button>
              <span>{tunedIn ? 'TUNE OUT' : 'TUNE IN'}</span>
            </div>
            <div className={styles.keys}>
              {(['request', 'timeline', 'schedule'] as const).map(key => <button type="button" className={styles.key} key={key} onClick={() => setPanel(key)}>{key}</button>)}
            </div>
            <VolumeDial value={volume} muted={muted} onChange={setVolume} onMute={toggleMute} />
          </div>
          <div className={styles.deviceFooter}><span>SUB/WAVE × ENOCHIAN</span><span>INTERNET RADIO</span></div>
        </section>
        <div className={styles.statement}><p>One broadcast. A shared frequency.</p><span>Your library. Your DJ. Your station.</span></div>
      </main>

      <footer className={styles.footer}><a href="/listen" aria-current="page">LISTEN</a><nav aria-label="Station"><button type="button" onClick={() => setPanel('booth')}>BOOTH</button><a href="/admin">ADMIN</a></nav></footer>
      <Sheet open={panel !== null} onOpenChange={open => { if (!open) setPanel(null); }} title={panel ? TITLES[panel] : ''} container={portalNode}>
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          {panel && <ReceiverPanel panel={panel} onClose={() => setPanel(null)} />}
        </Suspense>
      </Sheet>
    </div>
  );
}
