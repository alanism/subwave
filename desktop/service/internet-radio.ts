// Public internet-radio discovery and bounded, DNS-pinned HTTP streams. Remote
// playlists/redirects never give FFmpeg access to the network or local files.
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup, resolve4, reverse } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Transform } from 'node:stream';
import { desktopInternetStationInputSchema, type DesktopInternetStationInput } from '../../controller/src/schemas/desktop-local.js';

const blocked = new BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(ip,bits,'ipv4');
const global6 = new BlockList(); global6.addSubnet('2000::',3,'ipv6');
for (const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as const) blocked.addSubnet(ip,bits,'ipv6');
export function publicAddress(ip: string) {
  const family = isIP(ip);
  return family === 4 ? !blocked.check(ip,'ipv4') : family === 6 && global6.check(ip,'ipv6') && !blocked.check(ip,'ipv6');
}
export function radioUrl(raw: string) {
  const url = new URL(raw);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash || raw.length > 2048) throw new Error('Use a public HTTP or HTTPS audio stream URL without a login.');
  const hostname = url.hostname.replace(/^\[|\]$/g,'');
  if (!hostname.includes('.') && !isIP(hostname) || /(?:^|\.)(localhost|local|internal)$/.test(hostname) || isIP(hostname) && !publicAddress(hostname)) throw new Error('Choose a public internet-radio address. Local/private addresses are not radio stations.');
  return url;
}
export type OpenRadio = (raw: string, signal: AbortSignal) => Promise<IncomingMessage>;
export const openPublicRadio: OpenRadio = async (raw, signal) => {
  let url = radioUrl(raw);
  for (let redirects = 0; redirects <= 5; redirects++) {
    signal.throwIfAborted();
    const hostname = url.hostname.replace(/^\[|\]$/g,'');
    const addresses = await lookup(hostname,{ all:true });
    signal.throwIfAborted();
    if (!addresses.length || addresses.some(row => !publicAddress(row.address))) throw new Error('This station resolves to a private or unsupported address. Choose another station.');
    let response: IncomingMessage | undefined, failure: unknown;
    // DNS can return reachable and unreachable routes for the same station.
    // Retry another vetted address without relaxing TLS or private-IP checks.
    const candidates = [...addresses].sort((a,b) => a.family - b.family).slice(0,2);
    for (const address of candidates) {
      signal.throwIfAborted();
      try {
        response = await new Promise<IncomingMessage>((resolve,reject) => {
          const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
            agent:false, autoSelectFamily:false, family:address.family as 4|6, signal,
            headers:{ 'User-Agent':'Subwave/1.4 (Linux music player)', 'Icy-MetaData':'1', Accept:'*/*' },
            lookup: (_host,_options,callback) => callback(null,address.address,address.family),
          }, resolve);
          request.once('error',reject);
          request.setTimeout(12_000,()=>request.destroy(new Error('The station stopped responding. Retry or choose another station.')));
          request.end();
        });
        break;
      } catch (error) { failure=error; }
    }
    if (!response) throw failure || new Error('This radio station could not be reached.');
    if ([301,302,303,307,308].includes(response.statusCode || 0)) {
      const location = response.headers.location; response.destroy();
      if (!location) throw new Error('This station returned an invalid redirect.');
      url = radioUrl(new URL(location,url).href); continue;
    }
    if (response.statusCode !== 200) { response.destroy(); throw new Error(`The station is unavailable (HTTP ${response.statusCode}). Retry or choose another station.`); }
    return response;
  }
  throw new Error('This station redirects too many times. Choose another station.');
};
async function readSmall(response: IncomingMessage, maximum: number) {
  let bytes=0; const parts: Buffer[]=[];
  for await (const chunk of response) { bytes+=chunk.length; if(bytes>maximum){response.destroy();throw new Error('The radio directory returned too much data. Try a narrower search.');}parts.push(Buffer.from(chunk)); }
  return Buffer.concat(parts).toString('utf8');
}
let mirrors: string[] = [], mirrorTime=0;
async function directoryServers() {
  if (mirrors.length && Date.now()-mirrorTime<3_600_000) return mirrors;
  try {
    const addresses=await resolve4('all.api.radio-browser.info');
    const names=(await Promise.allSettled(addresses.slice(0,8).map(ip=>reverse(ip)))).flatMap(result=>result.status==='fulfilled'?result.value:[]);
    const found=[...new Set(names.filter(name=>/^[a-z0-9-]+\.api\.radio-browser\.info$/.test(name)))];
    if(found.length){mirrors=found.sort(()=>Math.random()-.5);mirrorTime=Date.now();}
  }catch{/* Known HTTPS mirrors are an offline discovery fallback. */}
  return mirrors.length?mirrors:['de1.api.radio-browser.info','nl1.api.radio-browser.info'];
}
type SearchResults = { stations: DesktopInternetStationInput[]; hasMore: boolean; offset: number; provider: string };
const directoryCache = new Map<string,{ at: number; result: SearchResults }>();
export async function searchInternetRadio(input: { name:string; genre:string; country:string; offset:number }, open: OpenRadio = openPublicRadio) {
  const key=JSON.stringify(input), cached=open===openPublicRadio?directoryCache.get(key):undefined;
  if(cached && Date.now()-cached.at<60_000)return cached.result;
  const query=new URLSearchParams({limit:'30',offset:String(input.offset),hidebroken:'true',order:'clickcount',reverse:'true'});
  if(input.name)query.set('name',input.name);
  if(input.genre)query.set('tag',input.genre);
  if(input.country)query.set(/^[a-z]{2}$/i.test(input.country)?'countrycode':'country',input.country.toUpperCase()==='UK'?'GB':input.country.toUpperCase());
  let failure: unknown;
  for(const host of (await directoryServers()).slice(0,3)){
    let phase='connecting';
    try {
      const response=await open(`https://${host}/json/stations/search?${query}`,AbortSignal.timeout(12_000));
      phase='reading response';
      const data: unknown=JSON.parse(await readSmall(response,1_500_000));
      if(!Array.isArray(data))throw new Error('Invalid radio directory response.');
      const stations: DesktopInternetStationInput[]=[];
      for(const raw of data){
        if(raw?.hls || raw?.lastcheckok!==1 || !['MP3','AAC','AAC+','OGG','VORBIS','OPUS','FLAC'].includes(String(raw.codec).toUpperCase()))continue;
        const parsed=desktopInternetStationInputSchema.safeParse({name:String(raw.name||'').slice(0,120),url:raw.url_resolved||raw.url,country:String(raw.country||'').slice(0,80),tags:String(raw.tags||'').slice(0,300),codec:String(raw.codec||'').slice(0,30),providerId:String(raw.stationuuid||'').slice(0,80)});
        if(!parsed.success)continue;
        try{radioUrl(parsed.data.url);stations.push(parsed.data);}catch{/* Reject private/invalid directory entries. */}
      }
      const result={ stations, hasMore:data.length===30, offset:input.offset, provider:'Radio Browser' };
      if(open===openPublicRadio){directoryCache.delete(key);directoryCache.set(key,{at:Date.now(),result});if(directoryCache.size>40)directoryCache.delete(directoryCache.keys().next().value!);}
      return result;
    }catch(error){console.warn(`Radio directory ${host} (${phase}): ${error instanceof Error?error.message:String(error)}`);failure=error;}
  }
  throw new Error(`The radio directory could not be reached. Your saved presets and local music are kept. Try again. ${failure instanceof Error?failure.message:''}`);
}
export async function openAudioStream(raw: string, signal: AbortSignal, open: OpenRadio = openPublicRadio, depth=0): Promise<IncomingMessage> {
  if(depth>3)throw new Error('This station has too many nested playlists.');
  const response=await open(raw,signal);
  const type=String(response.headers['content-type']||'').toLowerCase();
  if(/mpegurl|scpls|text\/|application\/vnd.apple/.test(type)||/\.(m3u8?|pls)(?:\?|$)/i.test(raw)){
    const content=await readSmall(response,64_000);
    if(content.includes('#EXT-X-'))throw new Error('This is an adaptive HLS station. Choose a direct MP3, AAC or OGG station.');
    const next=content.split(/\r?\n/).map(line=>line.replace(/^File\d+=/i,'').trim()).find(line=>/^https?:\/\//i.test(line));
    if(!next)throw new Error('This address did not return a direct audio stream. Choose another station.');
    return openAudioStream(next,signal,open,depth+1);
  }
  return response;
}
export function icyAudio(interval: number, title: (value:string)=>void) {
  let remaining=interval, metadata=-1;let pieces: Buffer[]=[];
  return new Transform({ transform(chunk: Buffer,_encoding,done){
    let offset=0;
    while(offset<chunk.length){
      if(remaining>0){const take=Math.min(remaining,chunk.length-offset);this.push(chunk.subarray(offset,offset+take));remaining-=take;offset+=take;continue;}
      if(metadata<0){metadata=chunk[offset++]!*16;if(!metadata){remaining=interval;metadata=-1;}continue;}
      const take=Math.min(metadata,chunk.length-offset);pieces.push(chunk.subarray(offset,offset+take));metadata-=take;offset+=take;
      if(!metadata){const value=Buffer.concat(pieces).toString('utf8');pieces=[];const match=/StreamTitle='(.*?)';/.exec(value);if(match?.[1])title(match[1].slice(0,300));remaining=interval;metadata=-1;}
    }
    done();
  }});
}
