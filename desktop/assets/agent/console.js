'use strict';
const el = id => document.getElementById(id);
let catalog = [], recentTimer;
function text(tag, value) { const node = document.createElement(tag); node.textContent = value; return node; }
async function call(name, args = {}) {
  const response = await fetch('/api/agent/call', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, arguments: args }) });
  const value = await response.json();
  if (!response.ok || !value.ok) throw new Error(value.error || 'The agent action failed.');
  return value.result;
}
function error(target, value) { target.replaceChildren(text('p', value.message || String(value))); target.firstChild.className = 'error'; }
async function action(button, name, args) {
  button.disabled = true; el('action-status').textContent = 'Working…';
  try {
    const value = await call(name, args);
    el('action-status').textContent = JSON.stringify(value, null, 2);
    await Promise.all([status(), recents(), stations()]); return value;
  } catch (value) { el('action-status').textContent = value.message; throw value; }
  finally { button.disabled = false; }
}
function button(label, name, args) {
  const node = text('button', label); node.type = 'button';
  node.addEventListener('click', () => { void action(node, name, typeof args === 'function' ? args() : args).catch(() => {}); });
  return node;
}
function destination() {
  const id = el('destination').value; if (!id) throw new Error('Choose a destination genre station.'); return id;
}
async function status() {
  try {
    const value = await call('subwave_status');
    el('connection').textContent = `Connected to the native player · ${value.trackCount} local tracks`;
    const p = value.playback;
    el('player-state').textContent = `${p.playing ? 'Playing' : p.tunedIn ? 'Starting' : 'Stopped'} · Volume ${p.volume}% · Source ${value.selected}${value.nowPlaying ? ` · ${value.nowPlaying.title}` : ''}`;
    el('volume').value = p.volume;
  } catch (value) { el('connection').textContent = value.message; }
}
async function stations() {
  const value = await call('subwave_list_stations'), previous = el('destination').value;
  el('destination').replaceChildren(...value.stations.filter(s => s.id !== 'all').map(s => {
    const option = text('option', `${s.name} · ${s.count} tracks`); option.value = s.id; return option;
  }));
  if (value.stations.some(s => s.id === previous)) el('destination').value = previous;
  else if (value.stations.some(s => s.id === 'local-files')) el('destination').value = 'local-files';
}
function song(title, detail) { const row = document.createElement('article'); row.className = 'song'; row.append(text('strong', title), text('small', detail)); return row; }
async function recents() {
  clearTimeout(recentTimer);
  try {
    const { jobs } = await call('subwave_recent_downloads', { limit: 20 });
    const rows = jobs.map(job => {
      const row = song(job.video?.title || job.videoId, `${job.state}${job.progress == null ? '' : ` · ${Math.round(job.progress)}%`}${job.error ? ` · ${job.error}` : ''}`);
      if (['ready', 'imported'].includes(job.state)) {
        const actions = document.createElement('div'); actions.className = 'row';
        actions.append(button('Add to selected genre', 'subwave_add_download', () => ({ jobId: job.id, stationId: destination() })), button('Play in desktop', 'subwave_play_download', { jobId: job.id })); row.append(actions);
      } else if (job.state === 'failed') row.append(button('Retry download', 'subwave_retry_download', { jobId: job.id }));
      return row;
    });
    el('recent-results').replaceChildren(...(rows.length ? rows : [text('p', 'No downloads yet. Search or paste a video URL above.')]));
    if (jobs.some(j => ['queued', 'inspecting', 'downloading', 'importing'].includes(j.state))) recentTimer = setTimeout(recents, 2500);
  } catch (value) { error(el('recent-results'), value); }
}
async function search(event, youtube) {
  event.preventDefault();
  const target = el(youtube ? 'youtube-results' : 'library-results'), form = event.currentTarget, submit = form.querySelector('button');
  submit.disabled = true; target.replaceChildren(text('p', 'Searching…'));
  try {
    const value = await call(youtube ? 'subwave_search_youtube' : 'subwave_search_library', { query: el(youtube ? 'youtube-query' : 'library-query').value });
    const rows = (youtube ? value.videos : value.tracks).map(item => {
      const row = song(item.title, `${item.artist || 'Unknown artist'} · ${item.channel || item.genre || ''} · ${item.duration == null ? 'Duration unavailable' : Math.round(item.duration) + ' seconds'}`);
      const actions = document.createElement('div'); actions.className = 'row';
      if (youtube) actions.append(button('Download MP3', 'subwave_download_youtube', () => ({ url: item.url, stationId: destination(), autoImport: true })));
      else actions.append(button('Play in desktop', 'subwave_play_track', { trackId: item.id }), button('Copy to selected genre', 'subwave_copy_track', () => ({ trackId: item.id, stationId: destination() })));
      row.append(actions); return row;
    });
    target.replaceChildren(...(rows.length ? rows : [text('p', 'No songs found. Try another search.')]));
  } catch (value) { error(target, value); }
  finally { submit.disabled = false; }
}
el('library-form').addEventListener('submit', event => { void search(event, false); });
el('youtube-form').addEventListener('submit', event => { void search(event, true); });
el('url-form').addEventListener('submit', event => {
  event.preventDefault();
  void action(event.currentTarget.querySelector('button'), 'subwave_download_youtube', { url: el('video-url').value, stationId: destination(), autoImport: true }).catch(() => {});
});
el('refresh-status').addEventListener('click', () => { void status(); });
el('refresh-recent').addEventListener('click', () => { void recents(); });
el('stop').addEventListener('click', event => { void action(event.currentTarget, 'subwave_stop', {}).catch(() => {}); });
el('next').addEventListener('click', event => { void action(event.currentTarget, 'subwave_next', {}).catch(() => {}); });
el('set-volume').addEventListener('click', event => { void action(event.currentTarget, 'subwave_set_volume', { volume: Number(el('volume').value) }).catch(() => {}); });
el('tool-name').addEventListener('change', () => { el('tool-description').textContent = catalog.find(t => t.name === el('tool-name').value)?.description || ''; });
el('tool-form').addEventListener('submit', event => {
  event.preventDefault(); const submit = event.currentTarget.querySelector('button');
  try {
    const args = JSON.parse(el('tool-arguments').value);
    void action(submit, el('tool-name').value, args).then(value => { el('tool-result').textContent = JSON.stringify(value, null, 2); }).catch(value => { el('tool-result').textContent = value.message; });
  } catch (value) { el('tool-result').textContent = value.message; }
});
void (async () => {
  const response = await fetch('/api/agent/tools'); if (!response.ok) throw new Error('Open Agent controls from the running Subwave app.');
  catalog = (await response.json()).tools;
  el('tool-name').replaceChildren(...catalog.map(tool => { const option = text('option', tool.name); option.value = tool.name; return option; }));
  el('tool-description').textContent = catalog[0].description;
  const modelContext = document.modelContext || navigator.modelContext;
  if (modelContext?.registerTool) {
    try {
      for (const tool of catalog) await modelContext.registerTool({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema,
        annotations: tool.annotations, execute: async args => {
          try { const result = await call(tool.name, args); await Promise.all([status(), recents(), stations()]); return { content: [{ type: 'text', text: JSON.stringify(result) }] }; }
          catch (value) { return { isError: true, content: [{ type: 'text', text: value.message }] }; }
        } });
      el('browser-tools').textContent = `${catalog.length} browser tools registered for the connected agent.`;
    } catch { el('browser-tools').textContent = 'Browser tool registration is unavailable here. Use the forms or local JSON commands.'; }
  } else el('browser-tools').textContent = 'Use these accessible forms, or local JSON commands. This browser does not expose WebMCP.';
  await Promise.all([status(), stations(), recents()]);
})().catch(value => { el('connection').textContent = value.message; });
