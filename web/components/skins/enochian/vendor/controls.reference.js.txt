const realDocument = globalThis.document;

function scopedDocument(root) {
  if (!root) throw new Error("Enochian source root is missing");
  return new Proxy(realDocument, {
    get(target, property) {
      if (property === "body" || property === "documentElement") return root;
      if (property === "getElementById") return id => root.querySelector(`#${CSS.escape(id)}`);
      if (property === "querySelectorAll") return selector => root.querySelectorAll(selector);
      if (property === "querySelector") return selector => root.querySelector(selector);
      if (property === "activeElement") return root.contains(target.activeElement) ? target.activeElement : root;
      if (property === "elementFromPoint") return (x, y) => {
        const element = target.elementFromPoint(x, y);
        return root.contains(element) ? element : null;
      };
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function scopedListener(root) {
  return (type, handler, options) => {
    (type === "resize" ? window : root).addEventListener(type, handler, options);
  };
}

function fallbackAnimate(element, values) {
  for (const [name, value] of Object.entries(values)) {
    if (name === "x") element.style.translate = `${value}px 0`;
    else if (name === "y") element.style.translate = `0 ${value}px`;
    else if (name === "rotate") element.style.rotate = `${value}deg`;
    else if (name === "scale") element.style.scale = value;
    else element.style[name] = value;
  }
}

let animate = fallbackAnimate;
const motionPromise = import("https://cdn.jsdelivr.net/npm/motion@11/+esm");

{
const root=globalThis.document.getElementById("source-compact");
const document=scopedDocument(root);
const addEventListener=scopedListener(root);

(() => {
"use strict";
let MASTER=null, ANALYSER=null; const masterGainVal=()=>1;
const SNAP  = { stiffness:700, damping:35, mass:0.8 };
const HEAVY = { stiffness:300, damping:30, mass:1.2 };
const PRESS = { stiffness:720, damping:32, mass:0.55 };
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = id => document.getElementById(id);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, parent){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k, attrs[k]); if(parent) parent.appendChild(e); return e; }
const fmtSigned = (v,d=1) => (v>0?"+":v<0?"−":"±") + Math.abs(v).toFixed(d);

/* ── spring: same SNAP / HEAVY constants as Volume I, integrated inline ── */
class Spring {
  constructor(value, cfg, onUpdate, prec=0.01){ this.x=value; this.v=0; this.t=value; this.cfg=cfg; this.on=onUpdate; this.prec=prec; this.raf=0; onUpdate(value); }
  to(target, cfg){
    this.t=target; if(cfg) this.cfg=cfg;
    if(reduce){ this.x=target; this.v=0; this.on(target); return; }
    if(!this.raf){ this.last=performance.now(); this.raf=requestAnimationFrame(this.step); }
  }
  set(value){ this.x=this.t=value; this.v=0; if(this.raf){ cancelAnimationFrame(this.raf); this.raf=0; } this.on(value); }
  step = (now) => {
    let dt=Math.min(0.05,(now-this.last)/1000); this.last=now;
    const { stiffness:k, damping:c, mass:m } = this.cfg;
    while(dt>0){ const h=Math.min(1/240, dt); const a=(-k*(this.x-this.t)-c*this.v)/m; this.v+=a*h; this.x+=this.v*h; dt-=h; }
    if(Math.abs(this.x-this.t)<this.prec && Math.abs(this.v)<this.prec*4){ this.x=this.t; this.v=0; this.on(this.x); this.raf=0; return; }
    this.on(this.x); this.raf=requestAnimationFrame(this.step);
  };
}

/* ── one shared frame loop for continuous instruments ── */
const loops = new Set(); let loopRaf=0, loopLast=0;
function addLoop(fn){ loops.add(fn); if(!loopRaf){ loopLast=performance.now(); loopRaf=requestAnimationFrame(runLoop); } }
function runLoop(now){
  const dt=Math.min(0.05,(now-loopLast)/1000); loopLast=now;
  for(const fn of [...loops]){ if(fn(dt, now)===false) loops.delete(fn); }
  loopRaf = loops.size ? requestAnimationFrame(runLoop) : 0;
}
const visible = new Map();
const wakers = new Map();
const io = new IntersectionObserver(entries => entries.forEach(e => {
  visible.set(e.target, e.isIntersecting);
  if(e.isIntersecting && wakers.has(e.target)) wakers.get(e.target)();
}), { rootMargin:"120px" });
function watch(el, wake){ visible.set(el, true); wakers.set(el, wake); io.observe(el); }

/* ── sound: short filtered noise for mechanical clicks; starts only from a gesture ── */
let AC=null, NB=null, soundOn=true;
function audio(){
  if(!soundOn) return null;
  if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
  if(!MASTER){ MASTER=AC.createGain(); ANALYSER=AC.createAnalyser(); ANALYSER.fftSize=1024; ANALYSER.smoothingTimeConstant=.6; MASTER.connect(ANALYSER); ANALYSER.connect(AC.destination); MASTER.gain.value=masterGainVal(); }
  if(AC.state==="suspended") AC.resume();
  if(!NB){ NB=AC.createBuffer(1, Math.floor(AC.sampleRate*0.08), AC.sampleRate); const d=NB.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,5); }
  return AC;
}
function click(freq=3200, gain=0.12, q=1.4){
  const a=audio(); if(!a) return;
  const src=a.createBufferSource(); src.buffer=NB;
  const f=a.createBiquadFilter(); f.type="bandpass"; f.frequency.value=freq; f.Q.value=q;
  const g=a.createGain(); g.gain.value=gain;
  src.connect(f); f.connect(g); g.connect(MASTER); src.start();
}
const tick  = () => click(4200, 0.07, 2);
const thock = () => click(1100, 0.22, 1.1);
const clack = () => { click(1700, 0.16, 1.2); setTimeout(()=>click(3600,0.06,2), 28); };

/* ── accent, sound, finishes ── */
let ACCENT = "#CC0000";
const accentHooks = [];
function paintAccent(){
  document.documentElement.style.setProperty("--accent", ACCENT);
  $("accRed").setAttribute("aria-pressed", String(ACCENT==="#CC0000"));
  accentHooks.forEach(f=>f());
}
$("accRed").onclick    = () => { ACCENT="#CC0000"; paintAccent(); tick(); };
$("soundBtn").onclick = () => { soundOn=!soundOn; $("soundBtn").setAttribute("aria-pressed", String(soundOn)); $("soundBtn").textContent = soundOn?"ON":"OFF"; tick(); };

function bindFinish(groupId, targetId, after){
  const group=$(groupId), target=$(targetId);
  group.addEventListener("click", e => {
    const b=e.target.closest("button[data-finish]"); if(!b) return;
    target.dataset.finish=b.dataset.finish;
    $$("button[data-finish]", group).forEach(x=>x.setAttribute("aria-pressed", String(x===b)));
    tick(); if(after) after(b.dataset.finish);
  });
}

/* ── Code ── */
const veil=$("veil");
const veilSpring = new Spring(0, SNAP, x => { $("veilKnob").style.transform=`translateX(${x}px)`; });
bindFinish("veilFinish","veil");
veil.addEventListener("click", () => {
  const on = !document.body.classList.contains("show-code");
  document.body.classList.toggle("show-code", on);
  veil.setAttribute("aria-checked", String(on));
  $("veilLabel").textContent = on ? "Hide code" : "Show code";
  veilSpring.to(on ? 72 : 0);
  $$(".code-snippet").forEach(s => { s.inert = !on; s.setAttribute("aria-hidden", String(!on)); });
  thock();
});
$$(".copy-code").forEach(btn => btn.addEventListener("click", () => {
  const code = btn.closest(".code-snippet").querySelector("code");
  const done = t => { btn.textContent=t; setTimeout(()=>btn.textContent="COPY", 1400); };
  const fallback = () => { const r=document.createRange(); r.selectNodeContents(code); const s=getSelection(); s.removeAllRanges(); s.addRange(r); done("SELECTED"); };
  try { navigator.clipboard.writeText(code.textContent).then(()=>done("COPIED"), fallback); } catch(e){ fallback(); }
}));

/* ── generic rotary (drag ↕, arrows, Home/End) ── */
function makeRotary(el, knob, { value=0.5, onChange, arc=270, cfg=HEAVY }={}){
  let v=value;
  const sp = new Spring(v, cfg, x => { knob.style.transform=`rotate(${-arc/2 + x*arc}deg)`; }, 0.0005);
  function set(nv, instant){ v=clamp(nv,0,1); instant ? sp.set(v) : sp.to(v); el.setAttribute("aria-valuenow", Math.round(v*100)); el.setAttribute("aria-valuetext", Math.round(v*100)+" percent"); onChange && onChange(v); }
  let sy=0, sv=0, drag=false;
  el.addEventListener("pointerdown", e => { drag=true; sy=e.clientY; sv=v; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", e => { if(drag) set(sv + (sy-e.clientY)/150, true); });
  el.addEventListener("pointerup", () => { drag=false; });
  el.addEventListener("pointercancel", () => { drag=false; });
  el.addEventListener("keydown", e => {
    const k=e.key; let d=null;
    if(k==="ArrowRight"||k==="ArrowUp") d=v+.02; else if(k==="ArrowLeft"||k==="ArrowDown") d=v-.02; else if(k==="Home") d=0; else if(k==="End") d=1;
    if(d!==null){ set(d); e.preventDefault(); }
  });
  return { set, get:()=>v };
}

/* ═════════ compact section ═════════ */
$$(".rthemes[data-target]").forEach(g => {
  const target=$(g.dataset.target);
  g.addEventListener("click", e => { const b=e.target.closest("button[data-finish]"); if(!b) return;
    target.dataset.finish=b.dataset.finish; $$("button[data-finish]",g).forEach(x=>x.setAttribute("aria-pressed",String(x===b))); tick(); });
});
const PINCH={ stiffness:420, damping:22, mass:1 };

/* generic horizontal toggle: click flips, drag settles on the nearer side */
function makeToggle(btn, knob, { travel, pinch=false, axis="x", onChange }){
  let on = btn.getAttribute("aria-checked")==="true", sp;
  const T = typeof travel==="function" ? travel : ()=>travel;
  const draw = x => {
    const s = pinch ? 1+Math.min(.45, Math.abs(sp ? sp.v : 0)*.09) : 1;
    knob.style.transform = axis==="x" ? `translateX(${(x*T()).toFixed(2)}px) scaleX(${s.toFixed(3)})` : `translateY(${((1-x)*T()).toFixed(2)}px)`;
  };
  sp = new Spring(on?1:0, pinch?PINCH:SNAP, draw, .001);
  function set(v, quiet){ const ch=v!==on; on=v; btn.setAttribute("aria-checked",String(on)); sp.to(on?1:0); if(ch && !quiet){ on?thock():tick(); } onChange && onChange(on); }
  let drag=false, s0=0, x0=0, moved=0;
  btn.addEventListener("pointerdown", e => { drag=true; s0=axis==="x"?e.clientX:e.clientY; x0=sp.x; moved=0; try{ btn.setPointerCapture(e.pointerId); }catch(_){} });
  btn.addEventListener("pointermove", e => { if(!drag) return; const p=axis==="x"?e.clientX:e.clientY; const d=(p-s0)*(axis==="x"?1:-1); moved=Math.max(moved,Math.abs(d)); if(moved>3) sp.set(clamp(x0+d/T(),0,1)); });
  btn.addEventListener("pointerup", () => { if(!drag) return; drag=false; if(moved>3) set(sp.x>.5); else set(!on); });
  btn.addEventListener("pointercancel", () => { drag=false; sp.to(on?1:0); });
  btn.addEventListener("click", e => { if(e.detail===0) set(!on); });   // keyboard Space / Enter
  btn.addEventListener("keydown", e => {
    const fwd = axis==="x" ? "ArrowRight" : "ArrowUp", back = axis==="x" ? "ArrowLeft" : "ArrowDown";
    if(e.key===fwd){ e.preventDefault(); set(true); } else if(e.key===back){ e.preventDefault(); set(false); }
  });
  addEventListener("resize", () => draw(sp.x));
  onChange && onChange(on);
  return { set, get:()=>on };
}

/* ── Enochian Search Field ── */
const RS_ITEMS=$$("article.unit[id^='c-']").map(a=>({ id:a.id, name:a.querySelector(".cap span").textContent.split(" · ")[0], sect:(()=>{ let p=a.parentElement.previousElementSibling; while(p && !p.classList.contains("section-title")) p=p.previousElementSibling; return p?p.textContent:""; })() }));
(() => {
  const rs=$("rs"), ball=$("rsBall"), field=$("rsField"), input=$("rsInput"), list=$("rsList"); let open=false, sel=0, hits=[];
  const travel=()=>$("rs").querySelector(".rs-bar").clientWidth-ball.offsetWidth;
  const sp=new Spring(0, { stiffness:160, damping:20, mass:1 }, x => { const t=travel(); ball.style.transform=`translateX(${(x*t).toFixed(1)}px) rotate(${(x*t/30).toFixed(3)}rad)`; field.style.width=(56+x*t)+"px"; }, .001);
  function render(){
    const q=input.value.trim().toLowerCase();
    hits = RS_ITEMS.filter(it => !q || it.name.toLowerCase().includes(q) || it.sect.toLowerCase().includes(q));
    sel=Math.min(sel, Math.max(0,hits.length-1));
    if(hits.length) list.innerHTML=hits.map((h,i)=>`<li role="option" id="rs-o${i}" aria-selected="${i===sel}" data-id="${h.id}">${h.name}<span>${h.sect}</span></li>`).join("");
    else{ list.replaceChildren(); const empty=document.createElement("li"); empty.className="none"; empty.textContent=`Nothing matches "${input.value}". Try "switch" or "slider".`; list.append(empty); }
    input.setAttribute("aria-activedescendant", hits.length?`rs-o${sel}`:"");
    $("rsRead").innerHTML = `<b>${open?"open":"closed"}</b> · ${open?`${hits.length} match${hits.length===1?"":"es"}`:"controls indexed"}`;
  }
  function setOpen(v){
    open=v; rs.dataset.open=String(v); ball.setAttribute("aria-expanded",String(v)); ball.setAttribute("aria-label",v?"Close search":"Open search");
    input.setAttribute("aria-expanded",String(v)); input.tabIndex=v?0:-1; sp.to(v?1:0);
    if(v){ setTimeout(()=>input.focus({ preventScroll:true }), reduce?0:280); } else { input.value=""; sel=0; }
    render(); thock();
  }
  function jump(id){ const a=$(id); if(!a) return; setOpen(false); a.scrollIntoView({ behavior:reduce?"auto":"smooth", block:"center" }); a.classList.remove("flash"); void a.offsetWidth; a.classList.add("flash"); const f=a.querySelector('[tabindex="0"],button:not([data-finish]):not(.copy-code)'); if(f) setTimeout(()=>f.focus({ preventScroll:true }), 500); }
  ball.addEventListener("click", ()=>setOpen(!open));
  input.addEventListener("input", ()=>{ sel=0; render(); tick(); });
  input.addEventListener("keydown", e => {
    if(e.key==="ArrowDown"){ e.preventDefault(); sel=Math.min(hits.length-1,sel+1); render(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); sel=Math.max(0,sel-1); render(); }
    else if(e.key==="Enter"){ e.preventDefault(); if(hits[sel]) jump(hits[sel].id); }
    else if(e.key==="Escape"){ e.preventDefault(); setOpen(false); ball.focus(); }
  });
  list.addEventListener("click", e => { const li=e.target.closest("li[data-id]"); if(li) jump(li.dataset.id); });
  addEventListener("keydown", e => { if(e.key==="/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)){ e.preventDefault(); $("c-search").scrollIntoView({ block:"center" }); if(!open) setOpen(true); else input.focus(); } });
  addEventListener("resize", ()=>sp.on(sp.x));
  render();
})();

/* ── Enochian Synth Keyboard ── */
(() => {
  const WHITE=[["C",0,"a"],["D",2,"s"],["E",4,"d"],["F",5,"f"],["G",7,"g"],["A",9,"h"],["B",11,"j"]];
  const BLACK=[["C♯",1,"w",1],["D♯",3,"e",2],["F♯",6,"t",4],["G♯",8,"y",5],["A♯",10,"u",6]];
  let oct=4; const voices=new Map(), cells={};
  WHITE.forEach(([n,s,k]) => { const b=document.createElement("button"); b.type="button"; b.className="op-cell"; b.dataset.s=s; b.tabIndex=-1; b.setAttribute("aria-label",n); b.innerHTML=`<span class="op-cap"></span><span class="n">${k.toUpperCase()}</span>`; $("opWhite").appendChild(b); cells[s]=b; });
  BLACK.forEach(([n,s,k,pos]) => { const b=document.createElement("button"); b.type="button"; b.className="op-cell"; b.dataset.s=s; b.tabIndex=-1; b.setAttribute("aria-label",n); b.style.left=`calc(var(--w) * ${pos} - var(--w) / 2)`; b.innerHTML=`<span class="op-cap"></span>`; $("opBlack").appendChild(b); cells[s]=b; });
  const NAMES=["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"];
  function on(s){
    const midi=12*(oct+1)+s; if(voices.has(s)) return;
    cells[s].dataset.down="true";
    const hz=440*Math.pow(2,(midi-69)/12);
    $("opDisp").textContent=`OCT ${oct} · ${NAMES[s]}${oct}`; $("opRead").innerHTML=`<b>${NAMES[s]}${oct}</b> · ${hz.toFixed(1)} Hz · ${voices.size+1} held`;
    const a=audio(); if(!a){ voices.set(s,null); return; }
    const t=a.currentTime, o=a.createOscillator(), o2=a.createOscillator(), f=a.createBiquadFilter(), g=a.createGain();
    o.type="triangle"; o.frequency.value=hz; o2.type="sine"; o2.frequency.value=hz*2; f.type="lowpass"; f.frequency.setValueAtTime(5200,t); f.frequency.exponentialRampToValueAtTime(1400,t+.4);
    const g2=a.createGain(); g2.gain.value=.25; o2.connect(g2); g2.connect(f); o.connect(f); f.connect(g); g.connect(MASTER);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.22,t+.005); g.gain.exponentialRampToValueAtTime(.09,t+.3);
    o.start(t); o2.start(t); voices.set(s,{ o, o2, g });
  }
  function off(s){
    if(!voices.has(s)) return; const v=voices.get(s); voices.delete(s); cells[s].dataset.down="false";
    if(v && AC){ const t=AC.currentTime; v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(.0001,t,.08); v.o.stop(t+.6); v.o2.stop(t+.6); }
  }
  const allOff=()=>[...voices.keys()].forEach(off);
  let down=false;
  const sOf=e=>{ const c=document.elementFromPoint(e.clientX,e.clientY)?.closest(".op-cell"); return c && $("opKb").contains(c) ? +c.dataset.s : null; };
  $("opKb").addEventListener("pointerdown", e => { const s=sOf(e); if(s===null) return; e.preventDefault(); down=true; try{ $("opKb").setPointerCapture(e.pointerId); }catch(_){} on(s); });
  $("opKb").addEventListener("pointermove", e => { if(!down) return; const s=sOf(e); if(s!==null && !voices.has(s)){ allOff(); on(s); } });
  ["pointerup","pointercancel"].forEach(ev=>$("opKb").addEventListener(ev, ()=>{ down=false; allOff(); }));
  const KEYS=Object.fromEntries([...WHITE,...BLACK].map(([n,s,k])=>[k,s]));
  const shift=d=>{ allOff(); oct=clamp(oct+d,1,7); $("opDisp").textContent=`OCT ${oct} · READY`; $("opRead").innerHTML=`<b>octave ${oct}</b> · C${oct} = ${(440*Math.pow(2,(12*(oct+1)-69)/12)).toFixed(1)} Hz`; tick(); };
  $("opKb").addEventListener("keydown", e => { if(e.metaKey||e.ctrlKey||e.altKey) return; const k=e.key.toLowerCase();
    if(k==="z"){ e.preventDefault(); shift(-1); return; } if(k==="x"){ e.preventDefault(); shift(1); return; }
    if(KEYS[k]!==undefined){ e.preventDefault(); if(!e.repeat) on(KEYS[k]); } });
  $("opKb").addEventListener("keyup", e => { const k=e.key.toLowerCase(); if(KEYS[k]!==undefined) off(KEYS[k]); });
  $("opKb").addEventListener("blur", allOff);
  $("opDown").onclick=()=>shift(-1); $("opUp").onclick=()=>shift(1);
})();

/* ── Enochian Button Bank 02 ── */
(() => {
  const btns=$$("#tpb .rb");
  const read=()=>{ const on=btns.filter(b=>b.getAttribute("aria-pressed")==="true").map(b=>b.closest(".col-u").querySelector(".lbl").textContent); $("tpbRead").innerHTML=`<b>${on.length?on.join(" · "):"none"}</b> latched`; };
  btns.forEach(b => b.addEventListener("click", () => { const v=b.getAttribute("aria-pressed")!=="true"; b.setAttribute("aria-pressed",String(v)); b.closest(".col-u").querySelector(".dot").classList.toggle("on",v); v?thock():tick(); read(); }));
  read();
})();

/* ── Enochian Push Button 02 ── */
(() => {
  const b=$("pcb"), led=$("pcbLed"); let taps=0, holds=0, timer=0, held=false, active=false, ledT=0;
  const read=last=>$("pcbRead").innerHTML=`<b>${taps}</b> tap${taps===1?"":"s"} · ${holds} hold${holds===1?"":"s"}${last?` · last: ${last}`:""}`;
  const start=()=>{ if(active) return; active=true; held=false; b.dataset.down="true"; tick();
    timer=setTimeout(()=>{ held=true; holds++; led.classList.add("on"); clearTimeout(ledT); thock(); read("hold"); }, 600); };
  const end=()=>{ if(!active) return; active=false; clearTimeout(timer); b.dataset.down="false";
    if(!held){ taps++; led.classList.add("on"); clearTimeout(ledT); ledT=setTimeout(()=>led.classList.remove("on"),160); click(2400,.14,1.6); read("tap"); } };
  b.addEventListener("pointerdown", e=>{ try{ b.setPointerCapture(e.pointerId); }catch(_){} start(); });
  b.addEventListener("pointerup", end); b.addEventListener("pointercancel", ()=>{ active=false; clearTimeout(timer); b.dataset.down="false"; });
  b.addEventListener("keydown", e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); if(!e.repeat) start(); } });
  b.addEventListener("keyup", e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); end(); } });
  b.addEventListener("click", e=>e.preventDefault());
})();

/* ── Enochian Push Switch ── */
$("ccv").addEventListener("click", () => { const b=$("ccv"), v=b.getAttribute("aria-pressed")!=="true"; b.setAttribute("aria-pressed",String(v)); $("ccvLed").classList.toggle("on",v); v?thock():clack(); $("ccvRead").innerHTML=v?"<b>on</b> · lamp lit":"<b>off</b> · lamp dark"; });

/* ── Enochian Pop Buttons ── */
(() => {
  const bs=$$("#fp .fp-b"); let tray=1, busy=false;
  const read=()=>$("fpRead").innerHTML=`<b>${bs.filter(b=>b.getAttribute("aria-pressed")==="true").length} of 6</b> popped · tray ${tray}`;
  const pop=up=>{ const a=audio(); if(!a) return; const t=a.currentTime, o=a.createOscillator(), g=a.createGain(); o.type="sine";
    o.frequency.setValueAtTime(up?520:900+Math.random()*200,t); o.frequency.exponentialRampToValueAtTime(up?900:220,t+.06);
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(.25,t+.004); g.gain.exponentialRampToValueAtTime(.0001,t+.09); o.connect(g); g.connect(MASTER); o.start(t); o.stop(t+.1); click(1800,.08,3); };
  bs.forEach(b => b.addEventListener("click", () => {
    if(busy) return; const v=b.getAttribute("aria-pressed")!=="true"; b.setAttribute("aria-pressed",String(v)); pop(!v); read();
    if(bs.every(x=>x.getAttribute("aria-pressed")==="true")){
      busy=true; const fp=$("fp");
      setTimeout(()=>{ if(!reduce) fp.animate([{ transform:"rotateY(0)" },{ transform:"rotateY(90deg)" },{ transform:"rotateY(0)" }],{ duration:520, easing:"ease-in-out" });
        setTimeout(()=>{ bs.forEach(x=>x.setAttribute("aria-pressed","false")); tray++; clack(); read(); busy=false; }, reduce?0:260); }, 260);
    }
  }));
  read();
})();

/* ── toggles: Standard, Coloured, LED, I/O, Pinchin', Pinchin' Track ── */
makeToggle($("std"), $("std").querySelector(".tg-k"), { travel:44, onChange:on=>$("stdRead").innerHTML=`<b>${on?"on":"off"}</b>` });
makeToggle($("col"), $("col").querySelector(".tg-k"), { travel:44, onChange:on=>$("colRead").innerHTML=on?"<b>on</b> · signal colour":"<b>off</b> · neutral" });
makeToggle($("led"), $("led").querySelector(".tg-k"), { travel:44, onChange:on=>{ $("ledOn").classList.toggle("on",on); $("ledOff").style.opacity=on?.25:1; $("ledRead").innerHTML=on?"<b>on</b> · dot lit":"<b>off</b> · ring lit"; } });
makeToggle($("io"), $("io").querySelector(".tg-k"), { travel:44, onChange:on=>$("ioRead").innerHTML=on?"<b>I</b> · power on":"<b>O</b> · power off" });
makeToggle($("pz"), $("pz").querySelector(".tg-k"), { travel:36, pinch:true, onChange:on=>{ $("pzLed").classList.toggle("on",on); $("pzRead").innerHTML=`<b>${on?"on":"off"}</b>`; } });
makeToggle($("pzt"), $("pzt").querySelector(".tg-k"), { travel:()=>$("pzt").clientWidth-60, pinch:true, onChange:on=>{ $("pztLed").classList.toggle("on",on); $("pztRead").innerHTML=on?"<b>on</b> · knob over the lamp":"<b>off</b> · knob at rest"; } });

/* ── Enochian Toggle Bank 02 ── */
(() => {
  const tracks=$$("#ts .ts-track");
  const read=()=>$("tsRead").innerHTML=`<b>${tracks.map(t=>t.getAttribute("aria-checked")==="true"?"ON":"OFF").join(" – ")}</b>`;
  tracks.forEach(t => makeToggle(t, t.querySelector(".ts-th"), { travel:58, axis:"y", onChange:on=>{ t.closest(".ts-u").querySelector(".dot").classList.toggle("on",on); read(); } }));
})();

/* ── Enochian Rocker Switch Bank ── */
(() => {
  const ps=$$("#ls .ls-p"), lamps=$$("#lsx .lamp-b");
  const read=()=>{ const on=ps.filter(p=>p.getAttribute("aria-pressed")==="true").map(p=>p.querySelector(".n").textContent); $("lsRead").innerHTML=`<b>${on.length} on</b>${on.length?" · "+on.join(" · "):" · all dark"}`; ps.forEach((p,i)=>lamps[i].classList.toggle("on",p.getAttribute("aria-pressed")==="true")); };
  ps.forEach(p => p.addEventListener("click", () => { const v=p.getAttribute("aria-pressed")!=="true"; p.setAttribute("aria-pressed",String(v)); clack(); read(); }));
  read();
})();

/* ── horizontal sliders: Trackin', Square, Dimpled ── */
function makeHSlider(el, { value, steps=null, onChange, fmt }){
  const th=el.querySelector(".hs-th"), fill=el.querySelector(".hs-fill");
  const travel=()=>el.clientWidth-th.offsetWidth;
  let v=value, lastStep=steps?Math.round(v*steps):null;
  const sp=new Spring(v, SNAP, x=>{ const t=travel(); th.style.transform=`translateX(${(x*t).toFixed(2)}px)`; if(fill) fill.style.width=(x*t+th.offsetWidth/2)+"px"; }, .0005);
  const q=x=>steps ? Math.round(x*steps)/steps : x;
  function set(x, mode){ v=clamp(x,0,1); const qv=q(v);
    if(mode==="raw") sp.set(v); else { v=qv; sp.to(v); }
    if(steps){ const s=Math.round(qv*steps); if(s!==lastStep){ lastStep=s; tick(); } }
    el.setAttribute("aria-valuenow", steps?Math.round(qv*steps):Math.round(qv*100)); el.setAttribute("aria-valuetext", fmt(qv)); onChange(qv); }
  let drag=false, off=0;
  el.addEventListener("pointerdown", e => { drag=true; try{ el.setPointerCapture(e.pointerId); }catch(_){} const r=th.getBoundingClientRect(); off=(e.clientX>=r.left&&e.clientX<=r.right)?e.clientX-(r.left+r.width/2):0; move(e, off?"raw":"jump"); });
  const move=(e,mode)=>{ const r=el.getBoundingClientRect(); set((e.clientX-off-r.left-th.offsetWidth/2)/travel(), mode); };
  el.addEventListener("pointermove", e => { if(drag) move(e,"raw"); });
  const up=()=>{ if(!drag) return; drag=false; set(v); };
  el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  el.addEventListener("keydown", e => { const s=steps?1/steps:.01, d={ArrowRight:s,ArrowUp:s,ArrowLeft:-s,ArrowDown:-s,PageUp:s*10,PageDown:-s*10}[e.key];
    if(d!==undefined){ e.preventDefault(); set(v+d); } else if(e.key==="Home"){ e.preventDefault(); set(0); } else if(e.key==="End"){ e.preventDefault(); set(1); } });
  new ResizeObserver(()=>sp.on(sp.x)).observe(el);
  set(v); return { set };
}
makeHSlider($("trk"), { value:.35, fmt:v=>`${Math.round(v*100)}`, onChange:v=>$("trkRead").innerHTML=`<b>${Math.round(v*100)}</b> / 100` });
for(let i=0;i<=10;i++) $("sqTicks").appendChild(document.createElement("i"));
makeHSlider($("sq"), { value:.4, steps:10, fmt:v=>`step ${Math.round(v*10)}`, onChange:v=>{ const s=Math.round(v*10); $("sqRead").innerHTML=`<b>step ${s}</b> of 10`; $$("#sqTicks i").forEach((t,i)=>t.classList.toggle("on",i<=s)); } });
makeHSlider($("dmp"), { value:.2, fmt:v=>`${Math.round(v*100)}`, onChange:v=>$("dmpRead").innerHTML=`<b>${Math.round(v*100)}</b> / 100` });

/* ── Enochian Rotary Switch ── */
(() => {
  const k=$("rk"), rot=$("rkRot"); let on=false, a=0, drag=false, last=null, moved=0;
  const sp=new Spring(0, HEAVY, x=>{ rot.style.transform=`rotate(${x.toFixed(2)}deg)`; }, .05);
  const set=v=>{ const ch=v!==on; on=v; k.classList.toggle("on",on); k.setAttribute("aria-checked",String(on)); a=on?90:0; sp.to(a);
    $("rkOnL").classList.toggle("on",on); if(ch) clack(); $("rkRead").innerHTML=on?"<b>on</b> · 90°":"<b>off</b> · 0°"; };
  const ang=e=>{ const r=k.getBoundingClientRect(); return Math.atan2(e.clientY-(r.top+r.height/2), e.clientX-(r.left+r.width/2))*180/Math.PI; };
  k.addEventListener("pointerdown", e=>{ drag=true; last=ang(e); moved=0; try{ k.setPointerCapture(e.pointerId); }catch(_){} });
  k.addEventListener("pointermove", e=>{ if(!drag) return; const n=ang(e); let d=n-last; if(d>180) d-=360; if(d<-180) d+=360; last=n; moved+=Math.abs(d); a=clamp(a+d,-8,98); sp.set(a); });
  k.addEventListener("pointerup", ()=>{ if(!drag) return; drag=false; if(moved<4) set(!on); else set(a>45); });
  k.addEventListener("pointercancel", ()=>{ drag=false; set(on); });
  k.addEventListener("keydown", e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); set(!on); } else if(e.key==="ArrowRight"||e.key==="ArrowUp"){ e.preventDefault(); set(true); } else if(e.key==="ArrowLeft"||e.key==="ArrowDown"){ e.preventDefault(); set(false); } });
})();

/* ── Enochian Joystick ── */
(() => {
  const base=$("jpBase"), stick=$("jp"), dot=$("jpDot"), arena=$("jpArena"), MAX=26;
  const S={ x:0, y:0, px:85, py:75, drag:false, keys:new Set(), readAt:0 };
  const sx=new Spring(0, SNAP, ()=>{}, .001), sy=new Spring(0, SNAP, ()=>{}, .001);
  const draw=()=>{ stick.style.transform=`translate(${(sx.x*MAX).toFixed(2)}px,${(sy.x*MAX).toFixed(2)}px)`; };
  sx.on=x=>{ sx.x=x; draw(); }; sy.on=y=>{ sy.x=y; draw(); };
  const DIRS=["E","SE","S","SW","W","NW","N","NE"];
  function aim(x,y){ const r=Math.hypot(x,y); if(r>1){ x/=r; y/=r; } S.x=x; S.y=y; addLoop(jpTick); }
  function jpTick(dt, now){
    if(!S.drag){ const kx=(S.keys.has("ArrowRight")?1:0)-(S.keys.has("ArrowLeft")?1:0), ky=(S.keys.has("ArrowDown")?1:0)-(S.keys.has("ArrowUp")?1:0);
      if(kx||ky){ const r=Math.hypot(kx,ky); sx.to(kx/r); sy.to(ky/r); } else if(S.keys.size===0){ sx.to(0); sy.to(0); } S.x=sx.x; S.y=sy.x; }
    const W=arena.clientWidth, H=arena.clientHeight, sp=140;
    S.px=clamp(S.px+S.x*sp*dt,7,W-7); S.py=clamp(S.py+S.y*sp*dt,7,H-7);
    dot.style.transform=`translate(${S.px.toFixed(1)}px,${S.py.toFixed(1)}px)`;
    if(now-S.readAt>90){ S.readAt=now; const r=Math.hypot(S.x,S.y);
      $("jpRead").innerHTML = r<.12 ? `<b>center</b> · x 0.00 · y 0.00` : `<b>${DIRS[(Math.round(Math.atan2(S.y,S.x)/(Math.PI/4))+8)%8]}</b> · x ${S.x.toFixed(2)} · y ${(-S.y).toFixed(2)} · ${Math.round(r*100)}%`; }
    return S.drag || S.keys.size>0 || Math.hypot(sx.x,sy.x)>.01 || Math.hypot(S.x,S.y)>.01;
  }
  const local=e=>{ const r=base.getBoundingClientRect(); return [(e.clientX-(r.left+r.width/2))/MAX, (e.clientY-(r.top+r.height/2))/MAX]; };
  base.addEventListener("pointerdown", e=>{ S.drag=true; try{ base.setPointerCapture(e.pointerId); }catch(_){} const [x,y]=local(e); const r=Math.hypot(x,y), k=r>1?1/r:1; sx.set(x*k); sy.set(y*k); aim(x,y); tick(); });
  base.addEventListener("pointermove", e=>{ if(!S.drag) return; const [x,y]=local(e); const r=Math.hypot(x,y), k=r>1?1/r:1; sx.set(x*k); sy.set(y*k); aim(x,y); });
  const up=()=>{ if(!S.drag) return; S.drag=false; sx.to(0); sy.to(0); aim(0,0); };
  base.addEventListener("pointerup", up); base.addEventListener("pointercancel", up);
  base.addEventListener("keydown", e=>{ if(e.key.startsWith("Arrow")){ e.preventDefault(); S.keys.add(e.key); addLoop(jpTick); } });
  base.addEventListener("keyup", e=>{ S.keys.delete(e.key); addLoop(jpTick); });
  base.addEventListener("blur", ()=>{ S.keys.clear(); addLoop(jpTick); });
  dot.style.transform=`translate(${S.px}px,${S.py}px)`;
})();

/* ── Enochian Bouncing Balls ── */
(() => {
  const units=$$("#bb .bb-u"), G=1800; let bounces=0;
  const balls=units.map(u=>({ el:u.querySelector(".bb-ball"), sh:u.querySelector(".bb-shadow"), y:0, vy:0, sq:0, live:false }));
  function draw(b){ b.el.style.transform=`translateY(${(-b.y).toFixed(1)}px) scale(${(1+b.sq*.6).toFixed(3)},${(1-b.sq).toFixed(3)})`;
    b.sh.style.transform=`scale(${Math.max(.35,1-b.y/360).toFixed(3)})`; b.sh.style.opacity=Math.max(.15,1-b.y/260).toFixed(3); }
  function bbTick(dt){
    let any=false;
    balls.forEach(b=>{ if(!b.live) return; any=true;
      b.vy-=G*dt; b.y+=b.vy*dt; b.sq*=Math.exp(-dt*18);
      if(b.y<=0){ b.y=0; const impact=-b.vy; if(impact>90){ b.vy=impact*.66; b.sq=Math.min(.32,impact/2600); bounces++; click(900+impact*.3, Math.min(.22,impact/4500), 1.4); } else { b.vy=0; b.live=b.sq>.01; } }
      draw(b); });
    $("bbRead").innerHTML = any ? `<b>bouncing</b> · ${bounces} bounces` : `<b>at rest</b> · ${bounces} bounces`;
    return any;
  }
  const launch=b=>{ if(reduce){ b.sq=.2; draw(b); setTimeout(()=>{ b.sq=0; draw(b); },150); tick(); return; } b.vy=620+Math.random()*180; b.live=true; addLoop(bbTick); tick(); };
  balls.forEach(b=>b.el.addEventListener("click", ()=>launch(b)));
  $("bbAll").onclick=()=>balls.forEach((b,i)=>setTimeout(()=>launch(b), reduce?0:i*90));
})();

paintAccent();
})();

}
{
const root=globalThis.document.getElementById("source-instruments");
const document=scopedDocument(root);
const addEventListener=scopedListener(root);

(() => {
"use strict";
const SNAP  = { stiffness:700, damping:35, mass:0.8 };
const HEAVY = { stiffness:300, damping:30, mass:1.2 };
const PRESS = { stiffness:720, damping:32, mass:0.55 };
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = id => document.getElementById(id);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, parent){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k, attrs[k]); if(parent) parent.appendChild(e); return e; }
const fmtSigned = (v,d=1) => (v>0?"+":v<0?"−":"±") + Math.abs(v).toFixed(d);

/* ── spring: same SNAP / HEAVY constants as Volume I, integrated inline ── */
class Spring {
  constructor(value, cfg, onUpdate, prec=0.01){ this.x=value; this.v=0; this.t=value; this.cfg=cfg; this.on=onUpdate; this.prec=prec; this.raf=0; onUpdate(value); }
  to(target, cfg){
    this.t=target; if(cfg) this.cfg=cfg;
    if(reduce){ this.x=target; this.v=0; this.on(target); return; }
    if(!this.raf){ this.last=performance.now(); this.raf=requestAnimationFrame(this.step); }
  }
  set(value){ this.x=this.t=value; this.v=0; if(this.raf){ cancelAnimationFrame(this.raf); this.raf=0; } this.on(value); }
  step = (now) => {
    let dt=Math.min(0.05,(now-this.last)/1000); this.last=now;
    const { stiffness:k, damping:c, mass:m } = this.cfg;
    while(dt>0){ const h=Math.min(1/240, dt); const a=(-k*(this.x-this.t)-c*this.v)/m; this.v+=a*h; this.x+=this.v*h; dt-=h; }
    if(Math.abs(this.x-this.t)<this.prec && Math.abs(this.v)<this.prec*4){ this.x=this.t; this.v=0; this.on(this.x); this.raf=0; return; }
    this.on(this.x); this.raf=requestAnimationFrame(this.step);
  };
}

/* ── one shared frame loop for continuous instruments ── */
const loops = new Set(); let loopRaf=0, loopLast=0;
function addLoop(fn){ loops.add(fn); if(!loopRaf){ loopLast=performance.now(); loopRaf=requestAnimationFrame(runLoop); } }
function runLoop(now){
  const dt=Math.min(0.05,(now-loopLast)/1000); loopLast=now;
  for(const fn of [...loops]){ if(fn(dt, now)===false) loops.delete(fn); }
  loopRaf = loops.size ? requestAnimationFrame(runLoop) : 0;
}
const visible = new Map();
const wakers = new Map();
const io = new IntersectionObserver(entries => entries.forEach(e => {
  visible.set(e.target, e.isIntersecting);
  if(e.isIntersecting && wakers.has(e.target)) wakers.get(e.target)();
}), { rootMargin:"120px" });
function watch(el, wake){ visible.set(el, true); wakers.set(el, wake); io.observe(el); }

/* ── sound: short filtered noise for mechanical clicks; starts only from a gesture ── */
let AC=null, NB=null, soundOn=true;
function audio(){
  if(!soundOn) return null;
  if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return null; } }
  if(!MASTER){ MASTER=AC.createGain(); ANALYSER=AC.createAnalyser(); ANALYSER.fftSize=1024; ANALYSER.smoothingTimeConstant=.6; MASTER.connect(ANALYSER); ANALYSER.connect(AC.destination); MASTER.gain.value=masterGainVal(); }
  if(AC.state==="suspended") AC.resume();
  if(!NB){ NB=AC.createBuffer(1, Math.floor(AC.sampleRate*0.08), AC.sampleRate); const d=NB.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,5); }
  return AC;
}
function click(freq=3200, gain=0.12, q=1.4){
  const a=audio(); if(!a) return;
  const src=a.createBufferSource(); src.buffer=NB;
  const f=a.createBiquadFilter(); f.type="bandpass"; f.frequency.value=freq; f.Q.value=q;
  const g=a.createGain(); g.gain.value=gain;
  src.connect(f); f.connect(g); g.connect(MASTER); src.start();
}
const tick  = () => click(4200, 0.07, 2);
const thock = () => click(1100, 0.22, 1.1);
const clack = () => { click(1700, 0.16, 1.2); setTimeout(()=>click(3600,0.06,2), 28); };

/* ── accent, sound, finishes ── */
let ACCENT = "#CC0000";
const accentHooks = [];
function paintAccent(){
  document.documentElement.style.setProperty("--accent", ACCENT);
  $("accRed").setAttribute("aria-pressed", String(ACCENT==="#CC0000"));
  accentHooks.forEach(f=>f());
}
$("accRed").onclick    = () => { ACCENT="#CC0000"; paintAccent(); tick(); };
$("soundBtn").onclick = () => { soundOn=!soundOn; $("soundBtn").setAttribute("aria-pressed", String(soundOn)); $("soundBtn").textContent = soundOn?"ON":"OFF"; tick(); };

function bindFinish(groupId, targetId, after){
  const group=$(groupId), target=$(targetId);
  group.addEventListener("click", e => {
    const b=e.target.closest("button[data-finish]"); if(!b) return;
    target.dataset.finish=b.dataset.finish;
    $$("button[data-finish]", group).forEach(x=>x.setAttribute("aria-pressed", String(x===b)));
    tick(); if(after) after(b.dataset.finish);
  });
}

/* ── Code ── */
const veil=$("veil");
const veilSpring = new Spring(0, SNAP, x => { $("veilKnob").style.transform=`translateX(${x}px)`; });
bindFinish("veilFinish","veil");
veil.addEventListener("click", () => {
  const on = !document.body.classList.contains("show-code");
  document.body.classList.toggle("show-code", on);
  veil.setAttribute("aria-checked", String(on));
  $("veilLabel").textContent = on ? "Hide code" : "Show code";
  veilSpring.to(on ? 72 : 0);
  $$(".code-snippet").forEach(s => { s.inert = !on; s.setAttribute("aria-hidden", String(!on)); });
  thock();
});
$$(".copy-code").forEach(btn => btn.addEventListener("click", () => {
  const code = btn.closest(".code-snippet").querySelector("code");
  const done = t => { btn.textContent=t; setTimeout(()=>btn.textContent="COPY", 1400); };
  const fallback = () => { const r=document.createRange(); r.selectNodeContents(code); const s=getSelection(); s.removeAllRanges(); s.addRange(r); done("SELECTED"); };
  try { navigator.clipboard.writeText(code.textContent).then(()=>done("COPIED"), fallback); } catch(e){ fallback(); }
}));

/* ── generic rotary (drag ↕, arrows, Home/End) ── */
function makeRotary(el, knob, { value=0.5, onChange, arc=270, cfg=HEAVY }={}){
  let v=value;
  const sp = new Spring(v, cfg, x => { knob.style.transform=`rotate(${-arc/2 + x*arc}deg)`; }, 0.0005);
  function set(nv, instant){ v=clamp(nv,0,1); instant ? sp.set(v) : sp.to(v); el.setAttribute("aria-valuenow", Math.round(v*100)); el.setAttribute("aria-valuetext", Math.round(v*100)+" percent"); onChange && onChange(v); }
  let sy=0, sv=0, drag=false;
  el.addEventListener("pointerdown", e => { drag=true; sy=e.clientY; sv=v; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", e => { if(drag) set(sv + (sy-e.clientY)/150, true); });
  el.addEventListener("pointerup", () => { drag=false; });
  el.addEventListener("pointercancel", () => { drag=false; });
  el.addEventListener("keydown", e => {
    const k=e.key; let d=null;
    if(k==="ArrowRight"||k==="ArrowUp") d=v+.02; else if(k==="ArrowLeft"||k==="ArrowDown") d=v-.02; else if(k==="Home") d=0; else if(k==="End") d=1;
    if(d!==null){ set(d); e.preventDefault(); }
  });
  return { set, get:()=>v };
}

/* ═════════ Enochian Analog Level Meter + Enochian LED Level Meter (shared signal) ═════════ */
const SIG = { on:true, gain:0.62, ch:{ L:{n:0,lvl:-90,p:0,v:0,lad:-90,hold:-90,holdAt:0}, R:{n:0,lvl:-90,p:0,v:0,lad:-90,hold:-90,holdAt:0} }, peakUntil:{L:0,R:0}, lampTest:0, ladMode:"peak", ladHold:true };
const vuPos = db => Math.pow(10, db/20) / Math.pow(10, 3/20);
const vuAng = p => -44 + p*88;
const VU_DB = [-20,-10,-7,-5,-3,-2,-1,0,1,2,3];
const VU_LBL = { "-20":"−20","-10":"−10","-7":"−7","-5":"−5","-3":"−3","-1":"−1","0":"0","1":"+1","2":"+2","3":"+3" };
const needles={}, peaks={};
function buildVU(svg, chName){
  const cx=110, cy=150, R=110;
  const pt=(r,a)=>[cx + r*Math.sin(a*Math.PI/180), cy - r*Math.cos(a*Math.PI/180)];
  const arc=(r,a0,a1)=>{ const [x0,y0]=pt(r,a0),[x1,y1]=pt(r,a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  svgEl("path",{ d:arc(R, vuAng(vuPos(-20)), vuAng(vuPos(0))), class:"vu-line", fill:"none", "stroke-width":1.1 }, svg);
  svgEl("path",{ d:arc(R+3, vuAng(vuPos(0)), vuAng(1)), class:"vu-hot", fill:"none", "stroke-width":6 }, svg);
  VU_DB.forEach(db => {
    const a=vuAng(vuPos(db)), hot=db>0, major=!!VU_LBL[db];
    const [x1,y1]=pt(R,a), [x2,y2]=pt(R+(major?9:6),a);
    svgEl("line",{ x1,y1,x2,y2, class:hot?"vu-hot":"vu-line", "stroke-width":1.3 }, svg);
    if(major){ const [tx,ty]=pt(R+18,a); const t=svgEl("text",{ x:tx.toFixed(1), y:(ty+3).toFixed(1), "text-anchor":"middle", class:hot?"vu-num vu-num-hot":"vu-num" }, svg); t.textContent=VU_LBL[db]; }
  });
  [0,20,40,60,80,100].forEach(pc => {
    const a=vuAng(pc/100*vuPos(0)); const [x1,y1]=pt(R-4,a), [x2,y2]=pt(R-9,a);
    svgEl("line",{ x1,y1,x2,y2, class:"vu-pct-t", "stroke-width":0.9 }, svg);
    const [tx,ty]=pt(R-16,a); const t=svgEl("text",{ x:tx.toFixed(1), y:(ty+2.5).toFixed(1), "text-anchor":"middle", class:"vu-pct" }, svg); t.textContent=pc;
  });
  svgEl("text",{ x:110, y:88, "text-anchor":"middle", class:"vu-big" }, svg).textContent="VU";
  svgEl("text",{ x:110, y:99, "text-anchor":"middle", class:"vu-tiny" }, svg).textContent="dB · ENOCHIAN";
  svgEl("text",{ x:14, y:106, class:"vu-tiny" }, svg).textContent=chName;
  svgEl("text",{ x:190, y:16, "text-anchor":"end", class:"vu-tiny" }, svg).textContent="PEAK";
  peaks[chName] = svgEl("circle",{ cx:200, cy:13.5, r:3.6, class:"vu-peak" }, svg);
  const g = svgEl("g",{ class:"vu-needle", transform:`rotate(-44 ${cx} ${cy})` }, svg);
  svgEl("line",{ x1:cx, y1:cy, x2:cx, y2:cy-R-8, "stroke-width":1.4, "stroke-linecap":"round" }, g);
  svgEl("rect",{ x:0, y:110, width:220, height:18, class:"vu-shroud" }, svg);
  svgEl("path",{ d:"M0 110.5H220", stroke:"rgba(0,0,0,.25)", "stroke-width":1 }, svg);
  needles[chName]=g;
}
buildVU($("vuL"),"L"); buildVU($("vuR"),"R");
bindFinish("vuFinish","vu");

const LAD_DB=[-40,-30,-24,-20,-16,-13,-10,-8,-6,-5,-4,-3,-2,-1,0,1,2,3,5,8];
const LAD_LBL={0:"−40",3:"−20",6:"−10",8:"−6",11:"−3",14:"0",17:"+3",19:"+8"};
const ladSegs={L:[],R:[]};
["L","R"].forEach(ch => LAD_DB.forEach((db,i) => { const s=document.createElement("i"); if(db>0) s.classList.add("hot"); $("lad"+ch).appendChild(s); ladSegs[ch].push(s); }));
LAD_DB.forEach((db,i) => { const s=document.createElement("span"); s.textContent=LAD_LBL[i]||""; $("ladNums").appendChild(s); });
const ladState={L:{lit:-1,hold:-1},R:{lit:-1,hold:-1}};
bindFinish("ladFinish","lad");

function vuDbFromPos(p){ return 20*Math.log10(Math.max(p,1e-5)*Math.pow(10,3/20)); }
let vuReadAt=0;
function sigTick(dt, now){
  const t=now/1000;
  const anyVisible = visible.get($("vu")) || visible.get($("lad"));
  let settled=true;
  for(const k of ["L","R"]){
    const c=SIG.ch[k];
    c.n = c.n*Math.exp(-dt*3) + (Math.random()-.5)*Math.sqrt(dt)*9;
    const beat = Math.pow(Math.max(0, Math.sin(t*Math.PI*2*1.85 + (k==="R"?0.35:0))), 8)*5;
    const base = -28 + SIG.gain*34;
    c.lvl = SIG.on ? base + c.n*2.2 + beat + Math.sin(t*0.4)*2.5 - 2 : -90;
    // needle ballistics
    const target = SIG.on ? vuPos(c.lvl) : 0;
    if(reduce){ c.p += (target-c.p)*Math.min(1, dt*8); c.v=0; }
    else { let h=dt; while(h>0){ const s=Math.min(1/240,h); const a=-110*(c.p-target)-15*c.v; c.v+=a*s; c.p+=c.v*s; h-=s; } }
    if(c.p>1.04){ c.p=1.04; c.v*=-0.3; } if(c.p<-0.02){ c.p=-0.02; c.v*=-0.3; }
    if(Math.abs(c.p-target)>0.001 || Math.abs(c.v)>0.001) settled=false;
    needles[k].setAttribute("transform", `rotate(${vuAng(c.p).toFixed(2)} 110 150)`);
    if(SIG.on && c.lvl>0.5) SIG.peakUntil[k]=now+350;
    peaks[k].classList.toggle("on", now<SIG.peakUntil[k]);
    // ladder
    if(SIG.ladMode==="peak") c.lad=Math.max(c.lvl, c.lad-24*dt); else c.lad += (c.lvl-c.lad)*(1-Math.exp(-dt/0.3));
    if(c.lad>=c.hold){ c.hold=c.lad; c.holdAt=now; } else if(now-c.holdAt>1200) c.hold-=30*dt;
    let lit = LAD_DB.filter(s=>s<=c.lad).length;
    let hold = SIG.ladHold ? LAD_DB.filter(s=>s<=c.hold).length-1 : -1;
    if(SIG.lampTest){ const e=(now-SIG.lampTest)/1200; if(e>=1) SIG.lampTest=0; else { lit=Math.round((1-Math.abs(e*2-1))*20); hold=-1; } }
    if(c.lad>-60 || c.hold>-60 || SIG.lampTest) settled=false;
    const st=ladState[k];
    if(st.lit!==lit || st.hold!==hold){ ladSegs[k].forEach((s,i)=>{ s.classList.toggle("on", i<lit); s.classList.toggle("hold", i===hold && i>=lit); }); st.lit=lit; st.hold=hold; }
  }
  if(now-vuReadAt>140){
    vuReadAt=now;
    const p=Math.max(SIG.ch.L.p, SIG.ch.R.p), db=vuDbFromPos(p);
    $("vuRead").textContent = (!SIG.on && p<0.05) || db<-20 ? "< −20 VU" : fmtSigned(db)+" VU";
    $("vuL").setAttribute("aria-valuenow", clamp(vuDbFromPos(SIG.ch.L.p),-20,3).toFixed(1));
    $("vuR").setAttribute("aria-valuenow", clamp(vuDbFromPos(SIG.ch.R.p),-20,3).toFixed(1));
    const lad=Math.max(SIG.ch.L.lad, SIG.ch.R.lad);
    $("ladRead").textContent = lad<-40 ? "−∞ dB" : fmtSigned(lad,0)+" dB";
  }
  if(!anyVisible && !SIG.lampTest) return false;
  if(!SIG.on && settled) return false;
  return true;
}
const startSignal = () => addLoop(sigTick);
watch($("vu"), startSignal); watch($("lad"), startSignal);

const gain = makeRotary($("vuGain"), $("vuGainKnob"), { value:SIG.gain, onChange:v => { SIG.gain=v; $("vuGainRead").textContent=`gain ${Math.round(v*100)}%`; syncGainPresets(); } });
function syncGainPresets(){ $$("[data-gain]").forEach(b=>b.setAttribute("aria-pressed", String(Math.abs(+b.dataset.gain-SIG.gain)<0.01))); }
$$("[data-gain]").forEach(b => b.onclick = () => { gain.set(+b.dataset.gain); tick(); });
syncGainPresets();
$("sigBtn").onclick = () => {
  SIG.on=!SIG.on; const b=$("sigBtn"); b.setAttribute("aria-pressed", String(SIG.on)); b.textContent = SIG.on?"SIGNAL ON":"SIGNAL OFF";
  $("vuGain").dataset.lit=String(SIG.on); thock(); startSignal();
};
function setLadMode(m){ SIG.ladMode=m; $("ladPeak").setAttribute("aria-pressed", String(m==="peak")); $("ladAvg").setAttribute("aria-pressed", String(m==="avg")); ladModeText(); tick(); }
function ladModeText(){ $("ladMode").textContent = (SIG.ladMode==="peak"?"peak":"average") + (SIG.ladHold?" · hold":""); }
$("ladPeak").onclick=()=>setLadMode("peak"); $("ladAvg").onclick=()=>setLadMode("avg");
$("ladHold").onclick=()=>{ SIG.ladHold=!SIG.ladHold; $("ladHold").setAttribute("aria-pressed", String(SIG.ladHold)); ladModeText(); tick(); };
$("ladTest").onclick=()=>{ SIG.lampTest=performance.now(); thock(); startSignal(); };

/* ═════════ generic fader ═════════ */
const faders=[];
function makeFader({ track, cap, min, max, step, value, pad, detent=null, zone=0, big, onInput, fmt }){
  let v=value, mn=min, mx=max;
  const norm = x => (x-mn)/(mx-mn);
  const ypos = n => pad + (1-n)*(track.clientHeight-2*pad) - cap.offsetHeight/2;
  const sp = new Spring(norm(v), SNAP, n => { cap.style.transform=`translateY(${ypos(n).toFixed(2)}px)`; }, 0.0005);
  // the detent catches pointer input only, so arrow keys can still step off center
  function q(x, catchDetent){ x=clamp(x,mn,mx); x=Math.round(x/step)*step; if(catchDetent && detent!==null && Math.abs(x-detent)<zone) x=detent; return +x.toFixed(4); }
  function aria(){ track.setAttribute("aria-valuemin",mn); track.setAttribute("aria-valuemax",mx); track.setAttribute("aria-valuenow",v); track.setAttribute("aria-valuetext", fmt(v)); }
  function set(x, src="api"){
    const prev=v; v=q(x, src==="drag"||src==="jump");
    (src==="drag"||src==="link-drag") ? sp.set(norm(v)) : sp.to(norm(v));
    aria();
    if(v!==prev){ if(detent!==null && v===detent) thock(); onInput && onInput(v, prev, src); }
  }
  let drag=false, off=0;
  track.addEventListener("pointerdown", e => {
    drag=true; track.setPointerCapture(e.pointerId);
    const cr=cap.getBoundingClientRect();
    off = (e.clientY>=cr.top && e.clientY<=cr.bottom) ? e.clientY-(cr.top+cr.height/2) : 0;
    move(e, off ? "drag" : "jump");
  });
  function move(e, src){ const r=track.getBoundingClientRect(); const n=1-(e.clientY-off-r.top-pad)/(r.height-2*pad); set(mn+n*(mx-mn), src); }
  track.addEventListener("pointermove", e => { if(drag) move(e,"drag"); });
  track.addEventListener("pointerup", () => { drag=false; });
  track.addEventListener("pointercancel", () => { drag=false; });
  track.addEventListener("keydown", e => {
    const k=e.key; let d=null;
    if(k==="ArrowUp"||k==="ArrowRight") d=v+step; else if(k==="ArrowDown"||k==="ArrowLeft") d=v-step;
    else if(k==="PageUp") d=v+big; else if(k==="PageDown") d=v-big; else if(k==="Home") d=mn; else if(k==="End") d=mx;
    else if((k==="0"||k==="Delete") && detent!==null) d=detent;
    if(d!==null){ set(d,"key"); e.preventDefault(); }
  });
  aria();
  const api={ set, get:()=>v, setRange(a,b){ mn=a; mx=b; v=q(v); sp.set(norm(v)); aria(); }, refresh(){ sp.on(sp.x); } };
  faders.push(api); return api;
}
addEventListener("resize", () => faders.forEach(f=>f.refresh()));

/* ═════════ Enochian Pitch Slider ═════════ */
let PITCH=0, PITCH_RANGE=8;
function drawMerScale(){
  const svg=$("merScale"); svg.innerHTML=""; const H=260, pad=24, k=PITCH_RANGE/8;
  for(let i=-8;i<=8;i++){
    const y=pad+(1-(i+8)/16)*(H-2*pad); const major=i%2===0;
    svgEl("line",{ x1:major?21:25, y1:y, x2:32, y2:y, "stroke-width":i===0?1.8:1 }, svg);
    if(major){ const t=svgEl("text",{ x:18, y:y+3, "text-anchor":"end" }, svg); const val=i*k; t.textContent = val===0?"0":(val>0?"+":"−")+Math.abs(val); }
  }
}
drawMerScale();
const merFmt = v => v===0 ? "0.0 percent, centered" : `${v>0?"plus":"minus"} ${Math.abs(v).toFixed(1)} percent`;
const mer = makeFader({ track:$("merTrack"), cap:$("merCap"), min:-8, max:8, step:0.1, value:0, pad:24, detent:0, zone:0.32, big:1, fmt:merFmt, onInput:v=>updatePitch(v) });
function updatePitch(v){
  PITCH=v; $("merVal").textContent = v===0 ? "0.0%" : fmtSigned(v)+"%";
  $("merLed").classList.toggle("on", v===0);
  const base = TT.rpm===45 ? 45 : 33.333; const eff=base*(1+v/100);
  $("merRpm").textContent = v===0 ? `${TT.rpm===45?"45":"33⅓"} rpm · quartz lock` : `${eff.toFixed(2)} rpm`;
  $("ttPitch").textContent = "pitch " + (v===0?"±0.0":fmtSigned(v));
}
$("merReset").onclick = () => mer.set(0);
$$("[data-range]").forEach(b => b.onclick = () => {
  PITCH_RANGE=+b.dataset.range; $$("[data-range]").forEach(x=>x.setAttribute("aria-pressed", String(x===b)));
  mer.setRange(-PITCH_RANGE, PITCH_RANGE); drawMerScale(); updatePitch(mer.get()); tick();
});
bindFinish("merFinish","mer");

/* ═════════ Enochian DJ Mixer ═════════ */
function drawRegScale(svg, kind){
  const H=190, pad=20;
  const marks = kind==="level" ? [[0,"0"],[-6,"6"],[-12,"12"],[-18,"18"],[-24,"24"],[-30,"30"],[-36,"∞"]] : [[12,"+12"],[6,"6"],[3,"3"],[0,"0"],[-3,"3"],[-6,"6"],[-12,"12"]];
  const [lo,hi] = kind==="level" ? [-36,0] : [-12,12];
  marks.forEach(([val,lbl]) => { const y=pad+(1-(val-lo)/(hi-lo))*(H-2*pad); svgEl("line",{ x1:15, y1:y, x2:21, y2:y, "stroke-width":1 }, svg); const t=svgEl("text",{ x:13, y:y+3, "text-anchor":"end" }, svg); t.textContent=lbl; });
}
$$(".reg-scale").forEach(s => drawRegScale(s, s.dataset.scale));
let regLinked=true; const REG={};
const lvlFmt = v => v<=-36 ? "off" : `${v===0?"0":"minus "+Math.abs(v)} decibels`;
const toneFmt = v => v===0 ? "0, flat" : `${v>0?"plus":"minus"} ${Math.abs(v)} decibels`;
$$(".reg-track").forEach(track => {
  const ch=track.dataset.ch, level = ch==="L"||ch==="R";
  REG[ch] = makeFader({ track, cap:track.querySelector(".reg-cap"), min:level?-36:-12, max:level?0:12, step:level?1:0.5, value:level?-12:(ch==="bass"?3:0), pad:20,
    detent:level?null:0, zone:0.6, big:level?6:3, fmt:level?lvlFmt:toneFmt,
    onInput:(v,prev,src) => {
      if(level && regLinked && !src.startsWith("link")){ const o=REG[ch==="L"?"R":"L"]; o.set(o.get()+(v-prev), src==="drag"?"link-drag":"link"); }
      regRead();
    } });
  REG[ch].ch=ch;
});
function regRead(){
  const L=REG.L.get(), R=REG.R.get(), b=REG.bass.get(), t=REG.treble.get();
  const lv = L===R ? (L<=-36?"off":`${L===0?"0":"−"+Math.abs(L)} dB`) : `L ${L<=-36?"off":"−"+Math.abs(L)} / R ${R<=-36?"off":"−"+Math.abs(R)}`;
  $("regRead").innerHTML = `<b>${lv}</b> · bass ${b===0?"0":fmtSigned(b,b%1?1:0)} · treble ${t===0?"0":fmtSigned(t,t%1?1:0)} · ${regLinked?"linked":"unlinked"}`;
}
const regLinkSpring = new Spring(regLinked?.15:1, PRESS, x => $("regLink").style.setProperty("--lift", x.toFixed(3)), 0.002);
$("regLink").onclick = () => { regLinked=!regLinked; $("regLink").setAttribute("aria-pressed", String(regLinked)); regLinkSpring.to(regLinked?.15:1, regLinked?PRESS:SNAP); clack(); regRead(); };
const REG_PRESETS = { flat:{L:-12,R:-12,bass:0,treble:0}, loud:{L:-18,R:-18,bass:6,treble:3}, speech:{L:-9,R:-9,bass:-6,treble:2} };
$$("[data-preset]").forEach(b => b.onclick = () => {
  const p=REG_PRESETS[b.dataset.preset]; const was=regLinked; regLinked=false;
  ["L","R","bass","treble"].forEach((ch,i) => setTimeout(() => { REG[ch].set(p[ch]); if(i===3){ regLinked=was; regRead(); } }, reduce?0:i*40));
  tick();
});
regRead();
bindFinish("regFinish","reg");

/* ═════════ Enochian Radio Tuner ═════════ */
const BANDS = {
  fm:{ min:87.5, max:108, step:0.1, ppu:70, major:1, mid:0.5, dec:1, unit:"MHz", word:"megahertz", label:"FM · MHz", stations:[88.9,91.5,93.1,95.7,98.3,100.7,102.9,105.1,107.3], magnet:0.25, reach:0.6, value:98.3 },
  mw:{ min:530, max:1710, step:10, ppu:1.2, major:100, mid:50, dec:0, unit:"kHz", word:"kilohertz", label:"MW · kHz", stations:[610,770,880,1010,1130,1260,1480,1600], magnet:25, reach:60, value:880 }
};
let band=BANDS.fm, apV=band.value, apVel=0, apGliding=false;
const AP_MARGIN=60;
const apX = v => AP_MARGIN + (v-band.min)*band.ppu;
function drawStrip(){
  const W=Math.round((band.max-band.min)*band.ppu + AP_MARGIN*2), H=128, base=98;
  const svg=document.createElementNS(NS,"svg"); svg.setAttribute("width",W); svg.setAttribute("height",H); svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svgEl("line",{ x1:apX(band.min), y1:base, x2:apX(band.max), y2:base, class:"ap-t", "stroke-width":1 }, svg);
  const n=Math.round((band.max-band.min)/band.step);
  for(let i=0;i<=n;i++){
    const v=+(band.min+i*band.step).toFixed(3), x=apX(v);
    const isMajor = Math.abs(v/band.major-Math.round(v/band.major))<1e-6, isMid = !isMajor && Math.abs(v/band.mid-Math.round(v/band.mid))<1e-6;
    const len = isMajor?22:isMid?14:7;
    svgEl("line",{ x1:x, y1:base-len, x2:x, y2:base, class:"ap-t", "stroke-width":isMajor?1.6:1, opacity:isMajor?1:0.7 }, svg);
    if(isMajor){ const t=svgEl("text",{ x, y:base-34, "text-anchor":"middle", class:"ap-n"+(band===BANDS.fm?" fm":"") }, svg); t.textContent = band===BANDS.fm ? v.toFixed(0) : v; }
  }
  band.stations.forEach(s => svgEl("circle",{ cx:apX(s), cy:base+10, r:2.6, class:"ap-st" }, svg));
  svgEl("text",{ x:apX(band.min), y:base+24, class:"ap-st", "font-size":"9", "font-family":"IBM Plex Mono,monospace" }, svg).textContent = "· stations";
  const strip=$("apStrip"); strip.innerHTML=""; strip.appendChild(svg); strip.style.width=W+"px";
  $("apBandLbl").textContent=band.label; $("apUnit").textContent=band.unit;
  const w=$("apWin"); w.setAttribute("aria-valuemin",band.min); w.setAttribute("aria-valuemax",band.max);
}
let apLastStep=null;
function apRender(v){
  apV=clamp(v,band.min,band.max);
  $("apStrip").style.transform=`translateX(${($("apWin").clientWidth/2 - apX(apV)).toFixed(2)}px)`;
  const q=+(Math.round(apV/band.step)*band.step).toFixed(3);
  const d=Math.min(...band.stations.map(s=>Math.abs(s-apV)));
  const strength=Math.max(0,1-d/band.reach), bars=Math.round(strength*5), tuned=d<band.step*0.5;
  $("apVal").textContent=q.toFixed(band.dec);
  $("apState").textContent = (tuned?"tuned":"searching") + ` · signal ${bars}/5`;
  $("apLamp").classList.toggle("on", tuned); $("apLockLbl").textContent = tuned?"TUNED":"SEARCH";
  $$("#apBars i").forEach((b,i)=>b.classList.toggle("on", i<bars));
  const w=$("apWin"); w.setAttribute("aria-valuenow", q); w.setAttribute("aria-valuetext", `${q.toFixed(band.dec)} ${band.word}${tuned?", tuned":""}`);
  const major=Math.floor(apV/band.major); if(apLastStep!==null && major!==apLastStep) tick(); apLastStep=major;
}
const apSpring = new Spring(apV, SNAP, apRender, 0.0005);
function apSettle(){
  const near=band.stations.find(s=>Math.abs(s-apV)<=band.magnet);
  const target = near ?? +(Math.round(apV/band.step)*band.step).toFixed(3);
  apSpring.x=apV; apSpring.v=0; apSpring.to(clamp(target,band.min,band.max));
  if(near) setTimeout(thock, reduce?0:120);
  band.value=clamp(target,band.min,band.max);
}
function apTune(v){ apSpring.to(clamp(v,band.min,band.max)); band.value=clamp(v,band.min,band.max); }
(() => {
  const win=$("apWin"); let drag=false, sx=0, sv=0, samples=[];
  win.addEventListener("pointerdown", e => { drag=true; apGliding=false; sx=e.clientX; sv=apV; samples=[[e.clientX,performance.now()]]; win.setPointerCapture(e.pointerId); apSpring.set(apV); });
  win.addEventListener("pointermove", e => {
    if(!drag) return; apSpring.set(sv-(e.clientX-sx)/band.ppu);
    samples.push([e.clientX,performance.now()]); if(samples.length>6) samples.shift();
  });
  const end = () => {
    if(!drag) return; drag=false;
    const a=samples[0], b=samples[samples.length-1], dt=(b[1]-a[1])/1000;
    apVel = dt>0.005 && performance.now()-b[1]<80 ? -((b[0]-a[0])/dt)/band.ppu : 0;
    if(!reduce && Math.abs(apVel) > band.step*6){ apGliding=true; addLoop(apGlide); } else apSettle();
  };
  win.addEventListener("pointerup", end); win.addEventListener("pointercancel", end);
  let wheelT=0;
  win.addEventListener("wheel", e => { if(Math.abs(e.deltaX)<=Math.abs(e.deltaY)) return; e.preventDefault(); apSpring.set(apV+e.deltaX/band.ppu); clearTimeout(wheelT); wheelT=setTimeout(apSettle,140); }, { passive:false });
  win.addEventListener("keydown", e => {
    const k=e.key; const stepBig=e.shiftKey?band.major:band.step; let d=null;
    if(k==="ArrowRight"||k==="ArrowUp") d=apV+stepBig; else if(k==="ArrowLeft"||k==="ArrowDown") d=apV-stepBig;
    else if(k==="Home") d=band.min; else if(k==="End") d=band.max;
    else if(k==="PageUp"){ seek(1); e.preventDefault(); return; } else if(k==="PageDown"){ seek(-1); e.preventDefault(); return; }
    if(d!==null){ apTune(+(Math.round(d/band.step)*band.step).toFixed(3)); e.preventDefault(); }
  });
})();
function apGlide(dt){
  if(!apGliding) return false;
  let v=apV+apVel*dt; apVel*=Math.exp(-3.2*dt);
  if(v<=band.min||v>=band.max){ v=clamp(v,band.min,band.max); apVel=0; }
  apRender(v); apSpring.x=v;
  if(Math.abs(apVel)<band.step*2){ apGliding=false; apSettle(); return false; }
  return true;
}
function seek(dir){
  const list=dir>0 ? band.stations.filter(s=>s>apV+band.step/2) : band.stations.filter(s=>s<apV-band.step/2).reverse();
  const target = list.length ? list[0] : (dir>0?band.stations[0]:band.stations[band.stations.length-1]);
  apTune(target); setTimeout(thock, reduce?0:160);
}
$("apPrev").onclick=()=>seek(-1); $("apNext").onclick=()=>seek(1);
$$("[data-band]").forEach(b => b.onclick = () => {
  band.value=apV; band=BANDS[b.dataset.band]; $$("[data-band]").forEach(x=>x.setAttribute("aria-pressed", String(x===b)));
  apLastStep=null; drawStrip(); apSpring.set(band.value); clack();
});
drawStrip(); apRender(apV);
new ResizeObserver(()=>apRender(apV)).observe($("apWin"));
bindFinish("apFinish","ap");

/* ═════════ Enochian Input Selector ═════════ */
const liftSprings = new Map();
$$(".ilk-cap").forEach(c => {
  const start = parseFloat(c.style.getPropertyValue("--lift")) || 1;
  liftSprings.set(c, new Spring(start, SNAP, x => c.style.setProperty("--lift", x.toFixed(3)), 0.002));
});
const srcCaps=$$("#ilkSrc .ilk-cap"), filCaps=$$("#ilkFil .ilk-cap");
function ilkRead(){
  const src=srcCaps.find(c=>c.getAttribute("aria-checked")==="true");
  const fil=filCaps.filter(c=>c.getAttribute("aria-pressed")==="true").map(c=>c.dataset.v);
  $("ilkRead").innerHTML = `source <b>${src?src.dataset.v:"none"}</b>` + (fil.length?" · "+fil.join(" · "):" · no filters");
}
function selectSrc(cap, focus){
  const prev=srcCaps.find(c=>c.getAttribute("aria-checked")==="true");
  if(prev===cap){ if(focus) cap.focus(); return; }
  srcCaps.forEach(c => { const on=c===cap; c.setAttribute("aria-checked", String(on)); c.tabIndex=on?0:-1; c.closest(".ilk-row").querySelector(".ilk-lbl").classList.toggle("sel", on); });
  liftSprings.get(cap).to(.15, PRESS);
  if(prev) setTimeout(()=>liftSprings.get(prev).to(1, SNAP), reduce?0:30);
  clack(); if(focus) cap.focus(); ilkRead();
}
srcCaps.forEach((c,i) => {
  c.addEventListener("click", () => selectSrc(c));
  c.addEventListener("keydown", e => {
    let d=0; if(e.key==="ArrowDown"||e.key==="ArrowRight") d=1; else if(e.key==="ArrowUp"||e.key==="ArrowLeft") d=-1;
    if(d){ e.preventDefault(); selectSrc(srcCaps[(i+d+srcCaps.length)%srcCaps.length], true); }
  });
});
filCaps.forEach(c => c.addEventListener("click", () => {
  const on=c.getAttribute("aria-pressed")!=="true"; c.setAttribute("aria-pressed", String(on));
  c.closest(".ilk-row").querySelector(".ilk-lbl").classList.toggle("sel", on);
  liftSprings.get(c).to(on?.15:1, on?PRESS:SNAP); on?thock():tick(); ilkRead();
}));
bindFinish("ilkFinish","ilk");

/* ═════════ Enochian Light Switch Bank ═════════ */
const lanCaps=$$(".lan-cap");
function lanRead(){
  const on=lanCaps.filter(c=>c.getAttribute("aria-pressed")==="true").map(c=>c.dataset.k);
  $("lanRead").innerHTML = `<b>${on.length} lit</b>` + (on.length?" · "+on.join(" · "):" · all dark");
}
lanCaps.forEach(c => c.addEventListener("click", e => {
  if(e.shiftKey){ lanCaps.forEach(x=>x.setAttribute("aria-pressed", String(x===c))); }
  else c.setAttribute("aria-pressed", String(c.getAttribute("aria-pressed")!=="true"));
  c.getAttribute("aria-pressed")==="true" ? tick() : click(2600,0.05,2); lanRead();
}));
$("lanAll").onclick=()=>{ lanCaps.forEach((c,i)=>setTimeout(()=>c.setAttribute("aria-pressed","true"), reduce?0:i*45)); setTimeout(lanRead, reduce?0:250); thock(); };
$("lanNone").onclick=()=>{ lanCaps.forEach(c=>c.setAttribute("aria-pressed","false")); lanRead(); thock(); };
bindFinish("lanFinish","lan");

/* ═════════ Enochian Turntable ═════════ */
const TT = { running:true, rpm:33, ang:0, ring:[0,0], w:33.333*6, pos:134, held:false, lastA:0, lastT:0 };
const nominalW = () => (TT.rpm===45?45:33.333)*6;
TT.w=nominalW();
const PIV={x:300,y:56}, CEN={x:128,y:138}, ARM=200;
const toCenter = Math.atan2(CEN.y-PIV.y, CEN.x-PIV.x)*180/Math.PI;
const dPC = Math.hypot(CEN.x-PIV.x, CEN.y-PIV.y);
function armAngleFor(r){ const c=(ARM*ARM+dPC*dPC-r*r)/(2*ARM*dPC); return toCenter - Math.acos(clamp(c,-1,1))*180/Math.PI; }
const armSpring = new Spring(armAngleFor(104 - TT.pos/1200*49), HEAVY, a => $("ttArm").setAttribute("transform", `rotate(${a.toFixed(2)} ${PIV.x} ${PIV.y})`), 0.01);
function drawRings(){
  const size=$("ttPlatter").clientWidth, dpr=Math.min(2, devicePixelRatio||1);
  [["ttRingA",[[0.965,180],[0.925,216]]],["ttRingB",[[0.885,160],[0.848,192]]]].forEach(([id,rows]) => {
    const cv=$(id); cv.width=cv.height=Math.round(size*dpr); const g=cv.getContext("2d"); g.clearRect(0,0,cv.width,cv.height);
    const R=cv.width/2; g.fillStyle="#d6d6da";
    rows.forEach(([rf,n]) => { const dr=Math.max(0.9, R*0.009); for(let i=0;i<n;i++){ const a=i/n*Math.PI*2; g.beginPath(); g.arc(R+Math.cos(a)*R*rf, R+Math.sin(a)*R*rf, dr, 0, Math.PI*2); g.fill(); } });
  });
}
drawRings(); new ResizeObserver(drawRings).observe($("ttPlatter"));
const fmtTime = s => { s=Math.max(0,s); const m=Math.floor(s/60), r=s-m*60; return `${String(m).padStart(2,"0")}:${r.toFixed(1).padStart(4,"0")}`; };
let ttReadAt=0;
function ttTick(dt, now){
  const nom=nominalW(), target = TT.running ? nom*(1+PITCH/100) : 0;
  if(!TT.held) TT.w += (target-TT.w)*(1-Math.exp(-dt/(Math.abs(target)>Math.abs(TT.w)?0.18:0.45)));
  const dAng = TT.held ? 0 : TT.w*dt;
  TT.ang += dAng; TT.pos += dAng/nom; // seconds of program at nominal speed
  if(TT.pos>=1200){ TT.pos=1200; if(TT.running) setRunning(false); }
  const lit = TT.running && !TT.held;
  const locked = lit && Math.abs(TT.w-nom) < nom*0.1;
  const rowWithLamp = TT.rpm===45 ? 1 : 0;
  for(let i=0;i<2;i++){ TT.ring[i] += (locked && i===rowWithLamp ? (TT.w-nom) : (TT.held?0:TT.w))*dt; }
  $("ttRecord").style.transform=`rotate(${TT.ang.toFixed(2)}deg)`;
  $("ttRingA").style.transform=`rotate(${(TT.ring[0]+(TT.held?TT.ang-TT.heldAng:0)).toFixed(2)}deg)`;
  $("ttRingB").style.transform=`rotate(${(TT.ring[1]+(TT.held?TT.ang-TT.heldAng:0)).toFixed(2)}deg)`;
  armSpring.to(TT.running ? armAngleFor(104 - TT.pos/1200*49) : 95);
  if(now-ttReadAt>90){
    ttReadAt=now; $("ttTime").textContent=fmtTime(TT.pos);
    const p=$("ttPlatter"); p.setAttribute("aria-valuenow", Math.round(TT.pos)); p.setAttribute("aria-valuetext", `${Math.floor(TT.pos/60)} minutes ${Math.floor(TT.pos%60)} seconds`);
    $("ttState").textContent = TT.held ? "held · scrubbing" : !TT.running ? (Math.abs(TT.w)>1?"braking":"stopped") : locked ? (Math.abs(PITCH)<0.05?"running · strobe still":"running · strobe drifting "+(PITCH>0?"forward":"back")) : "spinning up";
  }
  return TT.running || TT.held || Math.abs(TT.w)>0.5;
}
function setRunning(on){
  TT.running=on; $("ttStart").setAttribute("aria-pressed", String(on)); $("ttLamp").classList.toggle("on", on); thock(); addLoop(ttTick);
}
$("ttStart").onclick=()=>setRunning(!TT.running);
$$(".tt-spd").forEach(b => b.onclick = () => {
  TT.rpm=+b.dataset.rpm; $$(".tt-spd").forEach(x=>x.setAttribute("aria-pressed", String(x===b))); tick(); updatePitch(PITCH); addLoop(ttTick);
});
(() => {
  const p=$("ttPlatter"); const angAt = e => { const r=p.getBoundingClientRect(); return Math.atan2(e.clientY-(r.top+r.height/2), e.clientX-(r.left+r.width/2))*180/Math.PI; };
  p.addEventListener("pointerdown", e => { TT.held=true; TT.heldAng=TT.ang; TT.lastA=angAt(e); TT.lastT=performance.now(); TT.w=0; p.setPointerCapture(e.pointerId); tick(); addLoop(ttTick); });
  p.addEventListener("pointermove", e => {
    if(!TT.held) return;
    const a=angAt(e); let d=a-TT.lastA; if(d>180) d-=360; if(d<-180) d+=360; TT.lastA=a;
    const t=performance.now(), dt=Math.max(1,(t-TT.lastT))/1000; TT.lastT=t;
    TT.ang+=d; TT.pos=clamp(TT.pos + d/nominalW(), 0, 1200); TT.w = TT.w*0.6 + (d/dt)*0.4;
  });
  const up = () => { if(!TT.held) return; TT.held=false; TT.ring[0]+=TT.ang-TT.heldAng; TT.ring[1]+=TT.ang-TT.heldAng; if(performance.now()-TT.lastT>60) TT.w=0; addLoop(ttTick); };
  p.addEventListener("pointerup", up); p.addEventListener("pointercancel", up);
  p.addEventListener("keydown", e => {
    if(e.key===" "||e.key==="Enter"){ e.preventDefault(); setRunning(!TT.running); return; }
    let d=0; if(e.key==="ArrowRight"||e.key==="ArrowUp") d=1; else if(e.key==="ArrowLeft"||e.key==="ArrowDown") d=-1;
    if(e.key==="Home"){ TT.pos=0; d=0; e.preventDefault(); tick(); addLoop(ttTick); }
    if(d){ e.preventDefault(); TT.pos=clamp(TT.pos+d,0,1200); TT.ang+=d*nominalW(); TT.ring[0]+=d*nominalW(); TT.ring[1]+=d*nominalW(); tick(); addLoop(ttTick); }
  });
})();
bindFinish("ttFinish","tt");
addLoop(ttTick);

/* ═════════ Enochian Tape Deck ═════════ */
const SEGS = { a:[13,4,"h"], b:[22,13,"v"], c:[22,31,"v"], d:[13,40,"h"], e:[4,31,"v"], f:[4,13,"v"], g:[13,22,"h"] };
const DIGITS = ["abcdef","bc","abged","abgcd","fgbc","afgcd","afgedc","abc","abcdefg","abcdfg"];
function segPts(cx,cy,o,l=15,t=4){
  const h=l/2, s=t/2;
  const p = o==="h" ? [[cx-h,cy],[cx-h+s,cy-s],[cx+h-s,cy-s],[cx+h,cy],[cx+h-s,cy+s],[cx-h+s,cy+s]] : [[cx,cy-h],[cx+s,cy-h+s],[cx+s,cy+h-s],[cx,cy+h],[cx-s,cy+h-s],[cx-s,cy-h+s]];
  return p.map(q=>q.join(",")).join(" ");
}
const digitEls=[];
for(let i=0;i<4;i++){
  const svg=svgEl("svg",{ viewBox:"0 0 26 44", "aria-hidden":"true" }, $("tpCounter")); const g=svgEl("g",{ transform:"translate(3 0) skewX(-7)" }, svg);
  const map={}; for(const k in SEGS){ const [cx,cy,o]=SEGS[k]; map[k]=svgEl("polygon",{ points:segPts(cx,cy,o), class:"seg" }, g); }
  digitEls.push(map);
}
for(let i=0;i<6;i++){ const s=svgEl("svg",{ viewBox:"0 0 12 16" }, $("tpDir")); svgEl("path",{ d:"M3 3l5 5-5 5" }, s); }
const dirPaths=$$("#tpDir path");
const TP={ mode:"stop", rec:false, armed:false, pause:false, count:412, memory:false, shown:-1, msgUntil:0, msg:"", chevT:0 };
function showCount(){
  const n=((Math.floor(TP.count)%10000)+10000)%10000; if(n===TP.shown) return; TP.shown=n;
  const s=String(n).padStart(4,"0");
  [...s].forEach((ch,i)=>{ const on=DIGITS[+ch]; for(const k in digitEls[i]) digitEls[i][k].classList.toggle("on", on.includes(k)); });
  $("tpCounter").setAttribute("aria-label","Counter "+s); $("tpCountRead").textContent=s;
}
function statusText(){
  if(TP.mode==="ff") return "FF ▸▸"; if(TP.mode==="rew") return "REW ◂◂";
  if(TP.mode==="play") return TP.rec ? (TP.pause?"REC · PAUSE":"REC ●") : (TP.pause?"PAUSE":"PLAY");
  return TP.armed ? "REC READY · PRESS PLAY" : "STOP";
}
function renderTP(){
  const keys=Object.fromEntries($$(".tp-key").map(k=>[k.dataset.k,k]));
  const led=(k,on,blink)=>{ const l=keys[k].querySelector(".tp-led"); l.classList.toggle("on", !!on); l.classList.toggle("blink", !!blink); };
  led("play", TP.mode==="play"); led("ff", TP.mode==="ff"); led("rew", TP.mode==="rew"); led("pause", TP.pause); led("rec", TP.rec||TP.armed, TP.armed && !TP.rec); led("stop", false);
  const down={ play:TP.mode==="play", ff:TP.mode==="ff", rew:TP.mode==="rew", pause:TP.pause, rec:TP.rec||TP.armed, stop:false };
  for(const k in keys){ keys[k].dataset.down=String(!!down[k]); keys[k].setAttribute("aria-pressed", String(!!down[k])); }
  const st=$("tpStatus"); const showMsg=performance.now()<TP.msgUntil;
  st.textContent = showMsg ? TP.msg : statusText(); st.classList.toggle("warn", showMsg || TP.rec);
  $("tpRead").textContent = statusText().replace(" · PRESS PLAY","");
  $("tpMemRead").textContent = TP.memory?"on":"off";
  if(TP.mode==="stop") dirPaths.forEach(p=>p.classList.remove("on"));
  showCount();
}
function go(patch, msg){ Object.assign(TP, patch); if(msg){ TP.msg=msg; TP.msgUntil=performance.now()+1600; setTimeout(renderTP,1650); } renderTP(); addLoop(tpTick); }
function refuse(k, msg){
  const key=$$(".tp-key").find(x=>x.dataset.k===k); key.classList.remove("refuse"); void key.offsetWidth; key.classList.add("refuse");
  click(520,0.18,3); TP.msg=msg; TP.msgUntil=performance.now()+1600; renderTP(); setTimeout(renderTP,1650);
}
function press(k){
  switch(k){
    case "stop": thock(); return go({ mode:"stop", rec:false, armed:false, pause:false });
    case "play": thock(); return go({ mode:"play", rec:TP.rec||TP.armed, armed:false });
    case "pause": if(TP.mode!=="play") return refuse(k,"PAUSE NEEDS PLAY"); thock(); return go({ pause:!TP.pause });
    case "rec":
      if(TP.mode==="play"){ if(TP.rec) return refuse(k,"ALREADY RECORDING"); thock(); return go({ rec:true }); }
      if(TP.mode==="stop"){ thock(); return go({ armed:!TP.armed }); }
      return refuse(k,"STOP BEFORE REC");
    case "ff": case "rew": thock(); return go({ mode:k, rec:false, armed:false, pause:false });
  }
}
$$(".tp-key").forEach(k => {
  k.addEventListener("click", () => press(k.dataset.k));
  if(k.dataset.k==="stop"){ k.addEventListener("pointerdown",()=>k.dataset.down="true"); ["pointerup","pointerleave","pointercancel"].forEach(ev=>k.addEventListener(ev,()=>k.dataset.down="false")); }
});
$("tpReset").onclick=()=>{ TP.count=0; TP.shown=-1; tick(); renderTP(); };
$("tpMem").onclick=()=>{ TP.memory=!TP.memory; $("tpMem").setAttribute("aria-pressed", String(TP.memory)); tick(); renderTP(); };
function tpTick(dt, now){
  const moving = (TP.mode==="play" && !TP.pause) || TP.mode==="ff" || TP.mode==="rew";
  if(!moving) return false;
  const rate = TP.mode==="play" ? 1.6 : TP.mode==="ff" ? 46 : -46;
  TP.count += rate*dt;
  if(TP.mode==="rew" && TP.memory && TP.count<=0){ TP.count=0; TP.shown=-1; go({ mode:"stop" }, "MEMORY STOP · 0000"); thock(); return false; }
  if(TP.count<0) TP.count+=10000; if(TP.count>=10000) TP.count-=10000;
  showCount();
  TP.chevT += dt * (TP.mode==="play"?6:18);
  const idx=Math.floor(TP.chevT)%6, rev=TP.mode==="rew";
  dirPaths.forEach((p,i)=>{ const j=rev?5-i:i; p.classList.toggle("on", reduce ? true : (j<=idx)); p.setAttribute("d", rev?"M8 3l-5 5 5 5":"M3 3l5 5-5 5"); });
  return true;
}
bindFinish("tpFinish","tp");
renderTP();

/* ═════════ Enochian Macro Pad ═════════ */
const LP_LAYERS = {
  build:  { toggles:["watch","lint","test","types"],   on:[true,false,true,false], acts:{ run:"run build", ok:"accept change", no:"discard change", ship:"open branch", console:"open console" } },
  review: { toggles:["diff","blame","notes","focus"],  on:[true,false,false,true], acts:{ run:"re-run checks", ok:"approve", no:"request changes", ship:"merge when green", console:"open thread" } },
  ship:   { toggles:["canary","notify","tag","lock"],  on:[true,true,false,false], acts:{ run:"start deploy", ok:"promote", no:"roll back", ship:"release", console:"tail logs" } }
};
const LP = { layer:"build", history:[ {layer:"build",text:"run build"}, {layer:"build",text:"toggle lint off"}, {layer:"build",text:"accept change"} ], cursor:3, listening:0, micT:0 };
const encSpring = new Spring(LP.cursor*30, SNAP, a => $("lpEncKnob").style.transform=`rotate(${a.toFixed(2)}deg)`, 0.05);
function lpActivity(){ const l=$("lpAct"); l.classList.add("on"); clearTimeout(lpActivity.t); lpActivity.t=setTimeout(()=>l.classList.remove("on"),140); }
function lpRender(){
  const L=LP_LAYERS[LP.layer];
  $$(".lp-layer").forEach(k=>k.setAttribute("aria-pressed", String(k.dataset.layer===LP.layer)));
  $$(".lp-toggle").forEach((k,i)=>{ k.setAttribute("aria-pressed", String(L.on[i])); k.querySelector(".lp-legend").textContent=L.toggles[i]; k.setAttribute("aria-label", `${L.toggles[i]} ${L.on[i]?"on":"off"}`); });
  $$(".lp-act").forEach(k=>k.setAttribute("title", L.acts[k.dataset.act]));
  const log=$("lpLog"); log.innerHTML="";
  const lines=[];
  if(LP.listening) lines.push(`<div class="live"><span>●</span><span>${LP.layer.toUpperCase()}</span><span>listening ${((performance.now()-LP.listening)/1000).toFixed(1)}s</span></div>`);
  const start=Math.max(0, LP.history.length-(LP.listening?3:4));
  for(let i=LP.history.length-1;i>=start;i--){
    const h=LP.history[i], undone=i>=LP.cursor, cur=i===LP.cursor-1;
    lines.push(`<div class="${undone?"undone":cur?"cur":""}"><span>${String(i+1).padStart(2,"0")}</span><span>${h.layer.toUpperCase()}</span><span>${h.text}</span></div>`);
  }
  if(!LP.history.length && !LP.listening) lines.push(`<div><span>··</span><span></span><span>no actions yet</span></div>`);
  log.innerHTML=lines.join("");
  const enc=$("lpEnc"); enc.setAttribute("aria-valuemax", LP.history.length); enc.setAttribute("aria-valuenow", LP.cursor); enc.setAttribute("aria-valuetext", `${LP.cursor} of ${LP.history.length} actions applied`);
  $("lpRead").innerHTML = `<b>${LP.layer.toUpperCase()}</b> · ${LP.history.length} action${LP.history.length===1?"":"s"} · history ${LP.cursor}/${LP.history.length}`;
}
function lpAct(text){ LP.history.splice(LP.cursor); LP.history.push({ layer:LP.layer, text }); if(LP.history.length>40) LP.history.shift(); LP.cursor=LP.history.length; encSpring.to(LP.cursor*30); lpActivity(); lpRender(); }
$$(".lp-layer").forEach(k => k.addEventListener("click", () => { if(LP.layer===k.dataset.layer) return; LP.layer=k.dataset.layer; clack(); lpActivity(); lpRender(); }));
$$(".lp-toggle").forEach((k,i) => k.addEventListener("click", () => { const L=LP_LAYERS[LP.layer]; L.on[i]=!L.on[i]; L.on[i]?thock():tick(); lpAct(`${L.toggles[i]} ${L.on[i]?"on":"off"}`); }));
$$(".lp-act").forEach(k => k.addEventListener("click", () => { thock(); lpAct(LP_LAYERS[LP.layer].acts[k.dataset.act]); }));
(() => {
  const mic=$("lpMic");
  const start = () => { if(LP.listening) return; LP.listening=performance.now(); mic.classList.add("listening"); mic.dataset.down="true"; thock(); addLoop(micTick); lpRender(); };
  const stop  = () => { if(!LP.listening) return; const s=(performance.now()-LP.listening)/1000; LP.listening=0; mic.classList.remove("listening"); mic.dataset.down="false"; tick(); lpAct(s<0.3?"voice note too short":`voice note ${s.toFixed(1)}s`); };
  mic.addEventListener("pointerdown", e => { mic.setPointerCapture(e.pointerId); start(); });
  mic.addEventListener("pointerup", stop); mic.addEventListener("pointercancel", stop);
  mic.addEventListener("keydown", e => { if((e.key===" "||e.key==="Enter")){ e.preventDefault(); if(!e.repeat) start(); } });
  mic.addEventListener("keyup", e => { if(e.key===" "||e.key==="Enter"){ e.preventDefault(); stop(); } });
  mic.addEventListener("click", e => e.preventDefault());
  function micTick(dt, now){ if(!LP.listening) return false; if(now-LP.micT>100){ LP.micT=now; lpRender(); } return true; }
})();
(() => {
  const enc=$("lpEnc"); let drag=false, sy=0, acc=0;
  const turn = d => { const n=clamp(LP.cursor+d,0,LP.history.length); if(n===LP.cursor){ encSpring.to(LP.cursor*30 + d*8); setTimeout(()=>encSpring.to(LP.cursor*30),90); return; } LP.cursor=n; encSpring.to(n*30); tick(); lpActivity(); lpRender(); };
  enc.addEventListener("pointerdown", e => { drag=true; sy=e.clientY; acc=0; enc.setPointerCapture(e.pointerId); });
  enc.addEventListener("pointermove", e => { if(!drag) return; acc += sy-e.clientY; sy=e.clientY; while(acc>=22){ acc-=22; turn(1); } while(acc<=-22){ acc+=22; turn(-1); } });
  enc.addEventListener("pointerup", ()=>drag=false); enc.addEventListener("pointercancel", ()=>drag=false);
  enc.addEventListener("wheel", e => { e.preventDefault(); turn(e.deltaY<0?1:-1); }, { passive:false });
  enc.addEventListener("keydown", e => {
    if(e.key==="ArrowRight"||e.key==="ArrowUp"){ e.preventDefault(); turn(1); } else if(e.key==="ArrowLeft"||e.key==="ArrowDown"){ e.preventDefault(); turn(-1); }
    else if(e.key==="Home"){ e.preventDefault(); turn(-LP.cursor); } else if(e.key==="End"){ e.preventDefault(); turn(LP.history.length-LP.cursor); }
  });
})();
bindFinish("lpFinish","lp");
lpRender();

/* ═════════ shared small knob ═════════ */
function makeKnob(el, cap, { value, min, max, step, fmt, onChange, center=null, sens=140 }){
  let v=value;
  const n = x => (x-min)/(max-min);
  const sp = new Spring(n(v), HEAVY, x => { cap.style.transform=`rotate(${(-135+x*270).toFixed(2)}deg)`; }, 0.0005);
  el.setAttribute("aria-valuemin",min); el.setAttribute("aria-valuemax",max);
  const aria = () => { el.setAttribute("aria-valuenow",v); el.setAttribute("aria-valuetext",fmt(v)); };
  function set(x, instant, silent){
    const q=+clamp(Math.round(x/step)*step,min,max).toFixed(4); const ch=q!==v; v=q;
    instant ? sp.set(n(v)) : sp.to(n(v)); aria();
    if(ch && !silent && onChange) onChange(v);
  }
  let drag=false, sy=0, sv=0;
  el.addEventListener("pointerdown", e => { drag=true; sy=e.clientY; sv=v; el.setPointerCapture(e.pointerId); onChange && onChange(v, true); });
  el.addEventListener("pointermove", e => { if(drag) set(sv + (sy-e.clientY)/sens*(max-min), true); });
  el.addEventListener("pointerup", () => drag=false); el.addEventListener("pointercancel", () => drag=false);
  el.addEventListener("dblclick", () => { if(center!==null){ set(center); thock(); } });
  el.addEventListener("keydown", e => {
    const k=e.key; let d=null;
    if(k==="ArrowUp"||k==="ArrowRight") d=v+step; else if(k==="ArrowDown"||k==="ArrowLeft") d=v-step;
    else if(k==="PageUp") d=v+step*10; else if(k==="PageDown") d=v-step*10; else if(k==="Home") d=min; else if(k==="End") d=max;
    if(d!==null){ set(d); e.preventDefault(); }
  });
  aria();
  return { set, get:()=>v };
}
function knobUnit(num, label, lblClass){
  const u=document.createElement("div"); u.className="knob-unit";
  u.innerHTML = (num?`<span class="knob-num">${num}</span>`:"") + `<div class="knob" role="slider" tabindex="0" aria-label="${label}"><span class="knob-cap"></span></div><span class="${lblClass}">${label}</span>`;
  return u;
}

/* ═════════ Enochian Drum Machine ═════════ */
const CP_VOICES=["kick","sub","snare","clap","hat","open hat","rim","shaker","tom lo","tom mid","tom hi","bell","crash","ride","zap","blip"];
const CP_FN=["1/4","1/8","1/16","1/32","swing 50","swing 54","swing 62","swing 70","kit a","kit b","metronome","clear","tempo −","tempo +","tap tempo","latch"];
const RATES=[4,8,16,32];
const CP={ tempo:96, swing:50, decay:.5, tone:.85, pitch:0, drive:.15, rate:2, level:.8, kit:"A", shift:false, repeat:false, latch:false, metro:false, rec:false };
const SEQ={ playing:false, step:0, nextT:0, timer:0, queue:[], cur:-1, curT:0, pattern:Array.from({length:16},()=>new Set()) };
[[0,[0,7,10]],[2,[4,12]],[4,[0,2,4,6,8,10,12]],[5,[14]],[7,[3,11]],[6,[15]]].forEach(([p,steps])=>steps.forEach(s=>SEQ.pattern[s].add(p)));

/* drum voices: everything synthesized, routed through drive → tone → level */
let DB=null, WN=null;
function drumBus(){
  const a=audio(); if(!a) return null;
  if(!DB){
    const shaper=a.createWaveShaper(), tone=a.createBiquadFilter(), lvl=a.createGain();
    tone.type="lowpass"; shaper.oversample="2x"; shaper.connect(tone); tone.connect(lvl); lvl.connect(MASTER);
    DB={ a, in:shaper, shaper, tone, lvl };
    WN=a.createBuffer(1, a.sampleRate, a.sampleRate); const d=WN.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
    updateBus();
  }
  return DB;
}
function updateBus(){
  if(!DB) return;
  DB.tone.frequency.value = 800*Math.pow(22.5, CP.tone);
  const k=CP.drive*30, n=1024, c=new Float32Array(n);
  for(let i=0;i<n;i++){ const x=i/(n-1)*2-1; c[i]=(1+k)*x/(1+k*Math.abs(x)); }
  DB.shaper.curve=c; DB.lvl.gain.value=CP.level*0.8;
}
function envG(t, peak, dec, att=0.002){
  const g=DB.a.createGain(); g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0002), t+att); g.gain.exponentialRampToValueAtTime(0.0001, t+att+dec);
  g.connect(DB.in); return g;
}
function osc(t, type, f0, f1, glide, peak, dec){
  const o=DB.a.createOscillator(); o.type=type; o.frequency.setValueAtTime(f0,t);
  if(f1!==f0) o.frequency.exponentialRampToValueAtTime(f1, t+glide);
  o.connect(envG(t,peak,dec)); o.start(t); o.stop(t+dec+0.05);
}
function nz(t, ftype, freq, q, peak, dec, att){
  const s=DB.a.createBufferSource(); s.buffer=WN; s.loop=true;
  const f=DB.a.createBiquadFilter(); f.type=ftype; f.frequency.value=freq; f.Q.value=q;
  s.connect(f); f.connect(envG(t,peak,dec,att)); s.start(t, Math.random()*0.5); s.stop(t+dec+0.05);
}
function voice(i, vel, t){
  if(!drumBus()) return;
  const v=vel/127, P=Math.pow(2,CP.pitch/12)*(CP.kit==="B"?0.84:1), D=(0.4+CP.decay*1.4)*(CP.kit==="B"?1.25:1);
  switch(i){
    case 0: osc(t,"sine",160*P,45*P,.09,.95*v,.45*D); break;
    case 1: osc(t,"sine",62*P,46*P,.25,.85*v,1.1*D); break;
    case 2: nz(t,"bandpass",1900*P,.9,.55*v,.17*D); osc(t,"triangle",210*P,165*P,.05,.4*v,.1*D); break;
    case 3: [0,.011,.023].forEach(o=>nz(t+o,"bandpass",1150*P,1.6,.5*v,.018)); nz(t+.03,"bandpass",1150*P,1.2,.35*v,.18*D); break;
    case 4: nz(t,"highpass",7600,.7,.32*v,.045*D); break;
    case 5: nz(t,"highpass",7000,.7,.28*v,.32*D); break;
    case 6: osc(t,"square",1700*P,1700*P,0,.12*v,.028); osc(t,"triangle",820*P,820*P,0,.2*v,.03); break;
    case 7: nz(t,"bandpass",6200,2,.3*v,.07*D,.018); break;
    case 8: osc(t,"sine",115*P,78*P,.3,.75*v,.38*D); break;
    case 9: osc(t,"sine",165*P,112*P,.3,.7*v,.34*D); break;
    case 10: osc(t,"sine",235*P,160*P,.3,.65*v,.3*D); break;
    case 11: osc(t,"square",540*P,540*P,0,.07*v,.3*D); osc(t,"square",800*P,800*P,0,.07*v,.3*D); break;
    case 12: nz(t,"highpass",4200,.5,.26*v,1.3*D,.004); break;
    case 13: nz(t,"bandpass",8200,1.2,.16*v,.85*D); osc(t,"square",3100*P,3100*P,0,.025*v,.5*D); break;
    case 14: osc(t,"sine",260*P,1500*P,.07,.3*v,.18); break;
    case 15: osc(t,"sine",880*P,880*P,0,.25*v,.12*D); break;
  }
}
function metroAt(t, one){ if(drumBus()) osc(t,"square",one?2000:1400,one?2000:1400,0,.1,.03); }

/* knobs */
const CP_KNOBS=[
  { k:"tempo", min:60, max:180, step:1, fmt:v=>`${v} BPM` },
  { k:"swing", min:50, max:75, step:1, fmt:v=>`${v}%` },
  { k:"decay", min:0, max:1, step:.01, fmt:v=>`${Math.round(v*100)}%` },
  { k:"tone", min:0, max:1, step:.01, fmt:v=>`${Math.round(800*Math.pow(22.5,v)).toLocaleString("en-US")} Hz` },
  { k:"pitch", min:-12, max:12, step:1, fmt:v=>`${v>0?"+":v<0?"−":""}${Math.abs(v)} st`, center:0 },
  { k:"drive", min:0, max:1, step:.01, fmt:v=>`${Math.round(v*100)}%` },
  { k:"rate", min:0, max:3, step:1, fmt:v=>`1/${RATES[v]}`, sens:90 },
  { k:"level", min:0, max:1, step:.01, fmt:v=>`${Math.round(v*100)}%` }
];
const cpKnobs={};
[6,7,4,5,2,3,0,1].forEach(idx => {
  const d=CP_KNOBS[idx]; const u=knobUnit(String(idx+1), d.k, "knob-lbl"); $("cpKnobs").appendChild(u);
  cpKnobs[d.k]=makeKnob(u.querySelector(".knob"), u.querySelector(".knob-cap"), { value:CP[d.k], min:d.min, max:d.max, step:d.step, fmt:d.fmt, center:d.center ?? null, sens:d.sens||140,
    onChange:(v, touch) => { if(!touch){ CP[d.k]=v; updateBus(); cpDisp(); if(d.k==="rate") restartRepeats(); } $("cpRead").innerHTML=`<b>${d.k}</b> · ${d.fmt(v)}`; } });
});

/* pads */
const cpPads=[], cpFlash=[];
[[12,13,14,15],[8,9,10,11],[4,5,6,7],[0,1,2,3]].flat().forEach(i => {
  const cell=document.createElement("div"); cell.className="cp-cell";
  cell.innerHTML=`<span class="cp-num">PAD${i+1}</span><button type="button" class="cp-pad" data-i="${i}" aria-label="Pad ${i+1}, ${CP_VOICES[i]}; with shift, ${CP_FN[i]}"><span class="cp-flash"></span><span class="cp-fn">${CP_FN[i]}</span><span class="cp-voice">${CP_VOICES[i]}</span></button>`;
  $("cpPads").appendChild(cell);
  const pad=cell.querySelector(".cp-pad"); cpPads[i]=pad; cpFlash[i]=pad.querySelector(".cp-flash");
});
for(let s=0;s<16;s++) $("cpSteps").appendChild(document.createElement("i"));
const stepDots=$$("#cpSteps i");
function renderSteps(){ stepDots.forEach((d,s)=>{ d.classList.toggle("has", SEQ.pattern[s].size>0); d.classList.toggle("now", s===SEQ.cur); }); }
renderSteps();
function flash(i, vel){
  const f=cpFlash[i]; const o=Math.max(.25, vel/127);
  if(reduce){ f.style.opacity=o; setTimeout(()=>f.style.opacity=0,120); return; }
  f.animate([{ opacity:o },{ opacity:0 }], { duration:320, easing:"cubic-bezier(.2,.7,.3,1)" });
}
function cpDisp(msg){
  $("cpDisp1").innerHTML = `KIT ${CP.kit} · ${CP.tempo} BPM · SWING ${CP.swing}% · 1/${RATES[CP.rate]}` + (CP.repeat?" · REPEAT":"") + (CP.latch?" · LATCH":"") + (CP.metro?" · METRO":"") + (CP.rec?` · <span class="rec">● REC</span>`:"");
  if(msg){ $("cpDisp2").textContent=msg; $("cpDisp2").className=""; }
}
function hit(i, vel){
  const a=audio(); if(a && drumBus()) voice(i, vel, a.currentTime+0.005);
  flash(i, vel);
  cpDisp(`PAD ${i+1} · ${CP_VOICES[i].toUpperCase()} · VEL ${vel}`);
  if(SEQ.playing && CP.rec && SEQ.cur>=0){
    const sd=60/CP.tempo/4; let s=SEQ.cur; if(performance.now()/1000-SEQ.curT > sd/2) s=(s+1)%16;
    if(!SEQ.pattern[s].has(i)){ SEQ.pattern[s].add(i); renderSteps(); }
  }
}
const repeaters={};
function startRepeat(i, vel){ stopRepeat(i); repeaters[i]={ vel, id:setInterval(()=>hit(i, Math.round(vel*.85)), 60/CP.tempo*4/RATES[CP.rate]*1000) }; }
function stopRepeat(i){ if(repeaters[i]){ clearInterval(repeaters[i].id); delete repeaters[i]; } }
function restartRepeats(){ Object.keys(repeaters).forEach(i=>startRepeat(+i, repeaters[i].vel)); }
function padFn(i){
  if(i<4){ CP.rate=i; cpKnobs.rate.set(i,false,true); restartRepeats(); }
  else if(i<8){ CP.swing=[50,54,62,70][i-4]; cpKnobs.swing.set(CP.swing,false,true); }
  else if(i<10){ CP.kit=i===8?"A":"B"; kitLabel(); }
  else if(i===10){ CP.metro=!CP.metro; }
  else if(i===11){ SEQ.pattern.forEach(s=>s.clear()); renderSteps(); }
  else if(i===12||i===13){ CP.tempo=clamp(CP.tempo+(i===12?-2:2),60,180); cpKnobs.tempo.set(CP.tempo,false,true); restartRepeats(); }
  else if(i===14){ tapTempo(); }
  else if(i===15){ CP.latch=!CP.latch; if(!CP.latch) Object.keys(repeaters).forEach(k=>stopRepeat(+k)); }
  flash(i, 70); tick(); cpDisp(`SHIFT · ${CP_FN[i].toUpperCase()}` + (i===11?" · PATTERN EMPTY":"") + (i===10?(CP.metro?" ON":" OFF"):"") + (i===15?(CP.latch?" ON":" OFF"):""));
}
let taps=[];
function tapTempo(){
  const t=performance.now(); taps=taps.filter(x=>t-x<2500); taps.push(t);
  if(taps.length>=2){ const iv=(taps[taps.length-1]-taps[0])/(taps.length-1); CP.tempo=clamp(Math.round(60000/iv),60,180); cpKnobs.tempo.set(CP.tempo,false,true); restartRepeats(); }
}
function kitLabel(){ $("cpKit").innerHTML=`KIT<br>${CP.kit}`; $("cpKit").setAttribute("aria-label", `Kit ${CP.kit}, switch to kit ${CP.kit==="A"?"B":"A"}`); }
function padDown(i, vel){
  cpPads[i].dataset.down="true";
  if(CP.shift) return padFn(i);
  if(CP.repeat && CP.latch && repeaters[i]){ stopRepeat(i); cpDisp(`PAD ${i+1} · REPEAT RELEASED`); return; }
  hit(i, vel);
  if(CP.repeat) startRepeat(i, vel);
}
function padUp(i){ cpPads[i].dataset.down="false"; if(CP.repeat && !CP.latch) stopRepeat(i); }
cpPads.forEach((pad,i) => {
  pad.addEventListener("pointerdown", e => {
    e.preventDefault(); try{ pad.setPointerCapture(e.pointerId); }catch(_){}
    const r=pad.getBoundingClientRect();
    const d=Math.min(1, Math.hypot((e.clientX-r.left)/r.width-.5, (e.clientY-r.top)/r.height-.5)/.707);
    padDown(i, Math.round(127-d*80));
  });
  ["pointerup","pointercancel"].forEach(ev => pad.addEventListener(ev, () => padUp(i)));
  pad.addEventListener("click", e => { if(e.detail===0){ padDown(i,100); setTimeout(()=>padUp(i),120); } });
});
const CP_KEYS={ z:0,x:1,c:2,v:3, a:4,s:5,d:6,f:7, q:8,w:9,e:10,r:11, "1":12,"2":13,"3":14,"4":15 };
$("cp").addEventListener("keydown", e => {
  if(e.metaKey||e.ctrlKey||e.altKey) return; const i=CP_KEYS[e.key.toLowerCase()]; if(i===undefined) return;
  e.preventDefault(); if(!e.repeat) padDown(i,100);
});
$("cp").addEventListener("keyup", e => { const i=CP_KEYS[e.key.toLowerCase()]; if(i!==undefined) padUp(i); });

/* sequencer: lookahead scheduler on the performance clock, audio placed on the AudioContext clock */
function seqSchedule(){
  const now=performance.now()/1000, sd=60/CP.tempo/4, a=audio(), bus=a&&drumBus();
  while(SEQ.nextT < now+0.12){
    const s=SEQ.step, t=SEQ.nextT + (s%2 ? ((CP.swing/100)*2-1)*sd : 0), lead=Math.max(0,t-now);
    SEQ.pattern[s].forEach(i => { if(bus) voice(i, 100, a.currentTime+lead); setTimeout(()=>flash(i,100), lead*1000); });
    if(CP.metro && s%4===0 && bus) metroAt(a.currentTime+lead, s===0);
    SEQ.queue.push({ s, t }); SEQ.nextT+=sd; SEQ.step=(s+1)%16;
  }
}
function cpTick(){
  const now=performance.now()/1000; let moved=false;
  while(SEQ.queue.length && SEQ.queue[0].t<=now){ const q=SEQ.queue.shift(); SEQ.cur=q.s; SEQ.curT=q.t; moved=true; }
  if(moved) renderSteps();
  return SEQ.playing;
}
function seqStart(){
  if(SEQ.playing) return; audio(); SEQ.playing=true; SEQ.step=0; SEQ.queue=[]; SEQ.nextT=performance.now()/1000+0.05;
  seqSchedule(); SEQ.timer=setInterval(seqSchedule,25); addLoop(cpTick);
  $("cpPlay").setAttribute("aria-pressed","true"); cpDisp("PLAYING · 16 STEPS");
}
function seqStop(){
  SEQ.playing=false; clearInterval(SEQ.timer); SEQ.queue=[]; SEQ.cur=-1; renderSteps();
  $("cpPlay").setAttribute("aria-pressed","false"); cpDisp("STOPPED");
}
$("cpPlay").onclick=()=>{ thock(); SEQ.playing ? seqStop() : seqStart(); };
$("cpStop").onclick=()=>{ thock(); seqStop(); Object.keys(repeaters).forEach(k=>stopRepeat(+k)); };
$("cpRec").onclick=()=>{ CP.rec=!CP.rec; $("cpRec").setAttribute("aria-pressed",String(CP.rec)); thock(); cpDisp(CP.rec ? (SEQ.playing?"RECORDING · HITS SNAP TO STEPS":"REC ARMED · PRESS PLAY") : "REC OFF"); };
$("cpShift").onclick=()=>{ CP.shift=!CP.shift; $("cpShift").setAttribute("aria-pressed",String(CP.shift)); $("cp").dataset.shift=String(CP.shift); tick(); cpDisp(CP.shift?"SHIFT · PADS RUN THEIR CORNER FUNCTION":"SHIFT OFF"); };
$("cpRepeat").onclick=()=>{ CP.repeat=!CP.repeat; $("cpRepeat").setAttribute("aria-pressed",String(CP.repeat)); if(!CP.repeat) Object.keys(repeaters).forEach(k=>stopRepeat(+k)); tick(); cpDisp(CP.repeat?`NOTE REPEAT · HOLD A PAD · 1/${RATES[CP.rate]}`:"NOTE REPEAT OFF"); };
$("cpKit").onclick=()=>{ CP.kit=CP.kit==="A"?"B":"A"; kitLabel(); tick(); cpDisp(CP.kit==="A"?"KIT A · TIGHT":"KIT B · DUSTY, LOWER, LONGER"); };
bindFinish("cpFinish","cp");
cpDisp();

/* ═════════ Enochian Video Editor ═════════ */
const PD={ z:Array(8).fill(0), exposure:0, contrast:0, shadows:0, highlights:0, blacks:0, whites:0, frame:288, before:false, inF:null, outF:null };
const PD_W=320, PD_H=180, pdBase=new Float32Array(PD_W*PD_H);
const ROMAN=["I","II","III","IV","V","VI","VII","VIII"];
const hash=(x,y)=>{ const s=Math.sin(x*12.9898+y*78.233)*43758.5453; return s-Math.floor(s); };
function pdScene(frame){
  const ph=(frame%480)/480, sx=0.12+0.76*ph, sy=0.6-0.4*Math.sin(Math.PI*ph);
  for(let y=0;y<PD_H;y++){
    const v=y/PD_H;
    for(let x=0;x<PD_W;x++){
      const u=x/PD_W; let L;
      const h1=.6+.05*Math.sin(u*7+1.3)+.025*Math.sin(u*17), h2=.72+.04*Math.sin(u*5+4)+.02*Math.sin(u*23+1);
      const dx=(u-sx)*16/9, dy=v-sy, d=Math.sqrt(dx*dx+dy*dy);
      if(v<h1){ L=.22+.48*(v/h1) + .5*Math.exp(-d*d/.004) + .18*Math.exp(-d/.09); if(d<.032) L=1; }
      else if(v<h2){ L=.34-.12*(v-h1)/(h2-h1) + .06*Math.exp(-d/.2); }
      else { L=.15-.1*(v-h2)/(1-h2) + (hash(x,y)-.5)*.05; }
      if(v>.88 && v<.97 && u>.05 && u<.95){ const k=(u-.05)/.9*11, idx=Math.floor(k); L = (k-idx<.06) ? 0.02 : idx/10; }
      pdBase[y*PD_W+x]=Math.max(0,L);
    }
  }
}
function grade(x){
  let v=x*Math.pow(2, PD.exposure*2);
  v=(v+PD.blacks*.1)/(1-PD.whites*.2+PD.blacks*.1);
  v+=PD.shadows*.18*v*(1-v)*(1-v)*6.75;
  v+=PD.highlights*.18*v*v*(1-v)*6.75;
  v=.5+(v-.5)*(1+PD.contrast*.8);
  const p=clamp(v,0,1)*7, i=Math.min(6,Math.floor(p)), f=p-i, sm=f*f*(3-2*f);
  v+=(PD.z[i]+(PD.z[i+1]-PD.z[i])*sm)*.12;
  return clamp(v,0,1);
}
const pdView=$("pdView").getContext("2d"), pdImg=pdView.createImageData(PD_W,PD_H), pdCurve=$("pdCurve").getContext("2d");
let pdDirty=false, pdSceneFrame=-1;
function pdRequest(){ if(!pdDirty){ pdDirty=true; requestAnimationFrame(pdDraw); } }
function pdDraw(){
  pdDirty=false;
  if(pdSceneFrame!==PD.frame){ pdScene(PD.frame); pdSceneFrame=PD.frame; }
  const lut=new Float32Array(1024); for(let i=0;i<1024;i++) lut[i]=grade(i/1023);
  const hist=new Uint32Array(64), d=pdImg.data;
  for(let p=0;p<pdBase.length;p++){
    const b=Math.min(1,pdBase[p]), o=PD.before ? b : lut[(b*1023)|0], g=(o*255)|0;
    d[p*4]=d[p*4+1]=d[p*4+2]=g; d[p*4+3]=255; hist[Math.min(63,(o*64)|0)]++;
  }
  pdView.putImageData(pdImg,0,0);
  // curve + histogram
  const c=pdCurve, W=460, H=300, pad=14, iw=W-pad*2, ih=H-pad*2, acc=getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  c.fillStyle="#0b0b0c"; c.fillRect(0,0,W,H);
  const mx=Math.max(...hist); c.fillStyle="#2c2c30";
  for(let i=0;i<64;i++){ const h=Math.sqrt(hist[i]/mx)*ih; c.fillRect(pad+i*iw/64, pad+ih-h, iw/64-1, h); }
  c.strokeStyle="#26262a"; c.lineWidth=1;
  for(let k=1;k<4;k++){ c.beginPath(); c.moveTo(pad+k*iw/4,pad); c.lineTo(pad+k*iw/4,pad+ih); c.moveTo(pad,pad+k*ih/4); c.lineTo(pad+iw,pad+k*ih/4); c.stroke(); }
  c.strokeStyle="#4a4a4f"; c.setLineDash([4,5]); c.beginPath(); c.moveTo(pad,pad+ih); c.lineTo(pad+iw,pad); c.stroke(); c.setLineDash([]);
  const cur = PD.before ? (x=>x) : (x=>lut[(x*1023)|0]);
  c.strokeStyle=acc; c.lineWidth=3; c.beginPath();
  for(let i=0;i<=120;i++){ const x=i/120, y=cur(x); i ? c.lineTo(pad+x*iw, pad+(1-y)*ih) : c.moveTo(pad+x*iw, pad+(1-y)*ih); }
  c.stroke();
  c.fillStyle="#f7f7f8";
  for(let k=0;k<8;k++){ const x=k/7, y=cur(x); c.beginPath(); c.arc(pad+x*iw, pad+(1-y)*ih, 4.5, 0, Math.PI*2); c.fill(); }
  const total=pdBase.length, lo=hist[0]/total, hi=hist[63]/total;
  $("pdClip").textContent = !PD.before && (lo>.06||hi>.04) ? (lo>.06&&hi>.04?"CLIPPING BOTH ENDS":lo>.06?"BLACKS CLIPPED":"WHITES CLIPPED") : "";
}
const pdTc=f=>{ const fr=f%24, s=Math.floor(f/24), p=n=>String(n).padStart(2,"0"); return `00:${p(Math.floor(s/60))}:${p(s%60)}:${p(fr)}`; };
const PD_KEYS=["exposure","contrast","shadows","highlights","blacks","whites"];
const pdAdjCount=()=>PD.z.filter(v=>v!==0).length + PD_KEYS.filter(k=>PD[k]!==0).length;
function pdInfo(){
  $("pdTc").textContent=pdTc(PD.frame);
  $("pdTag").textContent = PD.before?"BEFORE":"GRADED"; $("pdTag").classList.toggle("before", PD.before);
  $("pdMarks").textContent = `IN ${PD.inF===null?"—":pdTc(PD.inF)} · OUT ${PD.outF===null?"—":pdTc(PD.outF)}`;
  const j=$("pdJog"); j.setAttribute("aria-valuenow",PD.frame); j.setAttribute("aria-valuetext",`${pdTc(PD.frame)}`);
  const n=pdAdjCount();
  $("pdRead").innerHTML = `<b>${PD.before?"before":"graded"}</b> · frame ${PD.frame} · ${n} adjustment${n===1?"":"s"} · history ${pdHist.i+1}/${pdHist.list.length}`;
}
/* undo history: one snapshot per settled change */
const pdSnap=()=>JSON.stringify({ z:PD.z, exposure:PD.exposure, contrast:PD.contrast, shadows:PD.shadows, highlights:PD.highlights, blacks:PD.blacks, whites:PD.whites });
const pdHist={ list:[], i:-1, t:0, restoring:false };
function pdCommit(){ clearTimeout(pdHist.t); pdHist.t=setTimeout(() => { const s=pdSnap(); if(pdHist.list[pdHist.i]===s) return; pdHist.list.splice(pdHist.i+1); pdHist.list.push(s); pdHist.i=pdHist.list.length-1; pdInfo(); }, 350); }
function pdRestore(s){
  const o=JSON.parse(s); pdHist.restoring=true;
  o.z.forEach((v,k)=>pdFaders[k].set(v,"api")); PD_KEYS.forEach(k=>pdKnobs[k].set(o[k]));
  pdHist.restoring=false; Object.assign(PD,{ z:[...o.z] }, Object.fromEntries(PD_KEYS.map(k=>[k,o[k]])));
  pdDots(); pdRequest(); pdInfo();
}
function pdChanged(){ pdDots(); pdRequest(); if(!pdHist.restoring) pdCommit(); pdInfo(); }
const pdFaders=[];
ROMAN.forEach((r,k) => {
  const z=document.createElement("div"); z.className="pd-zone";
  z.innerHTML=`<span class="pd-zl">${r}</span><div class="fader pd-track" role="slider" tabindex="0" aria-orientation="vertical" aria-label="Zone ${r}"><div class="pd-slot"></div><div class="pd-mid"></div><div class="pd-cap"></div></div><i class="pd-dot"></i>`;
  $("pdZones").appendChild(z);
  pdFaders[k]=makeFader({ track:z.querySelector(".pd-track"), cap:z.querySelector(".pd-cap"), min:-1, max:1, step:.05, value:0, pad:12, detent:0, zone:.08, big:.25,
    fmt:v=>v===0?"0, unchanged":`${v>0?"lift":"lower"} ${Math.round(Math.abs(v)*100)} percent`,
    onInput:v=>{ PD.z[k]=v; $("pdRead").innerHTML=`<b>zone ${r}</b> · ${v===0?"0":fmtSigned(v,2)}`; pdChanged(); } });
});
const pdDotEls=()=>$$("#pdZones .pd-dot");
function pdDots(){ pdDotEls().forEach((d,k)=>d.classList.toggle("on", PD.z[k]!==0)); }
const pdKnobs={};
PD_KEYS.forEach(key => {
  const u=knobUnit("", key, "pd-klbl"); $("pdKnobs").appendChild(u);
  pdKnobs[key]=makeKnob(u.querySelector(".knob"), u.querySelector(".knob-cap"), { value:0, min:-1, max:1, step:.02, center:0,
    fmt:v=> key==="exposure" ? `${v>0?"+":v<0?"−":"±"}${Math.abs(v*2).toFixed(2)} stops` : (v===0?"0":fmtSigned(v*100,0)),
    onChange:(v,touch)=>{ if(!touch){ PD[key]=v; pdChanged(); } $("pdRead").innerHTML=`<b>${key}</b> · ${key==="exposure"?fmtSigned(v*2,2)+" EV":(v===0?"0":fmtSigned(v*100,0))}`; } });
});
/* jog dial: one frame per 6 px of travel or per wheel detent */
const jogSpring=new Spring(PD.frame*4, SNAP, a=>$("pdJogCap").style.transform=`rotate(${a.toFixed(1)}deg)`, 0.05);
function pdSeek(f){ const n=clamp(Math.round(f),0,1439); if(n===PD.frame) return; PD.frame=n; jogSpring.to(n*4); tick(); pdRequest(); pdInfo(); }
(() => {
  const j=$("pdJog"); let drag=false, sy=0, acc=0;
  j.addEventListener("pointerdown", e=>{ drag=true; sy=e.clientY; acc=0; j.setPointerCapture(e.pointerId); });
  j.addEventListener("pointermove", e=>{ if(!drag) return; acc+=sy-e.clientY; sy=e.clientY; const st=Math.trunc(acc/6); if(st){ acc-=st*6; pdSeek(PD.frame+st); } });
  j.addEventListener("pointerup", ()=>drag=false); j.addEventListener("pointercancel", ()=>drag=false);
  j.addEventListener("wheel", e=>{ e.preventDefault(); pdSeek(PD.frame+(e.deltaY<0?1:-1)*(e.shiftKey?24:1)); }, { passive:false });
  j.addEventListener("keydown", e=>{
    const m={ ArrowRight:1, ArrowUp:1, ArrowLeft:-1, ArrowDown:-1, PageUp:24, PageDown:-24 }[e.key];
    if(m){ e.preventDefault(); pdSeek(PD.frame+m); } else if(e.key==="Home"){ e.preventDefault(); pdSeek(0); } else if(e.key==="End"){ e.preventDefault(); pdSeek(1439); }
  });
})();
$("pdPrevF").onclick=()=>pdSeek(PD.frame-1); $("pdNextF").onclick=()=>pdSeek(PD.frame+1);
$("pdUndo").onclick=()=>{ if(pdHist.i>0){ pdHist.i--; pdRestore(pdHist.list[pdHist.i]); thock(); } else click(520,.15,3); };
$("pdRedo").onclick=()=>{ if(pdHist.i<pdHist.list.length-1){ pdHist.i++; pdRestore(pdHist.list[pdHist.i]); thock(); } else click(520,.15,3); };
$("pdReset").onclick=()=>{ pdFaders.forEach(f=>f.set(0,"api")); PD_KEYS.forEach(k=>pdKnobs[k].set(0)); thock(); };
$("pdIn").onclick=()=>{ PD.inF=PD.frame; if(PD.outF!==null && PD.outF<PD.inF) PD.outF=null; tick(); pdInfo(); };
$("pdOut").onclick=()=>{ if(PD.inF!==null && PD.frame<PD.inF){ click(520,.15,3); return; } PD.outF=PD.frame; tick(); pdInfo(); };
function pdBefore(on){ if(PD.before===on) return; PD.before=on; const b=$("pdBefore"); b.setAttribute("aria-pressed",String(on)); b.dataset.down=String(on); pdRequest(); pdInfo(); on?thock():tick(); }
(() => {
  const b=$("pdBefore");
  b.addEventListener("pointerdown", e=>{ b.setPointerCapture(e.pointerId); pdBefore(true); });
  ["pointerup","pointercancel"].forEach(ev=>b.addEventListener(ev, ()=>pdBefore(false)));
  b.addEventListener("keydown", e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); pdBefore(true); } });
  b.addEventListener("keyup", e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); pdBefore(false); } });
  b.addEventListener("click", e=>e.preventDefault());
  $("pd").addEventListener("keydown", e=>{ if((e.key==="b"||e.key==="B") && !e.repeat) pdBefore(true); });
  $("pd").addEventListener("keyup", e=>{ if(e.key==="b"||e.key==="B") pdBefore(false); });
})();
// a starting grade, so the deck opens mid-session rather than flat
[[0,-.2],[1,-.1],[5,.15],[6,.25],[7,.1]].forEach(([k,v])=>{ PD.z[k]=v; pdFaders[k].set(v,"init"); });
PD.contrast=.2; pdKnobs.contrast.set(.2,true,true); PD.shadows=.3; pdKnobs.shadows.set(.3,true,true);
pdHist.list=[JSON.stringify({ z:Array(8).fill(0), exposure:0, contrast:0, shadows:0, highlights:0, blacks:0, whites:0 }), pdSnap()]; pdHist.i=1;
pdDots(); pdRequest(); pdInfo();
accentHooks.push(pdRequest);
bindFinish("pdFinish","pd");

/* ═════════ Enochian Number Pad ═════════ */
const NK={ acc:null, op:null, entry:"1280", fresh:false, mem:[null,null,null,null,null], tape:[["640 × 2","1,280"]], msgT:0 };
const OPS={ "+":"+", "-":"−", "*":"×", "/":"÷" };
const nkNum = s => s===""||s==="-" ? 0 : parseFloat(s);
const nkFmt = n => { if(!isFinite(n)) return "—"; const a=Math.abs(n); if(a!==0 && (a>=1e12 || a<1e-8)) return n.toExponential(6).replace("-","−"); return n.toLocaleString("en-US",{ maximumFractionDigits:8 }).replace("-","−"); };
const nkEntryFmt = s => { if(s===""||s==="-") return s==="-"?"−0":"0"; const [i,f]=s.split("."); const n=nkFmt(parseFloat(i||"0")).replace(/\..*/,""); return (s.startsWith("-")&&!n.startsWith("−")?"−":"") + n + (f!==undefined?"."+f:""); };
function nkCalc(a,op,b){ switch(op){ case "+": return a+b; case "-": return a-b; case "*": return a*b; case "/": return b===0 ? NaN : a/b; } return b; }
function nkSay(m){ $("nkMsg").textContent=m; clearTimeout(NK.msgT); NK.msgT=setTimeout(()=>$("nkMsg").textContent="",2200); }
function nkCurrent(){ return NK.entry!=="" ? nkNum(NK.entry) : (NK.acc ?? 0); }
function nkRender(){
  $("nkVal").textContent = NK.entry!=="" ? nkEntryFmt(NK.entry) : nkFmt(NK.acc ?? 0);
  $("nkExpr").innerHTML = NK.op ? `${nkFmt(NK.acc)} ${OPS[NK.op]}` : "&nbsp;";
  $("nkMems").innerHTML = NK.mem.map((m,i)=>`<span class="${m===null?"":"set"}">M${i+1} ${m===null?"—":nkFmt(m)}</span>`).join("");
  $$('#nk [data-k^="m"]').forEach((k,i)=>k.dataset.stored=String(NK.mem[i]!==null));
  $("nkTape").innerHTML = NK.tape.slice(-4).reverse().map(([e,r])=>`<div><span>${e} =</span><b>${r}</b></div>`).join("") || `<div><span>results land here</span></div>`;
  $("nkKnob").setAttribute("aria-valuetext", $("nkVal").textContent);
}
function nkSetEntry(n){ NK.entry = String(+n.toFixed(10)); NK.fresh=true; }
function nkPress(k){
  if(/^[0-9]$/.test(k)){
    if(NK.fresh){ NK.entry=""; NK.fresh=false; }
    if(NK.entry.replace(/[-.]/g,"").length>=12) return nkSay("12 DIGITS MAX");
    NK.entry = (NK.entry==="0" ? "" : NK.entry==="-0" ? "-" : NK.entry) + k;
  } else if(k==="."){
    if(NK.fresh){ NK.entry=""; NK.fresh=false; }
    if(!NK.entry.includes(".")) NK.entry=(NK.entry===""||NK.entry==="-"?NK.entry+"0":NK.entry)+".";
  } else if(OPS[k]){
    if(NK.entry!==""){ const b=nkNum(NK.entry); const r = NK.acc===null||NK.op===null ? b : nkCalc(NK.acc,NK.op,b); if(isNaN(r)) return nkErr(); NK.acc=r; }
    else if(NK.acc===null) NK.acc=0;
    NK.op=k; NK.entry=""; NK.fresh=false;
  } else if(k==="="){
    if(NK.op===null || NK.entry===""){ nkSay(NK.op?"ENTER A SECOND NUMBER":"NOTHING TO SOLVE"); return; }
    const b=nkNum(NK.entry), r=nkCalc(NK.acc,NK.op,b); if(isNaN(r)) return nkErr();
    NK.tape.push([`${nkFmt(NK.acc)} ${OPS[NK.op]} ${nkFmt(b)}`, nkFmt(r)]); if(NK.tape.length>20) NK.tape.shift();
    NK.acc=null; NK.op=null; nkSetEntry(r);
  } else if(k==="back"){ if(NK.fresh){ NK.fresh=false; } NK.entry=NK.entry.slice(0,-1); if(NK.entry==="-") NK.entry=""; }
  else if(k==="neg"){ if(NK.entry===""||NK.fresh&&NK.entry==="0") NK.entry="-"; else NK.entry = NK.entry.startsWith("-") ? NK.entry.slice(1) : "-"+NK.entry; }
  else if(k==="pct"){ const b=nkNum(NK.entry); nkSetEntry(NK.op && NK.acc!==null && (NK.op==="+"||NK.op==="-") ? NK.acc*b/100 : b/100); }
  else if(k==="c"){ NK.entry=""; NK.fresh=false; nkSay("ENTRY CLEARED"); }
  else if(k==="ac"){ NK.acc=null; NK.op=null; NK.entry=""; NK.fresh=false; nkSay("ALL CLEAR"); }
  nkRender();
}
function nkErr(){ NK.acc=null; NK.op=null; NK.entry=""; NK.fresh=false; nkSay("CAN'T DIVIDE BY ZERO · CLEARED"); click(520,.18,3); nkRender(); }
const nkCaps={}; $$("#nk .nk-key").forEach(cap=>nkCaps[cap.dataset.k]=cap);
function nkPressVisual(cap){ cap.dataset.down="true"; setTimeout(()=>cap.dataset.down="false", 110); }
$$("#nk .nk-key").forEach(cap => {
  const k=cap.dataset.k;
  if(/^m\d$/.test(k)){
    const i=+k[1]; let timer=0, held=false, active=false;
    cap.addEventListener("pointerdown", () => { active=true; held=false; cap.dataset.down="true"; tick();
      timer=setTimeout(() => { held=true; NK.mem[i]=nkCurrent(); thock(); nkSay(`M${i+1} STORED · ${nkFmt(NK.mem[i])}`); nkRender(); }, 500); });
    const up = () => { if(!active) return; active=false; clearTimeout(timer); cap.dataset.down="false";
      if(!held){ if(NK.mem[i]===null) nkSay(`M${i+1} EMPTY · HOLD TO STORE`); else { nkSetEntry(NK.mem[i]); nkSay(`M${i+1} RECALLED`); nkRender(); } } };
    cap.addEventListener("pointerup", up); cap.addEventListener("pointercancel", up); cap.addEventListener("pointerleave", up);
    cap.addEventListener("click", e => { if(e.detail===0){ if(NK.mem[i]===null){ NK.mem[i]=nkCurrent(); nkSay(`M${i+1} STORED · ${nkFmt(NK.mem[i])}`); } else { nkSetEntry(NK.mem[i]); nkSay(`M${i+1} RECALLED`); } thock(); nkRender(); } });
  } else {
    cap.addEventListener("click", () => { k==="="?thock():tick(); nkPress(k); });
  }
});
const NK_KEYMAP={ "0":"0","1":"1","2":"2","3":"3","4":"4","5":"5","6":"6","7":"7","8":"8","9":"9",".":".",",":".","+":"+","-":"-","*":"*","x":"*","/":"/","Enter":"=","=":"=","Backspace":"back","Escape":"ac","Delete":"c","%":"pct" };
$("nk").addEventListener("keydown", e => {
  if(e.metaKey||e.ctrlKey||e.altKey) return;
  if(e.target.classList.contains("nk-key") && e.key===" ") return; // Space keeps native button activation; Enter always means equals
  if(e.target.id==="nkKnob" && e.key.startsWith("Arrow")) return;
  const k=NK_KEYMAP[e.key]; if(!k) return; e.preventDefault();
  const cap=nkCaps[k]; if(cap) nkPressVisual(cap);
  k==="="?thock():tick(); nkPress(k);
});
/* nudge knob: one detent per 14 px; ±1, or ±0.1 with Shift */
(() => {
  const el=$("nkKnob"); let ang=0, drag=false, sy=0, acc=0;
  const sp=new Spring(0, SNAP, a=>$("nkKnobCap").style.transform=`rotate(${a.toFixed(1)}deg)`, 0.05);
  const nudge=(d, fine)=>{ const s=fine?0.1:1; nkSetEntry(nkCurrent()+d*s); NK.fresh=true; ang+=d*24; sp.to(ang); tick(); nkRender(); };
  el.addEventListener("pointerdown", e=>{ drag=true; sy=e.clientY; acc=0; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", e=>{ if(!drag) return; acc+=sy-e.clientY; sy=e.clientY; while(acc>=14){ acc-=14; nudge(1,e.shiftKey); } while(acc<=-14){ acc+=14; nudge(-1,e.shiftKey); } });
  el.addEventListener("pointerup", ()=>drag=false); el.addEventListener("pointercancel", ()=>drag=false);
  el.addEventListener("wheel", e=>{ e.preventDefault(); nudge(e.deltaY<0?1:-1, e.shiftKey); }, { passive:false });
  el.addEventListener("keydown", e=>{ if(e.key==="ArrowUp"||e.key==="ArrowRight"){ e.preventDefault(); nudge(1,e.shiftKey); } else if(e.key==="ArrowDown"||e.key==="ArrowLeft"){ e.preventDefault(); nudge(-1,e.shiftKey); } });
})();
NK.mem[0]=1280; NK.mem[2]=0.0825;
bindFinish("nkFinish","nk");
nkRender();

/* ═════════ master bus: every voice on the page runs through MASTER → ANALYSER ═════════ */
let MASTER=null, ANALYSER=null, FBUF=null;
const MON={ vol:70, standby:false, input:"usb-c" };
const masterGainVal = () => MON.standby ? 0 : Math.pow(MON.vol/70, 1.5);
function setMasterGain(){ if(MASTER) MASTER.gain.setTargetAtTime(masterGainVal(), AC.currentTime, 0.03); }
function bands(){
  if(!ANALYSER || !AC || AC.state!=="running") return { low:0, high:0 };
  if(!FBUF) FBUF=new Uint8Array(ANALYSER.frequencyBinCount);
  ANALYSER.getByteFrequencyData(FBUF);
  const hz=AC.sampleRate/ANALYSER.fftSize;
  const avg=(a,b)=>{ let s=0,n=0; for(let i=Math.max(1,Math.floor(a/hz)); i<=Math.min(FBUF.length-1,Math.ceil(b/hz)); i++){ s+=FBUF[i]; n++; } return n ? s/n/255 : 0; };
  return { low:avg(20,250), high:avg(3000,12000) };
}

/* ═════════ Enochian Remote Control ═════════ */
const TV_ITEMS=[["Vigil","V","#46464b","#121214"],["Choir","C","#5b5b61","#1c1c1f"],["Aether","A","#2c2c30","#060607"],["Triune","T","#6c6c72","#242427"],
                ["Cantor","C","#424247","#101012"],["Meridian","M","#606066","#17171a"],["Regie","R","#38383c","#0b0b0d"],["Strobe","S","#76767c","#2a2a2e"]];
const TV={ power:true, view:"grid", f:0, open:0, playing:false, prog:TV_ITEMS.map((_,i)=>[.62,.18,0,.4,0,.85,.05,0][i]), vol:8, muted:false, osdT:0 };
const tvTiles=[];
TV_ITEMS.forEach(([t,g,a,b],i) => {
  if(i===4){ const r=document.createElement("span"); r.className="tv-row"; r.textContent="Library"; $("tvGrid").appendChild(r); }
  const el=document.createElement("div"); el.className="tv-tile"; el.style.setProperty("--g",`linear-gradient(135deg,${a},${b})`);
  el.innerHTML=`${g}<i>${t.toUpperCase()}</i>`; $("tvGrid").appendChild(el); tvTiles.push(el);
});
function tvRender(){
  const s=$("tvScreen"); s.dataset.view=TV.view; s.dataset.power=TV.power?"on":"off";
  tvTiles.forEach((el,i)=>el.classList.toggle("focus", i===TV.f));
  const [t,g,a,b]=TV_ITEMS[TV.open];
  $("tvArt").style.setProperty("--g",`linear-gradient(135deg,${a},${b})`); $("tvArt").textContent=g;
  $("tvTitle").textContent=t; $("tvSub").textContent=`EPISODE ${TV.open+1} · 42 MIN`;
  $("tvState").textContent = TV.playing ? "▸ PLAYING" : "❚❚ PAUSED";
  $("tvProg").style.width=(TV.prog[TV.open]*100).toFixed(1)+"%";
  $("tvWhere").textContent = TV.view==="grid" ? "HOME" : t.toUpperCase();
  $("tvLvl").style.height=(TV.muted?0:TV.vol/16*100)+"%"; $("tvOsd").classList.toggle("muted", TV.muted);
  const now=new Date(); $("tvClock").textContent=`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  $("rmRead").innerHTML = !TV.power ? "<b>STANDBY</b> · press power to wake" :
    `<b>${TV.view==="grid"?"HOME":t.toUpperCase()}</b> · ${TV.view==="grid"?"focus "+TV_ITEMS[TV.f][0]:(TV.playing?"playing":"paused")+" "+Math.round(TV.prog[TV.open]*100)+"%"} · volume ${TV.muted?"muted":TV.vol+"/16"}`;
}
function tvOsd(){ $("tvOsd").classList.add("show"); clearTimeout(TV.osdT); TV.osdT=setTimeout(()=>$("tvOsd").classList.remove("show"),1400); }
function tvNudge(dx,dy){ const el=tvTiles[TV.f]; el.style.setProperty("--nx",dx*4+"px"); el.style.setProperty("--ny",dy*4+"px"); el.classList.remove("nudge"); void el.offsetWidth; el.classList.add("nudge"); }
function tvMove(dx,dy){
  if(!TV.power) return;
  if(TV.view==="detail"){ if(dx){ TV.prog[TV.open]=clamp(TV.prog[TV.open]+dx*.05,0,1); tick(); tvRender(); } return; }
  const c=TV.f%4+dx, r=Math.floor(TV.f/4)+dy;
  if(c<0||c>3||r<0||r>1){ tvNudge(dx,dy); click(900,.08,2); return; }
  TV.f=r*4+c; tick(); tvRender();
}
function tvAct(a){
  if(a==="power"){ TV.power=!TV.power; if(!TV.power) TV.playing=false; thock(); tvRender(); return; }
  if(!TV.power) return;
  switch(a){
    case "select": if(TV.view==="grid"){ TV.open=TV.f; TV.view="detail"; TV.playing=true; } else TV.playing=!TV.playing; thock(); break;
    case "back": if(TV.view==="detail"){ TV.view="grid"; TV.playing=false; } tick(); break;
    case "home": TV.view="grid"; TV.f=0; TV.playing=false; tick(); break;
    case "play": if(TV.view==="grid"){ TV.open=TV.f; TV.view="detail"; TV.playing=true; } else TV.playing=!TV.playing; tick(); break;
    case "up": TV.vol=Math.min(16,TV.vol+1); TV.muted=false; tvOsd(); tick(); break;
    case "down": TV.vol=Math.max(0,TV.vol-1); TV.muted=false; tvOsd(); tick(); break;
    case "mute": TV.muted=!TV.muted; tvOsd(); tick(); break;
  }
  if(TV.playing) addLoop(tvTick);
  tvRender();
}
function tvTick(dt){
  if(!TV.playing || !TV.power || TV.view!=="detail") return false;
  TV.prog[TV.open]=Math.min(1, TV.prog[TV.open]+dt/90);
  if(TV.prog[TV.open]>=1){ TV.playing=false; }
  $("tvProg").style.width=(TV.prog[TV.open]*100).toFixed(2)+"%";
  if(!TV.playing) tvRender();
  return TV.playing;
}
(() => {
  const pad=$("rmPad"), wedge=$("rmWedge"), ghost=$("rmGhost"); let sw=null;
  const local = e => { const r=pad.getBoundingClientRect(); const x=(e.clientX-r.left)/r.width*2-1, y=(e.clientY-r.top)/r.height*2-1; return { x, y, r:Math.hypot(x,y), px:e.clientX-r.left, py:e.clientY-r.top }; };
  const flashDir = (dx,dy) => { const deg = dx>0?90:dx<0?-90:dy>0?180:0; wedge.style.transform=`rotate(${deg}deg)`; wedge.style.opacity=1; setTimeout(()=>wedge.style.opacity=0,160); };
  pad.addEventListener("pointerdown", e => {
    try{ pad.setPointerCapture(e.pointerId); }catch(_){}
    const p=local(e);
    if(p.r>0.6){
      const a=Math.atan2(p.y,p.x)*180/Math.PI; let dx=0,dy=0;
      if(a>-45&&a<=45) dx=1; else if(a>45&&a<=135) dy=1; else if(a<=-45&&a>-135) dy=-1; else dx=-1;
      flashDir(dx,dy); tvMove(dx,dy); sw=null; return;
    }
    sw={ x:p.x, y:p.y, dx:0, dy:0, moved:false };
    ghost.style.left=p.px+"px"; ghost.style.top=p.py+"px"; ghost.style.opacity=1;
  });
  pad.addEventListener("pointermove", e => {
    if(!sw) return; const p=local(e);
    ghost.style.left=p.px+"px"; ghost.style.top=p.py+"px";
    sw.dx+=p.x-sw.x; sw.dy+=p.y-sw.y; sw.x=p.x; sw.y=p.y;
    const T=.34;
    while(Math.abs(sw.dx)>T && Math.abs(sw.dx)>=Math.abs(sw.dy)){ const s=Math.sign(sw.dx); tvMove(s,0); sw.dx-=s*T; sw.moved=true; }
    while(Math.abs(sw.dy)>T && Math.abs(sw.dy)>Math.abs(sw.dx)){ const s=Math.sign(sw.dy); tvMove(0,s); sw.dy-=s*T; sw.moved=true; }
  });
  const up = () => { ghost.style.opacity=0; if(sw && !sw.moved) tvAct("select"); sw=null; };
  pad.addEventListener("pointerup", up); pad.addEventListener("pointercancel", () => { ghost.style.opacity=0; sw=null; });
  $$("#rm [data-a]").forEach(b => b.addEventListener("click", () => tvAct(b.dataset.a)));
  $("rmPwr").addEventListener("click", () => tvAct("power"));
  const press = (sel, fn) => { const el=$("rm").querySelector(sel); if(el){ el.dataset.down="true"; setTimeout(()=>el.dataset.down="false",120); } fn(); };
  $("rm").addEventListener("keydown", e => {
    if(e.target!==$("rm") && (e.key==="Enter"||e.key===" ")) return;
    const k=e.key; let hit=true;
    if(k.startsWith("Arrow")){ const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[k]; flashDir(...d); tvMove(...d); }
    else if(k==="Enter") tvAct("select");
    else if(k==="Escape"||k==="Backspace") press('[data-a="back"]',()=>tvAct("back"));
    else if(k===" ") press('[data-a="play"]',()=>tvAct("play"));
    else if(k==="+"||k==="=") press('[data-a="up"]',()=>tvAct("up"));
    else if(k==="-") press('[data-a="down"]',()=>tvAct("down"));
    else if(k==="m"||k==="M") press('[data-a="mute"]',()=>tvAct("mute"));
    else if(k==="h"||k==="H") press('[data-a="home"]',()=>tvAct("home"));
    else if(k==="p"||k==="P") press('#rmPwr',()=>tvAct("power"));
    else hit=false;
    if(hit) e.preventDefault();
  });
})();
bindFinish("rmFinish","rm");
tvRender();

/* ═════════ Enochian Scroll Wheel ═════════ */
const IP_SONGS=[["Vigil at Dawn","Enochian Clock",214],["Choir of Detents","Enochian Stepped Knob",187],["Three Gates","Enochian Toggle Bank 01",242],["Aether Static","Enochian Radio Player",199],["Ivory Hour","Enochian Rotary Knob 02",226],["Code","Enochian Code Toggle",171],
  ["Cantor Rising","Enochian LED Level Meter",233],["Meridian Drift","Enochian Pitch Slider",205],["Lantern Hours","Enochian Light Switch Bank",258],["Strobe at 33","Enochian Turntable",219],["Memory Stop","Enochian Tape Deck",184],["Penumbra","Enochian Video Editor",263]];
const IP={ stack:[], playing:false, track:0, queue:IP_SONGS.map((_,i)=>i), pos:48, vol:60, clicker:true, repeat:"Off", shuffle:false, scrub:false, volUntil:0, lastNow:0 };
const IP_ROWS=7;
const ipTime = s => `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
const ipPush = m => { IP.stack.push(Object.assign({ sel:0, top:0 }, m)); ipRender(); };
function ipSongs(title, idxs){ return { title, items: idxs.map(i => ({ label:IP_SONGS[i][0], right:ipTime(IP_SONGS[i][2]), go:()=>{ ipPlay(i, idxs); ipOpenNow(); } })) }; }
function ipMain(){ return { title:"Orbit", items:[
  { label:"Music", chev:true, go:()=>ipPush(ipMusic()) },
  { label:"Now Playing", chev:true, go:ipOpenNow },
  { label:"Shuffle Songs", go:()=>{ IP.shuffle=true; ipPlay(Math.floor(Math.random()*IP_SONGS.length), IP_SONGS.map((_,i)=>i)); ipOpenNow(); } },
  { label:"Settings", chev:true, go:()=>ipPush(ipSettings()) },
  { label:"About", chev:true, go:()=>ipPush(ipAbout()) } ] }; }
function ipMusic(){ return { title:"Music", items:[
  { label:"Playlists", chev:true, go:()=>ipPush({ title:"Playlists", items:[ { label:"Foundation", chev:true, go:()=>ipPush(ipSongs("Foundation",[0,1,2,3,4,5])) }, { label:"Instruments", chev:true, go:()=>ipPush(ipSongs("Instruments",[6,7,8,9,10,11])) } ] }) },
  { label:"Artists", chev:true, go:()=>ipPush({ title:"Artists", items:IP_SONGS.map((s,i)=>({ label:s[1], chev:true, go:()=>ipPush(ipSongs(s[1],[i])) })).sort((a,b)=>a.label.localeCompare(b.label)) }) },
  { label:"Songs", chev:true, go:()=>ipPush(ipSongs("Songs", IP_SONGS.map((_,i)=>i))) } ] }; }
function ipSettings(){ return { title:"Settings", items:[
  { label:"Clicker", right:()=>IP.clicker?"On":"Off", go:()=>{ IP.clicker=!IP.clicker; ipRender(); } },
  { label:"Repeat", right:()=>IP.repeat, go:()=>{ IP.repeat={ Off:"One", One:"All", All:"Off" }[IP.repeat]; ipRender(); } },
  { label:"Shuffle", right:()=>IP.shuffle?"Songs":"Off", go:()=>{ IP.shuffle=!IP.shuffle; ipRender(); } } ] }; }
function ipAbout(){ return { title:"About", items:[ { label:"Songs", right:"12" }, { label:"Playlists", right:"2" }, { label:"Wheel", right:"15° detent" }, { label:"Edition", right:"2026" } ] }; }
function ipPlay(i, queue){ IP.track=i; IP.queue=queue||IP.queue; IP.pos=0; IP.playing=true; addLoop(ipTick); }
function ipOpenNow(){ const top=IP.stack[IP.stack.length-1]; if(!top.now) IP.stack.push({ now:true, title:"Now Playing" }); IP.scrub=false; ipRender(); }
function ipNext(dir){
  const q=IP.queue, k=q.indexOf(IP.track);
  let n = IP.shuffle ? q[Math.floor(Math.random()*q.length)] : q[k+dir];
  if(n===undefined){ if(IP.repeat==="All") n = dir>0 ? q[0] : q[q.length-1]; else { IP.playing=false; IP.pos=0; ipRender(); return; } }
  IP.track=n; IP.pos=0; ipRender();
}
function ipTick(dt, now){
  if(!IP.playing) return false;
  IP.pos+=dt;
  const dur=IP_SONGS[IP.track][2];
  if(IP.pos>=dur){ if(IP.repeat==="One") IP.pos=0; else ipNext(1); }
  if(now-IP.lastNow>250 && IP.stack[IP.stack.length-1].now){ IP.lastNow=now; ipRender(); }
  return IP.playing;
}
function ipRender(){
  const top=IP.stack[IP.stack.length-1], body=$("ipBody");
  $("ipTitle").textContent=top.title;
  $("ipPlayIco").textContent = IP.playing ? "▸" : "❚❚";
  if(top.now){
    const [t,a,dur]=IP_SONGS[IP.track], k=IP.queue.indexOf(IP.track);
    const showVol = performance.now()<IP.volUntil && !IP.scrub;
    const pct = showVol ? IP.vol : IP.pos/dur*100;
    body.innerHTML = `<div class="ip-now"><div class="ip-nowtop"><div class="ip-art">${t[0]}</div><div><div class="ip-t">${t}</div><div class="ip-a">${a}</div><div class="ip-n">${k+1} of ${IP.queue.length}</div></div></div>
      <div class="ip-mode">${showVol?"VOLUME":IP.scrub?"SCRUBBING · PRESS CENTER TO RETURN":IP.playing?"PLAYING":"PAUSED"}</div>
      <div class="ip-bar${IP.scrub?" scrub":""}"><b style="width:${pct.toFixed(1)}%"></b><i style="left:${pct.toFixed(1)}%"></i></div>
      ${showVol?"":`<div class="ip-times"><span>${ipTime(IP.pos)}</span><span>−${ipTime(dur-IP.pos)}</span></div>`}</div>`;
    $("ipRead").innerHTML=`<b>${t}</b> · ${IP.playing?"playing":"paused"} ${ipTime(IP.pos)} · volume ${IP.vol}%`;
    return;
  }
  const n=top.items.length;
  if(top.sel<top.top) top.top=top.sel; if(top.sel>=top.top+IP_ROWS) top.top=top.sel-IP_ROWS+1;
  body.innerHTML = top.items.slice(top.top, top.top+IP_ROWS).map((it,j) => {
    const i=top.top+j, r=typeof it.right==="function"?it.right():it.right;
    return `<div class="ip-item${i===top.sel?" sel":""}"><span>${it.label}</span><span class="r">${r??""}${it.chev?" ›":""}</span></div>`;
  }).join("") + (n>IP_ROWS ? `<div class="ip-scroll"><b style="top:${top.top/n*100}%;height:${IP_ROWS/n*100}%"></b></div>` : "");
  $("ipRead").innerHTML=`<b>${top.title}</b> · ${top.items[top.sel].label} · ${top.sel+1} of ${n}`;
}
function ipStep(s){
  const top=IP.stack[IP.stack.length-1];
  if(top.now){
    if(IP.scrub) IP.pos=clamp(IP.pos+s*4,0,IP_SONGS[IP.track][2]-1);
    else { IP.vol=clamp(IP.vol+s*4,0,100); IP.volUntil=performance.now()+1500; setTimeout(ipRender,1550); }
  } else {
    const n=clamp(top.sel+s,0,top.items.length-1); if(n===top.sel) return; top.sel=n;
  }
  if(IP.clicker) click(5200,.05,3);
  ipRender();
}
function ipPress(q){
  const top=IP.stack[IP.stack.length-1];
  if(q==="menu"){ if(IP.stack.length>1){ IP.stack.pop(); IP.scrub=false; } }
  else if(q==="prev"){ if(IP.pos>3) IP.pos=0; else ipNext(-1); }
  else if(q==="next") ipNext(1);
  else if(q==="play"){ IP.playing=!IP.playing; if(IP.playing) addLoop(ipTick); }
  else if(q==="center"){ if(top.now) IP.scrub=!IP.scrub; else top.items[top.sel].go?.(); }
  tick(); ipRender();
}
(() => {
  const w=$("ipWheel"), pressEl=$("ipPress"); let last=null, acc=0, turned=0, a0=0, active=false;
  const angle = e => { const r=w.getBoundingClientRect(); return Math.atan2(e.clientY-(r.top+r.height/2), e.clientX-(r.left+r.width/2))*180/Math.PI; };
  w.addEventListener("pointerdown", e => {
    if(e.target===$("ipCenter")) return;
    active=true; try{ w.setPointerCapture(e.pointerId); }catch(_){} a0=last=angle(e); acc=0; turned=0;
    pressEl.style.transform=`rotate(${a0+90}deg)`; pressEl.style.opacity=1;
  });
  w.addEventListener("pointermove", e => {
    if(!active) return; const a=angle(e); let d=a-last; if(d>180) d-=360; if(d<-180) d+=360; last=a; acc+=d; turned+=Math.abs(d);
    if(turned>8) pressEl.style.opacity=0;
    while(Math.abs(acc)>=15){ const s=Math.sign(acc); acc-=s*15; ipStep(s); }
  });
  const up = () => {
    if(!active) return; active=false; pressEl.style.opacity=0;
    if(turned<8){ const a=a0; ipPress(a>-135&&a<=-45?"menu":a>-45&&a<=45?"next":a>45&&a<=135?"play":"prev"); }
  };
  w.addEventListener("pointerup", up); w.addEventListener("pointercancel", () => { active=false; pressEl.style.opacity=0; });
  let wacc=0; w.addEventListener("wheel", e => { e.preventDefault(); wacc+=e.deltaY; while(Math.abs(wacc)>=40){ const s=Math.sign(wacc); wacc-=s*40; ipStep(s); } }, { passive:false });
  $("ipCenter").addEventListener("click", () => ipPress("center"));
  $("ip").addEventListener("keydown", e => {
    if(e.target===$("ipCenter") && (e.key==="Enter"||e.key===" ")) return;
    const m={ ArrowDown:()=>ipStep(1), ArrowUp:()=>ipStep(-1), ArrowLeft:()=>ipPress("prev"), ArrowRight:()=>ipPress("next"), Enter:()=>ipPress("center"), Escape:()=>ipPress("menu"), Backspace:()=>ipPress("menu"), " ":()=>ipPress("play") }[e.key];
    if(m){ e.preventDefault(); m(); }
  });
})();
IP.stack=[Object.assign({ sel:0, top:0 }, ipMain())];
bindFinish("ipFinish","ip");
ipRender();

/* ═════════ Enochian Speaker Crossover ═════════ */
const EX={ src:"off", f:120, xo:2000, dir:1, wAmp:0, tAmp:0, t:0, readAt:0 };
let EXA=null;
const fFromN=n=>20*Math.pow(800,n), nFromF=f=>Math.log(f/20)/Math.log(800);
const xoN=f=>Math.log(f/80)/Math.log(62.5), xoF=n=>80*Math.pow(62.5,n);
const fmtHz=f=>f>=1000?`${(f/1000).toFixed(f>=10000?1:2).replace(/\.?0+$/,"")} kHz`:`${Math.round(f)} Hz`;
(() => { // hex mesh over the tweeter dome
  const g=$("txMesh"), s=5.2, w=Math.sqrt(3)*s, v=1.5*s;
  for(let row=-9; row<=9; row++){ const y=row*v, off=(row&1)?w/2:0;
    for(let x=-63+off; x<=63; x+=w){ if(Math.hypot(x,y)>62) continue;
      const pts=[[x,y-s],[x+w/2,y-s/2],[x+w/2,y+s/2],[x,y+s],[x-w/2,y+s/2],[x-w/2,y-s/2]].map(p=>p.map(n=>n.toFixed(2)).join(",")).join(" ");
      svgEl("polygon",{ points:pts }, g); } }
})();
const exU=knobUnit("", "frequency", "pd-klbl"); $("exKnobWrap").appendChild(exU);
const exKnob=makeKnob(exU.querySelector(".knob"), exU.querySelector(".knob-cap"), { value:+nFromF(EX.f).toFixed(3), min:0, max:1, step:.005, fmt:n=>fmtHz(fFromN(n)),
  onChange:(n,touch)=>{ if(touch) return; EX.f=fFromN(n); exApply(); exRead(); } });
function exApply(){ if(EXA && AC){ EXA.o.frequency.setTargetAtTime(EX.f, AC.currentTime, .02); EXA.lp.frequency.value=EXA.hp.frequency.value=EX.xo; } }
function exAudio(on){
  const a=audio();
  if(on && a){
    if(!EXA){ const o=a.createOscillator(), lp=a.createBiquadFilter(), hp=a.createBiquadFilter(), g=a.createGain();
      lp.type="lowpass"; hp.type="highpass"; g.gain.value=0; o.connect(lp); o.connect(hp); lp.connect(g); hp.connect(g); g.connect(MASTER); o.start(); EXA={ o, lp, hp, g }; }
    exApply(); EXA.g.gain.setTargetAtTime(0.07, a.currentTime, .05);
  } else if(EXA && AC) EXA.g.gain.setTargetAtTime(0, AC.currentTime, .05);
}
function exRead(){
  const w=1/Math.sqrt(1+Math.pow(EX.f/EX.xo,4)), t=1/Math.sqrt(1+Math.pow(EX.xo/EX.f,4));
  $("exRead").innerHTML = EX.src==="page" ? `<b>page</b> · following the master bus · crossover ${fmtHz(EX.xo)}`
    : `<b>${EX.src}</b> · ${fmtHz(EX.f)} · woofer ${Math.round(w*100)}% · tweeter ${Math.round(t*100)}% · crossover ${fmtHz(EX.xo)}`;
}
const xoTrack=$("xoTrack");
function xoSet(f){ EX.xo=clamp(f,80,5000); const n=xoN(EX.xo); $("xoCap").style.left=(n*100)+"%"; $("xoFill").style.width=(n*100)+"%";
  xoTrack.setAttribute("aria-valuenow",Math.round(EX.xo)); xoTrack.setAttribute("aria-valuetext",fmtHz(EX.xo)); exApply(); exRead(); }
[[100,"100"],[200,"200"],[500,"500"],[1000,"1k"],[2000,"2k"],[5000,"5k"]].forEach(([f,l])=>{ const s=document.createElement("span"); s.style.left=(xoN(f)*100)+"%"; s.textContent=l; $("xoScale").appendChild(s); });
xoTrack.setAttribute("aria-valuemin",80); xoTrack.setAttribute("aria-valuemax",5000);
(() => { let drag=false;
  const at=e=>{ const r=xoTrack.getBoundingClientRect(); xoSet(xoF(clamp((e.clientX-r.left)/r.width,0,1))); };
  xoTrack.addEventListener("pointerdown",e=>{ drag=true; try{ xoTrack.setPointerCapture(e.pointerId); }catch(_){} at(e); tick(); });
  xoTrack.addEventListener("pointermove",e=>{ if(drag) at(e); });
  xoTrack.addEventListener("pointerup",()=>drag=false); xoTrack.addEventListener("pointercancel",()=>drag=false);
  xoTrack.addEventListener("keydown",e=>{ const n=xoN(EX.xo); const d={ArrowRight:.02,ArrowUp:.02,ArrowLeft:-.02,ArrowDown:-.02,PageUp:.1,PageDown:-.1}[e.key];
    if(d!==undefined){ e.preventDefault(); xoSet(xoF(clamp(n+d,0,1))); } else if(e.key==="Home"){ e.preventDefault(); xoSet(80); } else if(e.key==="End"){ e.preventDefault(); xoSet(5000); } });
})();
function exTick(dt, now){
  EX.t+=dt;
  if(EX.src==="sweep"){ EX.f*=Math.pow(800, EX.dir*dt/8); if(EX.f>=16000){ EX.f=16000; EX.dir=-1; } if(EX.f<=20){ EX.f=20; EX.dir=1; } exKnob.set(nFromF(EX.f), true, true); exApply(); }
  let w=0, t=0;
  if(EX.src==="tone"||EX.src==="sweep"){ w=1/Math.sqrt(1+Math.pow(EX.f/EX.xo,4)); t=1/Math.sqrt(1+Math.pow(EX.xo/EX.f,4)); }
  else if(EX.src==="page"){ const b=bands(); w=Math.min(1,b.low*1.7); t=Math.min(1,b.high*3.2); }
  const k=1-Math.exp(-dt/0.06); EX.wAmp+=(w-EX.wAmp)*k; EX.tAmp+=(t-EX.tAmp)*k;
  const osc = EX.src==="page" ? 1 : Math.sin(2*Math.PI*clamp(EX.f/12,3,14)*EX.t);
  const cs = 1 + EX.wAmp*(EX.src==="page"?0.07:0.05*osc);
  $("exCone").style.transform=`scale(${cs.toFixed(4)})`; $("exSurr").style.transform=`scale(${(1+(cs-1)*.35).toFixed(4)})`;
  $("exDome").style.transform=`scale(${(1+EX.tAmp*.03*Math.sin(2*Math.PI*17*EX.t)).toFixed(4)})`; $("exGlint").setAttribute("opacity",(.22+EX.tAmp*.6).toFixed(3));
  $("exWm").style.width=(EX.wAmp*100).toFixed(1)+"%"; $("exTm").style.width=(EX.tAmp*100).toFixed(1)+"%";
  if(now-EX.readAt>120){ EX.readAt=now; $("exWl").textContent=`woofer ${Math.round(EX.wAmp*100)}%`; $("exTl").textContent=`tweeter ${Math.round(EX.tAmp*100)}%`; if(EX.src==="sweep") exRead(); }
  return EX.src!=="off" || EX.wAmp>0.004 || EX.tAmp>0.004;
}
$$("[data-src]").forEach(b => b.onclick = () => {
  EX.src=b.dataset.src; $$("[data-src]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  exAudio(EX.src==="tone"||EX.src==="sweep"); thock(); exRead(); addLoop(exTick);
});
xoSet(EX.xo); exRead();
bindFinish("exFinish","ex");

/* ═════════ Enochian Stereo Speakers ═════════ */
const mnPulse={ "-1":0, "1":0 }; let mnT=0, mnFlipped=false;
const mnFlip=new Spring(0, HEAVY, a => { $("mnL").style.transform=`rotateY(${a.toFixed(2)}deg)`; $("mnR").style.transform=`rotateY(${a.toFixed(2)}deg)`; }, 0.05);
const mnVolSp=new Spring(-135+MON.vol/100*270, HEAVY, a => $("mnVolCap").style.transform=`rotate(${a.toFixed(2)}deg)`, 0.05);
function mnRender(){
  $("mnLed").classList.toggle("on", !MON.standby);
  const v=$("mnVol"); v.setAttribute("aria-valuenow",MON.vol); v.setAttribute("aria-valuetext", MON.standby?"standby":`${MON.vol} percent`);
  const name=$("mnInputs").querySelector('[aria-checked="true"] span').textContent;
  $("mnRead").innerHTML = `<b>${MON.standby?"standby":MON.vol+"%"}</b> · input ${name} · ${MON.standby?"page audio muted":"on"}`;
}
function mnSetVol(v){ MON.vol=Math.round(clamp(v,0,100)); mnVolSp.to(-135+MON.vol/100*270); setMasterGain(); mnRender(); }
function mnStandby(){ MON.standby=!MON.standby; setMasterGain(); if(MON.standby){ mnRender(); } else { thock(); mnRender(); } }
(() => { const el=$("mnVol"); let drag=false, sy=0, sv=0, moved=0;
  el.addEventListener("pointerdown",e=>{ drag=true; sy=e.clientY; sv=MON.vol; moved=0; try{ el.setPointerCapture(e.pointerId); }catch(_){} });
  el.addEventListener("pointermove",e=>{ if(!drag) return; moved=Math.max(moved,Math.abs(sy-e.clientY)); if(moved>3) mnSetVol(sv+(sy-e.clientY)/1.4); });
  el.addEventListener("pointerup",()=>{ if(drag && moved<=3) mnStandby(); drag=false; });
  el.addEventListener("pointercancel",()=>drag=false);
  el.addEventListener("keydown",e=>{ const d={ArrowUp:2,ArrowRight:2,ArrowDown:-2,ArrowLeft:-2,PageUp:10,PageDown:-10}[e.key];
    if(d!==undefined){ e.preventDefault(); mnSetVol(MON.vol+d); } else if(e.key==="Enter"||e.key===" "){ e.preventDefault(); mnStandby(); } });
})();
$$(".mn-woof").forEach(b => b.addEventListener("click", () => {
  const side=+b.dataset.side; mnPulse[side]=1; addLoop(mnTick);
  const a=audio(); if(!a || !MASTER) return;
  const len=Math.floor(a.sampleRate*.35), buf=a.createBuffer(1,len,a.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.min(1,i/400)*Math.pow(1-i/len,2);
  const src=a.createBufferSource(); src.buffer=buf; const f=a.createBiquadFilter(); f.type="bandpass"; f.frequency.value=900; f.Q.value=.6;
  const g=a.createGain(); g.gain.value=.35; const p=a.createStereoPanner?a.createStereoPanner():null;
  src.connect(f); f.connect(g); if(p){ p.pan.value=side; g.connect(p); p.connect(MASTER); } else g.connect(MASTER); src.start();
  $("mnRead").innerHTML=`<b>${side<0?"left":"right"}</b> · test burst · ${MON.standby?"standby is on, nothing plays":"you should hear it on the "+(side<0?"left":"right")}`;
}));
$$("#mnInputs .mn-in").forEach((b,i,all) => {
  b.addEventListener("click", () => { all.forEach(x=>{ x.setAttribute("aria-checked",String(x===b)); x.tabIndex = x===b?0:-1; }); MON.input=b.dataset.in;
    const led=$("mnLed"); led.classList.add("blink"); setTimeout(()=>led.classList.remove("blink"),1300); clack(); mnRender(); });
  b.tabIndex = b.getAttribute("aria-checked")==="true"?0:-1;
  b.addEventListener("keydown", e => { const d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key]; if(d){ e.preventDefault(); const n=all[(i+d+all.length)%all.length]; n.click(); n.focus(); } });
});
$("mnFlip").onclick = () => { mnFlipped=!mnFlipped; mnFlip.to(mnFlipped?180:0); $("mnFlip").setAttribute("aria-pressed",String(mnFlipped)); $("mnFlip").textContent=mnFlipped?"SHOW FRONT":"SHOW REAR";
  $$("#mnL .mn-face, #mnR .mn-face").forEach(f=>f.inert=mnFlipped); $$("#mnL .mn-back, #mnR .mn-back").forEach(f=>f.inert=!mnFlipped); thock(); };
$$("#mnL .mn-back, #mnR .mn-back").forEach(f=>f.inert=true);
$("mnGroove").onclick = () => { SEQ.playing ? seqStop() : seqStart(); thock(); addLoop(mnTick); };
function mnTick(dt){
  mnT+=dt;
  const b=bands(), vis=visible.get($("mnStage"));
  ["-1","1"].forEach(s => { mnPulse[s]*=Math.exp(-dt*5);
    const sc = MON.standby ? 1 : 1 + b.low*0.08 + mnPulse[s]*0.05*Math.abs(Math.sin(2*Math.PI*9*mnT));
    $(s==="-1"?"mnConeL":"mnConeR").style.transform=`scale(${sc.toFixed(4)})`; });
  const g=$("mnGroove"); if(g.getAttribute("aria-pressed")!==String(SEQ.playing)){ g.setAttribute("aria-pressed",String(SEQ.playing)); g.textContent=SEQ.playing?"STOP GROOVE":"PLAY GROOVE"; }
  return vis || mnPulse["-1"]>.01 || mnPulse["1"]>.01;
}
watch($("mnStage"), () => addLoop(mnTick));
bindFinish("mnFinish","mnStage");
mnRender();

/* ═════════ Enochian Camera rangefinder ═════════ */
const CAM_SPEEDS=["A","1","2","4","8","15","30","60","125","250","500","1000","2000","4000"];
const CAM_F=[1.4,2,2.8,4,5.6,8,11,16];
const CAM_SCENES={ portrait:{ d:1.2, ev:7 }, street:{ d:3, ev:12 }, far:{ d:Infinity, ev:14 } };
const CAM={ sp:9, fi:4, n:1-0.7/5, scene:"street", frames:0, roll:1, wakeUntil:0, wakeT:0 };
const camDist = n => n>=0.995 ? Infinity : 0.7/(1-n);
const camN = d => d===Infinity ? 1 : 1-0.7/d;
const camFmtD = d => d===Infinity ? "∞" : d>=10 ? Math.round(d)+" m" : (Math.round(d*10)/10)+" m";
const camT = i => 1/+CAM_SPEEDS[i];
const camFmtT = t => t>=1 ? `${Math.round(t)}s` : `1/${Math.round(1/t)}`;
function camExposure(){
  const N=CAM_F[CAM.fi], evScene=CAM_SCENES[CAM.scene].ev+2;
  let i=CAM.sp, auto=false;
  if(CAM_SPEEDS[i]==="A"){ auto=true; const ideal=N*N/Math.pow(2,evScene); let best=1, bd=1e9;
    for(let k=1;k<CAM_SPEEDS.length;k++){ const d=Math.abs(Math.log2(camT(k)/ideal)); if(d<bd){ bd=d; best=k; } } i=best; }
  const t=camT(i), under=Math.log2(N*N/t)-evScene;
  return { N, t, under, auto, label:CAM_SPEEDS[i] };
}
function camFocus(){
  const N=CAM_F[CAM.fi], err=1/camDist(CAM.n)-1/CAM_SCENES[CAM.scene].d, tol=N*0.012;
  return { err, blur:Math.min(14, Math.max(0, Math.abs(err)-tol)*42) };
}

/* scene drawing: three monochrome subjects, each with a vertical edge under the rangefinder patch */
const camScene=document.createElement("canvas"); camScene.width=480; camScene.height=320;
function camDrawScene(){
  const c=camScene.getContext("2d"), W=480, H=320;
  const grad=(y0,y1,a,b)=>{ const g=c.createLinearGradient(0,y0,0,y1); g.addColorStop(0,a); g.addColorStop(1,b); return g; };
  c.clearRect(0,0,W,H);
  if(CAM.scene==="street"){
    c.fillStyle=grad(0,H*.75,"#d6d7da","#a5a6aa"); c.fillRect(0,0,W,H);
    [[20,90,110,"#7b7c80"],[140,60,80,"#8e8f93"],[300,80,90,"#6f7074"],[400,40,80,"#85868a"]].forEach(([x,y,w,col])=>{ c.fillStyle=col; c.fillRect(x,y,w,H*.78-y);
      c.fillStyle="rgba(255,255,255,.18)"; for(let yy=y+12; yy<H*.74; yy+=18) for(let xx=x+8; xx<x+w-10; xx+=16) c.fillRect(xx,yy,8,10); });
    c.fillStyle=grad(H*.78,H,"#4c4d51","#2a2a2d"); c.fillRect(0,H*.78,W,H*.22);
    c.fillStyle="rgba(255,255,255,.35)"; for(let x=0;x<W;x+=60) c.fillRect(x,H*.9,32,3);
    c.fillStyle="#18181a"; c.fillRect(236,62,11,H*.86-62); c.fillRect(226,56,40,10); c.beginPath(); c.ellipse(262,70,16,7,0,0,Math.PI*2); c.fill();
    c.fillStyle="#2a2a2d"; c.beginPath(); c.arc(330,196,9,0,Math.PI*2); c.fill(); c.fillRect(322,206,16,46); c.fillRect(323,250,6,26); c.fillRect(331,250,6,26);
  } else if(CAM.scene==="portrait"){
    c.fillStyle=grad(0,H,"#8f9094","#58595d"); c.fillRect(0,0,W,H);
    c.fillStyle="rgba(240,240,242,.75)"; c.fillRect(40,40,90,140); c.fillStyle="rgba(0,0,0,.25)"; c.fillRect(83,40,4,140); c.fillRect(40,108,90,4);
    c.fillStyle="#1f1f21"; c.beginPath(); c.ellipse(292,150,62,74,0,0,Math.PI*2); c.fill();
    c.beginPath(); c.ellipse(292,360,170,130,0,0,Math.PI*2); c.fill();
    c.fillStyle="rgba(255,255,255,.12)"; c.beginPath(); c.ellipse(262,130,18,34,-.3,0,Math.PI*2); c.fill();
  } else {
    c.fillStyle=grad(0,H*.6,"#e2e3e6","#b9babe"); c.fillRect(0,0,W,H);
    c.fillStyle="#9c9da1"; c.beginPath(); c.moveTo(0,H*.55); for(let x=0;x<=W;x+=20) c.lineTo(x,H*.55-28*Math.sin(x/70)-16*Math.sin(x/23)); c.lineTo(W,H); c.lineTo(0,H); c.fill();
    c.fillStyle="#6d6e72"; c.beginPath(); c.moveTo(0,H*.68); for(let x=0;x<=W;x+=20) c.lineTo(x,H*.66-14*Math.sin(x/50+2)); c.lineTo(W,H); c.lineTo(0,H); c.fill();
    c.fillStyle="#3a3b3e"; c.fillRect(0,H*.8,W,H*.2);
    c.fillStyle="#141416"; c.fillRect(236,96,9,H*.82-96); [[240,92,34],[214,110,24],[268,112,26],[240,70,22]].forEach(([x,y,r])=>{ c.beginPath(); c.arc(x,y,r,0,Math.PI*2); c.fill(); });
  }
}
const camFinder=$("camFinder").getContext("2d");
function camRenderFinder(){
  const c=camFinder, W=480, H=320, { err }=camFocus(), off=err*0.7*90;
  c.drawImage(camScene,0,0);
  const v=c.createRadialGradient(W/2,H/2,H*.35,W/2,H/2,H*.85); v.addColorStop(0,"rgba(0,0,0,0)"); v.addColorStop(1,"rgba(0,0,0,.45)"); c.fillStyle=v; c.fillRect(0,0,W,H);
  // bright frame lines for a 50 mm lens
  c.strokeStyle="rgba(255,255,255,.9)"; c.lineWidth=1.6; const fx=70, fy=48, fw=W-140, fh=H-96, k=16;
  c.beginPath(); [[fx,fy,1,1],[fx+fw,fy,-1,1],[fx,fy+fh,1,-1],[fx+fw,fy+fh,-1,-1]].forEach(([x,y,sx,sy])=>{ c.moveTo(x+sx*k,y); c.lineTo(x,y); c.lineTo(x,y+sy*k); }); c.stroke();
  // rangefinder patch with the ghost image
  const pw=96, ph=60, px=W/2-pw/2, py=H/2-ph/2-10;
  c.save(); c.beginPath(); c.rect(px,py,pw,ph); c.clip();
  c.globalAlpha=.6; c.globalCompositeOperation="screen"; c.drawImage(camScene,off,0);
  c.globalCompositeOperation="source-over"; c.globalAlpha=.08; c.fillStyle="#fff"; c.fillRect(px,py,pw,ph);
  c.restore(); c.strokeStyle="rgba(255,255,255,.25)"; c.lineWidth=1; c.strokeRect(px+.5,py+.5,pw-1,ph-1);
}
function camMeter(){
  const now=performance.now(), awake=now<CAM.wakeUntil, e=camExposure();
  $("camBar").classList.toggle("sleep", !awake);
  const u=e.under;
  $("camLedL").classList.toggle("on", awake && u>0.25);
  $("camLedR").classList.toggle("on", awake && u<-0.25);
  $("camLedC").classList.toggle("on", awake && Math.abs(u)<=0.75);
  $("camBarTxt").textContent = performance.now()<(CAM.msgUntil||0) ? CAM.msg : `${e.auto?"A ":""}${e.label==="1"?"1s":e.label} · f/${e.N}`;
  $("camCnt").textContent=`PAN 400 · ${CAM.frames}/36`;
  $("camCountSvg").textContent=CAM.frames;
  const f=camFocus();
  $("camRead").innerHTML = `<b>${e.auto?"A · ":""}${camFmtT(e.t)} · f/${e.N}</b> · focus ${camFmtD(camDist(CAM.n))} · ` +
    (awake ? (Math.abs(u)<=0.25?"exposure correct":`${Math.abs(u).toFixed(1)} stops ${u>0?"under":"over"}`) : "meter asleep, half-press to wake") +
    ` · ${Math.abs(f.err)<CAM_F[CAM.fi]*0.012?"in focus":"patch misaligned"}`;
}
function camWake(){ CAM.wakeUntil=performance.now()+6000; clearTimeout(CAM.wakeT); CAM.wakeT=setTimeout(camMeter,6050); camMeter(); }
function camUpdate(){ camRenderFinder(); camWake(); }

/* shutter speed dial: 14 positions, 24° apart, read at the red index */
(() => {
  const face=$("camDialFace"), svg=svgEl("svg",{ viewBox:"0 0 118 118", "aria-hidden":"true" }, face);
  CAM_SPEEDS.forEach((s,i)=>{ const t=svgEl("text",{ x:59, y:9, "text-anchor":"end", "dominant-baseline":"central", transform:`rotate(${i*24} 59 59) rotate(-90 59 9)` }, svg); t.textContent=s; if(s==="A") t.style.fill="var(--accent)"; });
  const sp=new Spring(-CAM.sp*24, SNAP, a=>{ face.style.transform=`rotate(${a.toFixed(2)}deg)`; $("camKnurl").setAttribute("patternTransform",`translate(${(a*.35).toFixed(2)} 0)`); }, .05);
  const dial=$("camDial");
  const set=i=>{ i=clamp(i,0,CAM_SPEEDS.length-1); if(i===CAM.sp) return; CAM.sp=i; sp.to(-i*24); tick();
    dial.setAttribute("aria-valuenow",i); dial.setAttribute("aria-valuetext", CAM_SPEEDS[i]==="A"?"automatic":CAM_SPEEDS[i]==="1"?"1 second":`1/${CAM_SPEEDS[i]} second`); camUpdate(); };
  dial.setAttribute("aria-valuenow",CAM.sp); dial.setAttribute("aria-valuetext","1/125 second");
  let last=null, acc=0;
  const ang=e=>{ const r=dial.getBoundingClientRect(); return Math.atan2(e.clientY-(r.top+r.height/2), e.clientX-(r.left+r.width/2))*180/Math.PI; };
  dial.addEventListener("pointerdown",e=>{ last=ang(e); acc=0; try{ dial.setPointerCapture(e.pointerId); }catch(_){} camWake(); });
  dial.addEventListener("pointermove",e=>{ if(last===null) return; const a=ang(e); let d=a-last; if(d>180) d-=360; if(d<-180) d+=360; last=a; acc+=d;
    while(Math.abs(acc)>=24){ const s=Math.sign(acc); acc-=s*24; set(CAM.sp-s); } });
  ["pointerup","pointercancel"].forEach(ev=>dial.addEventListener(ev,()=>last=null));
  dial.addEventListener("wheel",e=>{ e.preventDefault(); set(CAM.sp+(e.deltaY>0?1:-1)); },{ passive:false });
  dial.addEventListener("keydown",e=>{ const d={ArrowRight:1,ArrowUp:1,ArrowLeft:-1,ArrowDown:-1}[e.key]; if(d){ e.preventDefault(); set(CAM.sp+d); }
    else if(e.key==="Home"){ e.preventDefault(); set(0); } else if(e.key==="End"){ e.preventDefault(); set(CAM_SPEEDS.length-1); } });
})();

/* barrel rings: a printed scale slides under a fixed red index */
function makeRing(el, { len, value, labels, minor=[], step=null, onChange, fmt }){
  const pad=60, strip=el.querySelector(".ring-strip"), W=len+pad*2;
  const svg=svgEl("svg",{ width:W, height:42, viewBox:`0 0 ${W} 42` }, strip);
  minor.forEach(p=>svgEl("line",{ x1:pad+p*len, y1:2, x2:pad+p*len, y2:7, "stroke-width":1 }, svg));
  labels.forEach(([p,t])=>{ svgEl("line",{ x1:pad+p*len, y1:2, x2:pad+p*len, y2:11, "stroke-width":1.4 }, svg); svgEl("text",{ x:pad+p*len, y:30, "text-anchor":"middle" }, svg).textContent=t; });
  let v=value;
  const sp=new Spring(v, SNAP, x=>{ strip.style.transform=`translateX(${(el.clientWidth/2-pad-x*len).toFixed(2)}px)`; }, .0005);
  const q=x=>step ? Math.round(x/step)*step : x;
  const aria=()=>{ el.setAttribute("aria-valuenow",(+v.toFixed(3))); el.setAttribute("aria-valuetext",fmt(v)); };
  function set(x, mode){ const prev=v; v=clamp(mode==="raw"?x:q(x),0,1); mode==="raw" ? sp.set(v) : sp.to(v); aria(); if(q(v)!==q(prev)||!step) onChange(q(v)); }
  let drag=false, sx=0, sv=0;
  el.addEventListener("pointerdown",e=>{ drag=true; sx=e.clientX; sv=v; try{ el.setPointerCapture(e.pointerId); }catch(_){} camWake(); });
  el.addEventListener("pointermove",e=>{ if(drag) set(sv-(e.clientX-sx)/len,"raw"); });
  const end=()=>{ if(!drag) return; drag=false; set(v); };
  el.addEventListener("pointerup",end); el.addEventListener("pointercancel",end);
  el.addEventListener("keydown",e=>{ const s=step||.01, d={ArrowRight:s,ArrowUp:s,ArrowLeft:-s,ArrowDown:-s,PageUp:s*5,PageDown:-s*5}[e.key];
    if(d!==undefined){ e.preventDefault(); set(v+d); } else if(e.key==="Home"){ e.preventDefault(); set(0); } else if(e.key==="End"){ e.preventDefault(); set(1); } });
  new ResizeObserver(()=>sp.on(sp.x)).observe(el);
  aria();
  return { get:()=>v };
}
const camA=makeRing($("camARing"), { len:7*58, value:CAM.fi/7, step:1/7, labels:CAM_F.map((f,i)=>[i/7, String(f)]),
  fmt:v=>`f/${CAM_F[Math.round(v*7)]}`, onChange:v=>{ const i=Math.round(v*7); if(i!==CAM.fi){ CAM.fi=i; tick(); } $("camFLbl").textContent=`f/${CAM_F[CAM.fi]}`; camUpdate(); } });
const CAM_DISTS=[0.7,0.8,1,1.2,1.5,2,3,5,10,Infinity];
const camF=makeRing($("camFRing"), { len:620, value:CAM.n, labels:CAM_DISTS.map(d=>[camN(d), d===Infinity?"∞":String(d)]),
  minor:[0.75,0.9,1.1,1.3,1.75,2.5,4,7,15,30].map(camN),
  fmt:v=>camFmtD(camDist(v)), onChange:v=>{ CAM.n=v; $("camDLbl").textContent=camFmtD(camDist(v));
    $("camFocusRing").setAttribute("transform",`rotate(${(v*140-70).toFixed(2)} 280 215)`); camUpdate(); } });
$("camFocusRing").setAttribute("transform",`rotate(${(CAM.n*140-70).toFixed(2)} 280 215)`);

/* release: half-press wakes the meter, letting go fires the shutter */
function camSay(m){ CAM.msg=m; CAM.msgUntil=performance.now()+1800; camMeter(); setTimeout(camMeter,1850); }
function camFire(){
  if(CAM.frames>=36){ camSay("REWIND FILM"); click(520,.18,3); return; }
  const e=camExposure(), f=camFocus(), shake = e.t>1/60 ? Math.log2(e.t*60)*1.5+1 : 0;
  click(2600,.22,1.4); setTimeout(()=>click(1900,.16,1.4), Math.min(e.t,1)*1000+(e.t<1/60?18:0));
  CAM.frames++;
  const cv=document.createElement("canvas"); cv.width=336; cv.height=224; const c=cv.getContext("2d");
  const bright=Math.pow(2,-e.under);
  const passes = shake ? 5 : 1;
  for(let p=0;p<passes;p++){
    c.save(); c.globalAlpha = shake ? .28 : 1;
    c.filter=`grayscale(1) brightness(${bright.toFixed(3)}) blur(${f.blur.toFixed(1)}px)`;
    const dx = shake ? (p-2)*shake*.9 : 0, dy = shake ? (p-2)*shake*.35 : 0;
    c.drawImage(camScene, 70+dx, 48+dy, 340, 224, 0, 0, 336, 224); c.restore();
  }
  c.filter="none";
  const img=c.getImageData(0,0,336,224), d=img.data; for(let i=0;i<d.length;i+=4){ const n=(Math.random()-.5)*18; d[i]=d[i+1]=d[i+2]=clamp(d[i]+n,0,255); } c.putImageData(img,0,0);
  const issues=[];
  if(f.blur>1.5) issues.push("out of focus");
  if(Math.abs(e.under)>0.7) issues.push(`${Math.abs(e.under).toFixed(1)} stops ${e.under>0?"under":"over"}`);
  if(shake) issues.push(`camera shake at ${camFmtT(e.t)}`);
  const shot=document.createElement("div"); shot.className="shot";
  shot.innerHTML=`<span class="shot-n"><span>${CAM.frames}A</span><span>${camFmtT(e.t)} · f/${e.N}</span></span>`;
  shot.prepend(cv);
  const v=document.createElement("span"); v.className="shot-v"+(issues.length?" bad":""); v.textContent=issues.length?issues.join(" · "):"sharp · well exposed"; shot.appendChild(v);
  cv.setAttribute("role","img"); cv.setAttribute("aria-label",`Frame ${CAM.frames}: ${v.textContent}`);
  $("camFilm").prepend(shot); while($("camFilm").children.length>12) $("camFilm").lastChild.remove();
  camWake();
}
(() => {
  const r=$("camRel"); let held=false;
  const half=()=>{ if(held) return; held=true; r.dataset.stage="half"; camWake(); tick(); };
  const full=()=>{ if(!held) return; held=false; r.dataset.stage="full"; camFire(); setTimeout(()=>r.dataset.stage="none",140); };
  r.addEventListener("pointerdown",e=>{ try{ r.setPointerCapture(e.pointerId); }catch(_){} half(); });
  r.addEventListener("pointerup",full);
  r.addEventListener("pointercancel",()=>{ held=false; r.dataset.stage="none"; });
  r.addEventListener("keydown",e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); if(!e.repeat) half(); } });
  r.addEventListener("keyup",e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); full(); } });
  r.addEventListener("click",e=>e.preventDefault());
})();
$("camRewind").onclick=()=>{ if(!CAM.frames){ camSay("ROLL IS EMPTY"); return; }
  for(let i=0;i<8;i++) setTimeout(()=>click(3400,.05,2), i*55);
  CAM.roll++; CAM.frames=0; $("camFilm").innerHTML=""; camSay(`ROLL ${CAM.roll} LOADED`); };
$$("[data-scene]").forEach(b=>b.onclick=()=>{ CAM.scene=b.dataset.scene; $$("[data-scene]").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); camDrawScene(); camUpdate(); tick(); });
$("camFLbl").textContent=`f/${CAM_F[CAM.fi]}`; $("camDLbl").textContent=camFmtD(camDist(CAM.n));
camDrawScene(); camRenderFinder(); camMeter();
bindFinish("camFinish","cam");

/* ═════════ Enochian Compass compass ═════════ */
const angDiff=(a,b)=>((a-b+540)%360+360)%360-180;
const CMP={ heading:62, bearing:60, needle:-62, vel:0, open:true, wander:false, wanderT:0, readAt:0, wasOn:false };
const WIND=["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
const deg3=d=>String(Math.round((d%360+360)%360)%360).padStart(3,"0")+"°";
(() => { // printed rose: 5° ticks, numbers every 30°, cardinals with signal dots, orienting arrow and lines
  const g=$("cmpRoseMarks"), C=130, pt=(r,a)=>[C+r*Math.sin(a*Math.PI/180), C-r*Math.cos(a*Math.PI/180)];
  for(let a=0;a<360;a+=5){ const major=a%30===0; const [x1,y1]=pt(112,a), [x2,y2]=pt(major?101:106,a); svgEl("line",{ x1,y1,x2,y2, class:"c-tick", "stroke-width":major?1.6:1 }, g); }
  const CARD={ 0:"N", 90:"E", 180:"S", 270:"W" };
  for(let a=0;a<360;a+=30){
    const [x,y]=pt(CARD[a]?88:91,a);
    const t=svgEl("text",{ x, y, "text-anchor":"middle", "dominant-baseline":"central", class:CARD[a]?"c-card":"c-num", transform:`rotate(${a} ${x} ${y})` }, g);
    t.textContent=CARD[a]||a;
    if(CARD[a]){ const [dx,dy]=pt(96,a-11); svgEl("circle",{ cx:dx, cy:dy, r:2.4, style:"fill:var(--accent)" }, g); }
  }
  [[-1],[1]].forEach(([s])=>svgEl("line",{ x1:C+s*20, y1:C-70, x2:C+s*20, y2:C+70, class:"c-sub", "stroke-width":.8, opacity:.6 }, g));
  [45,135].forEach(a=>{ const [x1,y1]=pt(78,a), [x2,y2]=pt(78,a+180); svgEl("line",{ x1,y1,x2,y2, class:"c-sub", "stroke-width":.7, opacity:.45 }, g); });
  svgEl("path",{ id:"cmpArrow", d:`M${C} ${C-76} L${C+12} ${C-54} H${C+6} V${C-20} H${C-6} V${C-54} H${C-12} Z`, fill:"none", style:"stroke:var(--accent)", "stroke-width":1.6, "stroke-linejoin":"round" }, g);
})();
function cmpRender(){
  $("cmpRose").setAttribute("transform",`rotate(${(-CMP.bearing).toFixed(2)} 130 130)`);
  $("cmpNeedle").setAttribute("transform",`rotate(${CMP.needle.toFixed(2)} 130 130)`);
  const off=angDiff(CMP.bearing,CMP.heading), on=Math.abs(off)<=3;
  $("cmpArrow").style.fill = on ? "color-mix(in srgb, var(--accent) 35%, transparent)" : "none";
  $("cmpLubber").style.fill = on ? "var(--accent)" : "";
  if(on && !CMP.wasOn) thock(); CMP.wasOn=on;
  const now=performance.now();
  if(now-CMP.readAt>80){ CMP.readAt=now;
    $("cmpRead").innerHTML = !CMP.open ? `<b>lid closed</b> · bearing ${deg3(CMP.bearing)} kept` :
      `<b>${deg3(CMP.heading)} ${WIND[Math.round(((CMP.heading%360)+360)%360/22.5)%16]}</b> · bearing ${deg3(CMP.bearing)} · ${on?"on course":`turn ${off>0?"right":"left"} ${Math.abs(Math.round(off))}°`}`;
    const c=$("cmpCtl"); c.setAttribute("aria-valuenow", Math.round(((CMP.heading%360)+360)%360)); }
}
function cmpTick(dt, now){
  if(CMP.wander){ CMP.wanderT+=dt; CMP.heading += (Math.sin(CMP.wanderT*.7)*28 + Math.sin(CMP.wanderT*1.9)*9)*dt; }
  const err=angDiff(-CMP.heading, CMP.needle);
  if(reduce){ CMP.needle+=err; CMP.vel=0; }
  else { let h=dt; while(h>0){ const s=Math.min(1/240,h); CMP.vel += (40*angDiff(-CMP.heading,CMP.needle) - 3.2*CMP.vel)*s; CMP.needle += CMP.vel*s; h-=s; } }
  cmpRender();
  return CMP.wander || Math.abs(err)>.05 || Math.abs(CMP.vel)>.05;
}
(() => {
  const ctl=$("cmpCtl"); let mode=null, last=0, acc=0;
  const local=e=>{ const r=ctl.getBoundingClientRect(), x=e.clientX-(r.left+r.width/2), y=e.clientY-(r.top+r.height/2); return { a:Math.atan2(y,x)*180/Math.PI, r:Math.hypot(x,y)/(r.width/2) }; };
  const turnBezel=d=>{ const n=(Math.round((CMP.bearing+d)/5)*5+360)%360; if(n!==CMP.bearing){ CMP.bearing=n; tick(); cmpRender(); } };
  ctl.addEventListener("pointerdown", e=>{ const p=local(e); mode = p.r>0.84 ? "bezel" : "turn"; last=p.a; acc=0; try{ ctl.setPointerCapture(e.pointerId); }catch(_){} CMP.wander=false; $("cmpWander").setAttribute("aria-pressed","false"); });
  ctl.addEventListener("pointermove", e=>{ if(!mode) return; const p=local(e); let d=p.a-last; if(d>180) d-=360; if(d<-180) d+=360; last=p.a;
    if(mode==="turn"){ CMP.heading=(CMP.heading+d+360)%360; addLoop(cmpTick); }
    else { acc-=d; while(Math.abs(acc)>=5){ const s=Math.sign(acc); acc-=s*5; turnBezel(s*5); } } });
  ["pointerup","pointercancel"].forEach(ev=>ctl.addEventListener(ev, ()=>mode=null));
  ctl.addEventListener("keydown", e=>{
    const k=e.key;
    if(k==="ArrowRight"||k==="ArrowLeft"){ e.preventDefault(); CMP.heading=(CMP.heading+(k==="ArrowRight"?5:-5)+360)%360; tick(); addLoop(cmpTick); }
    else if(k==="]"||k==="["){ e.preventDefault(); turnBezel(k==="]"?5:-5); }
    else if(k==="s"||k==="S"){ e.preventDefault(); $("cmpSet").click(); }
  });
  ctl.setAttribute("aria-valuemin",0); ctl.setAttribute("aria-valuemax",359);
})();
$("cmpSet").onclick=()=>{ CMP.bearing=(Math.round(CMP.heading/5)*5+360)%360; clack(); cmpRender(); };
$("cmpWander").onclick=()=>{ CMP.wander=!CMP.wander; $("cmpWander").setAttribute("aria-pressed",String(CMP.wander)); tick(); addLoop(cmpTick); };
const lidSp=new Spring(0, HEAVY, a=>$("cmpLid").style.transform=`rotateX(${a.toFixed(2)}deg)`, .05);
$("cmpLatch").onclick=()=>{ CMP.open=!CMP.open; lidSp.to(CMP.open?0:-180); thock();
  const b=$("cmpLatch"); b.textContent=CMP.open?"CLOSE":"OPEN"; b.setAttribute("aria-label",CMP.open?"Close the lid":"Open the lid"); b.setAttribute("aria-pressed",String(!CMP.open));
  $("cmpCtl").inert=!CMP.open; CMP.readAt=0; cmpRender(); };
bindFinish("cmpFinish","cmpx");
cmpRender(); addLoop(cmpTick);

/* ═════════ Enochian Thermostat thermostat ═════════ */
const TH={ mode:"heat", fan:"auto", eco:false, sched:true, target:21.5, cur:19.4, rh:42, out:7, unit:"C", hvac:"idle", readAt:0 };
const TH_MODES=["off","heat","cool","auto"], TH_MIN=10, TH_MAX=32;
const thTemps=[]; for(let t=TH_MIN;t<=TH_MAX+1e-9;t+=.5) thTemps.push(+t.toFixed(1));
const thAng=t=>-135+(t-TH_MIN)/(TH_MAX-TH_MIN)*270;
const thFmt=c=>TH.unit==="C" ? c.toFixed(1) : String(Math.round(c*9/5+32));
const thSvg=$("thSvg"), thTicks=[];
(() => {
  const C=120, pt=(r,a)=>[C+r*Math.sin(a*Math.PI/180), C-r*Math.cos(a*Math.PI/180)];
  thTemps.forEach(t=>{ const a=thAng(t), major=Math.abs(t%2)<1e-6, [x1,y1]=pt(112,a), [x2,y2]=pt(major?97:101,a);
    thTicks.push(svgEl("line",{ x1,y1,x2,y2, class:"t-tick", "stroke-width":major?2.2:1.6, "stroke-linecap":"round" }, thSvg)); });
  TH.markT=svgEl("line",{ x1:C, y1:C-114, x2:C, y2:C-88, stroke:"#f7f7f8", "stroke-width":3.4, "stroke-linecap":"round" }, thSvg);
  TH.markC=svgEl("circle",{ cx:C, cy:C-82, r:3, fill:"#9a9aa0" }, thSvg);
  TH.tMode=svgEl("text",{ x:C, y:74, "text-anchor":"middle", class:"t-lbl" }, thSvg);
  TH.tBig=svgEl("text",{ x:C-6, y:136, "text-anchor":"middle", class:"t-big" }, thSvg);
  TH.tUnit=svgEl("text",{ x:C+48, y:110, "text-anchor":"start", class:"t-unit" }, thSvg);
  TH.tIn=svgEl("text",{ x:C, y:158, "text-anchor":"middle", class:"t-small" }, thSvg);
  TH.tOut=svgEl("text",{ x:C, y:176, "text-anchor":"middle", class:"t-lbl" }, thSvg);
  TH.tNext=svgEl("text",{ x:C, y:206, "text-anchor":"middle", class:"t-lbl" }, thSvg);
})();
const effTarget=()=>TH.eco ? (TH.mode==="cool" ? TH.target+2 : TH.target-2) : TH.target;
function thRender(){
  const tgt=effTarget(), lo=Math.min(TH.cur,tgt), hi=Math.max(TH.cur,tgt);
  const col = TH.hvac==="heating" ? "var(--heat)" : TH.hvac==="cooling" ? "var(--cool)" : null;
  thTicks.forEach((ln,i)=>{ const t=thTemps[i]; ln.style.stroke = col && t>=lo-.01 && t<=hi+.01 ? col : ""; });
  TH.markT.setAttribute("transform",`rotate(${thAng(TH.target).toFixed(2)} 120 120)`);
  TH.markC.setAttribute("transform",`rotate(${thAng(clamp(TH.cur,TH_MIN,TH_MAX)).toFixed(2)} 120 120)`);
  TH.tMode.textContent = TH.mode==="off" ? "SYSTEM OFF" : TH.hvac==="heating" ? "HEATING TO" : TH.hvac==="cooling" ? "COOLING TO" : TH.mode==="auto" ? "AUTO · HOLDING" : `${TH.mode.toUpperCase()} · HOLDING`;
  TH.tBig.textContent = TH.mode==="off" ? "––" : thFmt(TH.target);
  TH.tBig.style.fill = TH.mode==="off" ? "#5a5a60" : "";
  TH.tUnit.textContent = "°"+TH.unit;
  const eta = TH.hvac==="idle"||TH.mode==="off" ? "" : ` · ${Math.max(1,Math.round(Math.abs(tgt-TH.cur)/(TH.hvac==="heating"?.12:.1)))} MIN`;
  TH.tIn.textContent = `INSIDE ${thFmt(TH.cur)}°${eta}`;
  TH.tOut.textContent = `RH ${TH.rh}% · OUT ${thFmt(TH.out)}°${TH.eco?" · ECO ±2°":""}`;
  TH.tNext.textContent = TH.sched ? `NEXT ${thFmt(18)}° AT 22:00` : "SCHEDULE PAUSED";
  const L=(id,cls)=>{ const i=$(id).querySelector("i"); i.className=cls||""; };
  L("thMode", TH.mode==="off"?"":TH.mode==="cool"?"cool":"on"); L("thFan", TH.fan==="on"||TH.hvac!=="idle"?"on":""); L("thEco", TH.eco?"on":""); L("thSched", TH.sched?"on":"");
  $("thMode").setAttribute("aria-label",`Mode: ${TH.mode}`); $("thFan").setAttribute("aria-label",`Fan: ${TH.fan}`);
  $("thEco").setAttribute("aria-pressed",String(TH.eco)); $("thSched").setAttribute("aria-pressed",String(TH.sched));
  const s=$("thScreen"); s.setAttribute("aria-valuenow",TH.target); s.setAttribute("aria-valuetext",`${thFmt(TH.target)} degrees ${TH.unit==="C"?"Celsius":"Fahrenheit"}, ${TH.mode}`);
  $("thRead").innerHTML = TH.mode==="off" ? `<b>off</b> · inside ${thFmt(TH.cur)}°` : `<b>${TH.hvac==="idle"?"holding":TH.hvac}</b> ${TH.hvac==="idle"?"at":"to"} ${thFmt(tgt)}° · inside ${thFmt(TH.cur)}° · fan ${TH.fan}`;
}
function thTick(dt, now){
  const sim=dt; // one simulated minute per real second
  const tgt=effTarget();
  if(TH.mode==="off") TH.hvac="idle";
  else if(TH.mode==="heat") TH.hvac = TH.cur<tgt-.3 ? "heating" : TH.cur>=tgt ? "idle" : TH.hvac==="cooling"?"idle":TH.hvac;
  else if(TH.mode==="cool") TH.hvac = TH.cur>tgt+.3 ? "cooling" : TH.cur<=tgt ? "idle" : TH.hvac==="heating"?"idle":TH.hvac;
  else TH.hvac = TH.cur<tgt-.5 ? "heating" : TH.cur>tgt+.5 ? "cooling" : (Math.abs(TH.cur-tgt)<.05 ? "idle" : TH.hvac);
  const rate = TH.hvac==="heating" ? .12 : TH.hvac==="cooling" ? -.1 : (17-TH.cur)*.004;
  TH.cur=clamp(TH.cur+rate*sim, 5, 35);
  if(now-TH.readAt>200){ TH.readAt=now; thRender(); }
  return visible.get($("th"));
}
watch($("th"), ()=>addLoop(thTick));
(() => {
  const s=$("thScreen"); let drag=false;
  const set=t=>{ const n=clamp(Math.round(t*2)/2,TH_MIN,TH_MAX); if(n!==TH.target){ TH.target=n; tick(); thRender(); addLoop(thTick); } };
  const fromE=e=>{ const r=s.getBoundingClientRect(); let a=Math.atan2(e.clientX-(r.left+r.width/2), -(e.clientY-(r.top+r.height/2)))*180/Math.PI; a=clamp(a,-135,135); return TH_MIN+(a+135)/270*(TH_MAX-TH_MIN); };
  s.addEventListener("pointerdown", e=>{ drag=true; try{ s.setPointerCapture(e.pointerId); }catch(_){} if(TH.mode==="off"){ TH.mode="heat"; } set(fromE(e)); });
  s.addEventListener("pointermove", e=>{ if(drag) set(fromE(e)); });
  ["pointerup","pointercancel"].forEach(ev=>s.addEventListener(ev, ()=>drag=false));
  s.addEventListener("wheel", e=>{ e.preventDefault(); set(TH.target+(e.deltaY<0?.5:-.5)); }, { passive:false });
  s.addEventListener("keydown", e=>{ const d={ArrowUp:.5,ArrowRight:.5,ArrowDown:-.5,ArrowLeft:-.5,PageUp:2,PageDown:-2}[e.key]; if(d!==undefined){ e.preventDefault(); set(TH.target+d); } });
})();
$("thMode").onclick=()=>{ TH.mode=TH_MODES[(TH_MODES.indexOf(TH.mode)+1)%4]; if(TH.mode==="off") TH.hvac="idle"; thock(); thRender(); addLoop(thTick); };
$("thFan").onclick=()=>{ TH.fan=TH.fan==="auto"?"on":"auto"; tick(); thRender(); };
$("thEco").onclick=()=>{ TH.eco=!TH.eco; tick(); thRender(); addLoop(thTick); };
$("thSched").onclick=()=>{ TH.sched=!TH.sched; tick(); thRender(); };
$$("[data-unit]").forEach(b=>b.onclick=()=>{ TH.unit=b.dataset.unit; $$("[data-unit]").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); tick(); thRender(); });
bindFinish("thFinish","th");
thRender();

/* ═════════ Enochian Speedometer speedometer ═════════ */
const VL={ v:0, unit:"mph", gas:false, brake:false, cruise:false, cruiseAt:0, limit:false, limitAt:0, trip:0, odo:4213.0, readAt:0, drawnUnit:null };
const VL_C=120, vlPt=(r,a)=>[VL_C+r*Math.sin(a*Math.PI/180), VL_C-r*Math.cos(a*Math.PI/180)];
const vlMax=()=>VL.unit==="mph"?160:260, vlConv=mph=>VL.unit==="mph"?mph:mph*1.609344;
const vlAng=x=>-120+clamp(x/vlMax(),0,1.02)*240;
let vlTicks=[];
function vlBuild(){
  const svg=$("vlSvg"); svg.innerHTML=""; vlTicks=[];
  const max=vlMax(), minor=VL.unit==="mph"?5:10;
  for(let x=0;x<=max;x+=minor){ const a=vlAng(x), maj=x%20===0, [x1,y1]=vlPt(112,a), [x2,y2]=vlPt(maj?98:104,a);
    const l=svgEl("line",{ x1,y1,x2,y2, class:"g-tick"+(maj?" maj":""), "stroke-width":maj?2.2:1.4, "stroke-linecap":"round" }, svg); l.dataset.x=x; vlTicks.push(l);
    if(maj){ const [tx,ty]=vlPt(84,a); svgEl("text",{ x:tx, y:ty, "text-anchor":"middle", "dominant-baseline":"central", class:"g-num" }, svg).textContent=x; } }
  VL.tUnit=svgEl("text",{ x:VL_C, y:198, "text-anchor":"middle", class:"g-lbl" }, svg);
  VL.tBig=svgEl("text",{ x:VL_C, y:184, style:"font-size:36px", "text-anchor":"middle", class:"g-big" }, svg);
  VL.tTrip=svgEl("text",{ x:VL_C, y:214, "text-anchor":"middle", class:"g-small" }, svg);
  VL.tMode=svgEl("text",{ x:VL_C, y:228, "text-anchor":"middle", class:"g-lbl" }, svg);
  VL.needle=svgEl("g",{}, svg);
  svgEl("line",{ x1:VL_C, y1:VL_C+16, x2:VL_C, y2:VL_C-100, style:"stroke:var(--accent)", "stroke-width":3, "stroke-linecap":"round" }, VL.needle);
  svgEl("circle",{ cx:VL_C, cy:VL_C, r:7, fill:"#1c1c1f", stroke:"#5a5a60", "stroke-width":1.5 }, svg);
  VL.drawnUnit=VL.unit; vlRender(true);
}
function vlRender(force){
  const s=vlConv(VL.v), max=vlMax();
  VL.needle.setAttribute("transform",`rotate(${vlAng(s).toFixed(2)} ${VL_C} ${VL_C})`);
  const now=performance.now(); if(!force && now-VL.readAt<70) return; VL.readAt=now;
  const lim=VL.limit?vlConv(VL.limitAt):Infinity;
  vlTicks.forEach(t=>{ const x=+t.dataset.x; t.style.stroke = x>=max*.85 || x>lim+.01 ? "var(--accent)" : ""; });
  VL.tBig.textContent=Math.round(s); VL.tUnit.textContent=VL.unit==="mph"?"MPH":"KM/H";
  const d=VL.unit==="mph"?1:1.609344, u=VL.unit==="mph"?"MI":"KM";
  VL.tTrip.textContent=`TRIP ${(VL.trip*d).toFixed(1)} ${u} · ODO ${String(Math.floor(VL.odo*d)).padStart(6,"0")}`;
  VL.tMode.textContent = VL.cruise ? `CRUISE ${Math.round(vlConv(VL.cruiseAt))}` : VL.limit ? `LIMIT ${Math.round(vlConv(VL.limitAt))}` : VL.gas ? "THROTTLE" : VL.brake ? "BRAKING" : "";
  $("vlScreen").setAttribute("aria-valuenow",Math.round(s)); $("vlScreen").setAttribute("aria-valuemax",max); $("vlScreen").setAttribute("aria-valuetext",`${Math.round(s)} ${VL.unit==="mph"?"miles":"kilometres"} per hour`);
  $("vlRead").innerHTML=`<b>${Math.round(s)} ${VL.unit==="mph"?"mph":"km/h"}</b> · trip ${(VL.trip*d).toFixed(1)} ${u.toLowerCase()}${VL.cruise?" · cruise on":""}${VL.limit?` · limit ${Math.round(vlConv(VL.limitAt))}`:""}`;
}
function vlTick(dt){
  const v=VL.v;
  if(VL.brake && VL.cruise){ VL.cruise=false; vlLamps(); }
  if(VL.cruise && !VL.gas) VL.v += clamp((VL.cruiseAt-v)*.8,-4,6)*dt;
  else { const thrust=VL.gas?9.5*Math.max(0,1-v/175):0, brake=VL.brake?24:0, drag=v>0?.5+v*.011:0; VL.v=Math.max(0, v+(thrust-brake-drag)*dt); }
  if(VL.limit && VL.v>VL.limitAt) VL.v=VL.limitAt;
  VL.trip+=VL.v/3600*dt*60; VL.odo+=VL.v/3600*dt*60;   // distance runs at 60× so trips add up
  vlRender();
  return VL.gas || VL.brake || VL.v>0.01;
}
function vlLamps(){
  const L=(id,on)=>$(id).querySelector("i").classList.toggle("on",on);
  L("vlCruise",VL.cruise); L("vlLimit",VL.limit); L("vlUnit",true);
  $("vlCruise").setAttribute("aria-pressed",String(VL.cruise)); $("vlLimit").setAttribute("aria-pressed",String(VL.limit));
  $("vlUnit").innerHTML=`<i class="on"></i>${VL.unit==="mph"?"MPH":"KM/H"}`; $("vlUnit").setAttribute("aria-label",`Units: ${VL.unit}. Switch to ${VL.unit==="mph"?"km/h":"mph"}`);
  vlRender(true);
}
function vlPedal(btn, key){
  const down=v=>{ if(VL[key]===v) return; VL[key]=v; btn.dataset.down=String(v); if(v){ tick(); addLoop(vlTick); } vlRender(true); };
  btn.addEventListener("pointerdown", e=>{ try{ btn.setPointerCapture(e.pointerId); }catch(_){} down(true); });
  ["pointerup","pointercancel","lostpointercapture"].forEach(ev=>btn.addEventListener(ev, ()=>down(false)));
  btn.addEventListener("keydown", e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); down(true); } });
  btn.addEventListener("keyup", e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); down(false); } });
  return down;
}
const vlGas=vlPedal($("vlGas"),"gas"), vlBrk=vlPedal($("vlBrake"),"brake");
$("vlScreen").addEventListener("keydown", e=>{ if(e.key==="ArrowUp"){ e.preventDefault(); vlGas(true); } else if(e.key==="ArrowDown"){ e.preventDefault(); vlBrk(true); } });
$("vlScreen").addEventListener("keyup", e=>{ if(e.key==="ArrowUp") vlGas(false); else if(e.key==="ArrowDown") vlBrk(false); });
$("vlScreen").addEventListener("blur", ()=>{ vlGas(false); vlBrk(false); });
$("vlUnit").onclick=()=>{ VL.unit=VL.unit==="mph"?"kph":"mph"; clack(); vlBuild(); vlLamps(); };
$("vlTrip").onclick=()=>{ VL.trip=0; tick(); const i=$("vlTrip").querySelector("i"); i.classList.add("on"); setTimeout(()=>i.classList.remove("on"),300); vlRender(true); };
$("vlCruise").onclick=()=>{ if(!VL.cruise && VL.v<15){ click(520,.15,3); VL.tMode.textContent="CRUISE NEEDS 15+"; return; } VL.cruise=!VL.cruise; VL.cruiseAt=VL.v; thock(); vlLamps(); addLoop(vlTick); };
$("vlLimit").onclick=()=>{ VL.limit=!VL.limit; VL.limitAt=Math.max(20,Math.round(VL.v/5)*5); thock(); vlLamps(); };
bindFinish("vlFinish","vl");
vlBuild(); vlLamps();

/* ═════════ Enochian System Monitor system monitor ═════════ */
const TR_CORES=Math.min(16, navigator.hardwareConcurrency||8), TR_RAM=navigator.deviceMemory ? Math.max(4,navigator.deviceMemory) : 16;
const TR={ sel:"cpu", stress:0, cpu:.24, gpu:.12, ram:.58, tc:46, tg:44, t:0, cores:Array(TR_CORES).fill(.2), readAt:0 };
const TR_R={ cpu:98, gpu:82, ram:66 }, trArcs={};
(() => {
  const svg=$("trSvg");
  Object.entries(TR_R).forEach(([k,r])=>{
    const C=2*Math.PI*r;
    svgEl("circle",{ cx:120, cy:120, r, fill:"none", stroke:"#26262a", "stroke-width":9, "stroke-linecap":"round", "stroke-dasharray":`${C*.75} ${C}`, transform:"rotate(135 120 120)" }, svg);
    trArcs[k]=svgEl("circle",{ cx:120, cy:120, r, fill:"none", stroke:"#f2f2f4", "stroke-width":9, "stroke-linecap":"round", "stroke-dasharray":`0 ${C}`, transform:"rotate(135 120 120)", style:"transition:stroke-dasharray .45s ease,stroke .3s" }, svg);
    trArcs[k].C=C;
    svgEl("text",{ x:120, y:120+r+3, "text-anchor":"middle", class:"g-lbl" }, svg).textContent=k.toUpperCase();
  });
  TR.tLbl=svgEl("text",{ x:120, y:92, "text-anchor":"middle", class:"g-lbl" }, svg);
  TR.tBig=svgEl("text",{ x:120, y:134, "text-anchor":"middle", class:"g-big", style:"font-size:38px" }, svg);
  TR.tD1=svgEl("text",{ x:120, y:152, "text-anchor":"middle", class:"g-small", style:"font-size:8.5px" }, svg);
  TR.tD2=svgEl("text",{ x:120, y:164, "text-anchor":"middle", class:"g-lbl", style:"font-size:7px" }, svg);
  for(let i=0;i<TR_CORES;i++) $("trCores").appendChild(document.createElement("i"));
  $("trCores").setAttribute("aria-label",`${TR_CORES} cores`);
  $("trTag").textContent = `demo data · ${TR_CORES} cores${navigator.deviceMemory?` and ~${TR_RAM} GB memory`:""} read from this device`;
})();
function trRender(){
  Object.keys(TR_R).forEach(k=>{ const a=trArcs[k], v=TR[k]; a.setAttribute("stroke-dasharray",`${(a.C*.75*v).toFixed(1)} ${a.C}`); a.style.stroke = v>.85 ? "var(--accent)" : "#f2f2f4"; });
  const k=TR.sel, pct=Math.round(TR[k]*100);
  TR.tLbl.textContent = {cpu:"PROCESSOR",gpu:"GRAPHICS",ram:"MEMORY"}[k] + (TR.stress?" · STRESS":"");
  TR.tBig.textContent=pct+"%"; TR.tBig.style.fill = TR[k]>.85 ? "var(--accent)" : "";
  if(k==="cpu"){ TR.tD1.textContent=`${(2.2+TR.cpu*2.6).toFixed(1)} GHZ · ${TR_CORES} CORES`; TR.tD2.textContent=`${Math.round(TR.tc)}°C PACKAGE`; }
  if(k==="gpu"){ TR.tD1.textContent=`${(.6+TR.gpu*1.4).toFixed(2)} GHZ · VRAM ${(1+TR.gpu*6).toFixed(1)}/8 GB`; TR.tD2.textContent=`${Math.round(TR.tg)}°C CORE`; }
  if(k==="ram"){ TR.tD1.textContent=`${(TR.ram*TR_RAM).toFixed(1)} / ${TR_RAM} GB IN USE`; TR.tD2.textContent=`SWAP ${(Math.max(0,TR.ram-.78)*8).toFixed(1)} GB`; }
  $$("#trCores i").forEach((b,i)=>{ b.style.setProperty("--v",(TR.cores[i]*100).toFixed(0)+"%"); b.classList.toggle("hot",TR.cores[i]>.85); });
  $("trRead").innerHTML=["cpu","gpu","ram"].map(m=>m===TR.sel?`<b>${m.toUpperCase()} ${Math.round(TR[m]*100)}%</b>`:`${m.toUpperCase()} ${Math.round(TR[m]*100)}%`).join(" · ");
}
function trTick(dt, now){
  TR.t+=dt;
  if(TR.stress && now>TR.stress){ TR.stress=0; $("trLoad").setAttribute("aria-pressed","false"); $("trLoad").querySelector("i").classList.remove("on"); }
  if(now-TR.readAt>450){
    TR.readAt=now; const s=!!TR.stress, w=(x,lo,hi)=>clamp(x+(Math.random()-.5)*.12,lo,hi);
    const tc=s?.95:.2+.12*Math.sin(TR.t/7)+.06*Math.sin(TR.t*1.3), tg=s?.97:.1+.1*Math.sin(TR.t/11+1), tm=s?.84:.56+.04*Math.sin(TR.t/19);
    TR.cpu=clamp(TR.cpu+(tc-TR.cpu)*.35+(Math.random()-.5)*.08,.02,1); TR.gpu=clamp(TR.gpu+(tg-TR.gpu)*.3+(Math.random()-.5)*.06,.01,1); TR.ram=clamp(TR.ram+(tm-TR.ram)*.12+(Math.random()-.5)*.01,.2,.98);
    TR.cores=TR.cores.map((c,i)=>w(c+(TR.cpu-c)*.5+(i%3===0?.08:0),0,1));
    TR.tc+=(35+TR.cpu*55-TR.tc)*(1-Math.exp(-.45/6)); TR.tg+=(33+TR.gpu*50-TR.tg)*(1-Math.exp(-.45/6));
    trRender();
  }
  return visible.get($("tr"));
}
watch($("tr"), ()=>addLoop(trTick));
$$("#tr [data-metric]").forEach(b=>b.onclick=()=>{ TR.sel=b.dataset.metric; $$("#tr [data-metric]").forEach(x=>{ x.setAttribute("aria-pressed",String(x===b)); x.querySelector("i").classList.toggle("on",x===b); }); tick(); trRender(); });
$("trLoad").onclick=()=>{ const on=!TR.stress; TR.stress=on?performance.now()+20000:0; $("trLoad").setAttribute("aria-pressed",String(on)); $("trLoad").querySelector("i").classList.toggle("on",on); thock(); addLoop(trTick); };
bindFinish("trFinish","tr");
trRender();

/* ═════════ split-flap engine ═════════ */
const DRUM=" ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-.#/";
const flapBusy=new Set(); let flapSoundAt=0;
function makeFlap(parent, len){
  const cells=[];
  for(let i=0;i<len;i++){ const el=document.createElement("span"); el.className="fc"; const t=document.createTextNode(" "); el.appendChild(t); const fl=document.createElement("i"); el.appendChild(fl); parent.appendChild(el); cells.push({ el, t, fl, at:0, target:0, next:0 }); }
  return { len, set(str, cls){
    str=String(str??"").toUpperCase().padEnd(len).slice(0,len);
    cells.forEach((c,i)=>{ let idx=DRUM.indexOf(str[i]); if(idx<0) idx=0; c.el.className="fc"+(cls?" "+cls:"");
      if(idx===c.target) return; c.target=idx;
      if(reduce){ c.at=idx; c.t.nodeValue=DRUM[idx]; return; }
      c.next=performance.now()+Math.random()*180; flapBusy.add(c); });
    if(flapBusy.size) addLoop(flapTick);
  } };
}
function flapTick(dt, now){
  let steps=0;
  for(const c of flapBusy){
    if(c.at===c.target){ flapBusy.delete(c); continue; }
    if(now<c.next) continue;
    c.at=(c.at+1)%DRUM.length; c.t.nodeValue=DRUM[c.at]; c.next=now+38; steps++;
    c.fl.animate([{ transform:"scaleY(1)", opacity:.9 },{ transform:"scaleY(0)", opacity:0 }],{ duration:70 });
  }
  if(steps && now-flapSoundAt>34){ flapSoundAt=now; click(2600+Math.random()*1200, Math.min(.045,.006+steps*.0015), 3); }
  return flapBusy.size>0;
}
function boardCols(el, cols){ el.innerHTML=cols.map(([n,w])=>`<span style="width:calc(var(--cw) * ${w} + ${(w-1)*2}px)">${n}</span>`).join(""); }
const hhmm=m=>{ m=((Math.floor(m)%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0"); };

/* ═════════ Enochian Flight Board ═════════ */
const FB_COLS=[["TIME",5],["DESTINATION",12],["FLIGHT",6],["GATE",3],["REMARKS",12]], FB_ROWS=8;
const FB_CITIES=["NEW YORK","BERLIN","LONDON","TOKYO","HONG KONG","MADRID","SYDNEY","TORONTO","PARIS","ROME","SEOUL","LISBON","OSLO","DUBAI","SINGAPORE","MEXICO CITY","REYKJAVIK","NAIROBI","LIMA","ZURICH","CAPE TOWN","HELSINKI"];
const FB_AIR=["UC","EN","AE","VG","HR","LX","SA","OR"];
const now0=new Date(), FB={ t:now0.getHours()*60+now0.getMinutes(), speed:20, flights:[], lastMin:-1, rows:[] };
const rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
function fbNew(dep){ return { dep, dest:FB_CITIES[rnd(0,FB_CITIES.length-1)], code:FB_AIR[rnd(0,FB_AIR.length-1)]+" "+rnd(100,989), gate:String(rnd(1,38)).padStart(2,"0"), delayed:false, cancelAt:null }; }
(() => { let d=FB.t+4; for(let i=0;i<12;i++){ FB.flights.push(fbNew(d)); d+=rnd(5,13); } FB.flights[4].delayed=true; FB.flights[4].dep+=25; FB.flights[9].cancelAt=FB.t; })();
const fbStatus=f=>{ if(f.cancelAt!==null) return "CANCELLED"; const d=f.dep-FB.t; if(d<=0) return "DEPARTED"; if(f.delayed && d>30) return "DELAYED"; if(d<=10) return "GATE CLOSING"; if(d<=30) return "BOARDING"; return "ON TIME"; };
boardCols($("fbCols"), FB_COLS);
const fbClock=makeFlap($("fbClock"),5);
for(let r=0;r<FB_ROWS;r++){ const row=document.createElement("div"); row.className="board-row"; const g=FB_COLS.map(([,w])=>{ const s=document.createElement("span"); s.className="fgrp"; row.appendChild(s); return makeFlap(s,w); }); $("fbRows").appendChild(row); FB.rows.push(g); }
function fbRender(){
  fbClock.set(hhmm(FB.t));
  FB.flights.sort((a,b)=>a.dep-b.dep);
  const shown=FB.flights.slice(0,FB_ROWS);
  FB.rows.forEach((g,i)=>{ const f=shown[i]; if(!f){ g.forEach(x=>x.set("")); return; }
    const st=fbStatus(f), dim=st==="DEPARTED"||st==="CANCELLED";
    g[0].set(hhmm(f.dep), dim?"dim":""); g[1].set(f.dest, dim?"dim":""); g[2].set(f.code, dim?"dim":""); g[3].set(f.gate, dim?"dim":"");
    g[4].set(st, st==="DEPARTED"?"dim":(st==="GATE CLOSING"||st==="DELAYED"||st==="CANCELLED")?"red":""); });
  const nb=FB.flights.find(f=>fbStatus(f)==="BOARDING"||fbStatus(f)==="GATE CLOSING");
  $("fbRead").innerHTML=`<b>${hhmm(FB.t)}</b> · ${nb?`${nb.dest.toLowerCase()} ${fbStatus(nb).toLowerCase()} at gate ${nb.gate}`:"no flights boarding"}`;
  $("fbFoot").innerHTML=`<b>${FB.flights.filter(f=>fbStatus(f)==="DELAYED").length}</b> delayed · <b>${FB.flights.filter(f=>fbStatus(f)==="CANCELLED").length}</b> cancelled · clock ×${FB.speed}`;
}
function fbMinute(){
  FB.flights=FB.flights.filter(f=>!(fbStatus(f)==="DEPARTED" && FB.t-f.dep>4) && !(f.cancelAt!==null && FB.t-f.cancelAt>25));
  while(FB.flights.length<14){ const last=FB.flights.reduce((m,f)=>Math.max(m,f.dep),FB.t+20); FB.flights.push(fbNew(last+rnd(4,13))); }
  const pool=FB.flights.filter(f=>fbStatus(f)==="ON TIME" && !f.delayed);
  if(pool.length && Math.random()<.035){ const f=pool[rnd(0,pool.length-1)]; f.delayed=true; f.dep+=rnd(15,40); }
  if(pool.length && Math.random()<.008){ pool[rnd(0,pool.length-1)].cancelAt=FB.t; }
  fbRender();
}
function fbTick(dt){
  FB.t+=dt*FB.speed/60;
  const m=Math.floor(FB.t); if(m!==FB.lastMin){ FB.lastMin=m; fbMinute(); }
  return visible.get($("fb"));
}
watch($("fb"), ()=>addLoop(fbTick));
$$("[data-fbs]").forEach(b=>b.onclick=()=>{ FB.speed=+b.dataset.fbs; $$("[data-fbs]").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); tick(); fbRender(); });
bindFinish("fbFinish","fb");
fbRender();

/* ═════════ Enochian Task Board task board ═════════ */
const MF_COLS=[["ETA",5],["TASK",18],["TICKET",7],["PR",5],["STATUS",13]], MF_ROWS=8;
const MF_AUTO={ QUEUED:"BUILDING", BUILDING:"TESTING", MERGING:"SHIPPED" };
const MF_ACT={ "IN REVIEW":["MERGING","approve"], "CHECKS FAILED":["BUILDING","retry"], "BLOCKED":["QUEUED","unblock"] };
const MF_LEFT={ QUEUED:4, BUILDING:3, TESTING:2, "IN REVIEW":1, MERGING:1, SHIPPED:0 };
const MF={ t:FB.t, tasks:[], n:142, pr:1286, shipped:2, lastMin:-1, rows:[] };
function mfNew(title, status="QUEUED"){ MF.n++; MF.pr++; return { title, ticket:`ENO-${MF.n}`, pr:`#${MF.pr}`, status, nextAt:MF.t+rnd(2,6), shippedAt:null }; }
[["FIX AUTH REDIRECT","MERGING"],["SPLIT FLAP SOUND","IN REVIEW"],["AUDIT ARIA LABELS","TESTING"],["UPGRADE PLEX FONTS","CHECKS FAILED"],["TRIM BUNDLE SIZE","BUILDING"],["ADD DARK FINISH","QUEUED"],["WRITE REMIX GUIDE","QUEUED"]].forEach(([t,s])=>MF.tasks.push(mfNew(t,s)));
boardCols($("mfCols"), MF_COLS);
const mfClock=makeFlap($("mfClock"),5);
for(let r=0;r<MF_ROWS;r++){
  const row=document.createElement("div"); row.className="board-row"; row.dataset.i=r;
  const g=MF_COLS.map(([,w])=>{ const s=document.createElement("span"); s.className="fgrp"; row.appendChild(s); return makeFlap(s,w); });
  $("mfRows").appendChild(row); MF.rows.push({ row, g });
  row.addEventListener("click", e=>mfAct(r, e.shiftKey?"block":"act"));
  row.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); mfAct(r,"act"); } else if(e.key==="b"||e.key==="B"){ e.preventDefault(); mfAct(r,"block"); } else if(e.key==="Delete"||e.key==="Backspace"){ e.preventDefault(); mfAct(r,"remove"); } });
}
function mfAct(r, what){
  const t=MF.tasks[r]; if(!t) return;
  if(what==="remove"){ MF.tasks.splice(r,1); clack(); }
  else if(what==="block"){ if(t.status==="SHIPPED") return; t.status = t.status==="BLOCKED" ? "QUEUED" : "BLOCKED"; t.nextAt=MF.t+2; thock(); }
  else if(MF_ACT[t.status]){ t.status=MF_ACT[t.status][0]; t.nextAt=MF.t+rnd(2,5); thock(); }
  else { click(520,.12,3); }
  mfRender();
  const nr=MF.rows[Math.min(r,MF.tasks.length-1)]; if(nr && document.activeElement && document.activeElement.closest && document.activeElement.closest("#mfRows")) nr.row.focus();
}
function mfRender(){
  mfClock.set(hhmm(MF.t));
  MF.rows.forEach(({row,g},i)=>{ const t=MF.tasks[i];
    if(!t){ g.forEach(x=>x.set("")); row.removeAttribute("role"); row.removeAttribute("tabindex"); row.removeAttribute("aria-label"); return; }
    const red=t.status==="CHECKS FAILED"||t.status==="BLOCKED", dim=t.status==="SHIPPED", c=dim?"dim":"";
    const eta = t.status==="SHIPPED" ? "DONE" : MF_ACT[t.status] ? "--:--" : hhmm(MF.t+MF_LEFT[t.status]*5);
    g[0].set(eta,c); g[1].set(t.title,c); g[2].set(t.ticket,c); g[3].set(t.pr,c); g[4].set(t.status, red?"red":c);
    row.setAttribute("role","button"); row.tabIndex=0;
    const act=MF_ACT[t.status]; row.setAttribute("aria-label",`${t.title}, ${t.ticket}, ${t.status.toLowerCase()}.${act?` Press Enter to ${act[1]}.`:""} Press B to ${t.status==="BLOCKED"?"unblock":"block"}, Delete to remove.`);
  });
  const c=s=>MF.tasks.filter(t=>t.status===s).length;
  const inflight=MF.tasks.filter(t=>!["SHIPPED","BLOCKED"].includes(t.status)).length;
  $("mfRead").innerHTML=`<b>${inflight} in flight</b> · ${c("IN REVIEW")} awaiting review · ${c("CHECKS FAILED")} failed · ${c("BLOCKED")} blocked`;
  $("mfFoot").innerHTML=`<b>${MF.shipped}</b> shipped today`;
}
function mfMinute(){
  MF.tasks.forEach(t=>{ if(MF.t<t.nextAt) return;
    if(t.status==="TESTING"){ t.status=Math.random()<.25?"CHECKS FAILED":"IN REVIEW"; }
    else if(MF_AUTO[t.status]){ t.status=MF_AUTO[t.status]; if(t.status==="SHIPPED"){ t.shippedAt=MF.t; MF.shipped++; } }
    t.nextAt=MF.t+rnd(3,7); });
  MF.tasks=MF.tasks.filter(t=>!(t.status==="SHIPPED" && MF.t-t.shippedAt>6));
  mfRender();
}
function mfTick(dt){ MF.t+=dt*20/60; const m=Math.floor(MF.t); if(m!==MF.lastMin){ MF.lastMin=m; mfMinute(); } return visible.get($("mf")); }
watch($("mf"), ()=>addLoop(mfTick));
$("mfForm").addEventListener("submit", e=>{
  e.preventDefault(); const v=$("mfInput").value.toUpperCase().replace(/[^A-Z0-9 :\-./#]/g,"").trim();
  if(!v){ $("mfInput").focus(); return; }
  if(MF.tasks.length>=MF_ROWS){ $("mfFoot").innerHTML=`<b>board full</b> · ship or remove a task first`; click(520,.15,3); return; }
  MF.tasks.push(mfNew(v)); $("mfInput").value=""; thock(); mfRender();
});
bindFinish("mfFinish","mf");
mfRender();

/* ═════════ Enochian Voice Assistant · angel voice channel ═════════ */
(() => {
  const ae=$("ae"), ORDER=["off","idle","ready","listening","speaking"];
  const LABEL={ off:"OFF", idle:"MINIMAL", ready:"READY", listening:"LISTENING", speaking:"ANGEL SPEAKING" };
  const A={ state:"ready", session:60, left:60, level:0, hist:[], demo:true, demoT:0, demoEnd:0, thinkT:0, ext:0, listeners:{}, readAt:0, voice:null, armed:false };

  /* dial: Vigil-style ring, 60 ticks, numbers every 5, session arc, listening outline */
  (() => {
    const svg=$("aeDial"), C=150, pt=(r,a)=>[C+r*Math.sin(a*Math.PI/180), C-r*Math.cos(a*Math.PI/180)];
    for(let i=0;i<60;i++){ const a=i*6, maj=i%5===0, [x1,y1]=pt(maj?120:123,a), [x2,y2]=pt(129,a); svgEl("line",{ x1,y1,x2,y2, class:"d-tick", "stroke-width":maj?2.2:.9, "stroke-linecap":"round" }, svg); }
    for(let i=0;i<12;i++){ const a=i*30, [x,y]=pt(141,a); svgEl("text",{ x, y, "text-anchor":"middle", "dominant-baseline":"central", class:"d-num" }, svg).textContent = i===0?60:i*5; }
    const Cc=2*Math.PI*126; A.arc=svgEl("circle",{ cx:C, cy:C, r:126, class:"d-arc", "stroke-width":3, "stroke-dasharray":`0 ${Cc}`, transform:`rotate(-90 ${C} ${C})`, "stroke-linecap":"round" }, svg); A.arcC=Cc;
    svgEl("circle",{ cx:C, cy:C, r:115.5, class:"d-out" }, svg);
  })();

  /* minimal: the seal's real structure, redrawn with Hilfiker's bars and disc */
  (() => {
    const svg=$("aeMin"), C=100, R=100, pt=(r,a)=>[C+r*Math.sin(a*Math.PI/180), C-r*Math.cos(a*Math.PI/180)];
    const poly=(r,n,rot,step=1)=>{ const p=[]; for(let k=0,i=0;k<n;k++,i=(i+step)%n){ p.push(pt(r,rot+i*360/n).map(v=>v.toFixed(2)).join(",")); } return p.join(" "); };
    svgEl("circle",{ cx:C, cy:C, r:R*.975, class:"m-l", "stroke-width":3.4 }, svg);
    svgEl("circle",{ cx:C, cy:C, r:R*.875, class:"m-l", "stroke-width":1.4 }, svg);
    for(let i=0;i<40;i++){ const a=i*9, [x1,y1]=pt(R*.895,a), [x2,y2]=pt(R*.945,a); svgEl("line",{ x1,y1,x2,y2, class:"m-l", "stroke-width":i%5===0?3.2:2, "stroke-linecap":"butt" }, svg); }
    svgEl("polygon",{ points:poly(R*.875,7,0), class:"m-l", "stroke-width":2.4, "stroke-linejoin":"miter" }, svg);
    svgEl("polygon",{ points:poly(R*.663,7,0,2), class:"m-l", "stroke-width":2.4, "stroke-linejoin":"miter" }, svg);
    svgEl("polygon",{ points:poly(R*.30,7,180/7), class:"m-l", "stroke-width":1.6 }, svg);
    svgEl("polygon",{ points:poly(R*.27,5,0,2), class:"m-l", "stroke-width":2.2, "stroke-linejoin":"miter" }, svg);
    [[0,1],[90,1]].forEach(([a])=>{ const [x1,y1]=pt(R*.13,a), [x2,y2]=pt(R*.13,a+180); svgEl("line",{ x1,y1,x2,y2, class:"m-l", "stroke-width":1.2 }, svg); });
  })();

  const emit=(e,...a)=>(A.listeners[e]||[]).forEach(f=>{ try{ f(...a); }catch(err){ console.error(err); } });
  function setState(s, quiet){
    if(!ORDER.includes(s) || s===A.state) return;
    if(!quiet) A.armed=true;
    const prev=A.state; A.state=s; ae.dataset.state=s;
    $("aePower").setAttribute("aria-pressed",String(s!=="off"));
    $$(".ae-st").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.st===s || (s==="listening" && b.dataset.st==="ready"))));
    $("aeTalk").disabled = s==="off";
    if((s==="ready"||s==="listening"||s==="speaking") && (prev==="idle"||prev==="off")) A.left=A.session;
    if(s!=="speaking"){ A.level=0; }
    if(!quiet){ s==="off"?clack():s==="speaking"?thock():tick(); }
    aeVoice(s==="speaking");
    emit("state", s, prev); render(true); addLoop(aeTick);
  }
  function render(force){
    const now=performance.now(); if(!force && now-A.readAt<120) return; A.readAt=now;
    const m=Math.floor(A.left/60), s=Math.floor(A.left%60), t=`${m}:${String(s).padStart(2,"0")}`;
    const live=["ready","listening","speaking"].includes(A.state);
    A.arc.setAttribute("stroke-dasharray", `${live?(A.arcC*(1-A.left/A.session)).toFixed(1):0} ${A.arcC}`);
    A.arc.style.opacity = live && A.left<A.session ? 1 : 0;
    const tail={ off:"press power to wake", idle:"tap the disc to open a session", ready: A.thinking ? "the angel is composing a reply" : "hold to speak", listening:"listening · release to send", speaking:"the angel is answering" }[A.state];
    $("aeRead").innerHTML=`<b>${LABEL[A.state]}</b>${live?` · session ${t}`:""} · ${tail}`;
    ae.setAttribute("aria-label",`Angel channel, ${LABEL[A.state].toLowerCase()}. Hold Space to speak, left and right arrows change state, P toggles power.`);
  }
  /* push to talk */
  function pttStart(){
    if(A.state==="off") return;
    if(A.state==="speaking"){ setState("ready",true); }
    A.thinking=false; clearTimeout(A.thinkT);
    setState("listening"); emit("pttstart");
  }
  function pttEnd(){
    if(A.state!=="listening") return;
    setState("ready"); emit("pttend");
    if(A.demo){ A.thinking=true; render(true); A.thinkT=setTimeout(()=>{ A.thinking=false; A.demoT=performance.now(); A.demoEnd=A.demoT+3800+Math.random()*2200; setState("speaking"); }, 750); }
  }
  [$("aePtt"),$("aeTalk")].forEach(b=>{
    b.addEventListener("pointerdown", e=>{ e.preventDefault(); try{ b.setPointerCapture(e.pointerId); }catch(_){} b.dataset.down="true";
      if(A.state==="idle" && b===$("aePtt")){ setState("ready"); return; } pttStart(); });
    ["pointerup","pointercancel"].forEach(ev=>b.addEventListener(ev, ()=>{ b.dataset.down="false"; pttEnd(); }));
    b.addEventListener("keydown", e=>{ if((e.key===" "||e.key==="Enter") && !e.repeat){ e.preventDefault(); e.stopPropagation(); b.dataset.down="true"; if(A.state==="idle"){ setState("ready"); return; } pttStart(); } });
    b.addEventListener("keyup", e=>{ if(e.key===" "||e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); b.dataset.down="false"; pttEnd(); } });
    b.addEventListener("click", e=>e.preventDefault());
  });
  ae.addEventListener("keydown", e=>{
    if(e.target!==ae) return;
    if(e.key===" " && !e.repeat){ e.preventDefault(); if(A.state==="idle") setState("ready"); else pttStart(); }
    else if(e.key==="ArrowRight"){ e.preventDefault(); step(1); } else if(e.key==="ArrowLeft"){ e.preventDefault(); step(-1); }
    else if(e.key==="p"||e.key==="P"){ e.preventDefault(); $("aePower").click(); }
  });
  ae.addEventListener("keyup", e=>{ if(e.target===ae && e.key===" "){ e.preventDefault(); pttEnd(); } });
  const STEP=["off","idle","ready","speaking"];
  function step(d){ const i=Math.max(0,STEP.indexOf(A.state==="listening"?"ready":A.state)); const n=STEP[clamp(i+d,0,STEP.length-1)]; if(n==="speaking"){ A.demoT=performance.now(); A.demoEnd=A.demoT+6000; } setState(n); }
  $("aePrev").onclick=()=>step(-1); $("aeNext").onclick=()=>step(1);
  $("aePower").onclick=()=>setState(A.state==="off"?"idle":"off");
  $("aeSpk").onclick=()=>{ if(A.state==="off") return; A.demoT=performance.now(); A.demoEnd=A.demoT+4200; setState("speaking"); };
  $$(".ae-st").forEach(b=>b.onclick=()=>{ if(b.dataset.st==="speaking"){ A.demoT=performance.now(); A.demoEnd=A.demoT+6000; } setState(b.dataset.st); });
  $$("[data-ses]").forEach(b=>b.onclick=()=>{ A.session=+b.dataset.ses; A.left=A.session; $$("[data-ses]").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); tick(); render(true); });

  /* demo voice: a soft two-voice pad whose loudness follows the syllable envelope */
  function aeVoice(on){
    const a=audio();
    if(on && a && MASTER){
      if(!A.voice){ const g=a.createGain(); g.gain.value=0; const f=a.createBiquadFilter(); f.type="lowpass"; f.frequency.value=1400;
        const o1=a.createOscillator(), o2=a.createOscillator(), o3=a.createOscillator(); o1.type="sine"; o2.type="triangle"; o3.type="sine";
        o1.frequency.value=220; o2.frequency.value=329.6; o3.frequency.value=440*1.003;
        [o1,o2,o3].forEach(o=>{ o.connect(f); o.start(); }); f.connect(g); g.connect(MASTER); A.voice={ g, f, o2 }; }
    } else if(A.voice && AC){ A.voice.g.gain.setTargetAtTime(0, AC.currentTime, .12); }
  }
  /* illumination: centre first, then outward, each ring a little behind the one inside it */
  const rings=$$("#ae .ae-g");
  function aeTick(dt, now){
    const live=["ready","listening","speaking"].includes(A.state);
    if(live && A.armed){ A.left=Math.max(0, A.left-dt); if(A.left<=0){ clack(); setState("idle"); return false; } }
    if(A.state==="speaking"){
      let lv;
      if(A.demo && !A.ext){ const t=(now-A.demoT)/1000; const syl=Math.pow(Math.abs(Math.sin(t*5.3)),1.6)*(.55+.45*Math.sin(t*1.7+1)); lv=clamp(.15+syl*.85+(Math.random()-.5)*.08,0,1);
        if(now>A.demoEnd){ setState("ready"); return true; } }
      else lv=A.level;
      A.hist.push(lv); if(A.hist.length>40) A.hist.shift();
      rings.forEach((r,i)=>{ const h=A.hist[Math.max(0,A.hist.length-1-i*4)]??0; r.style.opacity=(reduce?.85:clamp(.25+h*.95-i*.04,0,1)).toFixed(3); });
      if(A.voice && AC){ A.voice.g.gain.setTargetAtTime(soundOn?lv*.05:0, AC.currentTime, .05); A.voice.f.frequency.setTargetAtTime(700+lv*1600, AC.currentTime, .05); }
    } else rings.forEach(r=>r.style.opacity=0);
    render();
    return live;
  }
  /* public API for wiring a real voice service */
  window.Aemeth={
    get state(){ return A.state; },
    setState:s=>{ if(s==="speaking"){ A.ext=1; } setState(s); },
    setLevel:v=>{ A.ext=1; A.demo=false; A.level=clamp(+v||0,0,1); },
    on:(e,f)=>{ (A.listeners[e]=A.listeners[e]||[]).push(f); return ()=>{ A.listeners[e]=A.listeners[e].filter(x=>x!==f); }; },
    set demo(v){ A.demo=!!v; if(v) A.ext=0; }, get demo(){ return A.demo; }
  };
  bindFinish("aeFinish","ae");
  render(true); addLoop(aeTick);
})();

/* ═════════ Context and agents: one simulated two-model session ═════════ */
(() => {
  const PAIRS=[["FABLE 5.1","SONNET 5.5"],["OPUS 5.5","SONNET 5.5"],["OPUS 5.5","HAIKU 5.5"]];
  const ADVISE=.40, RED=.85, SUBWIN=200000;
  const TASKS=["tests","refactor","docs","lint","migrate","review","search","types","bench","fixtures"];
  const S={ pair:1, win:1e6, run:true, speed:1, t:0,
    a:{ used:286000, rate:0, inst:0, burst:0 }, b:{ used:118000, rate:0, inst:0, burst:0 },
    agents:[], nextSpawn:6, seq:0, msg:"", msgUntil:0, test:0 };
  const views=[], short=n=>n.split(" ")[0];
  const kfmt=n=>n>=999500?`${(n/1e6).toFixed(n%1e6?2:0)}M`:`${Math.round(n/1000)}K`;
  const frac=m=>m.used/S.win;
  const say=m=>{ S.msg=m; S.msgUntil=performance.now()+2600; };
  function compact(w){ const m=S[w]; const before=m.used; m.used=Math.max(12000, Math.round(m.used*.12+15000)); say(`${short(PAIRS[S.pair][w==="a"?0:1])} COMPACTED ${kfmt(before)} → ${kfmt(m.used)}`); thock(); paintAll(true); }
  function newThread(){ S.a.used=9000; S.b.used=6000; S.agents.forEach(g=>g.done=true); say("NEW THREAD · BOTH CONTEXTS CLEARED"); clack(); paintAll(true); }
  function spawn(){ const live=S.agents.filter(g=>!g.done); if(live.length>=4){ say("FOUR SUB-AGENTS IS THE LIMIT HERE"); return; }
    S.seq++; S.agents.push({ id:S.seq, task:TASKS[(S.seq-1)%TASKS.length], used:4000, rate:0, inst:0, life:8+Math.random()*14, age:0, needsOk:false, asked:false, done:false, goneAt:0, peak:0, peakAt:0 }); tick(); paintAll(true); }
  function step(dt){
    const sp=dt*S.speed; S.t+=sp;
    const rA = 380 + S.a.burst, rB = (S.pair===2?1150:900) + S.b.burst;
    S.a.burst = Math.max(0, S.a.burst*Math.exp(-sp*1.4) + (Math.random()<sp*.25 ? 1800+Math.random()*2600 : 0));
    S.b.burst = Math.max(0, S.b.burst*Math.exp(-sp*1.1) + (Math.random()<sp*.35 ? 3000+Math.random()*7000 : 0));
    S.a.inst=rA*(.8+Math.random()*.4); S.b.inst=rB*(.7+Math.random()*.6);
    S.a.used+=S.a.inst*sp; S.b.used+=S.b.inst*sp;
    ["a","b"].forEach(w=>{ const m=S[w]; m.rate+=(m.inst-m.rate)*(1-Math.exp(-dt/1.2)); if(m.used>=S.win){ const b=m.used; m.used=Math.round(S.win*.18); say(`${short(PAIRS[S.pair][w==="a"?0:1])} HIT THE WINDOW · AUTO-COMPACTED`); } });
    S.nextSpawn-=sp; if(S.nextSpawn<=0){ S.nextSpawn=10+Math.random()*14; if(S.agents.filter(g=>!g.done).length<3) spawn(); }
    S.agents.forEach(g=>{ if(g.done) return;
      if(g.needsOk){ g.inst=0; }
      else { g.age+=sp; g.inst=(1400+Math.random()*4200)*(g.age<1?g.age:1); g.used+=g.inst*sp*.6;
        if(!g.asked && g.age>g.life*.45 && Math.random()<.18){ g.asked=true; g.needsOk=true; }
        if(g.age>=g.life){ g.done=true; g.goneAt=S.t; const add=3000+Math.round(Math.random()*4000); S.a.used+=add; say(`SUB-${g.id} ${g.task.toUpperCase()} DONE · +${kfmt(add)} TO ORCHESTRATOR`); } }
      g.rate+=(g.inst-g.rate)*(1-Math.exp(-dt/.8)); });
    S.agents.forEach(g=>{ if(g.done){ g.rate*=Math.exp(-dt*3); } });
    S.agents=S.agents.filter(g=>!(g.done && S.t-g.goneAt>4*Math.max(1,S.speed)));
  }
  function anyVisible(){ return views.some(v=>visible.get(v.el)); }
  function ctxTick(dt, now){
    if(S.run) step(dt);
    else { ["a","b"].forEach(w=>S[w].rate*=Math.exp(-dt*2)); S.agents.forEach(g=>g.rate*=Math.exp(-dt*2)); }
    views.forEach(v=>{ if(visible.get(v.el)) v.frame(dt, now); });
    return anyVisible();
  }
  function paintAll(force){ views.forEach(v=>v.paint && v.paint(force)); syncControls(); }
  function syncControls(){
    $$("[data-cpair]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.cpair===S.pair)));
    $$("[data-cwin]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.cwin===S.win)));
    $$(".ctx-run").forEach(b=>{ b.setAttribute("aria-pressed",String(S.run)); b.textContent=S.run?"RUNNING":"PAUSED"; });
    $$("[data-cspeed]").forEach(b=>{ b.setAttribute("aria-pressed",String(S.speed>1)); b.textContent=`SPEED ${S.speed}×`; });
    $("cxWin").innerHTML=`<i${S.win<1e6?' class="on"':""}></i>${kfmt(S.win)}`;
  }
  $$("[data-cpair]").forEach(b=>b.onclick=()=>{ S.pair=+b.dataset.cpair; tick(); views.forEach(v=>v.rebuild&&v.rebuild()); paintAll(true); });
  $$("[data-cwin]").forEach(b=>b.onclick=()=>{ const r=+b.dataset.cwin/S.win; S.win=+b.dataset.cwin; S.a.used=Math.min(S.a.used*r,S.win*.95); S.b.used=Math.min(S.b.used*r,S.win*.95); tick(); views.forEach(v=>v.rebuild&&v.rebuild()); paintAll(true); });
  $$(".ctx-run").forEach(b=>b.onclick=()=>{ S.run=!S.run; thock(); paintAll(true); addLoop(ctxTick); });
  $$("[data-cspeed]").forEach(b=>b.onclick=()=>{ S.speed=S.speed>1?1:10; tick(); paintAll(true); });
  $$("[data-ccompact]").forEach(b=>b.onclick=()=>compact(b.dataset.ccompact));
  $$("[data-cnew]").forEach(b=>b.onclick=newThread);

  /* ── Enochian Context Meter 01: twin VU faces on a compressed scale ── */
  (() => {
    const el=$("cv"), K=Math.log(.708)/Math.log(ADVISE), pos=u=>Math.pow(clamp(u/S.win,0,1.02),K), ang=p=>-44+clamp(p,-.02,1.04)*88;
    const N={ a:{ p:pos(S.a.used), v:0 }, b:{ p:pos(S.b.used), v:0 } }, parts={};
    function build(svg, w){
      svg.innerHTML=""; const cx=110, cy=150, R=110, pt=(r,a)=>[cx+r*Math.sin(a*Math.PI/180), cy-r*Math.cos(a*Math.PI/180)];
      const arc=(r,a0,a1)=>{ const [x0,y0]=pt(r,a0),[x1,y1]=pt(r,a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
      svgEl("path",{ d:arc(R,ang(0),ang(pos(ADVISE*S.win))), class:"vu-line", fill:"none", "stroke-width":1.1 }, svg);
      svgEl("path",{ d:arc(R+3,ang(pos(ADVISE*S.win)),ang(1)), class:"vu-hot", fill:"none", "stroke-width":6 }, svg);
      const LBL=new Set([0,.1,.2,.8,1]);
      [0,.05,.1,.2,.3,.4,.5,.6,.7,.8,.9,1].forEach(f=>{ const a=ang(pos(f*S.win)), hot=f>ADVISE, maj=LBL.has(f)||f===ADVISE;
        const [x1,y1]=pt(R,a), [x2,y2]=pt(R+(maj?9:6),a); svgEl("line",{ x1,y1,x2,y2, class:hot?"vu-hot":"vu-line", "stroke-width":1.3 }, svg);
        if(LBL.has(f)){ const [tx,ty]=pt(R+18,a); const t=svgEl("text",{ x:tx.toFixed(1), y:(ty+3).toFixed(1), "text-anchor":"middle", class:f===ADVISE?"vu-adv":hot?"vu-num vu-num-hot sm":"vu-num sm" }, svg); t.textContent = f===0?"0":kfmt(f*S.win); } });
      const [ax,ay]=pt(R+18,ang(pos(ADVISE*S.win))); svgEl("text",{ x:ax.toFixed(1), y:(ay+3).toFixed(1), "text-anchor":"middle", class:"vu-adv" }, svg).textContent=kfmt(ADVISE*S.win);
      svgEl("text",{ x:110, y:86, "text-anchor":"middle", class:"vu-big", style:"font-size:12px;letter-spacing:2px" }, svg).textContent="CONTEXT";
      parts[w]={};
      parts[w].count=svgEl("text",{ x:110, y:99, "text-anchor":"middle", class:"vu-tiny", style:"font-size:7px" }, svg);
      parts[w].name=svgEl("text",{ x:12, y:106, class:"vu-tiny" }, svg);
      svgEl("text",{ x:190, y:16, "text-anchor":"end", class:"vu-tiny" }, svg).textContent="COMPACT";
      parts[w].lamp=svgEl("circle",{ cx:200, cy:13.5, r:3.6, class:"vu-peak" }, svg);
      parts[w].g=svgEl("g",{ class:"vu-needle" }, svg);
      svgEl("line",{ x1:cx, y1:cy, x2:cx, y2:cy-R-8, "stroke-width":1.4, "stroke-linecap":"round" }, parts[w].g);
      svgEl("rect",{ x:0, y:110, width:220, height:18, class:"vu-shroud" }, svg);
      svgEl("path",{ d:"M0 110.5H220", stroke:"rgba(0,0,0,.25)", "stroke-width":1 }, svg);
    }
    const rebuild=()=>{ build($("cvA"),"a"); build($("cvB"),"b"); paint(true); };
    let readAt=0;
    function paint(force){
      ["a","b"].forEach(w=>{ const f=frac(S[w]);
        parts[w].name.textContent=`${w==="a"?"THINK":"BUILD"} · ${PAIRS[S.pair][w==="a"?0:1]}`;
        parts[w].count.textContent=`${kfmt(S[w].used)} / ${kfmt(S.win)} TOKENS`;
        parts[w].lamp.classList.toggle("on", f>=ADVISE); parts[w].lamp.classList.toggle("blink", f>=RED);
        $(w==="a"?"cvA":"cvB").setAttribute("aria-valuenow",Math.round(f*100)); $(w==="a"?"cvA":"cvB").setAttribute("aria-valuetext",`${kfmt(S[w].used)} of ${kfmt(S.win)} tokens`); });
      const now=performance.now(); if(!force && now-readAt<200) return; readAt=now;
      const fa=frac(S.a), advice = fa>=RED ? "start a new thread now" : fa>=ADVISE ? "compact or start a new thread" : `advice at ${kfmt(ADVISE*S.win)}`;
      $("cvRead").innerHTML = now<S.msgUntil ? `<b>${S.msg}</b>` : `<b>${short(PAIRS[S.pair][0])} ${kfmt(S.a.used)}</b> · ${short(PAIRS[S.pair][1])} ${kfmt(S.b.used)} · ${advice}`;
    }
    function frame(dt){
      ["a","b"].forEach(w=>{ const n=N[w], target=pos(S[w].used);
        if(reduce){ n.p=target; n.v=0; } else { let h=dt; while(h>0){ const s=Math.min(1/240,h); n.v+=(-110*(n.p-target)-15*n.v)*s; n.p+=n.v*s; h-=s; } }
        if(n.p>1.04){ n.p=1.04; n.v*=-.3; }
        parts[w].g.setAttribute("transform",`rotate(${ang(n.p).toFixed(2)} 110 150)`); });
      paint();
    }
    rebuild(); views.push({ el, frame, paint, rebuild }); bindFinish("cvFinish","cv");
  })();

  /* ── Enochian Agent Monitor: one ladder row per agent ── */
  (() => {
    const el=$("ca"), rowsEl=$("caRows"), rowCache=new Map();
    const lit=r=>Math.round(clamp(Math.log10(Math.max(r,1)/100)/Math.log10(200),0,1)*20);
    function rowFor(key){
      if(rowCache.has(key)) return rowCache.get(key);
      const row=document.createElement("div"); row.className="agl-row";
      row.innerHTML=`<span class="agl-name"></span><div class="lad-segs"></div><span class="agl-st"></span>`;
      const segs=[]; for(let i=0;i<20;i++){ const s=document.createElement("i"); if(i>=17) s.classList.add("hot"); row.children[1].appendChild(s); segs.push(s); }
      const r={ row, segs, name:row.children[0], st:row.children[2], lit:-1, hold:-1, peak:0, peakAt:0 };
      row.addEventListener("click", ()=>approve(key)); row.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); approve(key); } });
      rowCache.set(key,r); return r;
    }
    function approve(key){ const g=S.agents.find(x=>"s"+x.id===key); if(g && g.needsOk){ g.needsOk=false; thock(); say(`SUB-${g.id} APPROVED · ${g.task.toUpperCase()} CONTINUES`); paint(true); } }
    let readAt=0;
    function paint(force){
      const list=[{ key:"a", name:`<b>ORCH</b> · ${short(PAIRS[S.pair][0])}`, rate:S.a.rate, st:S.run?(S.a.rate>60?"WORKING":"IDLE"):"PAUSED" },
                  { key:"b", name:`<b>BUILD</b> · ${short(PAIRS[S.pair][1])}`, rate:S.b.rate, st:S.run?(S.b.rate>60?"WORKING":"IDLE"):"PAUSED" },
                  ...S.agents.map(g=>({ key:"s"+g.id, name:`<b>SUB-${g.id}</b> · ${g.task}`, rate:g.rate, st:g.needsOk?"NEEDS OK":g.done?"DONE":S.run?"WORKING":"PAUSED", gone:g.done, ask:g.needsOk }))];
      const keep=new Set(list.map(x=>x.key));
      [...rowCache.keys()].forEach(k=>{ if(!keep.has(k)){ rowCache.get(k).row.remove(); rowCache.delete(k); } });
      const now=performance.now();
      list.forEach((x,i)=>{ const r=rowFor(x.key); if(rowsEl.children[i]!==r.row) rowsEl.insertBefore(r.row, rowsEl.children[i]||null);
        r.name.innerHTML=x.name; r.st.textContent=x.st; r.st.className="agl-st"+(x.ask?" ask":x.st==="WORKING"?" work":x.st==="DONE"?" done":"");
        r.row.classList.toggle("gone", !!x.gone);
        if(x.ask){ r.row.setAttribute("role","button"); r.row.tabIndex=0; r.row.setAttribute("aria-label",`Sub-agent ${x.key.slice(1)} needs approval. Press Enter to approve.`); } else { r.row.removeAttribute("role"); r.row.removeAttribute("tabindex"); r.row.removeAttribute("aria-label"); }
        let L=lit(x.rate); if(S.test){ const e=(now-S.test)/1200; if(e>=1) S.test=0; else L=Math.round((1-Math.abs(e*2-1))*20); }
        if(L>=r.peak){ r.peak=L; r.peakAt=now; } else if(now-r.peakAt>1200) r.peak=Math.max(L, r.peak-1);
        const hold=S.test?-1:r.peak-1;
        if(L!==r.lit || hold!==r.hold){ r.segs.forEach((s,j)=>{ s.classList.toggle("on", j<L); s.classList.toggle("hold", j===hold && j>=L); }); r.lit=L; r.hold=hold; } });
      if(!force && now-readAt<250) return; readAt=now;
      const work=list.filter(x=>x.st==="WORKING").length, ask=list.filter(x=>x.ask).length, total=Math.round(S.a.rate+S.b.rate+S.agents.reduce((s,g)=>s+g.rate,0));
      $("caRead").innerHTML = now<S.msgUntil ? `<b>${S.msg}</b>` : `<b>${work} working</b>${ask?` · <b style="color:var(--accent)">${ask} need${ask>1?"":"s"} OK</b>`:""} · ${S.agents.filter(g=>!g.done).length} sub-agents · ${(total/1000).toFixed(1)}K tok/s`;
    }
    $("caSpawn").onclick=()=>{ spawn(); addLoop(ctxTick); };
    $("caHalt").onclick=()=>{ S.agents.forEach(g=>{ if(!g.done){ g.done=true; g.goneAt=S.t; } }); clack(); say("SUB-AGENTS HALTED"); paint(true); };
    $("caTest").onclick=()=>{ S.test=performance.now(); thock(); addLoop(ctxTick); };
    views.push({ el, frame:()=>paint(), paint }); bindFinish("caFinish","ca"); paint(true);
  })();

  /* ── Enochian Context Meter 03: think, build, agents ── */
  (() => {
    const el=$("ct"), svg=$("ctSvg"), R={ a:98, b:82, g:66 }, arcs={}; let sel="a";
    Object.entries(R).forEach(([k,r])=>{ const C=2*Math.PI*r;
      svgEl("circle",{ cx:120, cy:120, r, fill:"none", stroke:"#26262a", "stroke-width":9, "stroke-linecap":"round", "stroke-dasharray":`${C*.75} ${C}`, transform:"rotate(135 120 120)" }, svg);
      arcs[k]=svgEl("circle",{ cx:120, cy:120, r, fill:"none", stroke:"#f2f2f4", "stroke-width":9, "stroke-linecap":"round", "stroke-dasharray":`0 ${C}`, transform:"rotate(135 120 120)", style:"transition:stroke-dasharray .45s ease,stroke .3s" }, svg); arcs[k].C=C;
      const a=(135+ADVISE*270)*Math.PI/180; svgEl("line",{ x1:120+(r-7)*Math.cos(a), y1:120+(r-7)*Math.sin(a), x2:120+(r+7)*Math.cos(a), y2:120+(r+7)*Math.sin(a), stroke:"#F4A934", "stroke-width":2.2 }, svg);
      svgEl("text",{ x:120, y:120+r+3, "text-anchor":"middle", class:"g-lbl" }, svg).textContent={a:"THINK",b:"BUILD",g:"AGENTS"}[k]; });
    const tL=svgEl("text",{ x:120, y:90, "text-anchor":"middle", class:"g-lbl" }, svg), tB=svgEl("text",{ x:120, y:130, "text-anchor":"middle", class:"g-big", style:"font-size:34px" }, svg),
      tD1=svgEl("text",{ x:120, y:148, "text-anchor":"middle", class:"g-small", style:"font-size:7.2px" }, svg), tD2=svgEl("text",{ x:120, y:161, "text-anchor":"middle", class:"g-lbl", style:"font-size:7px" }, svg);
    const col=f=>f>=RED?"var(--accent)":f>=ADVISE?"#F4A934":"#f2f2f4";
    const agentsFrac=()=>{ const live=S.agents.filter(g=>!g.done); return live.length ? live.reduce((s,g)=>s+g.used,0)/live.length/SUBWIN : 0; };
    let readAt=0;
    function paint(force){
      const now=performance.now(); if(!force && now-readAt<400) return; readAt=now;
      const F={ a:frac(S.a), b:frac(S.b), g:agentsFrac() };
      Object.keys(R).forEach(k=>{ const f=clamp(F[k],0,1); arcs[k].setAttribute("stroke-dasharray",`${(arcs[k].C*.75*f).toFixed(1)} ${arcs[k].C}`); arcs[k].style.stroke=col(f); });
      const f=F[sel];
      tL.textContent = sel==="g" ? `${S.agents.filter(g=>!g.done).length} SUB-AGENTS · AVG` : `${PAIRS[S.pair][sel==="a"?0:1]} · ${sel==="a"?"THINKING":"BUILDING"}`;
      tB.textContent = sel==="g" ? `${Math.round(f*100)}%` : kfmt(S[sel].used); tB.style.fill = f>=ADVISE ? col(f) : "";
      tD1.textContent = sel==="g" ? `OF ${kfmt(SUBWIN)} EACH` : `${Math.round(f*100)}% OF ${kfmt(S.win)} · ${(S[sel].rate/1000).toFixed(1)}K TOK/S`;
      tD2.textContent = f>=RED ? "NEW THREAD NOW" : f>=ADVISE ? "COMPACT ADVISED" : `ADVICE AT ${sel==="g"?"40%":kfmt(ADVISE*S.win)}`;
      $("ctRead").innerHTML=["a","b","g"].map(k=>{ const t=`${{a:"THINK",b:"BUILD",g:"AGENTS"}[k]} ${Math.round(F[k]*100)}%`; return k===sel?`<b>${t}</b>`:t; }).join(" · ");
    }
    $$("[data-cring]").forEach(b=>b.onclick=()=>{ sel=b.dataset.cring; $$("[data-cring]").forEach(x=>{ x.setAttribute("aria-pressed",String(x===b)); x.querySelector("i").classList.toggle("on",x===b); }); tick(); paint(true); });
    $("ctCompact").onclick=()=>{ if(sel==="g"){ say("SUB-AGENTS COMPACT THEMSELVES WHEN THEY REPORT BACK"); tick(); paint(true); return; } compact(sel); };
    views.push({ el, frame:()=>paint(), paint }); bindFinish("ctFinish","ct"); paint(true);
  })();

  /* ── Enochian Context Meter 02: two needles, 0 to the window ── */
  (() => {
    const el=$("cx"), C=120, pt=(r,a)=>[C+r*Math.sin(a*Math.PI/180), C-r*Math.cos(a*Math.PI/180)];
    const ang=u=>-120+clamp(u/S.win,0,1.02)*240; let p={}, nA=S.a.used, nB=S.b.used;
    function build(){
      const svg=$("cxSvg"); svg.innerHTML=""; const step=S.win/10;
      for(let i=0;i<=40;i++){ const u=i*S.win/40, a=ang(u), maj=i%4===0, f=u/S.win; const [x1,y1]=pt(112,a), [x2,y2]=pt(maj?98:104,a);
        svgEl("line",{ x1,y1,x2,y2, class:"g-tick"+(maj?" maj":""), "stroke-width":maj?2.2:1.4, "stroke-linecap":"round", style:f>=RED?"stroke:var(--accent)":f>=ADVISE?"stroke:#F4A934":"" }, svg);
        if(maj){ const [tx,ty]=pt(84,a); svgEl("text",{ x:tx, y:ty, "text-anchor":"middle", "dominant-baseline":"central", class:"g-num", style:"font-size:9px"+(f>=RED?";fill:var(--accent)":f>=ADVISE?";fill:#F4A934":"") }, svg).textContent=Math.round(u/1000); } }
      p.big=svgEl("text",{ x:C, y:180, "text-anchor":"middle", class:"g-big", style:"font-size:32px" }, svg);
      p.unit=svgEl("text",{ x:C, y:194, "text-anchor":"middle", class:"g-lbl" }, svg);
      p.l1=svgEl("text",{ x:C, y:209, "text-anchor":"middle", class:"g-small", style:"font-size:8.5px" }, svg);
      p.l2=svgEl("text",{ x:C, y:222, "text-anchor":"middle", class:"g-lbl", style:"font-size:7px" }, svg);
      p.nB=svgEl("g",{}, svg); svgEl("line",{ x1:C, y1:C+10, x2:C, y2:C-92, stroke:"#f2f2f4", "stroke-width":1.8, "stroke-linecap":"round" }, p.nB);
      p.nA=svgEl("g",{}, svg); svgEl("line",{ x1:C, y1:C+16, x2:C, y2:C-100, style:"stroke:var(--accent)", "stroke-width":3, "stroke-linecap":"round" }, p.nA);
      svgEl("circle",{ cx:C, cy:C, r:7, fill:"#1c1c1f", stroke:"#5a5a60", "stroke-width":1.5 }, svg);
      svgEl("text",{ x:C, y:62, "text-anchor":"middle", class:"g-lbl", style:"font-size:7px" }, svg).textContent="K TOKENS";
    }
    let readAt=0;
    function paint(force){
      const now=performance.now(); if(!force && now-readAt<150) return; readAt=now;
      const fa=frac(S.a), toAdv=(ADVISE*S.win-S.a.used)/Math.max(S.a.rate*S.speed,1);
      p.big.textContent=Math.round(S.a.used/1000); p.big.style.fill = fa>=RED?"var(--accent)":fa>=ADVISE?"#F4A934":"";
      p.unit.textContent=`K · THINK · ${short(PAIRS[S.pair][0])}`;
      p.l1.textContent=`BUILD ${kfmt(S.b.used)} · ${short(PAIRS[S.pair][1])} · ${((S.a.rate+S.b.rate)/1000).toFixed(1)}K TOK/S`;
      p.l2.textContent = fa>=RED ? "WINDOW NEARLY FULL · NEW THREAD" : fa>=ADVISE ? "COMPACT ADVISED" : S.run ? `COMPACT IN ~${Math.max(1,Math.ceil(toAdv/60))} MIN` : "PAUSED";
      $("cxScreen").setAttribute("aria-valuenow",Math.round(S.a.used/1000)); $("cxScreen").setAttribute("aria-valuetext",`${kfmt(S.a.used)} of ${kfmt(S.win)} tokens, thinking model`);
      $("cxRead").innerHTML = now<S.msgUntil ? `<b>${S.msg}</b>` : `<b>${kfmt(S.a.used)}</b> think · ${kfmt(S.b.used)} build · ${PAIRS[S.pair].map(short).join(" + ")}`;
    }
    function frame(dt){
      const k=reduce?1:1-Math.exp(-dt/.25); nA+=(S.a.used-nA)*k; nB+=(S.b.used-nB)*k;
      p.nA.setAttribute("transform",`rotate(${ang(nA).toFixed(2)} ${C} ${C})`); p.nB.setAttribute("transform",`rotate(${ang(nB).toFixed(2)} ${C} ${C})`); paint();
    }
    $("cxPair").onclick=()=>{ S.pair=(S.pair+1)%PAIRS.length; tick(); views.forEach(v=>v.rebuild&&v.rebuild()); paintAll(true); };
    $("cxWin").onclick=()=>{ $$("[data-cwin]").find(b=>+b.dataset.cwin!==S.win).click(); };
    $("cxCompact").onclick=()=>compact("a"); $("cxNew").onclick=newThread;
    build(); views.push({ el, frame, paint, rebuild:()=>{ build(); paint(true); } }); bindFinish("cxFinish","cx"); paint(true);
  })();

  views.forEach(v=>watch(v.el, ()=>addLoop(ctxTick)));
  syncControls();
  window.ContextGauges={ get state(){ return { pair:PAIRS[S.pair], window:S.win, think:S.a.used, build:S.b.used, agents:S.agents.length }; },
    set(think, build){ if(think!=null) S.a.used=+think; if(build!=null) S.b.used=+build; paintAll(true); }, pause(){ S.run=false; paintAll(true); } };
})();

/* ═════════ Enochian Usage Monitor: session / weekly / model cap with week pacing ═════════ */
(() => {
  const PROV=[{ name:"CLAUDE", model:"OPUS", modelLong:"Opus weekly" },{ name:"CHATGPT", model:"REASONING", modelLong:"reasoning models" },{ name:"OTHER", model:"PREMIUM", modelLong:"premium model" }];
  const STYLE=[{ name:"light", rate:.95, p:.55, share:.3 },{ name:"steady", rate:1.55, p:.75, share:.45 },{ name:"heavy", rate:2.6, p:.9, share:.62 }];
  const WEEK=168, SCAP=15, MCAP=50, DAYS=["MON","TUE","WED","THU","FRI","SAT","SUN"];
  const Q={ prov:0, style:1, t:0, w:0, m:0, sStart:-99, sUsed:0, log:[], hist:[], speed:1/30, sel:"s", manual:null, lastHist:-1, readAt:0, wasBlocked:"" };
  const hourOf=t=>(9+t)%24, dayOf=t=>Math.floor(t/24)%7;
  const when=t=>{ const h=9+t, d=Math.floor(h/24)%7, hh=Math.floor(h%24), mm=Math.floor((h%1)*60); return `${DAYS[d][0]+DAYS[d].slice(1).toLowerCase()} ${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; };
  const dur=h=>{ h=Math.max(0,h); const d=Math.floor(h/24), r=h-d*24, hh=Math.floor(r), mm=Math.round((r-hh)*60); return d?`${d}d ${hh}h`:`${hh}h ${String(mm).padStart(2,"0")}m`; };
  /* session: starts at the first message, resets in full five hours later */
  const sess=()=>Q.t<Q.sStart+5 ? Q.sUsed/SCAP*100 : 0;
  const sResetIn=()=>Q.t<Q.sStart+5 ? Q.sStart+5-Q.t : 0;
  const used24=()=>Q.log.filter(e=>e.t>Q.t-24).reduce((s,e)=>s+e.a,0);
  function stepSim(dh){
    const st=STYLE[Q.style], h=hourOf(Q.t), day=dayOf(Q.t);
    const active = h>=9 && h<19 && !(day>=5 && Math.random()<.6);
    if(Q.w>=100 || sess()>=99.5) return;
    if(active && Math.random()<st.p+.2){ if(Q.t>=Q.sStart+5){ Q.sStart=Q.t; Q.sUsed=0; } const a=Math.min(st.rate*dh*(.5+Math.random()), SCAP-Q.sUsed); if(a<=0) return; Q.sUsed+=a; Q.log.push({ t:Q.t, a }); Q.w=Math.min(100,Q.w+a); Q.m=Math.min(MCAP,Q.m+a*st.share*(MCAP/100)*2); }
  }
  function advance(dh){
    let left=dh; while(left>0){ const s=Math.min(.05,left); Q.t+=s; left-=s; if(Q.t>=WEEK){ newWeek(); return; } stepSim(s);
      if(Q.t-Q.lastHist>=.5){ Q.hist.push({ t:Q.t, w:Q.w }); Q.lastHist=Q.t; } }
    Q.log=Q.log.filter(e=>e.t>Q.t-24.5);
  }
  function newWeek(){ Q.t=0; Q.w=0; Q.m=0; Q.sStart=-99; Q.sUsed=0; Q.log=[]; Q.hist=[{ t:0, w:0 }]; Q.lastHist=0; }
  function seed(){
    newWeek(); const keep=Q.speed; for(let i=0;i<53/.05;i++){ Q.t+=.05; stepSim(.05); if(Q.t-Q.lastHist>=.5){ Q.hist.push({ t:Q.t, w:Q.w }); Q.lastHist=Q.t; } }
    const k=Q.w>0?38/Q.w:1; Q.w=38; Q.sStart=Q.t-2.9; Q.sUsed=SCAP*.61; Q.hist.forEach(p=>p.w*=k); Q.log.forEach(e=>e.a*=k); Q.log=Q.log.filter(e=>e.t>Q.t-24.5); Q.m=MCAP*.55; Q.speed=keep;
  }
  function forecast(){
    const t=Math.max(Q.t,.5), weekRate=Q.w/t, recent=Q.t>=24 ? used24()/24 : weekRate, hist=.6*recent+.4*weekRate;
    // the usage style is the plan for the rest of the week: blend it with history (real data uses history only)
    const st=STYLE[Q.style], planRate=st.rate*Math.min(1,st.p+.2)*(10/24)*((5+2*.4)/7);
    const rate=Math.max(.01, Q.manual ? hist : .5*hist+.5*planRate);
    const projected=Q.w+rate*(WEEK-Q.t), out=projected>100 ? Q.t+(100-Q.w)/rate : null;
    return { rate, projected, out, ideal:Q.t/WEEK*100 };
  }

  /* rings */
  const svg=$("qtSvg"), R={ s:98, w:82, m:66 }, arcs={}; const lbls={};
  Object.entries(R).forEach(([k,r])=>{ const C=2*Math.PI*r;
    svgEl("circle",{ cx:120, cy:120, r, fill:"none", stroke:"#26262a", "stroke-width":9, "stroke-linecap":"round", "stroke-dasharray":`${C*.75} ${C}`, transform:"rotate(135 120 120)" }, svg);
    arcs[k]=svgEl("circle",{ cx:120, cy:120, r, fill:"none", stroke:"#f2f2f4", "stroke-width":9, "stroke-linecap":"round", "stroke-dasharray":`0 ${C}`, transform:"rotate(135 120 120)", style:"transition:stroke-dasharray .45s ease,stroke .3s" }, svg); arcs[k].C=C;
    lbls[k]=svgEl("text",{ x:120, y:120+r+3, "text-anchor":"middle", class:"g-lbl" }, svg); });
  const proj=svgEl("path",{ fill:"none", "stroke-width":3, "stroke-dasharray":"4 4", "stroke-linecap":"butt" }, svg);
  const notch=svgEl("line",{ x1:120, y1:120-82-8, x2:120, y2:120-82+8, stroke:"#f2f2f4", "stroke-width":2.4 }, svg);
  const tL=svgEl("text",{ x:120, y:90, "text-anchor":"middle", class:"g-lbl" }, svg), tB=svgEl("text",{ x:120, y:130, "text-anchor":"middle", class:"g-big", style:"font-size:34px" }, svg),
    tD1=svgEl("text",{ x:120, y:148, "text-anchor":"middle", class:"g-small", style:"font-size:7.2px" }, svg), tD2=svgEl("text",{ x:120, y:161, "text-anchor":"middle", class:"g-lbl", style:"font-size:7px" }, svg);
  const angAt=f=>135+clamp(f,0,1)*270;
  const arcPath=(r,f0,f1)=>{ const a0=angAt(f0)*Math.PI/180, a1=angAt(f1)*Math.PI/180; const large=(a1-a0)>Math.PI?1:0;
    return `M${(120+r*Math.cos(a0)).toFixed(2)} ${(120+r*Math.sin(a0)).toFixed(2)}A${r} ${r} 0 ${large} 1 ${(120+r*Math.cos(a1)).toFixed(2)} ${(120+r*Math.sin(a1)).toFixed(2)}`; };

  /* week chart */
  const ch=$("qtChart"), X0=36, X1=410, Y0=14, Y1=144, x=t=>X0+t/WEEK*(X1-X0), y=p=>Y1-clamp(p,0,112)/112*(Y1-Y0);
  const g={};
  (() => {
    for(let d=0;d<=7;d++) svgEl("line",{ x1:x(d*24), y1:Y0, x2:x(d*24), y2:Y1, class:"c-grid" }, ch);
    for(let d=0;d<7;d++) svgEl("text",{ x:x(d*24+12), y:160, "text-anchor":"middle", class:"c-day" }, ch).textContent=DAYS[d];
    [0,50,100].forEach(p=>{ svgEl("line",{ x1:X0, y1:y(p), x2:X1, y2:y(p), class:"c-grid" }, ch); svgEl("text",{ x:X0-6, y:y(p)+3, "text-anchor":"end", class:"c-pct" }, ch).textContent=p+"%"; });
    svgEl("line",{ x1:X0, y1:y(100), x2:X1, y2:y(100), class:"c-cap" }, ch);
    svgEl("path",{ d:`M${x(0)} ${y(0)}L${x(WEEK)} ${y(100)}`, class:"c-ideal" }, ch);
    g.fill=svgEl("path",{ class:"c-fill" }, ch); g.used=svgEl("path",{ class:"c-used" }, ch); g.proj=svgEl("path",{ class:"c-proj" }, ch);
    g.now=svgEl("line",{ y1:Y0, y2:Y1, class:"c-now" }, ch); g.dot=svgEl("circle",{ r:3.5, fill:"#f2f2f4" }, ch);
    g.out=svgEl("circle",{ r:4, style:"fill:var(--accent)" }, ch); g.outT=svgEl("text",{ "text-anchor":"middle", class:"c-pct", style:"fill:var(--accent);font-weight:600" }, ch);
  })();

  function colS(f){ return f>=.9?"var(--accent)":f>=.7?"#F4A934":"#f2f2f4"; }
  function paint(force){
    const now=performance.now(); if(!force && now-Q.readAt<350) return; Q.readAt=now;
    const P=PROV[Q.prov], fc=forecast(), S=sess(), F={ s:S/100, w:Q.w/100, m:Q.m/MCAP };
    const colW = fc.projected>100||F.w>=.9 ? "var(--accent)" : (Q.w-fc.ideal>10||F.w>=.7) ? "#F4A934" : "#f2f2f4";
    Object.keys(R).forEach(k=>{ const f=clamp(F[k],0,1); arcs[k].setAttribute("stroke-dasharray",`${(arcs[k].C*.75*f).toFixed(1)} ${arcs[k].C}`); arcs[k].style.stroke = k==="w"?colW:colS(f); });
    lbls.s.textContent="SESSION"; lbls.w.textContent="WEEKLY"; lbls.m.textContent=P.model;
    const pf=Math.min(fc.projected,100)/100;
    if(pf>F.w+.005){ proj.setAttribute("d",arcPath(82,F.w,pf)); proj.style.stroke = fc.projected>100?"var(--accent)":fc.projected>90?"#F4A934":"rgba(242,242,244,.45)"; proj.style.display=""; } else proj.style.display="none";
    notch.setAttribute("transform",`rotate(${(angAt(fc.ideal/100)+90).toFixed(2)} 120 120)`);
    const sRe=sResetIn();
    const sel=Q.sel, f=F[sel];
    tL.textContent = sel==="s" ? "SESSION · 5 H" : sel==="w" ? "WEEKLY" : `${P.model} CAP`;
    tB.textContent = Math.round(clamp(f,0,1)*100)+"%"; tB.style.fill = sel==="w" ? (colW==="#f2f2f4"?"":colW) : (f>=.7?colS(f):"");
    tD1.textContent = sel==="s" ? (S>=100?"SESSION LIMIT REACHED":`${Math.round(100-S)}% LEFT THIS SESSION`) : sel==="w" ? `${Math.round(fc.projected)}% PROJECTED AT RESET` : `${(Q.m).toFixed(1)} / ${MCAP} · ${P.modelLong.toUpperCase()}`;
    tD2.textContent = sel==="s" ? (sRe>0?`RESETS IN ${dur(sRe).toUpperCase()}`:"STARTS WITH YOUR NEXT MESSAGE") : sel==="w" ? `RESETS MON 09:00 · IN ${dur(WEEK-Q.t).toUpperCase()}` : (F.m>=.9?"SWITCH TO A LIGHTER MODEL":"SHARE OF WEEKLY TOP MODEL");
    /* chart */
    const pts=[...Q.hist,{ t:Q.t, w:Q.w }];
    const d=pts.map((p,i)=>`${i?"L":"M"}${x(p.t).toFixed(1)} ${y(p.w).toFixed(1)}`).join("");
    g.used.setAttribute("d",d); g.fill.setAttribute("d",`${d}L${x(Q.t).toFixed(1)} ${y(0)}L${x(0)} ${y(0)}Z`);
    g.now.setAttribute("x1",x(Q.t)); g.now.setAttribute("x2",x(Q.t)); g.dot.setAttribute("cx",x(Q.t)); g.dot.setAttribute("cy",y(Q.w));
    const endT = fc.out ?? WEEK, endP = fc.out ? 100 : fc.projected;
    g.proj.setAttribute("d",`M${x(Q.t).toFixed(1)} ${y(Q.w).toFixed(1)}L${x(endT).toFixed(1)} ${y(endP).toFixed(1)}`);
    g.proj.style.stroke = fc.out ? "var(--accent)" : fc.projected>90 ? "#F4A934" : "rgba(242,242,244,.55)";
    g.out.style.display=g.outT.style.display = fc.out ? "" : "none";
    if(fc.out){ g.out.setAttribute("cx",x(fc.out)); g.out.setAttribute("cy",y(100)); g.outT.setAttribute("x",clamp(x(fc.out),X0+30,X1-30)); g.outT.setAttribute("y",y(100)-8); g.outT.textContent=`OUT ${when(fc.out).toUpperCase()}`; }
    /* verdict and details */
    const v=$("qtVerdict");
    if(Q.w>=100){ v.className="qt-verdict over"; v.innerHTML=`Weekly limit reached<small>access returns Mon 09:00 · in ${dur(WEEK-Q.t)}</small>`; }
    else if(fc.out){ v.className="qt-verdict over"; v.innerHTML=`Runs out ${when(fc.out)}<small>then ~${dur(WEEK-fc.out)} without access · ease off by ~${Math.round((1-(100-Q.w)/(fc.rate*(WEEK-Q.t)))*100)}% to make it</small>`; }
    else if(fc.projected>90){ v.className="qt-verdict near"; v.innerHTML=`Tight finish<small>~${Math.round(fc.projected)}% used by the reset · little room for heavy days</small>`; }
    else { v.className="qt-verdict"; const left=Math.round(100-fc.projected); v.innerHTML=`~${left}% left at the reset<small>${left>35?"room to lean on the top model more":"on pace for the week"}</small>`; }
    $("qtS").textContent = S>=99.5 ? `100% · session limit, resets in ${dur(sRe)}` : `${Math.round(S)}% · ${sRe>0?`resets in ${dur(sRe)}`:"starts with your next message"}`;
    $("qtW").textContent = `${Math.round(Q.w)}% · resets Mon 09:00, in ${dur(WEEK-Q.t)}`;
    $("qtM").textContent = `${Math.round(F.m*100)}% · ${P.modelLong}`;
    const diff=Math.round(Q.w-fc.ideal);
    $("qtP").textContent = `ideal ${Math.round(fc.ideal)}% by ${when(Q.t)} · you're ${Math.abs(diff)} pts ${diff>=0?"ahead":"behind"} · ${fc.rate.toFixed(2)}%/h`;
    $("qtRead").innerHTML=[["s","SESSION",S],["w","WEEKLY",Q.w],["m",P.model,F.m*100]].map(([k,n,p])=>k===Q.sel?`<b>${n} ${Math.round(p)}%</b>`:`${n} ${Math.round(p)}%`).join(" · ");
    const blocked = Q.w>=100 ? "weekly" : S>=99.5 ? "session" : "";
    if(blocked && blocked!==Q.wasBlocked) clack(); Q.wasBlocked=blocked;
  }
  function qtTick(dt){ if(!Q.manual) advance(dt*Q.speed); paint(); return visible.get($("qt")); }
  $$("[data-qring]").forEach(b=>b.onclick=()=>{ Q.sel=b.dataset.qring; $$("[data-qring]").forEach(x=>{ x.setAttribute("aria-pressed",String(x===b)); x.querySelector("i").classList.toggle("on",x===b); }); tick(); paint(true); });
  const setProv=i=>{ Q.prov=i; $$("[data-qprov]").forEach(b=>b.setAttribute("aria-pressed",String(+b.dataset.qprov===i))); tick(); paint(true); };
  $$("[data-qprov]").forEach(b=>b.onclick=()=>setProv(+b.dataset.qprov));
  $("qtProv").onclick=()=>setProv((Q.prov+1)%PROV.length);
  $$("[data-qstyle]").forEach(b=>b.onclick=()=>{ Q.style=+b.dataset.qstyle; $$("[data-qstyle]").forEach(x=>x.setAttribute("aria-pressed",String(x===b))); tick(); paint(true); });
  $$("[data-qspeed]").forEach(b=>b.onclick=()=>{ const fast=Q.speed<1; Q.speed=fast?1:1/30; b.setAttribute("aria-pressed",String(fast)); tick(); });
  $("qtWeek").onclick=()=>{ Q.manual=null; newWeek(); clack(); paint(true); };
  window.QuotaGauge={
    set({ session, weekly, model, elapsedHours, provider, sessionResetsInHours }={}){ Q.manual=true;
      if(elapsedHours!=null){ Q.t=clamp(+elapsedHours,0,WEEK); }
      if(weekly!=null){ Q.w=clamp(+weekly,0,100); Q.hist.push({ t:Q.t, w:Q.w }); }
      if(session!=null){ Q.sUsed=clamp(+session,0,100)/100*SCAP; Q.sStart=Q.t-(5-clamp(+(sessionResetsInHours??5),0,5)); }
      if(model!=null){ Q.m=clamp(+model,0,100)/100*MCAP; }
      if(provider!=null){ const i=PROV.findIndex(p=>p.name===String(provider).toUpperCase()); if(i>=0) setProv(i); }
      paint(true); },
    simulate(){ Q.manual=null; }
  };
  seed(); bindFinish("qtFinish","qt"); watch($("qt"), ()=>addLoop(qtTick)); paint(true);
})();

paintAccent();
})();

}
try{animate=(await motionPromise).animate;}catch(error){console.warn("Motion unavailable; controls use immediate transitions",error);}
{
const root=globalThis.document.getElementById("source-foundation");
const document=scopedDocument(root);
const addEventListener=scopedListener(root);
const SNAP = { type:"spring", stiffness:700, damping:35, mass:0.8 };
const HEAVY = { type:"spring", stiffness:300, damping:30, mass:1.2 };
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const T = (s) => reduce ? { duration:0 } : s;
let ACCENT = "#cc0000";
const $ = id => document.getElementById(id);
const ang = v => -135 + v * 270;           // 0..1 → -135..+135deg
const clamp01 = v => Math.min(1, Math.max(0, v));

/* accent switch */
function paintAccent(){
  document.documentElement.style.setProperty("--accent", ACCENT);
  [ ["accRed","#cc0000"] ].forEach(([id,c]) =>
    $(id).setAttribute("aria-pressed", String(ACCENT===c)));
  drawStepTicks(); // recolor active ticks
  document.querySelectorAll(".tdot.on").forEach(d=>d.style.background=ACCENT);
}
$("accRed").onclick = () => { ACCENT="#cc0000"; paintAccent(); };

/* paired material finishes: every instrument keeps its state while its shell changes */
function bindFinish(groupId,targetId){
  const group=$(groupId),target=$(targetId);
  group.addEventListener("click",e=>{
    const button=e.target.closest("button[data-finish]"); if(!button) return;
    target.dataset.finish=button.dataset.finish;
    group.querySelectorAll("button[data-finish]").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));
  });
}
bindFinish("darkDialFinish","darkDial");
bindFinish("lightDialFinish","lightDial");
bindFinish("choirFinish","stepDial");
bindFinish("triuneFinish","triple");
bindFinish("clockFinish","clockCase");
bindFinish("codeVeilFinish","codeToggle");
bindFinish("keyboardFinish","mechanicalKeyboard");

/* tick-ring helpers (SVG) */
const NS="http://www.w3.org/2000/svg";
function polar(cx,cy,r,deg){ const a=(deg-90)*Math.PI/180; return [cx+r*Math.cos(a), cy+r*Math.sin(a)]; }
function drawDarkTicks(){
  const svg=$("darkTicks"); svg.innerHTML="";
  for(let i=0;i<15;i++){ const d=-135+i*(270/16);
    const [x,y]=polar(110,110,96,d);
    const c=document.createElementNS(NS,"circle");
    c.setAttribute("cx",x);c.setAttribute("cy",y);c.setAttribute("r",2.4);c.setAttribute("fill","#111");svg.appendChild(c);
  }
  [[-135],[135]].forEach(([d])=>{ const [x1,y1]=polar(110,110,88,d),[x2,y2]=polar(110,110,102,d);
    const l=document.createElementNS(NS,"line");
    l.setAttribute("x1",x1);l.setAttribute("y1",y1);l.setAttribute("x2",x2);l.setAttribute("y2",y2);
    l.setAttribute("stroke","#111");l.setAttribute("stroke-width","2.4");svg.appendChild(l); });
}

/* generic continuous dial driver */
function driveDial(el, knob, valEl, fmt){
  let v = parseFloat(el.dataset.v ?? el.getAttribute("aria-valuenow"))/100 || 0;
  function render(instant=false){
    const a=ang(v);
    if(instant||reduce) knob.style.transform=`rotate(${a}deg)`;
    else animate(knob, { rotate:a }, HEAVY);
    el.setAttribute("aria-valuenow", Math.round(v*100));
    el.setAttribute("aria-valuetext", Math.round(v*100)+" percent");
    valEl.textContent = fmt(v);
  }
  function bind(){
    let sy=0, sv=0, dragging=false;
    el.addEventListener("pointerdown", e=>{ dragging=true; sy=e.clientY; sv=v; el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", e=>{ if(!dragging) return;
      v=clamp01(sv+(sy-e.clientY)/150); knob.style.transform=`rotate(${ang(v)}deg)`;
      el.setAttribute("aria-valuenow", Math.round(v*100)); valEl.textContent=fmt(v); });
    el.addEventListener("pointerup", ()=>{ dragging=false; render(); });
    el.addEventListener("keydown", e=>{
      if(e.key==="ArrowRight"||e.key==="ArrowUp"){ v=clamp01(v+.02); render(); e.preventDefault(); }
      if(e.key==="ArrowLeft"||e.key==="ArrowDown"){ v=clamp01(v-.02); render(); e.preventDefault(); }
      if(e.key==="Home"){ v=0; render(); e.preventDefault(); }
      if(e.key==="End"){ v=1; render(); e.preventDefault(); } });
  }
  return { render, bind, get:()=>v, set:(nv,instant)=>{ v=clamp01(nv); render(instant); } };
}

/* dark dial: states MIN 5% / HIGH 80% */
drawDarkTicks();
const dark = driveDial($("darkDial"), $("darkKnob"), $("darkVal"), v=>Math.round(v*100)+"%");
dark.bind(); $("darkDial").dataset.v=0.05; dark.set(0.05,true);
$("darkMin").onclick=()=>dark.set(0.05);
$("darkHigh").onclick=()=>dark.set(0.80);

/* light dial */
const light = driveDial($("lightDial"), $("lightKnob"), $("lightVal"), v=>Math.round(v*100)+"%");
light.bind(); $("lightDial").dataset.v=0.5; light.set(0.5,true);

/* stepper: N detents */
let N=7, idx=3; // 0-based
function drawStepTicks(){
  const svg=$("stepTicks"); svg.innerHTML="";
  for(let i=0;i<N;i++){ const d = N===1?0:-135+i*(270/(N-1));
    const [x,y]=polar(110,110,96,d);
    const passed = i<idx, active = i===idx;
    const c=document.createElementNS(NS,"circle");
    c.setAttribute("cx",x);c.setAttribute("cy",y);
    c.setAttribute("r",active?4.4:2.6);
    c.setAttribute("fill", active?ACCENT:(passed?ACCENT:"#bbb"));
    if(passed) c.setAttribute("opacity","0.45");
    c.style.cursor="pointer"; c.style.pointerEvents="all";
    c.addEventListener("click", ()=>{ idx=i; renderStep(); });
    // invisible fat hit area
    const h=document.createElementNS(NS,"circle");
    h.setAttribute("cx",x);h.setAttribute("cy",y);h.setAttribute("r",11);h.setAttribute("fill","transparent");
    h.style.cursor="pointer"; h.style.pointerEvents="all";
    h.addEventListener("click", ()=>{ idx=i; renderStep(); });
    svg.appendChild(h); svg.appendChild(c);
  }
}
function renderStep(instant=false){
  const v = N===1?0.5:idx/(N-1), a=ang(v);
  if(instant||reduce) $("stepKnob").style.transform=`rotate(${a}deg)`;
  else animate($("stepKnob"), { rotate:a }, SNAP);
  drawStepTicks();
  $("stepVal").textContent=`Step ${idx+1} of ${N}`;
  const d=$("stepDial");
  d.setAttribute("aria-valuemax",N); d.setAttribute("aria-valuenow",idx+1);
  d.setAttribute("aria-valuetext",`Step ${idx+1} of ${N}`);
}
$("nbar").addEventListener("click", e=>{
  const b=e.target.closest("button"); if(!b) return;
  N=+b.dataset.n; idx=Math.min(idx,N-1);
  [...$("nbar").children].forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  renderStep();
});
$("stepPrev").onclick=()=>{ idx=(idx-1+N)%N; renderStep(); };
$("stepNext").onclick=()=>{ idx=(idx+1)%N; renderStep(); };
(function(){
  const el=$("stepDial"); let sy=0, si=0, dragging=false;
  el.addEventListener("pointerdown", e=>{ dragging=true; sy=e.clientY; si=idx; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", e=>{ if(!dragging) return;
    const dv=(sy-e.clientY)/40, ni=Math.min(N-1,Math.max(0,Math.round(si+dv)));
    if(ni!==idx){ idx=ni; renderStep(); } });
  el.addEventListener("pointerup", ()=>dragging=false);
  el.addEventListener("keydown", e=>{
    if(e.key==="ArrowRight"||e.key==="ArrowUp"){ idx=Math.min(N-1,idx+1); renderStep(); e.preventDefault(); }
    if(e.key==="ArrowLeft"||e.key==="ArrowDown"){ idx=Math.max(0,idx-1); renderStep(); e.preventDefault(); }
    if(e.key==="PageUp"){ idx=Math.min(N-1,idx+2); renderStep(); e.preventDefault(); }
    if(e.key==="PageDown"){ idx=Math.max(0,idx-2); renderStep(); e.preventDefault(); }
    if(e.key==="Home"){ idx=0; renderStep(); e.preventDefault(); }
    if(e.key==="End"){ idx=N-1; renderStep(); e.preventDefault(); } });
})();
[...$("nbar").children].forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.n==="7")));
renderStep(true);

/* N-pill bar */
let M=5, mi=2;
function renderPill(instant=false){
  const wrap=$("npill"); wrap.innerHTML="";
  const names = M<=5 ? ["I","II","III","IV","V"].slice(0,M) : Array.from({length:M},(_,i)=>"0"+(i+1));
  names.forEach((n,i)=>{
    const b=document.createElement("button");
    b.type="button"; b.setAttribute("role","radio");
    b.setAttribute("aria-checked", String(i===mi));
    b.className=i===mi?"is-active":"";
    b.innerHTML=`<span style="position:relative;z-index:1">${n}</span>`;
    b.onclick=()=>{ mi=i; renderPill(); };
    wrap.appendChild(b);
  });
  let pill=wrap.querySelector(".npill");
  if(!pill){ pill=document.createElement("div"); pill.className="npill"; wrap.appendChild(pill); }
  const btns=[...wrap.querySelectorAll("button")];
  const target=btns[mi];
  const move=()=>{ pill.style.left=target.offsetLeft+"px"; pill.style.width=target.offsetWidth+"px"; };
  const toL=target.offsetLeft, toW=target.offsetWidth;
  if(instant||reduce){ move(); }
  else { // glide: Motion interpolates left/width on one spring
    animate(pill, { left:toL+"px", width:toW+"px" }, SNAP);
  }
  $("npillVal").textContent=`Option ${mi+1} of ${M}`;
}
$("nbar2").addEventListener("click", e=>{
  const b=e.target.closest("button"); if(!b) return;
  M=+b.dataset.n; mi=Math.min(mi,M-1);
  [...$("nbar2").children].forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  renderPill(true);
});
[...$("nbar2").children].forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.n==="5")));
renderPill(true);
addEventListener("resize", ()=>renderPill(true));

/* triple switch: 3 independent vertical binaries, spring y-snap + dot cross-fade */
const TRAVEL = 38; // (176 - 100) / 2
const tripleUnits = [...document.querySelectorAll("#triple .tunit")].map((unit) => {
  const thumb = unit.querySelector(".tthumb"), dot = unit.querySelector(".tdot");
  let on = false;
  function render(instant=false){
    thumb.setAttribute("aria-checked", String(on));
    dot.classList.toggle("on", on);
    if(instant||reduce){
      thumb.style.transform=`translateY(${on?-TRAVEL:TRAVEL}px)`;
      dot.style.background=on?ACCENT:"#c8c8c9";
    } else {
      animate(thumb, { y:on?-TRAVEL:TRAVEL }, SNAP);
      animate(dot, { backgroundColor:on?ACCENT:"#c8c8c9" }, { duration:.2 });
    }
    $("tripleVal").textContent = tripleUnits.map(u=>u.isOn()?"ON":"OFF").join(" – ");
  }
  let sy=0, y0=0, dragging=false, moved=false;
  thumb.addEventListener("pointerdown", e=>{ dragging=true; moved=false; sy=e.clientY; y0=on?-TRAVEL:TRAVEL; thumb.setPointerCapture(e.pointerId); });
  thumb.addEventListener("pointermove", e=>{ if(!dragging) return;
    const dy=e.clientY-sy; if(Math.abs(dy)>4) moved=true;
    const y=Math.min(TRAVEL,Math.max(-TRAVEL,y0+dy));
    thumb.style.transform=`translateY(${y}px)`; });
  thumb.addEventListener("pointerup", e=>{ if(!dragging) return; dragging=false;
    if(!moved){ on=!on; } else { on=(e.clientY-sy)<0; }
    render(); });
  thumb.addEventListener("keydown", e=>{
    if(e.key===" "||e.key==="Enter"){ on=!on; render(); e.preventDefault(); }
    else if(e.key==="ArrowUp"||e.key==="ArrowRight"){ on=true; render(); e.preventDefault(); }
    else if(e.key==="ArrowDown"||e.key==="ArrowLeft"){ on=false; render(); e.preventDefault(); } });
  thumb.setAttribute("aria-checked","false");
  thumb.style.transform=`translateY(${TRAVEL}px)`;
  return { render, isOn:()=>on, set:(v,instant)=>{ on=v; render(instant); } };
});
tripleUnits.forEach(u=>u.render(true));
function triSet(pattern){ tripleUnits.forEach((u,i)=>u.set(pattern[i],false)); }
$("triPreset1").onclick=()=>triSet([false,true,false]);   // your shot 1: OFF–ON–OFF
$("triPreset2").onclick=()=>triSet([true,false,true]);    // your shot 2: ON–OFF–ON
$("triPreset3").onclick=()=>triSet([true,false,false]);   // your shot 3: ON–OFF–OFF

/* rotary radio player: grill + OFFLINE/ON power + WebAudio bed + volume */
let radioOn=false, rvol=0.25, radioTheme="light";
const radioPalettes={
  light:{ledOn:"#CC0000",ledOff:"#3a3a3a",powerOn:"#CC0000",powerOff:"#111111"},
  red:{ledOn:"#ffffff",ledOff:"rgba(255,255,255,.28)",powerOn:"#ffffff",powerOff:"#760000"},
  black:{ledOn:"#ffffff",ledOff:"#55555a",powerOn:"#ffffff",powerOff:"#6f6f74"}
};
const rscale=$("rscale"), rknob=$("rknob");
for(let i=0;i<19;i++){ const t=document.createElement("div"); t.className="rtick";
  t.style.left=(i*(100/18))+"%"; rscale.appendChild(t); }
const rdash=document.createElement("div"); rdash.className="rdash"; rscale.appendChild(rdash);
const ledDots=[];
(function(){ const svg=$("rledSvg");
  for(let i=0;i<13;i++){ const c=document.createElementNS(NS,"circle");
    c.setAttribute("cx",3+i*4.3); c.setAttribute("cy",4); c.setAttribute("r",1.8);
    c.setAttribute("fill","#3a3a3a"); svg.appendChild(c); ledDots.push(c); }
})();
(function(){ const svg=$("rspk"); // halftone horn, pointing right
  for(let r=0;r<8;r++){ const n=8-r;
    for(let x=0;x<n;x++){ const c=document.createElementNS(NS,"circle");
      c.setAttribute("cx",4+x*3.6); c.setAttribute("cy",3+r*2.9); c.setAttribute("r",1.3);
      c.setAttribute("fill","#222"); svg.appendChild(c); } }
})();
/* WebAudio: soft static bed while ON (user-gesture started, gain follows knob) */
let AC=null, bedGain=null;
function ensureAudio(){
  if(AC) return;
  AC=new (window.AudioContext||window.webkitAudioContext)();
  const len=AC.sampleRate*2, buf=AC.createBuffer(1,len,AC.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*0.12;
  const src=AC.createBufferSource(); src.buffer=buf; src.loop=true;
  const f=AC.createBiquadFilter(); f.type="lowpass"; f.frequency.value=750;
  bedGain=AC.createGain(); bedGain.gain.value=0;
  src.connect(f); f.connect(bedGain); bedGain.connect(AC.destination); src.start();
}
function blip(freq){
  if(!AC||globalThis.__enochianSoundEnabled===false) return; const t=AC.currentTime;
  const o=AC.createOscillator(), g=AC.createGain();
  o.type="sine"; o.frequency.value=freq;
  g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.12,t+0.015);
  g.gain.exponentialRampToValueAtTime(0.0001,t+0.12);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t+0.14);
}
function renderRadio(instant=false){
  const palette=radioPalettes[radioTheme];
  $("radio").dataset.theme=radioTheme;
  $("radio").setAttribute("aria-label", ({light:"Ivory",red:"Cinnabar",black:"Obsidian"}[radioTheme])+" Enochian Radio Player");
  document.querySelectorAll("#radioThemes button").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.theme===radioTheme)));
  $("pwrBtn").setAttribute("aria-checked", String(radioOn));
  $("pdot").style.background=radioOn?palette.powerOn:palette.powerOff;
  $("pdot").style.boxShadow=radioOn?`0 0 7px ${palette.powerOn}`:"none";
  $("rl1").textContent = radioOn ? "ENOCHIAN" : "OFFLINE";
  $("rl2").textContent = radioOn ? "17:48 Sep 11" : "17:40 Sep 11";
  const finishName={light:"IVORY",red:"CINNABAR",black:"OBSIDIAN"}[radioTheme];
  $("radioVal").textContent = finishName+" · "+(radioOn ? ("ON · "+Math.round(rvol*100)+"%") : "OFF");
  const lit = radioOn ? Math.round(rvol*13) : 0;
  ledDots.forEach((c,i)=>c.setAttribute("fill",i<lit?palette.ledOn:palette.ledOff));
  rdash.style.left=(rvol*100)+"%";
  const a=ang(rvol);
  if(instant||reduce) rknob.style.transform=`rotate(${a}deg)`;
  else animate(rknob, { rotate:a }, HEAVY);
  rknob.setAttribute("aria-valuenow", Math.round(rvol*100));
  rknob.setAttribute("aria-valuetext", "Volume "+Math.round(rvol*100)+" percent");
  if(bedGain&&AC){
    const t=AC.currentTime;
    bedGain.gain.cancelScheduledValues(t);
    bedGain.gain.setTargetAtTime(radioOn&&globalThis.__enochianSoundEnabled!==false?rvol*0.06:0, t, 0.15);
  }
}
globalThis.addEventListener('enochian-sound-change',()=>renderRadio(true));
function setPower(on){
  radioOn=on;
  if(on){ ensureAudio(); AC.resume(); blip(880); } else { blip(440); }
  renderRadio();
}
$("radioThemes").addEventListener("click",e=>{
  const b=e.target.closest("button[data-theme]"); if(!b) return;
  radioTheme=b.dataset.theme; renderRadio();
});
$("pwrBtn").onclick=()=>setPower(!radioOn);
$("radioOff").onclick=()=>setPower(false);
$("radioOn").onclick=()=>{ setPower(true); rvol=0.25; renderRadio(); };
(function(){ let sy=0, sv=0, dragging=false;
  rknob.addEventListener("pointerdown", e=>{ dragging=true; sy=e.clientY; sv=rvol; rknob.setPointerCapture(e.pointerId); });
  rknob.addEventListener("pointermove", e=>{ if(!dragging) return;
    rvol=clamp01(sv+(sy-e.clientY)/150); renderRadio(true);
    rknob.style.transform=`rotate(${ang(rvol)}deg)`; });
  rknob.addEventListener("pointerup", ()=>{ dragging=false; renderRadio(); });
  rknob.addEventListener("keydown", e=>{
    if(e.key==="ArrowRight"||e.key==="ArrowUp"){ rvol=clamp01(rvol+.05); renderRadio(); e.preventDefault(); }
    if(e.key==="ArrowLeft"||e.key==="ArrowDown"){ rvol=clamp01(rvol-.05); renderRadio(); e.preventDefault(); }
    if(e.key==="Home"){ rvol=0; renderRadio(); e.preventDefault(); }
    if(e.key==="End"){ rvol=1; renderRadio(); e.preventDefault(); } });
})();
renderRadio(true);

/* square clock-radio: generated dial, live hands, 3 brand options */
const clkSvg=$("clkSvg"), CX=136, CY=136;
function clkEl(n,attrs){ const e=document.createElementNS(NS,n);
  for(const k in attrs) e.setAttribute(k,attrs[k]); clkSvg.appendChild(e); return e; }
(function buildDial(){
  for(let m=0;m<60;m++){ const a=m*6, maj=m%5===0, q=m%15===0;
    const r1=maj?100:103, r2=108;
    const [x1,y1]=polar(CX,CY,r1,a), [x2,y2]=polar(CX,CY,r2,a);
    clkEl("line",{x1,y1,x2,y2,stroke:"#111","stroke-width":q?3.4:(maj?2.4:1.2)});
  }
  const hourN={12:0,3:90,6:180,9:270};
  for(const n in hourN){ const [x,y]=polar(CX,CY,78,hourN[n]);
    const t=clkEl("text",{x,y:y+9,"text-anchor":"middle",fill:"#111","font-size":26,
      "font-family":"'IBM Plex Sans',-apple-system,Inter,sans-serif","font-weight":500}); t.textContent=n; }
  const minN={60:0,15:90,20:120,25:150,30:180,35:210,40:240,45:270,50:300,55:330};
  for(const n in minN){ const [x,y]=polar(CX,CY,120,minN[n]);
    const t=clkEl("text",{x,y:y+3,"text-anchor":"middle",fill:"#111","font-size":9,
      "font-family":"'IBM Plex Mono',ui-monospace,monospace"}); t.textContent=n; }
})();
const ARC_R=93, ARC_C=2*Math.PI*ARC_R;
const arc=clkEl("circle",{cx:CX,cy:CY,r:ARC_R,fill:"none",stroke:ACCENT,"stroke-width":9,
  "stroke-dasharray":ARC_C,"stroke-dashoffset":ARC_C,"stroke-linecap":"round",
  transform:`rotate(-90 ${CX} ${CY})`,opacity:.9});
/* Enochian identity sigil: nested open rings + EN monogram */
function enochianSigilSVG(){
  const C1=(2*Math.PI*38), C2=(2*Math.PI*21), gap1=C1*35/360, gap2=C2*42/360;
  return `<svg viewBox="0 0 100 100" width="39" height="39" role="img" aria-label="Enochian sigil">`
    +`<circle cx="50" cy="50" r="38" fill="none" stroke="#111" stroke-width="13" stroke-dasharray="${C1-gap1} ${gap1}" stroke-dashoffset="${-C1*17.5/360}"/>`
    +`<circle cx="50" cy="50" r="21" fill="none" stroke="#111" stroke-width="8" stroke-dasharray="${C2-gap2} ${gap2}" stroke-dashoffset="${-C2*21/360}"/>`
    +`<text x="50" y="58" text-anchor="middle" font-family="'IBM Plex Sans',-apple-system,Inter,sans-serif" font-weight="800" font-size="18" fill="#111">EN</text></svg>`;
}
const brands=[
  { name:"Enochian sigil", html:enochianSigilSVG() },
  { name:"“ENOCHIAN” wordmark", html:`<div class="b1">ENOCHIAN</div><div class="b2">HOROLOGION</div>` },
  { name:"“EN” initialism", html:`<div class="b1" style="font-size:22px;letter-spacing:6px">EN</div><div class="b2">HOROLOGION</div>` },
];
let bi=0;
function renderBrand(){ $("clkBrand").innerHTML=brands[bi].html; $("brandVal").textContent=brands[bi].name; }
$("brandPrev").onclick=()=>{ bi=(bi-1+brands.length)%brands.length; renderBrand(); };
$("brandNext").onclick=()=>{ bi=(bi+1)%brands.length; renderBrand(); };
renderBrand();
let playing=false;
$("clkSpk").onclick=()=>{ playing=!playing;
  $("clkState").textContent=playing?"PLAYING":"NOT PLAYING";
  ensureAudio(); if(AC){ AC.resume(); blip(playing?990:440); } };
function tickClock(){
  const d=new Date(), s=d.getSeconds()+d.getMilliseconds()/1000,
        m=d.getMinutes()+s/60, h=(d.getHours()%12)+m/60;
  $("hSec").style.transform=`rotate(${s*6}deg)`;
  $("hTail").style.transform=`rotate(${s*6+180}deg)`;
  $("hMin").style.transform=`rotate(${m*6}deg)`;
  $("hHour").style.transform=`rotate(${h*30}deg)`;
  arc.setAttribute("stroke-dashoffset", ARC_C*(1-s/60));
  arc.setAttribute("stroke", ACCENT);
  const p=n=>String(n).padStart(2,"0");
  $("clkDigital").textContent=`${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  requestAnimationFrame(tickClock);
}
tickClock();

/* stopwatch timer: real elapsed time, increasing red arc, 60s/5m/10m/25m */
const timerSvg=$("timerSvg"),TCX=152,TCY=152;
function timerEl(name,attrs,parent=timerSvg){const e=document.createElementNS(NS,name);for(const k in attrs)e.setAttribute(k,attrs[k]);parent.appendChild(e);return e;}
const TIMER_R=137,TIMER_C=2*Math.PI*TIMER_R;
const timerProgress=timerEl("circle",{cx:TCX,cy:TCY,r:TIMER_R,fill:"none",class:"timer-progress","stroke-width":7,
  "stroke-dasharray":TIMER_C,"stroke-dashoffset":TIMER_C,"stroke-linecap":"round",transform:`rotate(-90 ${TCX} ${TCY})`});
(function buildTimerFace(){
  timerEl("circle",{cx:TCX,cy:TCY,r:142,fill:"none",class:"timer-subface","stroke-width":1});
  for(let s=0;s<60;s++){
    const major=s%5===0,quarter=s%15===0,a=s*6,r1=quarter?123:(major?127:131),r2=138;
    const [x1,y1]=polar(TCX,TCY,r1,a),[x2,y2]=polar(TCX,TCY,r2,a);
    timerEl("line",{x1,y1,x2,y2,class:"timer-tick","stroke-width":quarter?3:(major?2:1)});
    if(major){const [x,y]=polar(TCX,TCY,112,a);const t=timerEl("text",{x,y:y+7,"text-anchor":"middle",class:"timer-number",
      "font-size":s===0?25:20,"font-family":"'IBM Plex Sans',sans-serif","font-weight":600});t.textContent=s===0?"60":String(s);}
  }
  const SCY=103,SR=39;
  timerEl("circle",{cx:TCX,cy:SCY,r:SR,class:"timer-subface","stroke-width":1.5});
  for(let m=0;m<30;m++){
    const major=m%5===0,a=m*12,r1=major?31:34,r2=38;
    const [x1,y1]=polar(TCX,SCY,r1,a),[x2,y2]=polar(TCX,SCY,r2,a);
    timerEl("line",{x1,y1,x2,y2,class:"timer-subtick","stroke-width":major?1.5:.7});
    if(major){const [x,y]=polar(TCX,SCY,24,a);const t=timerEl("text",{x,y:y+4,"text-anchor":"middle",class:"timer-subnum",
      "font-size":9,"font-family":"'IBM Plex Mono',monospace","font-weight":600});t.textContent=m===0?"30":String(m);}
  }
})();
const timerSubHand=timerEl("line",{x1:TCX,y1:103,x2:TCX,y2:76,class:"timer-hand-min","stroke-width":3,"stroke-linecap":"round"});
const timerSecHand=timerEl("line",{x1:TCX,y1:TCY+18,x2:TCX,y2:TCY-116,class:"timer-hand-sec","stroke-width":3,"stroke-linecap":"round"});
timerEl("circle",{cx:TCX,cy:103,r:5,class:"timer-hub-outer","stroke-width":2});
timerEl("circle",{cx:TCX,cy:TCY,r:12,class:"timer-hub-outer","stroke-width":2});
timerEl("circle",{cx:TCX,cy:TCY,r:5,class:"timer-hub-inner"});
let timerDuration=60000,timerRemaining=60000,timerEnd=0,timerMode="ready",timerTheme="white",timerPresetLabel="60 SECOND TEST",timerAlarmed=false;
function timerFormat(ms){const tenths=Math.max(0,Math.ceil(ms/100)),mins=Math.floor(tenths/600),secs=Math.floor((tenths%600)/10),tenth=tenths%10;return `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}.${tenth}`;}
function setTimerLine(line,cx,cy,r,angle){const [x,y]=polar(cx,cy,r,angle);line.setAttribute("x2",x);line.setAttribute("y2",y);}
function renderTimer(){
  if(timerMode==="running")timerRemaining=Math.max(0,timerEnd-Date.now());
  const progress=clamp01(1-timerRemaining/timerDuration),elapsed=(timerDuration-timerRemaining)/1000;
  $("timerCase").dataset.progress=progress.toFixed(3);
  timerProgress.setAttribute("stroke-dashoffset",TIMER_C*(1-progress));
  setTimerLine(timerSecHand,TCX,TCY,116,(elapsed%60)*6);
  setTimerLine(timerSubHand,TCX,103,27,((timerRemaining/60000)%30)*12);
  const display=timerFormat(timerRemaining);$("timerDigital").textContent=display;
  $("timerDigital").setAttribute("aria-label",display.replace(":"," minutes ").replace("."," point ")+" seconds remaining");
  const startLabel=timerMode==="running"?"Stop timer":(timerMode==="done"?"Start timer again":"Start timer");
  $("timerStart").dataset.state=timerMode;
  $("timerStart").setAttribute("aria-label",startLabel);
  $("timerStartGlyph").textContent=timerMode==="running"?"■":"▶";
  $("timerState").textContent=timerMode==="ready"?`READY · ${timerPresetLabel}`:timerMode.toUpperCase();
  if(timerMode==="running"&&timerRemaining<=0){
    timerMode="done";$("timerState").textContent="DONE";$("timerStart").dataset.state="done";
    $("timerStart").setAttribute("aria-label","Start timer again");$("timerStartGlyph").textContent="▶";
    if(!timerAlarmed){timerAlarmed=true;blip(880);setTimeout(()=>blip(1100),150);}
  }
}
$("timerPresets").addEventListener("click",e=>{const b=e.target.closest("button[data-seconds]");if(!b)return;
  timerDuration=Number(b.dataset.seconds)*1000;timerRemaining=timerDuration;timerMode="ready";timerAlarmed=false;
  timerPresetLabel=b.textContent==="60 SEC"?"60 SECOND TEST":b.textContent+" TEST";
  document.querySelectorAll("#timerPresets button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));renderTimer();});
$("timerThemes").addEventListener("click",e=>{const b=e.target.closest("button[data-theme]");if(!b)return;timerTheme=b.dataset.theme;
  $("timerCase").dataset.theme=timerTheme;document.querySelectorAll("#timerThemes button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));});
$("timerStart").onclick=()=>{ensureAudio();if(AC)AC.resume();
  if(timerMode==="running"){timerRemaining=Math.max(0,timerEnd-Date.now());timerMode="paused";blip(440);}
  else{if(timerMode==="done"||timerRemaining<=0)timerRemaining=timerDuration;timerEnd=Date.now()+timerRemaining;timerMode="running";timerAlarmed=false;blip(660);}renderTimer();};
$("timerReset").onclick=()=>{timerRemaining=timerDuration;timerMode="ready";timerAlarmed=false;renderTimer();};
(function timerLoop(){renderTimer();requestAnimationFrame(timerLoop);})();

/* Pressure sound: an original synthesized countdown in the spirit of TV-thriller clocks (no recorded audio).
   Every second: a hard electronic tick over a low thump. Last 10 s: double time, higher, digits red. Zero: a low boom. */
function pressureVoice(t,freq,gain,thump){
  if(!AC||globalThis.__enochianSoundEnabled===false) return;
  const o=AC.createOscillator(),o2=AC.createOscillator(),bp=AC.createBiquadFilter(),g=AC.createGain();
  o.type="square";o.frequency.setValueAtTime(freq,t);o2.type="square";o2.frequency.setValueAtTime(freq*1.498,t);
  bp.type="bandpass";bp.frequency.value=freq*1.6;bp.Q.value=2.2;
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.003);g.gain.exponentialRampToValueAtTime(.0001,t+.085);
  o.connect(bp);o2.connect(bp);bp.connect(g);g.connect(AC.destination);o.start(t);o2.start(t);o.stop(t+.1);o2.stop(t+.1);
  if(thump){const s=AC.createOscillator(),sg=AC.createGain();s.type="sine";s.frequency.setValueAtTime(130,t);s.frequency.exponentialRampToValueAtTime(52,t+.11);
    sg.gain.setValueAtTime(.0001,t);sg.gain.exponentialRampToValueAtTime(thump,t+.004);sg.gain.exponentialRampToValueAtTime(.0001,t+.16);s.connect(sg);sg.connect(AC.destination);s.start(t);s.stop(t+.18);}
}
function pressureTick(secLeft){
  if(!AC) return; const t=AC.currentTime+.005, hot=secLeft<=10, last=secLeft<=3;
  pressureVoice(t, hot?1180:940, last?.16:hot?.12:.09, hot?.22:.14);
  if(hot) pressureVoice(t+.5, hot?1320:1050, last?.12:.08, 0);   // the second, off-beat tick of the final ten
}
function pressureBoom(){
  if(!AC||globalThis.__enochianSoundEnabled===false) return; const t=AC.currentTime+.01;
  const o=AC.createOscillator(),g=AC.createGain();o.type="sine";o.frequency.setValueAtTime(70,t);o.frequency.exponentialRampToValueAtTime(34,t+1.1);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.38,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+1.4);o.connect(g);g.connect(AC.destination);o.start(t);o.stop(t+1.5);
  const len=AC.sampleRate*.6|0,b=AC.createBuffer(1,len,AC.sampleRate),d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,3);
  const n=AC.createBufferSource(),f=AC.createBiquadFilter(),ng=AC.createGain();n.buffer=b;f.type="lowpass";f.frequency.value=420;ng.gain.value=.3;n.connect(f);f.connect(ng);ng.connect(AC.destination);n.start(t);
}
function pressureToggle(btnId,caseId,get,set){
  $(btnId).onclick=()=>{ensureAudio();if(AC)AC.resume();const on=!get();set(on);$(btnId).setAttribute("aria-pressed",String(on));
    $(btnId).textContent=on?"PRESSURE SOUND · ON":"PRESSURE SOUND · OFF";if(!on)$(caseId).dataset.pressure="";if(on)pressureTick(30);};
}
/* Enochian Countdown Timer (60 s and up): watch its countdown from outside, so the original timer code stays untouched */
(function(){
  let on=false,lastSec=-1,lastMode="ready";
  pressureToggle("timerPressure","timerCase",()=>on,v=>on=v);
  (function watch(){
    const sec=Math.ceil(timerRemaining/1000);
    if(on&&timerMode==="running"&&sec!==lastSec&&sec>0){pressureTick(sec);}
    if(on&&lastMode==="running"&&timerMode==="done")pressureBoom();
    $("timerCase").dataset.pressure = on&&timerMode==="running"&&sec<=10 ? "hot" : "";
    lastSec=sec;lastMode=timerMode;requestAnimationFrame(watch);
  })();
})();

/* shared builders for the Vigil family: face ring, progress arc, hands, hubs */
function vigilEl(svg,name,attrs){const e=document.createElementNS(NS,name);for(const k in attrs)e.setAttribute(k,attrs[k]);svg.appendChild(e);return e;}
function vigilArcPath(cx,cy,r,a0,a1){const [x0,y0]=polar(cx,cy,r,a0),[x1,y1]=polar(cx,cy,r,a1);return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1-a0>180?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;}
function vigilThemes(groupId,caseId){$(groupId).addEventListener("click",e=>{const b=e.target.closest("button[data-theme]");if(!b)return;$(caseId).dataset.theme=b.dataset.theme;
  document.querySelectorAll("#"+groupId+" button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));});}
function vigilFormat(ms){const tenths=Math.max(0,Math.ceil(ms/100)),mins=Math.floor(tenths/600),secs=Math.floor((tenths%600)/10),tenth=tenths%10;return `${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}.${tenth}`;}

/* Enochian 90 Second Timer: one sweep of the red hand is the whole 90-second interval */
(function(){
  const svg=$("v90Svg"),CX=152,CY=152,R=137,C=2*Math.PI*R,SCY=103;
  const prog=vigilEl(svg,"circle",{cx:CX,cy:CY,r:R,fill:"none",class:"timer-progress","stroke-width":7,"stroke-dasharray":C,"stroke-dashoffset":C,"stroke-linecap":"round",transform:`rotate(-90 ${CX} ${CY})`});
  vigilEl(svg,"circle",{cx:CX,cy:CY,r:142,fill:"none",class:"timer-subface","stroke-width":1});
  for(let s=0;s<90;s++){
    const major=s%10===0,quarter=s%30===0,a=s*4,r1=quarter?123:(major?127:132);
    const [x1,y1]=polar(CX,CY,r1,a),[x2,y2]=polar(CX,CY,138,a);
    vigilEl(svg,"line",{x1,y1,x2,y2,class:"timer-tick","stroke-width":quarter?3:(major?2:1)});
    if(major){const [x,y]=polar(CX,CY,112,a);vigilEl(svg,"text",{x,y:y+7,"text-anchor":"middle",class:"timer-number","font-size":s===0?25:20,"font-family":"'IBM Plex Sans',sans-serif","font-weight":600}).textContent=s===0?"90":String(s);}
  }
  vigilEl(svg,"circle",{cx:CX,cy:SCY,r:39,class:"timer-subface","stroke-width":1.5});
  for(let i=0;i<12;i++){const major=i%3===0,a=i*30,[x1,y1]=polar(CX,SCY,major?31:34,a),[x2,y2]=polar(CX,SCY,38,a);
    vigilEl(svg,"line",{x1,y1,x2,y2,class:"timer-subtick","stroke-width":major?1.5:.7});
    if(major){const [x,y]=polar(CX,SCY,24,a);vigilEl(svg,"text",{x,y:y+4,"text-anchor":"middle",class:"timer-subnum","font-size":9,"font-family":"'IBM Plex Mono',monospace","font-weight":600}).textContent=i===0?"12":String(i);}}
  vigilEl(svg,"text",{x:CX,y:SCY+14,"text-anchor":"middle",class:"timer-subnum","font-size":5.5,"font-family":"'IBM Plex Mono',monospace","font-weight":600,"letter-spacing":1}).textContent="ROUNDS";
  const sub=vigilEl(svg,"line",{x1:CX,y1:SCY,x2:CX,y2:SCY-27,class:"timer-hand-min","stroke-width":3,"stroke-linecap":"round"});
  const hand=vigilEl(svg,"line",{x1:CX,y1:CY+18,x2:CX,y2:CY-116,class:"timer-hand-sec","stroke-width":3,"stroke-linecap":"round"});
  vigilEl(svg,"circle",{cx:CX,cy:SCY,r:5,class:"timer-hub-outer","stroke-width":2});
  vigilEl(svg,"circle",{cx:CX,cy:CY,r:12,class:"timer-hub-outer","stroke-width":2});
  vigilEl(svg,"circle",{cx:CX,cy:CY,r:5,class:"timer-hub-inner"});
  const V={dur:90000,rem:90000,end:0,mode:"ready",rounds:1,round:1,done:0,tickAt:-1,pressure:false,pSec:-1};
  pressureToggle("v90Pressure","v90Case",()=>V.pressure,v=>V.pressure=v);
  const setLine=(l,cx,cy,r,a)=>{const [x,y]=polar(cx,cy,r,a);l.setAttribute("x2",x);l.setAttribute("y2",y);};
  const roundsText=()=>V.rounds===1?"":V.rounds?` · ROUND ${V.round} OF ${V.rounds}`:` · ROUND ${V.round}`;
  function render(){
    if(V.mode==="running"){V.rem=Math.max(0,V.end-Date.now());
      const s=Math.ceil(V.rem/1000);
      if(V.pressure){if(s>0&&s!==V.pSec){V.pSec=s;pressureTick(s);}}
      else if(s<=3&&s>0&&s!==V.tickAt){V.tickAt=s;blip(1320);}
      if(V.rem<=0){V.done++;
        if(V.rounds===0||V.round<V.rounds){V.round++;V.rem=V.dur;V.end=Date.now()+V.dur;V.tickAt=-1;blip(880);setTimeout(()=>blip(1100),140);}
        else{V.mode="done";if(V.pressure)pressureBoom();else{blip(880);setTimeout(()=>blip(1100),150);setTimeout(()=>blip(1320),300);}}}}
    $("v90Case").dataset.pressure = V.pressure&&V.mode==="running"&&Math.ceil(V.rem/1000)<=10 ? "hot" : "";
    const p=clamp01(1-V.rem/V.dur);
    prog.setAttribute("stroke-dashoffset",C*(1-p));
    setLine(hand,CX,CY,116,p*360);setLine(sub,CX,SCY,27,(V.done%12)*30);
    const d=vigilFormat(V.rem);$("v90Digital").textContent=d;$("v90Digital").setAttribute("aria-label",`${Math.ceil(V.rem/1000)} seconds remaining`);
    $("v90Start").dataset.state=V.mode;$("v90Glyph").textContent=V.mode==="running"?"■":"▶";
    $("v90Start").setAttribute("aria-label",V.mode==="running"?"Stop timer":V.mode==="done"?"Start again":"Start timer");
    $("v90State").textContent=V.mode==="ready"?`READY · ${V.rounds===1?"90 SECONDS":V.rounds?`${V.rounds} ROUNDS × 90 SEC`:"LOOPING 90 SEC"}`
      :V.mode==="done"?`DONE · ${V.done} ROUND${V.done===1?"":"S"}`:(V.mode==="paused"?"PAUSED":"RUNNING")+roundsText();
  }
  $("v90Presets").addEventListener("click",e=>{const b=e.target.closest("button[data-rounds]");if(!b)return;V.rounds=+b.dataset.rounds;V.round=1;V.done=0;V.rem=V.dur;V.mode="ready";
    document.querySelectorAll("#v90Presets button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));render();});
  vigilThemes("v90Themes","v90Case");
  $("v90Start").onclick=()=>{ensureAudio();if(AC)AC.resume();
    if(V.mode==="running"){V.rem=Math.max(0,V.end-Date.now());V.mode="paused";blip(440);}
    else{if(V.mode==="done"){V.rem=V.dur;V.round=1;V.done=0;}V.end=Date.now()+V.rem;V.mode="running";V.tickAt=-1;blip(660);}render();};
  $("v90Reset").onclick=()=>{V.rem=V.dur;V.mode="ready";V.round=1;V.done=0;render();};
  (function loop(){render();requestAnimationFrame(loop);})();
})();

/* Enochian Pomodoro Timer: one face is one cycle; focus in red, break in ink, a dot per finished focus */
(function(){
  const svg=$("pomoSvg"),CX=152,CY=152,R=137,SCY=103;
  const P={focus:25,brk:5,long:15,longOn:true,auto:true,speed:1,phase:"focus",count:0,rem:25*60000,mode:"ready",last:0};
  let face=null;
  function build(){
    svg.innerHTML="";const cyc=P.focus+P.brk,deg=360/cyc,step=cyc<=30?.5:1;
    const fAng=P.focus*deg;
    vigilEl(svg,"path",{d:vigilArcPath(CX,CY,146,fAng,359.9),class:"timer-band","stroke-width":7});
    const [lx,ly]=polar(CX,CY,146,fAng+(360-fAng)/2);
    vigilEl(svg,"circle",{cx:CX,cy:CY,r:142,fill:"none",class:"timer-subface","stroke-width":1});
    for(let m=0;m<cyc-1e-9;m+=step){const major=Math.abs(m%5)<1e-9,quarter=major&&Math.abs(m%(cyc/2))<1e-9,a=m*deg,r1=quarter?123:(major?127:131);
      const [x1,y1]=polar(CX,CY,r1,a),[x2,y2]=polar(CX,CY,138,a);vigilEl(svg,"line",{x1,y1,x2,y2,class:"timer-tick","stroke-width":quarter?3:(major?2:1)});
      if(major){const [x,y]=polar(CX,CY,112,a);vigilEl(svg,"text",{x,y:y+7,"text-anchor":"middle",class:"timer-number","font-size":m===0?25:20,"font-family":"'IBM Plex Sans',sans-serif","font-weight":600}).textContent=m===0?String(cyc):String(m);}}
    const [bx,by]=polar(CX,CY,94,fAng+(360-fAng)/2);
    vigilEl(svg,"text",{x:bx,y:by+3,"text-anchor":"middle",class:"timer-bandlbl"}).textContent="BREAK";
    const fArc=vigilEl(svg,"path",{fill:"none",class:"timer-progress","stroke-width":7,"stroke-linecap":"round"});
    const bArc=vigilEl(svg,"path",{fill:"none",class:"timer-brk","stroke-width":7,"stroke-linecap":"round"});
    vigilEl(svg,"circle",{cx:CX,cy:SCY,r:39,class:"timer-subface","stroke-width":1.5});
    const dots=[0,90,180,270].map(a=>{const [x,y]=polar(CX,SCY,24,a);return vigilEl(svg,"circle",{cx:x,cy:y,r:5,class:"timer-dot","stroke-width":1.5});});
    vigilEl(svg,"text",{x:CX,y:SCY+3,"text-anchor":"middle",class:"timer-subnum","font-size":7,"font-family":"'IBM Plex Mono',monospace","font-weight":600,"letter-spacing":1}).textContent="SET";
    const hand=vigilEl(svg,"line",{x1:CX,y1:CY+18,x2:CX,y2:CY-116,class:"timer-hand-sec","stroke-width":3,"stroke-linecap":"round"});
    vigilEl(svg,"circle",{cx:CX,cy:CY,r:12,class:"timer-hub-outer","stroke-width":2});
    vigilEl(svg,"circle",{cx:CX,cy:CY,r:5,class:"timer-hub-inner"});
    face={deg,fAng,fArc,bArc,dots,hand};
  }
  const len=ph=>(ph==="focus"?P.focus:ph==="break"?P.brk:P.long)*60000;
  const nextFocusNo=()=>P.count%4+1;
  function endPhase(natural){
    if(P.phase==="focus"){if(natural)P.count++;P.phase=(P.longOn&&P.count>0&&P.count%4===0&&natural)?"long":"break";blip(660);setTimeout(()=>blip(440),170);}
    else{P.phase="focus";blip(440);setTimeout(()=>blip(660),150);setTimeout(()=>blip(880),300);}
    P.rem=len(P.phase);
    if(!(P.auto&&P.mode==="running"))P.mode="ready";
  }
  function render(){
    const now=performance.now();
    if(P.mode==="running"){P.rem-=(now-P.last)*P.speed;if(P.rem<=0)endPhase(true);}
    P.last=now;
    const L=len(P.phase),frac=clamp01(1-P.rem/L);
    const pos = P.phase==="focus" ? frac*P.focus : P.focus+frac*P.brk;   // minutes into the cycle (a long break is drawn across the break band)
    const a=pos*face.deg;
    face.fArc.setAttribute("d", P.phase==="focus" ? (a>.3?vigilArcPath(CX,CY,R,0,a):"") : vigilArcPath(CX,CY,R,0,face.fAng));
    face.bArc.setAttribute("d", P.phase!=="focus" && a-face.fAng>.3 ? vigilArcPath(CX,CY,R,face.fAng,Math.min(a,359.9)) : "");
    const [hx,hy]=polar(CX,CY,116,a);face.hand.setAttribute("x2",hx);face.hand.setAttribute("y2",hy);
    const done=P.phase==="long"?4:P.count%4;face.dots.forEach((d,i)=>d.classList.toggle("on",i<done));
    $("pomoDigital").textContent=vigilFormat(P.rem);$("pomoDigital").setAttribute("aria-label",`${Math.ceil(P.rem/60000)} minutes remaining in ${P.phase==="focus"?"focus":"the break"}`);
    $("pomoStart").dataset.state=P.mode;$("pomoGlyph").textContent=P.mode==="running"?"■":"▶";
    $("pomoStart").setAttribute("aria-label",P.mode==="running"?"Pause":`Start ${P.phase==="focus"?"focus":"break"}`);
    const label=P.phase==="focus"?`FOCUS ${nextFocusNo()} OF 4`:P.phase==="long"?"LONG BREAK · SET COMPLETE":`BREAK · NEXT FOCUS ${nextFocusNo()}`;
    $("pomoState").textContent=(P.mode==="ready"?"READY · ":P.mode==="paused"?"PAUSED · ":"")+label+(P.speed>1?" · 60×":"");
  }
  $("pomoPresets").addEventListener("click",e=>{const b=e.target.closest("button[data-focus]");if(!b)return;
    P.focus=+b.dataset.focus;P.brk=+b.dataset.break;P.phase="focus";P.count=0;P.rem=len("focus");P.mode="ready";
    document.querySelectorAll("#pomoPresets button[data-focus]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));build();render();});
  $("pomoLong").onclick=()=>{P.longOn=!P.longOn;$("pomoLong").setAttribute("aria-pressed",String(P.longOn));};
  $("pomoSpeed").onclick=()=>{P.speed=P.speed>1?1:60;$("pomoSpeed").setAttribute("aria-pressed",String(P.speed>1));};
  vigilThemes("pomoThemes","pomoCase");
  $("pomoStart").onclick=()=>{ensureAudio();if(AC)AC.resume();if(P.mode==="running"){P.mode="paused";blip(440);}else{P.mode="running";P.last=performance.now();blip(660);}render();};
  $("pomoReset").onclick=()=>{P.phase="focus";P.count=0;P.rem=len("focus");P.mode="ready";render();};
  $("pomoSkip").onclick=()=>{ensureAudio();const wasRunning=P.mode==="running";endPhase(false);if(wasRunning&&P.auto)P.mode="running";render();};
  $("pomoAuto").onclick=()=>{P.auto=!P.auto;$("pomoAuto").setAttribute("aria-pressed",String(P.auto));};
  build();(function loop(){render();requestAnimationFrame(loop);})();
})();

/* mechanical keyboard: semantic keys, visible bottom-out, lightweight typing model */
const keyboardRows=[
  [["Esc",1.1,"accent"],...[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>[`F${n}`,1,"accent"])],
  [["`",1,"accent"],...["1","2","3","4","5","6","7","8","9","0","-","="].map(k=>[k]),["⌫",2.1,"accent","Backspace"]],
  [["Tab",1.55,"accent"],...["Q","W","E","R","T","Y","U","I","O","P","[","]","\\"].map(k=>[k])],
  [["Caps",1.75,"accent","CapsLock"],...["A","S","D","F","G","H","J","K","L",";","'"].map(k=>[k]),["Enter",2.1,"accent","Enter"]],
  [["Shift",2.15,"accent","Shift"],...["Z","X","C","V","B","N","M",",",".","/"].map(k=>[k]),["Shift",2.15,"accent","Shift"]],
  [["Ctrl",1.25,"accent","Control"],["EN",1.25,"accent","Brand"],["Alt",1.25,"accent","Alt"],["Space",6.8,""," "],["Alt",1.25,"accent","Alt"],["EN",1.25,"accent","Brand"],["Menu",1.35,"accent","Menu"],["Ctrl",1.25,"accent","Control"]]
];
const keyboardKeys=$("keyboardKeys"),keyboardDisplay=$("keyboardDisplay"),keyboardState=$("keyboardState");
let typed="",caps=false,shifted=false;
function keyLegend(label,key){
  if(key!=="Brand") return document.createTextNode(label);
  const mark=document.createElement("span");mark.className="enochian-key-mark";mark.setAttribute("aria-hidden","true");mark.innerHTML="<b>E</b>";return mark;
}
function setKeyDown(button,down){
  button.dataset.pressed=String(down);
  animate(button,down?{y:5,scale:.985}:{y:0,scale:1},T({type:"spring",stiffness:780,damping:34,mass:.45}));
}
function typeFromKey(button){
  const key=button.dataset.key,label=button.dataset.label;
  if(key==="Backspace") typed=typed.slice(0,-1);
  else if(key==="Enter") typed+="\n";
  else if(key==="Tab") typed+="\t";
  else if(key==="CapsLock"){caps=!caps;button.setAttribute("aria-pressed",String(caps));}
  else if(key==="Shift"){shifted=!shifted;document.querySelectorAll('.mk-key[data-key="Shift"]').forEach(k=>k.setAttribute("aria-pressed",String(shifted)));}
  else if(key===" "||key.length===1){const upper=caps!==shifted;typed+=/^[a-z]$/i.test(label)?(upper?label.toUpperCase():label.toLowerCase()):label;shifted=false;document.querySelectorAll('.mk-key[data-key="Shift"]').forEach(k=>k.setAttribute("aria-pressed","false"));}
  keyboardDisplay.textContent=typed||"Enochian";
  keyboardState.textContent=key==="Brand"?"ENOCHIAN BRANDMARK":key+" PRESSED";
}
keyboardRows.forEach(rowData=>{
  const row=document.createElement("div");row.className="mk-row";
  rowData.forEach(([label,width=1,tone="",key=label])=>{
    const button=document.createElement("button");button.type="button";button.className="mk-key"+(tone?" "+tone:"");button.style.setProperty("--w",width);button.dataset.key=key;button.dataset.label=label;button.dataset.pressed="false";button.setAttribute("aria-label",key==="Brand"?"Enochian brandmark key":label+" key");if(key==="CapsLock"||key==="Shift")button.setAttribute("aria-pressed","false");button.appendChild(keyLegend(label,key));
    button.addEventListener("pointerdown",()=>setKeyDown(button,true));["pointerup","pointercancel","pointerleave"].forEach(type=>button.addEventListener(type,()=>setKeyDown(button,false)));
    button.addEventListener("keydown",e=>{if(!e.repeat&&(e.key===" "||e.key==="Enter"))setKeyDown(button,true)});button.addEventListener("keyup",e=>{if(e.key===" "||e.key==="Enter")setKeyDown(button,false)});
    button.addEventListener("click",()=>typeFromKey(button));row.appendChild(button);
  });keyboardKeys.appendChild(row);
});

/* concave push button: cap, dish, and socket move as one tactile system */
const concaveButton=$("concaveButton"),concaveSocket=$("concaveSocket"),concaveTop=concaveButton.querySelector(".concave-top");
let concavePresses=0,concaveHeld=false;
const CONCAVE_SOCKET_REST="inset 0 10px 16px rgba(0,0,0,.72), inset 0 -4px 7px rgba(255,255,255,.14), 5px 12px 22px rgba(0,0,0,.24)";
const CONCAVE_SOCKET_DOWN="inset 0 14px 22px rgba(0,0,0,.82), inset 0 -2px 5px rgba(255,255,255,.10), 2px 5px 10px rgba(0,0,0,.18)";
const CONCAVE_DISH_REST="inset 8px 10px 18px rgba(0,0,0,.22), inset -8px -10px 17px rgba(255,255,255,.88), 0 1px 1px rgba(255,255,255,.9)";
const CONCAVE_DISH_DOWN="inset 10px 13px 20px rgba(0,0,0,.32), inset -5px -7px 12px rgba(255,255,255,.66), 0 0 0 rgba(0,0,0,0)";
function renderConcave(down,instant=false){
  concaveHeld=down;concaveButton.dataset.pressed=String(down);concaveButton.setAttribute("aria-pressed",String(down));$("concaveState").textContent=down?"DEPRESSED":"READY";
  const transition=instant||reduce?{duration:0}:{type:"spring",stiffness:720,damping:32,mass:.55};
  animate(concaveButton,down?{y:9,scale:.975}:{y:0,scale:1},transition);
  animate(concaveSocket,{boxShadow:down?CONCAVE_SOCKET_DOWN:CONCAVE_SOCKET_REST},{duration:instant?0:.11});
  concaveTop.style.boxShadow=down?CONCAVE_DISH_DOWN:CONCAVE_DISH_REST;
}
concaveButton.addEventListener("pointerdown",()=>renderConcave(true));
["pointerup","pointercancel","pointerleave"].forEach(type=>concaveButton.addEventListener(type,()=>renderConcave(false)));
concaveButton.addEventListener("keydown",e=>{if(!e.repeat&&(e.key===" "||e.key==="Enter"))renderConcave(true)});
concaveButton.addEventListener("keyup",e=>{if(e.key===" "||e.key==="Enter")renderConcave(false)});
concaveButton.addEventListener("click",()=>{concavePresses++;$("concaveCount").textContent=concavePresses+" "+(concavePresses===1?"press":"presses");});
renderConcave(false,true);

/* arcade push-buttons: momentary press + latch, LED follows, click sound */
const PRESS_SHADOW="0 -2px 4px -2px rgba(0,0,0,.50), 0 1px 2px rgba(0,0,0,.20), 0 0 0 4px rgba(0,0,0,.40), inset 0 2px 3px rgba(255,255,255,.4), inset 0 6px 12px rgba(0,0,0,.45)";
const REST_SHADOW="0 -4px 6px -2px rgba(0,0,0,.55), 0 5px 9px rgba(0,0,0,.20), 0 4px 5px -2px rgba(255,255,255,.65), inset 0 2px 3px rgba(255,255,255,.7), inset 0 -6px 9px rgba(0,0,0,.30)";
const SOCKET_REST="inset 0 8px 14px rgba(0,0,0,.32), inset 0 -7px 10px rgba(255,255,255,.95), 2px 5px 8px rgba(0,0,0,.14)";
const SOCKET_DEEP="inset 0 11px 18px rgba(0,0,0,.44), inset 0 -5px 8px rgba(255,255,255,.9), 1px 3px 5px rgba(0,0,0,.10)";
let abMode="moment";
$("abMode").addEventListener("click", e=>{
  const b=e.target.closest("button"); if(!b) return; abMode=b.dataset.m;
  [...$("abMode").children].forEach(x=>x.setAttribute("aria-pressed",String(x===b)));
  abUnits.forEach(u=>u.set(false,true));
});
const abUnits=[...document.querySelectorAll("#abtns .abunit")].map((unit)=>{
  const btn=unit.querySelector(".abtn"), led=unit.querySelector(".aled"), sock=unit.querySelector(".asocket");
  let held=false, latched=false;
  const lit=()=>held||latched;
  function render(instant=false){
    btn.setAttribute("aria-pressed", String(lit()));
    if(instant||reduce){
      btn.style.transform=lit()?"translateY(6px) scale(.94)":"";
      btn.style.boxShadow=lit()?PRESS_SHADOW:"";
      sock.style.boxShadow=lit()?SOCKET_DEEP:"";
      led.style.background=lit()?ACCENT:"#d6d6d6";
      led.style.boxShadow=lit()?`0 0 8px ${ACCENT}`:"";
    } else {
      animate(btn, lit()?{ y:6, scale:.94 }:{ y:0, scale:1 }, { type:"spring", stiffness:650, damping:26, mass:.6 });
      animate(btn, { boxShadow: lit()?PRESS_SHADOW:REST_SHADOW }, { duration:.12 });
      animate(sock, { boxShadow: lit()?SOCKET_DEEP:SOCKET_REST }, { duration:.12 });
      animate(led, { backgroundColor: lit()?ACCENT:"#d6d6d6" }, { duration:.15 });
      led.style.boxShadow=lit()?`0 0 8px ${ACCENT}`:"";
    }
    const states=abUnits.map(u=>u.lit()?"ON":"off").join(" · ");
    $("abVal").textContent = abUnits.every(u=>!u.lit()) ? "all released" : states;
  }
  btn.addEventListener("pointerdown", e=>{ held=true; ensureAudio(); if(AC){ AC.resume(); blip(660); } render(); });
  const release=()=>{ if(!held) return; held=false;
    if(abMode==="latch"&&!latched){ /* click without drag latches on pointerup */ }
    render(); };
  btn.addEventListener("pointerup", ()=>{ held=false; if(abMode==="moment") render(); });
  btn.addEventListener("click", ()=>{ if(abMode!=="latch") return;
    latched=!latched; ensureAudio(); if(AC){ AC.resume(); blip(latched?880:440); } render(); });
  btn.addEventListener("pointerleave", release);
  btn.addEventListener("keydown", e=>{ if(e.repeat) return;
    if(e.key===" "||e.key==="Enter"){ e.preventDefault();
      if(abMode==="latch"){ latched=!latched; ensureAudio(); if(AC){ AC.resume(); blip(latched?880:440); } }
      else { held=true; ensureAudio(); if(AC){ AC.resume(); blip(660); } }
      render(); } });
  btn.addEventListener("keyup", e=>{ if(e.key===" "||e.key==="Enter"){ held=false; render(); } });
  return { render, lit, set:(v,instant)=>{ latched=v; held=false; render(instant); } };
});

/* Code drives a page-wide, copyable code layer */
const CODE_SPRING={type:"spring",stiffness:500,damping:32,mass:1};
const CODE_SNIPPETS=[
  {id:"codeToggle",title:"Enochian Code Toggle",code:String.raw`const spring = { type: "spring", stiffness: 500, damping: 32 };
<motion.button role="switch" aria-checked={showCode} data-finish={finish}
  animate={{ backgroundColor: showCode ? "#CC0000" : finish === "obsidian" ? "#171719" : "#EFEFEF" }}
  transition={spring} onClick={() => setShowCode(v => !v)}>
  <motion.span animate={{ x: showCode ? 72 : 0 }} transition={spring} />
</motion.button>`},
  {id:"darkDial",title:"Enochian Rotary Knob 01",code:String.raw`const value = useMotionValue(0.05);
const rotation = useTransform(value, [0, 1], [-135, 135]);
<motion.div role="slider" aria-valuenow={Math.round(value.get()*100)}
  drag="y" dragMomentum={false} style={{ rotate: rotation }} />
/* data-finish="obsidian|ivory" swaps materials without resetting value */`},
  {id:"lightDial",title:"Enochian Rotary Knob 02",code:String.raw`.light-base { background:#EFEFEF; border-radius:50%; }
.light-knob {
  background:#FFF;
  box-shadow:6px 8px 16px rgba(0,0,0,.16);
}
.dot { background:#CC0000; }
.dial[data-finish="obsidian"] .light-knob { background:#1d1d20; }`},
  {id:"stepDial",title:"Enochian Stepped Knob",code:String.raw`const stepWidth = trackWidth / (steps - 1);
const index = clamp(Math.round(x.get() / stepWidth), 0, steps - 1);
animate(x, index * stepWidth,
  { type:"spring", stiffness:600, damping:32, mass:.8 });
// Arrow keys ±1 · PageUp/PageDown ±2 · Home/End
// data-finish="ivory|obsidian" changes material only; detent stays selected.`},
  {id:"npill",title:"Enochian Segment Selector",code:String.raw`<LayoutGroup>
  {options.map(option => <button key={option}>
    {selected === option &&
      <motion.span layoutId="active-pill" transition={spring} />}
    <span>{option}</span>
  </button>)}
</LayoutGroup>`},
  {id:"triple",title:"Enochian Toggle Bank 01",code:String.raw`.triple { display:flex; gap:72px; }
.tunit { width:56px; } /* absolute thumb needs a flex width */
.tthumb { width:56px; height:100px; }
const travel = (176 - 100) / 2;
animate(thumb, { y: on ? -travel : travel }, snapSpring);
.triple[data-finish="obsidian"] .tthumb { background:#171719; }`},
  {id:"radio",title:"Enochian Radio Player",code:String.raw`<div className="radio" data-theme={theme}>
  <button role="switch" aria-checked={playing}>Power</button>
  <div className="grill" />
  <div role="slider" aria-valuenow={volume} className="rknob" />
</div>
/* light · #CC0000 red · #121214 black theme tokens */`},
  {id:"clkBrand",title:"Enochian Clock",code:String.raw`function tickClock(now = new Date()) {
  hourHand.style.transform = "rotate(" + ((now.getHours()%12)*30 + now.getMinutes()*.5) + "deg)";
  minuteHand.style.transform = "rotate(" + (now.getMinutes()*6 + now.getSeconds()*.1) + "deg)";
  secondHand.style.transform = "rotate(" + (now.getSeconds()*6) + "deg)";
  requestAnimationFrame(() => tickClock(new Date()));
}
/* data-finish="ivory|obsidian" changes case, face, hands, marks, and corners. */`},
  {id:"timerCase",title:"Enochian Countdown Timer",code:String.raw`const presets = [60, 5*60, 10*60, 25*60];
const endAt = Date.now() + remainingMs;
const remaining = Math.max(0, endAt - Date.now());
const elapsedRatio = 1 - remaining / durationMs;
progressCircle.setAttribute("stroke-dashoffset", circumference * (1-elapsedRatio));
// Derive every frame from wall time so background tabs do not lose time.`},
  {id:"mechanicalKeyboard",title:"Enochian Typing Keyboard",code:String.raw`const keySpring = { type:"spring", stiffness:780, damping:34, mass:.45 };
function setKeyDown(key, down) {
  key.dataset.pressed = String(down);
  animate(key, down ? { y:5, scale:.985 } : { y:0, scale:1 }, keySpring);
}
// Render each key as a native button. Cinnabar keys use #CC0000.
// data-finish="ivory|obsidian" swaps typing-key material and ink only.
// Pointer and keyboard events share the same press/release path.`},
  {id:"concaveButton",title:"Enochian Push Button 01",code:String.raw`const pressSpring = { type:"spring", stiffness:720, damping:32, mass:.55 };
function renderPress(down) {
  button.setAttribute("aria-pressed", String(down));
  animate(button, down ? { y:9, scale:.975 } : { y:0, scale:1 }, pressSpring);
  animate(socket, { boxShadow: down ? SOCKET_DOWN : SOCKET_REST });
  dish.style.boxShadow = down ? DISH_DOWN : DISH_REST;
}
// The radial-gradient cap and inset shadows create the concavity.`},
  {id:"abtns",title:"Enochian Button Bank 01",code:String.raw`const press = { type:"spring", stiffness:650, damping:26, mass:.6 };
animate(button, pressed ? { y:6, scale:.94 } : { y:0, scale:1 }, press);
animate(socket, { boxShadow: pressed ? SOCKET_DEEP : SOCKET_REST });
// Native <button>; latch changes on click, momentary follows hold.`},
  {id:"v90Case",title:"Enochian 90 Second Timer",code:String.raw`// One sweep = 90 seconds: 4° per second, labels every 10 s, 90 at the top.
const angle = (1 - remainingMs / 90000) * 360;
secondHand.setAttribute("transform", "rotate(" + angle + " 152 152)");
// Soft ticks for the last three seconds, a chime pair between rounds.
const s = Math.ceil(remainingMs / 1000);
if (s <= 3 && s > 0 && s !== lastTick) { lastTick = s; blip(1320); }
if (remainingMs <= 0 && (loop || round < rounds)) { round++; endAt = Date.now() + 90000; }`},
  {id:"timerPressure",title:"Pressure sound",code:String.raw`// Original synthesized countdown, no recorded audio: tick + thump each second,
// double time and higher pitch in the last ten, a low boom at zero.
function pressureTick(secLeft) {
  const hot = secLeft <= 10, t = ctx.currentTime;
  voice(t, hot ? 1180 : 940, hot ? .12 : .09, hot ? .22 : .14);   // square pair → band-pass + sine thump
  if (hot) voice(t + .5, 1320, .08, 0);                           // off-beat tick
}
timerCase.dataset.pressure = running && secLeft <= 10 ? "hot" : ""; // digits go red`},
  {id:"pomoCase",title:"Enochian Pomodoro Timer",code:String.raw`// One face is one cycle: focus + break minutes around 360°.
const deg = 360 / (focus + brk);
const pos = phase === "focus" ? frac * focus : focus + frac * brk;   // minutes into the cycle
focusArc.setAttribute("d", arc(0, Math.min(pos, focus) * deg));      // red
breakArc.setAttribute("d", phase !== "focus" ? arc(focus * deg, pos * deg) : "");  // ink
// After every fourth completed focus session, the break is long.
next = phase === "focus" ? (++count % 4 === 0 && longOn ? "long" : "break") : "focus";`},
];
function addCodePanels(){
  CODE_SNIPPETS.forEach(item=>{
    const anchor=$(item.id),host=anchor&&anchor.closest(".card"); if(!host) return;
    const panel=document.createElement("section"); panel.className="code-snippet"; panel.inert=true; panel.setAttribute("aria-hidden","true");
    const head=document.createElement("div"); head.className="code-snippet-head";
    const title=document.createElement("span"); title.textContent=item.title;
    const copy=document.createElement("button"); copy.type="button"; copy.className="copy-code"; copy.textContent="COPY";
    const pre=document.createElement("pre"); const code=document.createElement("code"); code.textContent=item.code; pre.appendChild(code);
    copy.addEventListener("click",async()=>{
      try{ await navigator.clipboard.writeText(item.code); }
      catch(_){ const ta=document.createElement("textarea");ta.value=item.code;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove(); }
      copy.textContent="COPIED"; setTimeout(()=>copy.textContent="COPY",900);
    });
    head.append(title,copy); panel.append(head,pre); host.appendChild(panel);
  });
}
let codeVisible=false;
const codeToggle=$("codeToggle"),codeKnob=codeToggle.querySelector(".d37-knob");
function renderCodeLayer(instant=false){
  codeToggle.setAttribute("aria-checked",String(codeVisible));
  $("codeToggleLabel").textContent=codeVisible?"Hide code":"Show code";
  document.body.classList.toggle("show-code",codeVisible);
  document.querySelectorAll(".code-snippet").forEach(p=>{p.inert=!codeVisible;p.setAttribute("aria-hidden",String(!codeVisible));});
  const move=instant||reduce?{duration:0}:CODE_SPRING;
  const offColor=codeToggle.dataset.finish==="obsidian"?"#171719":"#EFEFEF";
  animate(codeKnob,{x:codeVisible?72:0},move);
  animate(codeToggle,{backgroundColor:codeVisible?"#CC0000":offColor},instant||reduce?{duration:0}:{...CODE_SPRING,stiffness:400,damping:34});
}
addCodePanels();
$("codeVeilFinish").addEventListener("click",()=>renderCodeLayer());
codeToggle.addEventListener("click",()=>{codeVisible=!codeVisible;renderCodeLayer();});
codeToggle.addEventListener("pointerdown",()=>animate(codeToggle,{scale:.97},{duration:.1}));
["pointerup","pointercancel","pointerleave"].forEach(type=>codeToggle.addEventListener(type,()=>animate(codeToggle,{scale:1},CODE_SPRING)));
renderCodeLayer(true);

}
import("./atlas.js?v=b8464a906267");
