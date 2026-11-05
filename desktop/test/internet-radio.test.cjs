'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createServer,request}=require('node:http');const {mkdtemp,mkdir,readFile,rm}=require('node:fs/promises');const {join}=require('node:path');const {tmpdir}=require('node:os');const {execFileSync}=require('node:child_process');
const {startLocalStation,publicAddress,radioUrl,icyAudio,openPublicRadio}=require('../runtime/service/station.cjs');
const token='r'.repeat(64);
test('radio URLs permit public HTTP audio but reject private addresses, embedded logins and file/network wrappers',async()=>{
 for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);
 for(const ip of ['0.0.0.0','10.0.0.1','127.0.0.1','169.254.169.254','172.16.0.1','192.168.0.1','100.64.1.2','224.0.0.1','::1','::ffff:127.0.0.1','fe80::1','fc00::1','2001:db8::1','2002:7f00:1::1'])assert.equal(publicAddress(ip),false,ip);
 for(const url of ['file:///etc/passwd','ftp://example.com/audio','http://127.1/','http://2130706433/','http://[::ffff:127.0.0.1]/','http://user:secret@example.com/','http://localhost/audio','http://printer.local/audio'])assert.throws(()=>radioUrl(url));
 await assert.rejects(openPublicRadio('http://127.0.0.1/private',new AbortController().signal),/public/);
 assert.equal(radioUrl('https://radio.example/stream.mp3').hostname,'radio.example');
});
test('ICY metadata is stripped across arbitrary chunk boundaries and only real stream titles are reported',async()=>{
 const titles=[],stream=icyAudio(4,title=>titles.push(title)),out=[];
 stream.on('data',chunk=>out.push(chunk));const meta=Buffer.alloc(32);meta.write("StreamTitle='Artist - Song';");
 const data=Buffer.concat([Buffer.from('abcd'),Buffer.from([2]),meta,Buffer.from('efgh'),Buffer.from([0]),Buffer.from('ijkl')]);
 for(let i=0;i<data.length;i+=3)stream.write(data.subarray(i,i+3));stream.end();await new Promise(resolve=>stream.once('end',resolve));
 assert.equal(Buffer.concat(out).toString(),'abcdefghijkl');assert.deepEqual(titles,['Artist - Song']);
});
test('live presets survive cold restart, decode real streamed audio and switch back to local collections', {timeout:35000}, async t=>{
 const root=await mkdtemp(join(tmpdir(),'subwave-live-radio-'));await mkdir(join(root,'input'));
 const file=join(root,'input','tone.mp3');execFileSync('/usr/bin/ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=660:duration=5','-c:a','libmp3lame','-b:a','128k',file]);const audio=await readFile(file);
 let opened=0,closed=0;
 const upstream=createServer((req,res)=>{
  if(req.url==='/playlist'){res.writeHead(200,{'Content-Type':'audio/x-mpegurl'});res.end('#EXTM3U\nhttps://fixture.example/live\n');return;}
  if(req.url==='/hls'){res.writeHead(200,{'Content-Type':'application/vnd.apple.mpegurl'});res.end('#EXTM3U\n#EXT-X-TARGETDURATION:1\nfile:///etc/passwd');return;}
  if(req.url!=='/live'){res.writeHead(404);res.end();return;}
  opened++;res.writeHead(200,{'Content-Type':'audio/mpeg'});let position=0;
  const timer=setInterval(()=>{res.write(audio.subarray(position,position+1600));position+=1600;if(position>=audio.length)position=0;},50);
  res.on('close',()=>{closed++;clearInterval(timer);});
 });await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const port=upstream.address().port;
 const openRadio=(url,signal)=>new Promise((resolve,reject)=>{const r=request(`http://127.0.0.1:${port}${new URL(url).pathname}`,{signal},response=>{if(response.statusCode!==200){response.destroy();reject(new Error('Fixture station unavailable'));}else resolve(response);});r.on('error',reject);r.end();});
 const options={stateDir:join(root,'state'),musicDir:join(root,'Music'),token,ffmpeg:'/usr/bin/ffmpeg',ffprobe:'/usr/bin/ffprobe',ytDlp:'/usr/bin/yt-dlp',openRadio};
 let station=await startLocalStation(options);
 t.after(async()=>{await station.close();await new Promise(resolve=>{upstream.close(resolve);upstream.closeAllConnections();});await rm(root,{recursive:true,force:true});});
 const api=async(path,method='GET',body)=>{const r=await fetch(station.origin+'/api'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;};
 const input={name:'Fixture live radio',url:'https://fixture.example/playlist',country:'Test country',tags:'jazz',codec:'MP3',providerId:''};
 const saved=await api('/local/radio/presets','POST',input);assert.match(saved.station.id,/^net-/);
 await api('/local/radio/presets','POST',input);assert.equal((await api('/local/library')).internetStations.length,1);
 await assert.rejects(api('/local/radio/presets','POST',{...input,url:'http://127.0.0.1/private'}),/public/);
 await api('/local/stations/select','POST',{id:saved.station.id});assert.equal(station.radio.online,true);assert.equal((await api('/local/library')).tracks.length,0);
 const controller=new AbortController();const response=await fetch(station.origin+'/stream.mp3',{headers:{Authorization:'Bearer '+token},signal:controller.signal});const reader=response.body.getReader();let bytes=0;
 while(bytes<6000){const item=await reader.read();assert.equal(item.done,false);bytes+=item.value.length;}
 assert.equal(station.radio.current.stationId,saved.station.id);assert.ok(station.radio.startedAt);assert.equal(station.radio.error,null);
 await assert.rejects(api('/local/next','POST',{}),/cannot skip/);
 controller.abort();await new Promise(resolve=>setTimeout(resolve,1300));assert.ok(closed>=1);assert.equal(station.radio.listeners,0);
 const hls=await api('/local/radio/presets','POST',{...input,name:'Unsupported adaptive station',url:'https://fixture.example/hls',providerId:'hls-proof'});
 await api('/local/stations/select','POST',{id:hls.station.id});
 const hlsAbort=new AbortController();await fetch(station.origin+'/stream.mp3',{headers:{Authorization:'Bearer '+token},signal:hlsAbort.signal});
 const deadline=Date.now()+5000;while(!station.radio.error&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
 assert.match(station.radio.error,/adaptive HLS/);assert.equal(opened,1,'HLS must not open its file URL or another audio decoder');hlsAbort.abort();
 await api('/local/radio/presets/'+hls.station.id,'DELETE');await api('/local/stations/select','POST',{id:saved.station.id});
 await station.close();station=await startLocalStation(options);assert.equal((await api('/local/library')).selected,saved.station.id);
 assert.equal((await api('/local/library')).internetStations[0].name,input.name);
 await api('/local/radio/presets/'+saved.station.id,'DELETE');assert.equal((await api('/local/library')).selected,'all');assert.equal((await api('/local/library')).internetStations.length,0);
 assert.ok(opened>=1);
});
