'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Controller } from 'react-hook-form';
import { useAdminAuth } from '@/lib/adminAuth';
import { adminJson, useAdminQuery } from '@/lib/admin-query';
import { fieldAria, useZodForm } from '@/lib/form';
import { TextField } from '@/lib/form-fields';
import { desktopInternetStationInputSchema, desktopRadioSearchSchema, type DesktopInternetStationInput } from '@/lib/schemas.generated';
import { Field, FieldLabel, FieldError } from '@/components/ui/field';
import { useSkinSelection } from '@/components/skins/SkinContext';
import { useThemeSwitcher } from '@/components/ThemeProvider';
import SourceSearch from '@/components/skins/enochian/SourceSearch';
import { DesktopAction } from './DesktopAction';
import { useDesktopSurface } from './DesktopContext';
import styles from './DesktopSurface.module.css';

type Search = { name:string; genre:string; country:string; offset:number };
type Results = { stations:DesktopInternetStationInput[]; hasMore:boolean; offset:number; provider:string };
const blank: Search = { name:'', genre:'', country:'', offset:0 };
const radioKeys = { search:(query: Search | null) => ['desktop','radio-search',query] as const };
export default function InternetRadioPanel() {
  const desktop = useDesktopSurface()!;
  const { adminFetch } = useAdminAuth();
  const skin = useSkinSelection(), themes = useThemeSwitcher(), uid = useId();
  const form = useZodForm(desktopRadioSearchSchema, blank);
  const manual = useZodForm(desktopInternetStationInputSchema, { name:'',url:'',country:'',tags:'',codec:'',providerId:'' });
  const [submitted,setSubmitted] = useState<Search | null>(null);
  const [lastRemoved,setLastRemoved] = useState<DesktopInternetStationInput | null>(null);
  const [actionError,setActionError] = useState('');
  const presetHeading = useRef<HTMLHeadingElement>(null), undoAction = useRef<HTMLDivElement>(null);
  const [returnFocus, setReturnFocus] = useState<{ from: Element | null; target: () => HTMLElement | null } | null>(null);
  useLayoutEffect(() => {
    if (desktop.busy || !returnFocus) return;
    const current = document.activeElement;
    if (current === document.body || current === returnFocus.from || current?.getAttribute('role') === 'dialog') returnFocus.target()?.focus();
    setReturnFocus(null);
  }, [desktop.busy, returnFocus]);
  const results = useAdminQuery<Results>({ adminFetch, key:radioKeys.search(submitted), enabled:submitted!==null, staleTime:60_000,
    request:(fetcher,signal)=>adminJson(fetcher,'/local/radio/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submitted)},signal) });
  const presets = desktop.library.data?.internetStations || [];
  const save = async (station: DesktopInternetStationInput, play=false) => {
    setActionError('');
    const from = document.activeElement, row = from?.closest('li'), form = from?.closest('form');
    try {
      await desktop.saveRadioPreset(station,play);
      setReturnFocus({from,target:()=>row?.querySelector<HTMLElement>('button:not(:disabled)') || form?.querySelector<HTMLElement>('input:not(:disabled)') || presetHeading.current});
      return true;
    }catch(error){setActionError(error instanceof Error?error.message:String(error));return false;}
  };
  return <div className={styles.panel}>
    <header className={styles.panelIntro}><p className={styles.eyebrow}>Live broadcasts + your local channels</p><h2>Tune the world.</h2><p>Find a live station, save it as a preset, then turn the receiver dial to it. Your genre stations and playlists stay on the same dial.</p></header>
    <section aria-label="Saved radio presets"><h3 ref={presetHeading} tabIndex={-1}>Saved radio presets <span className={styles.count}>{presets.length}</span></h3>
      {!presets.length && <p className={styles.empty}>Search below or add a stream URL to save your first live station.</p>}
      <ul className={styles.trackList}>{presets.map(station=><li key={station.id}><div className={styles.trackInfo}><strong>{station.name}{desktop.library.data?.selected===station.id?' · selected':''}</strong><span>{[station.country,station.tags,station.codec].filter(Boolean).join(' · ') || 'Live internet radio'}</span></div>
        <div className={styles.actions}><DesktopAction label="Tune in" ariaLabel={`Tune in to ${station.name}`} disabled={desktop.busy} onClick={()=>{void desktop.selectSource(station.id,true).catch(()=>{});}} />
          <DesktopAction label="Remove preset" ariaLabel={`Remove preset ${station.name}`} disabled={desktop.busy} onClick={()=>{const from=document.activeElement;void desktop.run({kind:'remove-radio',id:station.id},'Radio preset removed.').then(()=>{setLastRemoved(station);setReturnFocus({from,target:()=>undoAction.current?.querySelector('button') || presetHeading.current});}).catch(()=>{});}} /></div></li>)}</ul>
      {lastRemoved && <div ref={undoAction} className={styles.actions}><p>{lastRemoved.name} removed.</p><DesktopAction label="Undo removal" disabled={desktop.busy} onClick={()=>{void save(lastRemoved).then(ok=>{if(ok){setLastRemoved(null);}});}} /></div>}
    </section>
    <section className={styles.section} aria-label="Find internet radio"><h3>Find internet radio</h3>
      <form className={styles.form} onSubmit={form.handleSubmit(values=>setSubmitted({...values,offset:0}))}>
        <Controller name="name" control={form.control} render={({field,fieldState})=>{
          const aria=fieldAria(`${uid}-name`,fieldState.error);
          return <Field><FieldLabel {...aria.labelProps}>Station name</FieldLabel>{skin?.effectiveId==='classic' ? <input {...aria.controlProps} {...field} type="search" placeholder="Station name" /> : <SourceSearch {...aria.controlProps} finish={themes?.effectiveId==='enochian-obsidian'?'obsidian':'ivory'} searchLabel="radio station search" value={field.value || ''} onChange={field.onChange} onBlur={field.onBlur} inputRef={field.ref} placeholder="Station name" />}<FieldError {...aria.errorProps} errors={fieldState.error?[fieldState.error]:undefined} /></Field>;
        }} />
        <TextField name="genre" control={form.control} label="Genre" placeholder="Jazz, ambient, house…" />
        <TextField name="country" control={form.control} label="Country" placeholder="Vietnam, UK, US…" />
        <DesktopAction label={results.isFetching?'Searching…':'Search stations'} submit disabled={results.isFetching} />
        <DesktopAction label="Browse popular" disabled={results.isFetching} onClick={()=>setSubmitted({...blank})} />
      </form>
      <p className={styles.eyebrow}>Directory: <a href="https://www.radio-browser.info/" target="_blank" rel="noreferrer">Radio Browser</a> · direct MP3, AAC, OGG and FLAC streams</p>
      {results.isFetching && <p role="status">Searching live radio stations…</p>}
      {results.error && <div role="alert" className={styles.alert}>{results.error.message} <button type="button" onClick={()=>void results.refetch()}>Retry search</button></div>}
      {results.data && !results.isFetching && <><p role="status">{results.data.stations.length?`${results.data.stations.length} stations found.`:'No direct-audio stations matched. Try another name, genre or country.'}</p>
        <ul className={styles.trackList}>{results.data.stations.map(station=>{
          const saved=presets.find(row=>station.providerId?row.providerId===station.providerId:row.url===station.url);
          return <li key={station.providerId||station.url}><div className={styles.trackInfo}><strong>{station.name}</strong><span>{[station.country,station.tags,station.codec].filter(Boolean).join(' · ')}</span></div><div className={styles.actions}>
            <DesktopAction label={saved?'Saved':'Save preset'} ariaLabel={`Save preset ${station.name}`} disabled={desktop.busy||!!saved} onClick={()=>void save(station)} />
            <DesktopAction label="Tune in" ariaLabel={`Listen to ${station.name}`} disabled={desktop.busy} onClick={()=>void save(station,true)} /></div></li>;
        })}</ul>
        <div className={styles.actions}>{submitted && submitted.offset>0 && <DesktopAction label="Previous stations" onClick={()=>setSubmitted({...submitted,offset:Math.max(0,submitted.offset-30)})} />}{submitted && results.data.hasMore && <DesktopAction label="More stations" onClick={()=>setSubmitted({...submitted,offset:submitted.offset+30})} />}</div>
      </>}
    </section>
    <details className={styles.details}><summary>Add a station by stream URL</summary><p>Use the station’s direct public audio stream address.</p><form className={styles.form} onSubmit={manual.handleSubmit(async values=>{await save(values);})}>
      <TextField name="name" control={manual.control} label="Preset name" placeholder="My radio station" />
      <TextField name="url" control={manual.control} label="Audio stream URL" placeholder="https://…" />
      <DesktopAction label="Save stream preset" submit disabled={desktop.busy} />
    </form></details>
    {actionError && <p className={styles.alert} role="alert">{actionError}</p>}
  </div>;
}
