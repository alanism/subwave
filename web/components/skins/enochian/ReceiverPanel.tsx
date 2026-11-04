'use client';

import { useState } from 'react';
import { usePlayerActions, usePlayerFeed } from '@/components/player/PlayerCore';
import TimelineDrawer from '../classic/drawers/TimelineDrawer';
import BoothDrawer from '../classic/drawers/BoothDrawer';
import RequestDrawer from '../classic/drawers/RequestDrawer';
import ScheduleDrawer from '../classic/drawers/ScheduleDrawer';

/** Reuse public listener surfaces, including their request outcome handling. */
export default function ReceiverPanel({ panel, onClose }: {
  panel: 'timeline' | 'booth' | 'request' | 'schedule';
  onClose: () => void;
}) {
  const { state, session, nowPlaying, context, activeShow, timezone, locale } = usePlayerFeed();
  const { submitRequest, pollRequest } = usePlayerActions();
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);

  if (panel === 'timeline') return <TimelineDrawer upcoming={state.upcoming} history={state.history} />;
  if (panel === 'booth') return <BoothDrawer items={session.messages} timezone={timezone} locale={locale} />;
  if (panel === 'schedule') return <ScheduleDrawer activeShow={activeShow} context={context} />;
  return <RequestDrawer
    requestText={text} setRequestText={setText}
    requesterName={name} setRequesterName={setName}
    isSubmitting={sending}
    onSubmit={async () => {
      if (sending || !text.trim()) return null;
      setSending(true);
      try { return await submitRequest(text, name); }
      finally { setSending(false); }
    }}
    onPoll={pollRequest} onClose={onClose}
    nowPlaying={nowPlaying} context={context}
  />;
}
