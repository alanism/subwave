import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPlayableSource, playbackSources } from './local-sources';
import type { DesktopLibrary } from './schemas.generated';
const library: DesktopLibrary = { selected:'all', stations:[{id:'all',name:'All music',count:0,genre:'All'}],playlists:[],internetStations:[],tracks:[],allTracks:[],musicDir:'/music',downloadsDir:'/downloads',error:null };
test('live radio is playable without local files, while an empty genre or missing preset is not',()=>{
 assert.equal(hasPlayableSource(library),false);
 const radio={id:'net-0123456789abcdef',name:'Live station',url:'https://radio.example/audio',country:'',tags:'',codec:'MP3',providerId:''};
 assert.equal(hasPlayableSource({...library,internetStations:[radio]}),false);
 assert.equal(hasPlayableSource({...library,internetStations:[radio],selected:radio.id}),true);
 assert.equal(hasPlayableSource({...library,selected:radio.id}),false);
});
test('one tuning list includes genres, active playlists and saved internet presets with stable identities',()=>{
 const data={...library,playlists:[{id:'pl-11111111',name:'Active',trackIds:[],count:0,deletedAt:null},{id:'pl-22222222',name:'Deleted',trackIds:[],count:0,deletedAt:'2026-11-06'}],internetStations:[{id:'net-0123456789abcdef',name:'Live',url:'https://radio.example/audio',country:'',tags:'',codec:'',providerId:''}]};
 assert.deepEqual(playbackSources(data).map(row=>row.id),['all','pl-11111111','net-0123456789abcdef']);
});
