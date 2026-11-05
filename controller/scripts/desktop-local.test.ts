import test from 'node:test';
import assert from 'node:assert/strict';
import { desktopInternetStationInputSchema, desktopInternetStationSchema, desktopLibrarySchema, desktopRadioSearchSchema } from '../src/schemas/desktop-local.js';
test('desktop library contracts read pre-radio snapshots and bound explicit public-stream input',()=>{
 const old={selected:'all',stations:[],playlists:[],tracks:[],allTracks:[],musicDir:'/music',downloadsDir:'/downloads',error:null};
 assert.deepEqual(desktopLibrarySchema.parse(old).internetStations,[]);
 const preset=desktopInternetStationInputSchema.parse({name:' Radio ',url:'https://radio.example/live'});
 assert.equal(preset.name,'Radio');assert.equal(preset.country,'');
 assert.equal(desktopInternetStationSchema.safeParse({...preset,id:'net-0123456789abcdef'}).success,true);
 assert.equal(desktopInternetStationInputSchema.safeParse({...preset,url:'file:///etc/passwd'}).success,false);
 assert.equal(desktopInternetStationInputSchema.safeParse({...preset,name:'x'.repeat(121)}).success,false);
 assert.deepEqual(desktopRadioSearchSchema.parse({}),{name:'',genre:'',country:'',offset:0});
 assert.equal(desktopRadioSearchSchema.safeParse({offset:-1}).success,false);
});
