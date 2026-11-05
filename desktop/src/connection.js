// This is an isolated browser script; it has no Node or Electron imports.
'use strict';
const form = document.getElementById('connection-form');
const input = document.getElementById('station');
const status = document.getElementById('status');
const check = document.getElementById('check');
const save = document.getElementById('save');
function report(message, error = false) { status.textContent = message; status.dataset.error = String(error); }
function busy(value) { check.disabled = value; save.disabled = value; }
window.desktopPlayer.connection().then(value => { input.value = value.stationUrl; }).catch(() => report('Could not read the station address.', true));
check.addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  busy(true); report('Checking station…');
  try { const result = await window.desktopPlayer.checkConnection(input.value); report(result.message, !result.ok); }
  catch { report('Could not test this address.', true); }
  finally { busy(false); }
});
form.addEventListener('submit', async event => {
  event.preventDefault(); busy(true); report('Connecting…');
  try { await window.desktopPlayer.saveConnection(input.value); }
  catch (error) { report(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''), true); }
  finally { busy(false); }
});
