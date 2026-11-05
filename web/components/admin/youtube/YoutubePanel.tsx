'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { Controller, useFieldArray, useWatch } from 'react-hook-form';
import { useAdminAuth } from '@/lib/adminAuth';
import { useThemeSwitcher } from '@/components/ThemeProvider';
import { useSkinSelection } from '@/components/skins/SkinContext';
import { useDesktopSurface } from '@/components/desktop/DesktopContext';
import { DesktopAction } from '@/components/desktop/DesktopAction';
import { DESKTOP_EDITION } from '@/lib/desktop';
import { useZodForm, fieldAria } from '@/lib/form';
import { TextField, SelectField } from '@/lib/form-fields';
import { adminResponse, type AdminFetch } from '@/lib/admin-query';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { notify } from '@/lib/notify';
import { youtubeImportFormSchema, youtubeRoutingSchema, youtubeVideoId, type YoutubeJob, type YoutubeRoute, type YoutubeVideo } from '@/lib/schemas.generated';
import { SourceDisplay, SourceMute, type Finish } from '@/components/skins/enochian/SourceControls';
import SourceSearch from '@/components/skins/enochian/SourceSearch';
import '@/components/skins/enochian/vendor/fonts.css';
import '@/components/skins/enochian/vendor/controls.css';
import {
  useYoutubeAdd, useYoutubeDestinations, useYoutubeDownload, useYoutubeDownloads, useYoutubeRetry,
  useYoutubeSearch, useYoutubeTools, useSaveYoutubeRoutes, type YoutubeStation,
} from './queries';
import styles from './YoutubePanel.module.css';

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const duration = (seconds: number | null) => seconds === null ? 'Duration unavailable' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const stateLabel = (job: YoutubeJob) => ({ queued: 'Queued', inspecting: 'Reading song details', downloading: `Downloading${job.progress === null ? '' : ` · ${Math.round(job.progress)}%`}`, ready: 'MP3 ready', importing: 'Adding to station', imported: 'Added to station', failed: 'Download failed' }[job.state]);

export default function YoutubePanel() {
  const { adminFetch, hydrated, needsAuth } = useAdminAuth();
  const ready = hydrated && !needsAuth;
  const themes = useThemeSwitcher();
  const skin = useSkinSelection();
  const desktop = useDesktopSurface();
  const classic = DESKTOP_EDITION && skin?.effectiveId === 'classic';
  const finish: Finish = themes?.effectiveId === 'enochian-obsidian' ? 'obsidian' : 'ivory';
  const destinations = useYoutubeDestinations(adminFetch, ready);
  const downloads = useYoutubeDownloads(adminFetch, ready);
  const tools = useYoutubeTools(adminFetch, ready);
  const search = useYoutubeSearch(adminFetch);
  const download = useYoutubeDownload(adminFetch);
  const retry = useYoutubeRetry(adminFetch);
  const add = useYoutubeAdd(adminFetch);
  const [editing, setEditing] = useState(false);
  const [saveBusy, setSaveBusy] = useState<ReadonlySet<string>>(() => new Set());
  const saveBusyRef = useRef(new Set<string>());
  const [filter, setFilter] = useState('all');
  const form = useZodForm(youtubeImportFormSchema, { query: '', stationId: '', autoImport: true });
  const preferences = useWatch({ control: form.control });
  const uid = useId();
  const routes = destinations.data?.routes ?? [];
  const stations = destinations.data?.stations ?? [];
  const jobs = downloads.data?.jobs ?? [];
  const stationName = (id: string) => stations.find(s => s.id === id)?.name || id;
  const matchingRoute = (video: YoutubeVideo) => jobs.find(j => j.videoId === video.id);
  const stationOptions = [{ value: '__auto__', label: 'Auto · match the genre station' }, ...routes.map(r => ({ value: r.stationId, label: `${r.genre} · ${stationName(r.stationId)}` }))];
  const isVideoUrl = !!youtubeVideoId(preferences.query || '');
  const busy = search.isPending || download.isPending;
  const canDownload = !!tools.data?.ytDlp.available && !!tools.data?.ffmpeg.available;
  const canAdd = !!tools.data?.libraryWritable && routes.length > 0;
  async function saveMp3(job: YoutubeJob) {
    if (saveBusyRef.current.has(job.id)) return;
    saveBusyRef.current.add(job.id);
    setSaveBusy(current => new Set(current).add(job.id));
    try {
      // admin-query-imperative: youtube-mp3-download
      const response = await adminResponse(adminFetch, `/youtube/downloads/${job.id}/file`);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = job.filename || `${job.videoId}.mp3`;
      anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) { notify.err(message(error)); }
    finally {
      saveBusyRef.current.delete(job.id);
      setSaveBusy(current => { const next = new Set(current); next.delete(job.id); return next; });
    }
  }
  function queue(video: YoutubeVideo) {
    download.mutate({ url: video.url, autoImport: preferences.autoImport ?? true, ...(preferences.stationId ? { stationId: preferences.stationId } : {}) });
  }
  const shown = jobs.filter(j => filter === 'all' || (filter === 'sorting' ? j.state === 'ready' && j.copies.length === 0 : j.copies.some(c => c.stationId === filter) || j.suggestedStationId === filter));
  return <div className={styles.panel} data-skin={classic ? 'classic' : 'enochian'} data-desktop={desktop ? true : undefined}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Library / YouTube</p><h1>YouTube imports<span>.</span></h1><p>Find a song. Keep the MP3. Send it to its genre station.</p></div>
      {desktop ? <DesktopAction label="Genre stations" onClick={() => desktop.openPanel('stations')} /> : <Button variant="outline" onClick={() => setEditing(v => !v)}>{editing ? 'Close genre routing' : 'Genre stations'}</Button>}
    </header>

    {(destinations.error || downloads.error || tools.error) && <p role="alert" className={styles.error}>{message(destinations.error || downloads.error || tools.error)}</p>}
    {tools.data && !canDownload && <p role="alert" className={styles.notice}>The station needs yt-dlp and FFmpeg to download MP3s. <Link href="#youtube-setup">Open setup details</Link>.</p>}

    {editing && destinations.data && <RouteEditor initial={routes} stations={stations} adminFetch={adminFetch} onSaved={() => setEditing(false)} />}

    <section className={styles.searchSection} aria-labelledby={`${uid}-search-title`}>
      <h2 id={`${uid}-search-title`}>Search YouTube or paste a video URL</h2>
      <form onSubmit={form.handleSubmit(values => {
        if (youtubeVideoId(values.query)) download.mutate({ url: values.query, autoImport: values.autoImport, ...(values.stationId ? { stationId: values.stationId } : {}) });
        else search.mutate({ query: values.query });
      })}>
        <div className={styles.searchRow}>
          <Controller name="query" control={form.control} render={({ field, fieldState }) => {
            const aria = fieldAria(`${uid}-query`, fieldState.error, { hasDescription: true });
            return <Field data-invalid={aria.invalid || undefined}>
              <FieldLabel {...aria.labelProps}>Song, artist or YouTube URL</FieldLabel>
              {classic ? <input {...aria.controlProps} className={styles.classicSearch} type="search" autoComplete="off" {...field} value={field.value || ''} placeholder="Song, artist or YouTube URL" /> : <SourceSearch {...aria.controlProps} finish={finish} value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} inputRef={field.ref} placeholder="Song, artist or YouTube URL" />}
              <FieldDescription {...aria.descriptionProps}>{classic ? '' : 'Open the red control. '}Search by song or artist, or paste a video URL and press Enter to download.</FieldDescription>
              <FieldError {...aria.errorProps} errors={fieldState.error ? [fieldState.error] : undefined} />
            </Field>;
          }} />
          <div className={styles.searchAction}><DesktopAction label={download.isPending ? 'Queuing' : search.isPending ? 'Searching' : isVideoUrl ? 'Download MP3' : 'Search'} submit disabled={busy || !canDownload} /></div>
        </div>
        <div className={styles.preferences}>
          <SelectField control={form.control} name="stationId" label="Destination station" options={stationOptions} emptyValue="__auto__" />
          <Controller name="autoImport" control={form.control} render={({ field, fieldState }) => {
            const aria = fieldAria(`${uid}-auto`, fieldState.error, { hasDescription: true });
            return <Field><FieldLabel {...aria.labelProps}>Add matching songs automatically</FieldLabel>
              <div className={styles.switchRow}>{classic ? <input {...aria.controlProps} ref={field.ref} type="checkbox" checked={field.value ?? true} onChange={event => field.onChange(event.target.checked)} onBlur={field.onBlur} /> : <SourceMute controlProps={{ ...aria.controlProps, onBlur: field.onBlur }} inputRef={field.ref} label="Add matching songs automatically" on={field.value ?? true} onChange={field.onChange} finish={finish} />}<span>MP3s with a clear genre match go to that station.</span></div>
              <FieldDescription {...aria.descriptionProps}>Other songs stay in Recent YT downloads until you choose a station.</FieldDescription>
            </Field>;
          }} />
        </div>
      </form>
      {(search.error || download.error) && <p role="alert" className={styles.error}>{message(search.error || download.error)}</p>}
      {search.isPending && (classic ? <p role="status">Searching YouTube…</p> : <SourceDisplay>SEARCHING YOUTUBE…</SourceDisplay>)}
      {search.data && !search.isPending && <div className={styles.results} aria-live="polite">
        <h3>{search.data.videos.length ? `${search.data.videos.length} ${search.data.videos.length === 1 ? 'result' : 'results'}` : 'No songs found. Try another search.'}</h3>
        {search.data.videos.map(video => {
          const existing = matchingRoute(video);
          return <article className={styles.result} key={video.id}>
            <div><a href={video.url} target="_blank" rel="noreferrer">{video.title}</a><p>{video.artist}</p><small>{video.channel} · {duration(video.duration)}</small></div>
            <DesktopAction label={existing?.state === 'failed' ? 'Retry download' : existing ? 'View download' : 'Download MP3'} disabled={download.isPending || retry.isPending || !canDownload} onClick={() => {
              if (existing?.state === 'failed') retry.mutate(existing.id);
              else if (existing) { setFilter('all'); requestAnimationFrame(() => { const row = document.getElementById(`${uid}-${existing.id}`); row?.scrollIntoView({ block: 'center' }); row?.focus(); }); }
              else queue(video);
            }} />
          </article>;
        })}
      </div>}
    </section>

    <section aria-labelledby={`${uid}-recent-title`} className={styles.recent}>
      <div className={styles.collectionHeader}><div><p className={styles.eyebrow}>{desktop ? 'Saved on this computer' : 'Saved on the station'} · {jobs.length} {jobs.length === 1 ? 'song' : 'songs'}</p><h2 id={`${uid}-recent-title`}>Recent YT downloads</h2></div>
        <label className={styles.filter}>Show<select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter recent downloads"><option value="all">All downloads</option><option value="sorting">Needs a station</option>{routes.map(r => <option key={r.stationId} value={r.stationId}>{r.genre} · {stationName(r.stationId)}</option>)}</select></label>
      </div>
      <p className={styles.help}>Your MP3s stay here after being added to Subwave. “Save MP3” also copies the file to this device.</p>
      {!routes.length && <p className={styles.notice}>Set up <button type="button" onClick={() => { if (desktop) desktop.openPanel('stations'); else setEditing(true); }}>genre stations</button> to sort downloads automatically.</p>}
      {tools.data && !tools.data.libraryWritable && <p className={styles.notice}>Downloads are available here. Connect a writable station music folder in <Link href="#youtube-setup">setup</Link> to add them to Subwave.</p>}
      {!shown.length && <div className={styles.empty}>{downloads.isPending ? 'Loading downloads…' : jobs.length ? 'No downloads match this filter.' : 'No downloads yet. Search above or paste a YouTube video URL.'}</div>}
      {shown.map(job => <article className={styles.download} key={job.id} id={`${uid}-${job.id}`} tabIndex={-1}>
        <div className={styles.downloadInfo}><span className={styles.status} role="status">{stateLabel(job)}</span><h3>{job.video?.title || job.videoId}</h3><p>{job.video?.artist || 'Waiting for song details'}</p>
          <small>{new Date(job.createdAt).toLocaleString()} {job.video?.duration ? `· ${duration(job.video.duration)}` : ''}</small>
          {job.suggestedStationId && !job.copies.length && <p>Genre match: {stationName(job.suggestedStationId)}</p>}
          {job.state === 'ready' && !job.suggestedStationId && !job.copies.length && <p>{desktop ? 'Add & play keeps a copy in Local files. You can also choose a genre below.' : 'Choose a genre station below.'}</p>}
          {job.copies.map(copy => <p key={copy.stationId}>Added to <strong>{stationName(copy.stationId)}</strong> · {copy.genre}{copy.scanWarning && <span className={styles.warning}>{copy.scanWarning}</span>}</p>)}
          {job.error && <p role="alert" className={styles.error}>{job.error}</p>}
        </div>
        {(job.state === 'ready' || job.state === 'importing' || job.state === 'imported') && <div className={styles.downloadActions}>
          {desktop && <DesktopAction label={job.copies.length ? 'Play' : 'Add & play'} disabled={desktop.busy || job.state === 'importing'} onClick={() => void desktop.playDownload(job.id).catch(() => {})} />}
          <DesktopAction label={saveBusy.has(job.id) ? 'Preparing MP3' : 'Save MP3'} disabled={saveBusy.has(job.id)} onClick={() => void saveMp3(job)} />
          <AddSong job={job} routes={routes} stations={stations} disabled={!canAdd || add.isPending || job.state === 'importing'} onAdd={stationId => add.mutate({ id: job.id, stationId })} />
        </div>}
        {job.state === 'failed' && (desktop ? <DesktopAction label={retry.isPending ? 'Queuing retry' : 'Retry download'} disabled={retry.isPending} onClick={() => retry.mutate(job.id)} /> : <Button variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>Retry download</Button>)}
      </article>)}
    </section>
    <details className={styles.setup} id="youtube-setup"><summary>Storage and setup details</summary>
      <p>MP3 folder: <code>{tools.data?.downloadsDir || 'Loading…'}</code></p>
      <p>Station music root: <code>{tools.data?.libraryRoot || 'Not connected'}</code></p>
      <p>yt-dlp: {tools.data?.ytDlp.version || 'Not available'} · FFmpeg: {tools.data?.ffmpeg.available ? 'Ready' : 'Not available'}</p>
      {desktop ? <p>Subwave manages these folders locally. Original downloads stay in Recent after you add copies to genre stations.</p> : <p>The music root must be writable by Subwave and watched by each destination station’s Navidrome library. Set YT_LIBRARY_PATH on the station, or use the YouTube Docker override described in docs/youtube-imports.md.</p>}
      <p>Genre routing uses video genre tags, title and description. If the evidence ties or is unclear, the song waits here for you to assign it.</p>
      {desktop ? <p>Adding a song to a genre keeps the current playback source. Choose Genre stations when you want to listen to a different collection.</p> : <p>Subwave’s built-in station profiles share one live broadcast. Adding a song does not switch the station on air. <Link href="/admin/stations">Manage stations</Link>.</p>}
    </details>
  </div>;
}

function AddSong({ job, routes, stations, disabled, onAdd }: { job: YoutubeJob; routes: YoutubeRoute[]; stations: YoutubeStation[]; disabled: boolean; onAdd: (id: string) => void }) {
  const desktop = useDesktopSurface();
  const form = useZodForm(youtubeImportFormSchema.pick({ stationId: true }), { stationId: job.requestedStationId || job.suggestedStationId || '' });
  const selected = useWatch({ control: form.control, name: 'stationId' });
  const alreadyAdded = job.copies.some(c => c.stationId === selected);
  return <form className={styles.addForm} onSubmit={form.handleSubmit(v => { if (v.stationId) onAdd(v.stationId); })}>
    <SelectField name="stationId" control={form.control} label="Add to genre station" disabled={disabled} emptyValue="__choose__" options={[{ value: '__choose__', label: 'Choose a station' }, ...routes.map(r => ({ value: r.stationId, label: `${r.genre} · ${stations.find(s => s.id === r.stationId)?.name || r.stationId}${job.copies.some(c => c.stationId === r.stationId) ? ' · added' : ''}` }))]} />
    {desktop ? <DesktopAction submit disabled={disabled || !selected || alreadyAdded} label={alreadyAdded ? 'Added to Subwave' : 'Add to Subwave'} /> : <Button type="submit" variant="outline" disabled={disabled || !selected || alreadyAdded}>{alreadyAdded ? 'Added to Subwave' : 'Add to Subwave'}</Button>}
  </form>;
}

function RouteEditor({ initial, stations, adminFetch, onSaved }: { initial: YoutubeRoute[]; stations: YoutubeStation[]; adminFetch: AdminFetch; onSaved: () => void }) {
  const form = useZodForm(youtubeRoutingSchema, { routes: initial });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'routes' });
  const save = useSaveYoutubeRoutes(adminFetch);
  const selected = useWatch({ control: form.control, name: 'routes' }) ?? [];
  const nextStation = stations.find(s => !selected.some(r => r.stationId === s.id));
  return <section className={styles.routeEditor} aria-label="Genre station routing">
    <h2>Route genres to stations</h2><p>Each station gets its own genre rule and music folder. Add aliases such as “deep house, tech house” to improve matching.</p>
    <form onSubmit={form.handleSubmit(async values => { try { await save.mutateAsync(values); onSaved(); } catch { /* mutation reports the server error */ } })}>
      {save.error && <p role="alert" className={styles.error}>{message(save.error)}</p>}
      {fields.map((field, i) => <fieldset key={field.id} className={styles.route}><legend>Genre destination {i + 1}</legend>
        <SelectField name={`routes.${i}.stationId`} control={form.control} label="Station" options={stations.map(s => ({ value: s.id, label: s.name }))} />
        <TextField name={`routes.${i}.genre`} control={form.control} label="Genre" placeholder="Jazz" />
        <TextField name={`routes.${i}.aliases`} control={form.control} label="Also match" placeholder="Bebop, hard bop" />
        <TextField name={`routes.${i}.folder`} control={form.control} label="Station music folder" description="Relative to the connected music root." placeholder="YouTube/Jazz" />
        <Button type="button" variant="ghost" onClick={() => remove(i)}>Remove rule</Button>
      </fieldset>)}
      <div className={styles.routeButtons}><Button type="button" variant="outline" disabled={!nextStation || fields.length >= 8} onClick={() => { if (nextStation) append({ stationId: nextStation.id, genre: '', aliases: [], folder: `YouTube/${nextStation.id}` }); }}>Add genre destination</Button>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save genre routing'}</Button>
        <Link href="/admin/stations">Create or configure a station →</Link>
      </div>
    </form>
  </section>;
}
