/* Ali Kachok Jang — asosiy o'yin: hisoblar, menyu, jang, chizish */
"use strict";
/* =========================================================
   SAQLASH (localStorage)
   ========================================================= */
const DB_KEY = "aliKachok.users.v1", CUR_KEY = "aliKachok.current";
function loadDB(){ try{ return JSON.parse(localStorage.getItem(DB_KEY)) || {}; }catch(e){ return {}; } }
function saveDB(){ try{ localStorage.setItem(DB_KEY, JSON.stringify(db)); }catch(e){} }
function setCur(k){ try{ k ? localStorage.setItem(CUR_KEY,k) : localStorage.removeItem(CUR_KEY); }catch(e){} }
function getCur(){ try{ return localStorage.getItem(CUR_KEY); }catch(e){ return null; } }
function hash(s){ let h = 5381; for (let i=0;i<s.length;i++) h = ((h<<5)+h + s.charCodeAt(i))|0; return (h>>>0).toString(36); }
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
const $ = s => document.querySelector(s);

/* ---------- Ma'lumotlar qatlami: onlayn server yoki oflayn brauzer ---------- */
const TOK_KEY = "aliKachok.session.v1";
let db = loadDB();          // oflayn rejim uchun (localStorage)
let SERVER = false;         // umumiy onlayn baza ulanganmi
let accounts = db;          // key -> o'yinchi ma'lumoti
const tokens = {};          // key -> server sessiya tokeni
let userKey = null, p2Key = null;
const U = () => accounts[userKey];

function saveTok(key){ try{ localStorage.setItem(TOK_KEY, JSON.stringify({ key, token:tokens[key] })); }catch(e){} }
function loadTok(){ try{ return JSON.parse(localStorage.getItem(TOK_KEY)); }catch(e){ return null; } }
function clearTok(){ try{ localStorage.removeItem(TOK_KEY); }catch(e){} }

async function api(a, body, key){
  const headers = { "Content-Type":"application/json" };
  if (key && tokens[key]) headers.Authorization = "Bearer " + tokens[key];
  const r = await fetch("/api/game?a=" + a, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  let j = {};
  try{ j = await r.json(); }catch(e){}
  if (!r.ok) throw new Error(j.error || ("Server xatosi (" + r.status + ")"));
  return j;
}

function show(id){
  document.querySelectorAll(".screen").forEach(e => e.classList.toggle("active", e.id === id));
  document.body.classList.toggle("in-game", id === "scr-game");
  window.scrollTo(0,0);
}

/* ---------- Telefon: to'liq ekran va gorizontal holat ---------- */
const isTouch = matchMedia("(pointer:coarse)").matches;
function enterFS(){
  if (!isTouch) return;
  const el = document.documentElement;
  try{
    const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI:"hide" })
            : el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : null;
    const lock = () => { try{ screen.orientation && screen.orientation.lock && screen.orientation.lock("landscape").catch(()=>{}); }catch(e){} };
    r && r.then ? r.then(lock).catch(()=>{}) : lock();
  }catch(e){}
}
function exitFS(){
  try{
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  }catch(e){}
}

/* =========================================================
   RO'YXATDAN O'TISH / KIRISH
   ========================================================= */
const GLOVES = ["#e11d48","#2563eb","#16a34a","#a855f7","#06b6d4"];

async function authUser(mode, rawName, pass, glove, excludeKey){
  if (!SERVER) return localAuth(mode, rawName, pass, glove, excludeKey);
  const name = rawName.trim().replace(/\s+/g," ");
  if (excludeKey && name.toLowerCase() === excludeKey) return { error:"Bu 1-o'yinchining hisobi. 2-o'yinchi boshqa hisob bilan kirsin." };
  try{
    const j = await api(mode === "reg" ? "register" : "login", { name, pass, glove });
    tokens[j.user.key] = j.token; accounts[j.user.key] = j.user;
    return { key:j.user.key };
  }catch(e){ return { error:e.message === "Failed to fetch" ? "Internetga ulanib bo'lmadi." : e.message }; }
}

function localAuth(mode, rawName, pass, glove, excludeKey){
  const name = rawName.trim().replace(/\s+/g," ");
  if (name.length < 2) return { error:"Ism kamida 2 ta harfdan iborat bo'lsin." };
  if (name.toLowerCase().replace(/\s/g,"") === "alikachok") return { error:"Ali Kachok faqat bitta! Boshqa ism tanlang 😄" };
  if (pass.length < 4) return { error:"Parol kamida 4 ta belgidan iborat bo'lsin." };
  const key = name.toLowerCase();
  if (excludeKey && key === excludeKey) return { error:"Bu 1-o'yinchining hisobi. 2-o'yinchi boshqa hisob bilan kirsin." };
  const ph = hash(key + ":" + pass);
  if (mode === "reg"){
    if (db[key]) return { error:"Bu ism band. \"Kirish\" bo'limidan kiring." };
    db[key] = { name, pass:ph, glove, wins:0, losses:0, kos:0, fights:0, bestKO:null, coopWins:0, coopLosses:0,
                coins:0, up:{ hp:0, dmg:0, sta:0, spd:0, def:0 }, created:Date.now() };
    saveDB();
  } else {
    if (!db[key]) return { error:"Bunday o'yinchi topilmadi. Avval ro'yxatdan o'ting." };
    if (db[key].pass !== ph) return { error:"Parol noto'g'ri." };
  }
  return { key };
}

function authWidget(root, labels, onDone, getExclude){
  const st = { mode:"reg", glove:GLOVES[0] };
  const sw = root.querySelector(".swatches"), errEl = root.querySelector(".err");
  const btn = root.querySelector(".auth-btn"), fName = root.querySelector(".f-name"), fPass = root.querySelector(".f-pass");
  GLOVES.forEach((c,i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "sw" + (i===0 ? " active" : ""); b.style.background = c;
    b.setAttribute("aria-label", "Qo'lqop rangi " + (i+1));
    b.onclick = () => { st.glove = c; sw.querySelectorAll(".sw").forEach(x => x.classList.toggle("active", x===b)); };
    sw.appendChild(b);
  });
  const tabs = root.querySelectorAll(".tab");
  tabs.forEach(t => t.onclick = () => {
    st.mode = t.dataset.tab;
    tabs.forEach(x => x.classList.toggle("active", x===t));
    root.querySelector(".reg-only").style.display = st.mode==="reg" ? "" : "none";
    btn.textContent = labels[st.mode];
    errEl.textContent = "";
  });
  root.querySelector("form").onsubmit = async e => {
    e.preventDefault();
    if (btn.disabled) return;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = "Kuting...";
    const res = await authUser(st.mode, fName.value, fPass.value, st.glove, getExclude && getExclude());
    btn.disabled = false; btn.textContent = label;
    if (res.error){ errEl.textContent = res.error; return; }
    fPass.value = ""; errEl.textContent = "";
    onDone(res.key);
  };
  return { reset(){ fName.value = ""; fPass.value = ""; errEl.textContent = ""; }, focus(){ fName.focus(); } };
}

authWidget($("#auth1"), { reg:"Ro'yxatdan o'tish", login:"Kirish" }, key => {
  userKey = key;
  if (SERVER) saveTok(key); else setCur(key);
  openMenu();
});
const auth2 = authWidget($("#auth2"), { reg:"Ro'yxatdan o'tib jangga!", login:"Kirib jangga!" }, key => {
  p2Key = key; $("#p2modal").classList.add("hidden"); initAudio(); enterFS(); startGame("coop");
}, () => userKey);

/* =========================================================
   MENYU
   ========================================================= */
function aliLevel(){ return Math.min(10, U().wins + 1); }
function coopLevel(){ return Math.min(10, 1 + Math.max(accounts[userKey].coopWins || 0, accounts[p2Key].coopWins || 0)); }
function fmtTime(s){ s = Math.round(s); return Math.floor(s/60) + ":" + String(s%60).padStart(2,"0"); }

function openMenu(){
  const u = U();
  $("#mName").textContent = u.name;
  $("#sWin").textContent = u.wins;
  $("#sLose").textContent = u.losses;
  $("#sKo").textContent = u.kos;
  $("#sBest").textContent = u.bestKO ? fmtTime(u.bestKO) : "—";
  const lv = aliLevel();
  $("#mLvlTxt").textContent = lv + "-daraja" + (lv >= 10 ? " (MAKSIMAL!)" : "");
  $("#mLvl").innerHTML = Array.from({length:10}, (_,i) => `<i class="${i<lv?"on":""}"></i>`).join("");
  $("#coopRec").textContent = `Jamoa rejimida: ${u.coopWins||0} g'alaba · ${u.coopLosses||0} mag'lubiyat`;

  loadBoard();
  renderShop();
  exitFS();
  show("scr-menu");
  if (pendingJoin){
    const code = pendingJoin; pendingJoin = null;
    try{ history.replaceState(null, "", location.pathname); }catch(e){}
    openNetModal(); $("#netCode").value = code; joinRoom(code);
  }
}

function renderBoard(list, aW, aL){
  const board = $("#board");
  board.innerHTML = list.length ? list.slice(0, SERVER ? 20 : 10).map((p,i) =>
    `<li class="${p.key===userKey?"me":""}"><span class="rk">${i+1}</span>` +
    `<span class="nm">${esc(p.name)}</span><span class="sc">${p.wins}G · ${p.losses}M · ${p.kos}KO` +
    `${p.coopWins ? " · 👥" + p.coopWins : ""}</span></li>`
  ).join("") : "<li>Hali hech kim yo'q</li>";
  $("#aliRec").textContent = `💪 Ali Kachok rekordi: ${aW} g'alaba, ${aL} mag'lubiyat`;
}
function loadBoard(){
  $("#boardTitle").textContent = SERVER ? "🌍 Umumiy reyting" : "🏆 Reyting (shu qurilma)";
  if (SERVER){
    $("#board").innerHTML = "<li>Yuklanmoqda...</li>";
    api("board").then(j => renderBoard(j.list, j.aliWins, j.aliLosses))
      .catch(() => { $("#board").innerHTML = "<li>Reytingni yuklab bo'lmadi</li>"; });
    return;
  }
  const all = Object.entries(db).map(([k,v]) => ({ ...v, key:k }));
  all.sort((a,b) => b.wins-a.wins || b.kos-a.kos || (b.coopWins||0)-(a.coopWins||0) || a.losses-b.losses || a.created-b.created);
  renderBoard(all, all.reduce((s,p)=>s+p.losses+(p.coopLosses||0),0), all.reduce((s,p)=>s+p.wins+(p.coopWins||0),0));
}

/* ---------- Kuchaytirish do'koni ---------- */
const UP_MAX = 5, upCost = l => 80 * (l + 1);
const UPGRADES = [
  { id:"hp",  icon:"❤️", name:"Jon",         desc:l => `${100 + 15*l} jon` },
  { id:"dmg", icon:"👊", name:"Zarba kuchi", desc:l => `+${8*l}% zarar` },
  { id:"sta", icon:"⚡", name:"Chidamlilik", desc:l => `${100 + 10*l} kuch, +${12*l}% tiklanish` },
  { id:"spd", icon:"💨", name:"Tezlik",      desc:l => `+${5*l}% tezlik` },
  { id:"def", icon:"🛡", name:"Himoya",      desc:l => `himoyada ${15 - 2*l}% zarar o'tadi` },
];
function ups(u){
  u.up = Object.assign({ hp:0, dmg:0, sta:0, spd:0, def:0 }, u.up || {});
  if (typeof u.coins !== "number") u.coins = 0;
  return u.up;
}
function renderShop(){
  const u = U(), up = ups(u);
  $("#coins").textContent = u.coins;
  const list = $("#upgList");
  list.innerHTML = UPGRADES.map(g => {
    const l = up[g.id], max = l >= UP_MAX, cost = upCost(l);
    return `<div class="upg">
      <div class="upg-top"><span class="ic">${g.icon}</span><b>${g.name}</b>
        <span class="pips">${Array.from({length:UP_MAX}, (_,i) => `<i class="${i<l?"on":""}"></i>`).join("")}</span></div>
      <div class="upg-desc">${g.desc(l)}${max ? "" : ` → <b>${g.desc(l+1)}</b>`}</div>
      <button class="btn small ${max ? "ghost" : ""}" type="button" data-up="${g.id}" ${max || u.coins < cost ? "disabled" : ""}>
        ${max ? "MAKSIMAL ✓" : cost + " 🪙 sotib olish"}</button>
    </div>`;
  }).join("");
  list.querySelectorAll("[data-up]").forEach(b => b.onclick = () => buyUpgrade(b.dataset.up));
}
async function buyUpgrade(id){
  const u = U(), up = ups(u), l = up[id];
  if (l >= UP_MAX || u.coins < upCost(l)) return;
  $("#shopErr").textContent = "";
  if (SERVER){
    document.querySelectorAll("[data-up]").forEach(b => b.disabled = true);
    try{ const j = await api("upgrade", { id }, userKey); accounts[userKey] = j.user; }
    catch(e){ $("#shopErr").textContent = e.message; }
    renderShop();
    return;
  }
  u.coins -= upCost(l); up[id]++;
  saveDB(); renderShop();
}

$("#btnLogout").onclick = () => {
  if (SERVER && tokens[userKey]) api("logout", {}, userKey).catch(() => {});
  clearTok(); setCur(null); userKey = null; show("scr-auth");
};
$("#btnFight").onclick = () => { initAudio(); enterFS(); startGame("solo"); };
$("#btnOnline").onclick = () => openNetModal();
$("#btnCoop").onclick = () => { auth2.reset(); $("#p2modal").classList.remove("hidden"); auth2.focus(); };
$("#p2Cancel").onclick = () => $("#p2modal").classList.add("hidden");

/* =========================================================
   OVOZ (WebAudio)
   ========================================================= */
let AC = null, master = null, NB = null, muted = false;
function initAudio(){
  try{
    if (!AC){
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = .6; master.connect(AC.destination);
      NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const d = NB.getChannelData(0); for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
    }
    if (AC.state === "suspended") AC.resume();
  }catch(e){ AC = null; }
}
function noise(t,dur,freq,vol,type){
  const s = AC.createBufferSource(); s.buffer = NB;
  const f = AC.createBiquadFilter(); f.type = type || "lowpass"; f.frequency.value = freq;
  const g = AC.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+dur+.05);
}
function tone(t,freq,dur,vol,type,endFreq){
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || "sine"; o.frequency.setValueAtTime(freq,t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq,t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+.05);
}
function sfx(type){
  emit(["a", type]);
  if (!AC || muted) return;
  const t = AC.currentTime;
  switch(type){
    case "hit":   tone(t,190,.16,.5,"sine",55); noise(t,.07,2200,.35); break;
    case "big":   tone(t,140,.3,.8,"sine",40); noise(t,.14,1500,.6); noise(t,.05,5000,.2,"highpass"); break;
    case "block": tone(t,420,.06,.2,"square",300); noise(t,.05,3500,.25,"bandpass"); break;
    case "whiff": noise(t,.12,900,.18,"bandpass"); break;
    case "bell":  [0,.4,.8].forEach(d => { tone(t+d,1250,1.1,.25,"sine"); tone(t+d,2510,.7,.08,"sine"); }); break;
    case "bell1": tone(t,1250,1.4,.3,"sine"); tone(t,2510,.9,.1,"sine"); break;
    case "crowd": {
      const s = AC.createBufferSource(); s.buffer = NB; s.loop = true;
      const f = AC.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = .6;
      const g = AC.createGain(); g.gain.setValueAtTime(.001,t); g.gain.exponentialRampToValueAtTime(.35,t+.4);
      g.gain.exponentialRampToValueAtTime(.001,t+3);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t+3.1); break;
    }
    case "stun":  [0,.12,.24].forEach((d,i) => tone(t+d,900-i*200,.15,.12,"triangle")); break;
    case "rage":  tone(t,90,.8,.5,"sawtooth",50); break;
  }
}

/* =========================================================
   O'YIN — SOZLAMALAR
   ========================================================= */
const cv = $("#cv"), ctx = cv.getContext("2d");
const W = 960, H = 540, FLOOR = 430, TAU = Math.PI*2;
const RING_L = 120, RING_R = 840, MIN_GAP = 88, ROUND_TIME = 60, ROUNDS = 3;

const P_ATK = {
  jab:   { wind:.07, act:.08, rec:.15, dmg:5,  range:108, sta:7,  stun:.2,  poise:8,  name:"JAB" },
  hook:  { wind:.16, act:.10, rec:.27, dmg:10, range:100, sta:13, stun:.3,  poise:15, name:"XUK" },
  upper: { wind:.26, act:.10, rec:.38, dmg:16, range:94,  sta:20, stun:.42, poise:28, name:"APERKOT" },
};
const A_ATK = {
  jab:  { wind:.40, act:.10, rec:.32, dmg:7,  range:125, stun:.28, kb:150 },
  slam: { wind:.55, act:.10, rec:.45, dmg:12, range:118, stun:.38, kb:220 },
  hay:  { wind:.78, act:.12, rec:.60, dmg:17, range:130, stun:.55, kb:420, big:true, armor:true },
  spin: { wind:.62, act:.14, rec:.60, dmg:13, range:138, stun:.45, kb:380, big:true, armor:true, both:true },
};

const LINES = {
  start: ["Yana bitta qurbon keldi!", "Men har kuni 200 kilo ko'taraman!", "Kel, kichkina, kel!", "Mushaklarimni ko'rdingmi?"],
  coopStart: ["Ikkitami? Mayli, ikkalangiz ham!", "Ikkingiz birga ham kuchsizsiz!", "Bittangiz kam edi, ikkita keldingizmi?"],
  hay:   ["KACHOK ZARBA!", "Mana senga!", "Ushla buni!", "Protein kuchi!"],
  spin:  ["AYLANMA ZARBA!", "Hammangizga yetadi!", "Atrofimdan ket!"],
  hurt:  ["Voy!", "Bu nima edi?!", "Hm, yomon emas...", "Qitiqladingmi?", "Ey!"],
  back:  ["Orqadan urma!", "Nomard!", "Kim urdi?!"],
  flex:  ["Mana mushak!", "Qara, qara!", "Bitseps 50 sm!", "Zalga yur, o'rgataman!"],
  taunt: ["Qochma!", "Qani, ur!", "Charchadingmi?", "Bu boksmi yoki raqs?"],
  armor: ["Bas qil!", "Endi menga navbat!", "Yetar!"],
  down:  ["Bittasi tayyor!", "Keyingisi kim?", "Bitta qoldi!"],
  stun:  "Boshim aylanyapti...",
  rage:  "ENDI JAHLIM CHIQDI!",
  win:   ["Kachok doim yutadi!", "Protein ich, keyin kel!", "Keyingisi kim?"],
  lose:  "Bu... mumkin emas...",
};
const pick = a => a[Math.random()*a.length|0];
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t) => a + (b-a)*t;
const lp = (p,q,t) => ({ x:lerp(p.x,q.x,t), y:lerp(p.y,q.y,t) });

/* =========================================================
   HOLAT
   ========================================================= */
let players = [], ali, fight, ai, lvl, coop = false;
let gameMode = "solo", netGame = false, myIndex = 0;   // "solo" | "coop" (bitta qurilma) | "online"
let fx = [], shake = 0, hitstop = 0, timeScale = 1, hype = 0, now = 0, banner = null;
let running = false, paused = false;

function newStats(){ return { thrown:0, landed:0, dealt:0, taken:0, combo:0, comboT:0, maxCombo:0, dodges:0 }; }
function makeFighter(o){
  return Object.assign({
    x:0, vx:0, kb:0, facing:1, hp:100, maxHp:100, ghost:100, sta:100,
    state:"idle", t:0, atk:null, atkName:null, hitDone:false, flash:0, walk:0,
    speedMul:1, dmgMul:1, recMul:1, stunT:0, bobPh:Math.random()*6,
    poise:100, poiseT:0, recent:0, recentT:0, blockDur:0, rage:false, speech:null,
    keys:{ left:false, right:false, block:false }, pending:null, tiredT:0, st:newStats()
  }, o);
}
function aliSpeed(rage){ return Math.max(.55, (1 - (lvl-1)*.035) * (rage ? .72 : 1)); }
function profileOf(key){
  const u = accounts[key];
  return { key, name:u.name, glove:u.glove, up:{ ...ups(u) }, coopWins:u.coopWins || 0 };
}
function makePlayer(pr, idx, x){
  const u = { name:String(pr.name || "?").slice(0,16), up:{} };
  for (const id of ["hp","dmg","sta","spd","def"]) u.up[id] = clamp((pr.up && pr.up[id]) | 0, 0, 5);
  const key = pr.key;
  let g = GLOVES.includes(pr.glove) ? pr.glove : GLOVES[0];
  if (idx === 1 && players[0] && players[0].look.glove === g) g = GLOVES[(GLOVES.indexOf(g)+2) % GLOVES.length];
  const look = { scale:1, skin: idx ? "#e3a978" : "#f0c29a", skinD: idx ? "#c2864f" : "#d29a6c",
    shorts: idx ? "#93c5fd" : "#e5e7eb", trim:g, glove:g, gr:12, tw:20, aw:12, lw:14, ali:false };
  // kuchaytirishlar
  const up = ups(u);
  const maxHp = 100 + 15*up.hp, staMax = 100 + 10*up.sta;
  return makeFighter({ x, facing:1, look, key, name:u.name, idx, tag:(idx+1)+"P", profile:pr,
    hp:maxHp, maxHp, ghost:maxHp, sta:staMax, staMax, staRegen:24*(1 + .12*up.sta),
    dmgMul:1 + .08*up.dmg, speedMul:1 - .05*up.spd, walkMul:1 + .05*up.spd,
    blockMul:.15 - .02*up.def, blockDrain:1 - .1*up.def });
}
const LOOK_A = { scale:1.24, skin:"#c68650", skinD:"#9a5f33", shorts:"#b91c1c", trim:"#fde68a", glove:"#f59e0b", gr:14, tw:30, aw:17, lw:19, ali:true };

const START_X = () => coop ? { p:[250,710], a:480 } : { p:[300], a:660 };

function startGame(mode, setup){
  if (mode === "coop" && (!p2Key || !accounts[p2Key])) mode = "solo";
  if (mode === "online" && !net) mode = "solo";
  gameMode = mode; coop = mode !== "solo"; netGame = mode === "online";
  myIndex = netGame && net.role === "guest" ? 1 : 0;
  let profiles;
  if (netGame){
    if (setup){ profiles = setup.players.slice(0,2); lvl = clamp(setup.lvl | 0, 1, 10); }
    else {
      profiles = [profileOf(userKey), net.remote];
      lvl = Math.min(10, 1 + Math.max(profiles[0].coopWins | 0, profiles[1].coopWins | 0));
    }
  } else if (coop){ profiles = [profileOf(userKey), profileOf(p2Key)]; lvl = coopLevel(); }
  else { profiles = [profileOf(userKey)]; lvl = aliLevel(); }
  const sx = START_X();
  players = [];
  profiles.forEach((pr, i) => players.push(makePlayer(pr, i, sx.p[i])));
  netEvents = []; netAcc = 0;
  const aHp = Math.round((140 + (lvl-1)*15) * (coop ? 2.4 : 1));
  ali = makeFighter({ x:sx.a, facing:-1, hp:aHp, maxHp:aHp, ghost:aHp, sta:999, look:LOOK_A, isAli:true,
                      speedMul:aliSpeed(false), dmgMul:(1 + (lvl-1)*.08) * (coop ? 1.2 : 1), name:"Ali Kachok" });
  fight = { round:1, time:ROUND_TIME, phase:"intro", phaseT:0, elapsed:0, winner:null };
  ai = { think:1.2, queue:[], backT:0, tauntT:7, farT:0, target:players[0], retargetT:3 };
  fx = []; shake = 0; hitstop = 0; timeScale = 1; hype = .3;
  setBanner("1-RAUND", (coop ? "Jamoa · " : "") + "Ali Kachok · " + lvl + "-daraja");
  say(pick(coop ? LINES.coopStart : LINES.start), 2.6);
  running = true; paused = false;
  $("#stage").classList.toggle("coop-mode", coop);
  $("#keysHint").innerHTML = (coop && !netGame)
    ? `<b>1P:</b> <kbd>A</kbd>/<kbd>D</kbd> yurish · <kbd>W</kbd> chap · <kbd>S</kbd> himoya · <kbd>F</kbd> jab · <kbd>G</kbd> xuk · <kbd>H</kbd> aperkot<br>
       <b>2P:</b> <kbd>←</kbd>/<kbd>→</kbd> yurish · <kbd>↑</kbd> chap · <kbd>↓</kbd> himoya · <kbd>,</kbd> jab · <kbd>.</kbd> xuk · <kbd>/</kbd> aperkot
       <span style="opacity:.7">(yoki Num1/2/3)</span> · <kbd>P</kbd> pauza`
    : `<kbd>A</kbd>/<kbd>D</kbd> yurish · <kbd>J</kbd> jab · <kbd>K</kbd> xuk · <kbd>L</kbd> aperkot ·
       <kbd>S</kbd> himoya · <kbd>Probel</kbd> chap berish · <kbd>P</kbd> pauza · <kbd>M</kbd> ovoz`;
  buildTouch();
  hideOverlay();
  show("scr-game");
}

/* =========================================================
   YORDAMCHILAR
   ========================================================= */
function setState(f,s){ f.state = s; f.t = 0; }
function setBanner(text, sub, dur){ emit(["b", text, sub, dur]); banner = { text, sub:sub||"", t:0, dur:dur||1.6 }; }
function say(text, dur){ ali.speech = { text, t:dur || 1.8 }; }
function popText(x,y,text,color,size){
  emit(["p", Math.round(x), Math.round(y), text, color, size]);
  fx.push({ k:"txt", x, y, vy:-55, life:0, max:1, text, color:color||"#fff", size:size||22 });
}
function sparks(x,y,n,color,spd){
  emit(["k", Math.round(x), Math.round(y), n, color, spd]);
  for (let i=0;i<n;i++){
    const a = Math.random()*TAU, s = (spd||260)*(.4+Math.random()*.8);
    fx.push({ k:"spk", x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s-60, life:0, max:.25+Math.random()*.25, color:color||"#fde68a", r:2+Math.random()*3 });
  }
}
function headY(f){ return FLOOR - 191*f.look.scale; }
const BUSY = s => s==="wind" || s==="act" || s==="rec";
const alive = () => players.filter(p => p.state !== "ko");
const inFront = (a, b) => Math.sign(b.x - a.x) === a.facing;
function nearestAlive(){
  let best = null, bd = 1e9;
  for (const p of alive()){ const d = Math.abs(p.x - ali.x); if (d < bd){ bd = d; best = p; } }
  return best;
}
function surrounded(){
  const al = alive().filter(p => Math.abs(p.x - ali.x) < 150);
  return al.some(p => p.x < ali.x) && al.some(p => p.x > ali.x);
}

function startAttack(f, name){
  const table = f.isAli ? A_ATK : P_ATK;
  f.atk = table[name]; f.atkName = name; f.hitDone = false; f.recMul = 1;
  setState(f, "wind");
  if (!f.isAli){ f.st.thrown++; aiOnPlayerAttack(f); }
}

/* =========================================================
   ZARBA HISOBI
   ========================================================= */
function aliStrike(a){
  if (fight.phase !== "fight") return;
  const atk = a.atk; let any = false;
  for (const p of players){
    if (p.state === "ko") continue;
    if (Math.abs(p.x - a.x) > atk.range) continue;
    if (!atk.both && !inFront(a, p)) continue;
    any = true; resolveHit(a, p);
  }
  if (!any){ sfx("whiff"); a.recMul = 1.3; }
}

function resolveHit(a, d){
  if (fight.phase !== "fight" || d.state === "ko") return;
  const atk = a.atk, dist = Math.abs(a.x - d.x);
  const dir = Math.sign(d.x - a.x) || a.facing;      // hujumchidan himoyachiga
  const hx = d.x - dir*(d.isAli ? 30 : 18), hy = headY(d) + 6;

  if (dist > atk.range){ sfx("whiff"); return; }
  if (d.state === "dodge" && d.t < .26){
    sfx("whiff");
    if (!d.isAli){
      popText(d.x, headY(d)-30, "CHAP!", "#7dd3fc", 22);
      d.st.dodges++; d.sta = Math.min(d.staMax, d.sta + 12);
      a.recMul = 1.7;  // Ali ochiq qoladi
    }
    return;
  }

  let dmg = atk.dmg * a.dmgMul * (a.rage ? 1.2 : 1);
  let blocked = d.state === "block" && d.facing === -dir;
  if (blocked && !d.isAli && d.sta < (atk.big ? 30 : 1)){
    blocked = false; dmg *= .7;
    popText(d.x, headY(d)-40, "HIMOYA SINDI!", "#fca5a5", 22);
  }

  if (blocked){
    dmg *= d.isAli ? .15 : d.blockMul;
    d.hp = Math.max(0, d.hp - dmg);
    if (!d.isAli) d.sta = Math.max(0, d.sta - (atk.big ? 30 : 12) * d.blockDrain);
    d.kb = dir * (atk.big ? 260 : 90);
    sparks(hx, hy+20, 6, "#cbd5e1", 180); sfx("block");
    if (!a.isAli){ a.st.dealt += dmg; if (Math.random()<.35) popText(d.x, headY(d)-40, "Himoyada", "#94a3b8", 16); }
    else d.st.taken += dmg;
    checkKO(d, a);
    return;
  }

  // to'liq zarba
  const counter = d.state === "wind";
  const fromBehind = d.isAli && d.facing === dir;   // Ali teskari qarab turibdi
  if (counter) dmg *= 1.5;
  if (fromBehind) dmg *= 1.2;
  if (d.state === "stun") dmg *= 1.25;
  d.hp = Math.max(0, d.hp - dmg);
  d.flash = .12;
  hitstop = atk.big || a.atkName==="upper" ? .09 : .05;
  shake = Math.max(shake, atk.big ? 16 : a.atkName==="upper" ? 9 : 4);
  sparks(hx, hy, atk.big ? 18 : 10, counter ? "#fca5a5" : "#fde68a", atk.big ? 360 : 260);
  sfx(atk.big || a.atkName==="upper" || counter ? "big" : "hit");
  hype = Math.min(1, hype + (atk.big ? .25 : .08));

  if (!a.isAli){
    const s = a.st;
    s.landed++; s.dealt += dmg;
    s.combo = s.comboT > 0 ? s.combo + 1 : 1; s.comboT = .9;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    popText(d.x + (Math.random()*30-15), headY(d)-30, "-" + Math.round(dmg), counter ? "#f87171" : "#fff", counter ? 26 : 20);
    if (counter) popText(d.x, headY(d)-62, "KONTR!", "#fbbf24", 26);
    else if (fromBehind && Math.random() < .5) popText(d.x, headY(d)-62, "ORQADAN!", "#7dd3fc", 20);
    if (s.combo >= 3) popText(d.x, headY(d)-92, (coop ? a.tag + " " : "") + s.combo + " ZARBA KOMBO!", "#fbbf24", 18 + Math.min(10, s.combo));
    aliTakeHit(atk, counter, a, fromBehind);
  } else {
    d.st.taken += dmg;
    popText(d.x, headY(d)-30, "-" + Math.round(dmg), "#fca5a5", atk.big ? 28 : 20);
    if (a.atkName === "hay") popText(d.x, headY(d)-62, "KACHOK ZARBA!", "#ef4444", 26);
    d.st.combo = 0;
    d.kb = dir * atk.kb;
    if (d.hp > 0){ setState(d, "hit"); d.stunT = atk.stun; d.atk = null; }
  }
  checkKO(d, a);
}

function aliTakeHit(atk, counter, attacker, fromBehind){
  const a = ali;
  // jamoa rejimida Ali chidamliroq: muvozanati sekinroq tugaydi, tezroq qaytarma beradi
  a.poise -= atk.poise * (counter ? 1.5 : 1) * (coop ? .55 : 1); a.poiseT = 1.5;
  a.recentT > 0 ? a.recent++ : (a.recent = 1); a.recentT = 1.1;
  if (a.hp <= 0 || a.state === "stun") return;
  // kim urgan bo'lsa, o'shanga qarshi burilishi mumkin
  if (coop && attacker !== ai.target && Math.random() < (fromBehind ? .35 : .2)){
    ai.target = attacker; ai.retargetT = 3;
    if (fromBehind && !a.speech) say(pick(LINES.back), 1.2);
  }

  // katta zarba tayyorlanayotganda — zirh (faqat aperkot to'xtatadi)
  if (a.state === "wind" && a.atk && a.atk.armor){
    if (atk === P_ATK.upper){
      popText(a.x, headY(a)-120, "ZO'R KONTR!", "#fbbf24", 30);
      a.poise = 0;
    } else {
      if (Math.random()<.5) popText(a.x, headY(a)-120, "ZIRH!", "#94a3b8", 18);
      if (a.poise > 0) return;
    }
  }
  if (a.poise <= 0){
    a.poise = 100; setState(a, "stun"); a.atk = null; ai.queue = [];
    say(LINES.stun, 1.6); sfx("stun");
    return;
  }
  if (a.recent >= (coop ? 3 : 4)){
    a.recent = 0; a.atk = null; ai.queue = [];
    if (coop && surrounded()){ startAttack(a, "spin"); say(pick(LINES.spin), 1.3); }
    else { setState(a, "block"); a.blockDur = .75; say(pick(LINES.armor), 1.3); }
    return;
  }
  setState(a, "hit"); a.stunT = atk.stun * (coop ? .55 : 1); a.atk = null; ai.queue = [];
  a.kb = Math.sign(a.x - attacker.x) * 70;
  if (Math.random() < .18 && !a.speech) say(pick(LINES.hurt), 1.2);
}

function checkKO(d, a){
  if (d.hp > 0 || fight.phase !== "fight" || d.state === "ko") return;
  setState(d, "ko"); d.atk = null; d.pending = null;
  if (!d.isAli && alive().length > 0){
    // jamoa rejimi: bittasi yiqildi, ikkinchisi davom etadi
    shake = 14; hitstop = .12; sfx("big"); hype = 1;
    popText(d.x, headY(d)-70, d.tag + " NOKAUT!", "#ef4444", 30);
    say(pick(LINES.down), 2);
    ai.target = nearestAlive(); ai.queue = [];
    return;
  }
  fight.phase = "ko"; fight.phaseT = 0; fight.winner = d.isAli ? "players" : "ali";
  timeScale = .25; shake = 22; hitstop = .15; hype = 1;
  setBanner("NOKAUT!", d.isAli ? "Ali Kachok yiqildi!" : "Ali Kachok yutdi", 3);
  sfx("bell"); sfx("crowd");
  if (d.isAli) say(LINES.lose, 3); else say(pick(LINES.win), 3);
}

/* =========================================================
   ALI KACHOK SUN'IY INTELLEKTI
   ========================================================= */
function aiOnPlayerAttack(attacker){
  const a = ali;
  if (fight.phase !== "fight" || !(a.state==="idle" || a.state==="walk")) return;
  if (!inFront(a, attacker) || Math.abs(a.x - attacker.x) > 150) return;
  const chance = Math.min(.5, .16 + lvl*.035) * (a.rage ? .6 : 1) * (coop ? .8 : 1);
  if (Math.random() < chance){ setState(a, "block"); a.blockDur = .45 + Math.random()*.3; }
}

function updateAli(dt){
  const a = ali;
  ai.retargetT -= dt;
  if (!ai.target || ai.target.state === "ko" || ai.retargetT <= 0){
    ai.target = nearestAlive(); ai.retargetT = 2.5 + Math.random()*2.5;
  }
  const p = ai.target;
  if (!p) return;
  if (a.state === "block"){
    a.vx = 0;
    if (a.t >= a.blockDur){ setState(a, "idle"); if (Math.random() < .55) startAttack(a, "jab"); }
    return;
  }
  if (a.state === "flex"){ a.vx = 0; if (a.t >= 1.1) setState(a, "idle"); return; }
  if (!(a.state === "idle" || a.state === "walk")){ a.vx = 0; return; }

  if (ai.queue.length){ startAttack(a, ai.queue.shift()); return; }

  const dist = Math.abs(a.x - p.x);
  ai.think -= dt; ai.tauntT -= dt;
  if (ai.tauntT <= 0 && !a.speech){ say(pick(LINES.taunt), 1.4); ai.tauntT = 7 + Math.random()*6; }

  if (ai.backT > 0){ ai.backT -= dt; a.vx = -a.facing * 120; a.state = "walk"; return; }

  if (dist > 112){
    ai.farT += dt;
    const spd = (100 + lvl*8) * (a.rage ? 1.3 : 1) * (dist > 260 && ai.farT > 1.5 ? 1.8 : 1);
    a.vx = a.facing * spd; a.state = "walk";
    return;
  }
  ai.farT = 0; a.vx = 0; a.state = "idle";

  if (ai.think <= 0){
    ai.think = (.45 + Math.random()*.65) * (a.rage ? .6 : 1) * Math.max(.6, 1 - lvl*.04) * (coop ? .75 : 1);
    const r = Math.random();
    if (coop && surrounded() && r < .3){ startAttack(a, "spin"); say(pick(LINES.spin), 1.2); return; }
    if (!coop && dist < 92 && r < .2){ ai.backT = .35; return; }
    if (r < .42) startAttack(a, "jab");
    else if (r < .66){ startAttack(a, "hay"); say(pick(LINES.hay), 1.2); }
    else if (r < .86){ startAttack(a, "jab"); ai.queue = Math.random() < .5 ? ["jab", a.rage ? "hay" : "slam"] : ["slam"]; }
    else if (r < .93) startAttack(a, "slam");
    else if (!a.rage){ setState(a, "flex"); say(pick(LINES.flex), 1.2); }
    else { startAttack(a, "hay"); say(pick(LINES.hay), 1.2); }
  }
}

/* =========================================================
   O'YINCHI
   ========================================================= */
function updatePlayer(p, dt){
  if (p.state === "ko"){ p.vx = 0; return; }
  const k = p.keys;
  const free = p.state==="idle" || p.state==="walk" || p.state==="block";
  if (free){
    if (k.block){ if (p.state !== "block") setState(p, "block"); p.vx = 0; }
    else {
      if (p.state === "block") setState(p, "idle");
      const mv = (k.right ? 1 : 0) - (k.left ? 1 : 0);
      p.vx = mv * 240 * p.walkMul;
      p.state = mv ? "walk" : "idle";
    }
  } else p.vx = 0;

  if (p.pending){
    p.pending.ttl -= dt;
    if (p.pending.ttl <= 0) p.pending = null;
    else if (free){
      const act = p.pending.a; p.pending = null;
      if (act === "dodge"){
        if (p.sta >= 12){
          p.sta -= 12; setState(p, "dodge");
          p.dodgeDir = k.left ? -1 : k.right ? 1 : -p.facing;
        } else tired(p);
      } else {
        const atk = P_ATK[act];
        if (p.sta >= atk.sta){ p.sta -= atk.sta; startAttack(p, act); }
        else tired(p);
      }
    }
  }
}
function tired(p){ if (p.tiredT <= 0){ popText(p.x, headY(p)-30, "Charchadim!", "#fde047", 18); p.tiredT = .8; } }

/* =========================================================
   UMUMIY YANGILASH
   ========================================================= */
function updateFighter(f, dt){
  f.t += dt; f.flash = Math.max(0, f.flash - dt);
  f.ghost = f.ghost > f.hp ? Math.max(f.hp, f.ghost - dt*f.maxHp*.35) : f.hp;
  if (f.speech){ f.speech.t -= dt; if (f.speech.t <= 0) f.speech = null; }
  switch (f.state){
    case "wind":
      if (f.t >= f.atk.wind * f.speedMul) setState(f, "act");
      break;
    case "act":
      if (!f.hitDone){ f.hitDone = true; f.isAli ? aliStrike(f) : resolveHit(f, ali); }
      if (f.state === "act" && f.t >= f.atk.act) setState(f, "rec");
      break;
    case "rec":
      if (f.t >= f.atk.rec * f.speedMul * f.recMul){ setState(f, "idle"); f.atk = null; }
      break;
    case "hit":  if (f.t >= f.stunT) setState(f, "idle"); break;
    case "stun": if (f.t >= 1.6) setState(f, "idle"); break;
    case "dodge":
      f.x += f.dodgeDir * 430 * dt * Math.max(0, 1 - f.t/.32);
      if (f.t >= .32) setState(f, "idle");
      break;
  }
  if (f.state === "walk") f.walk += Math.abs(f.vx) * dt * .06;
  f.x += (f.vx + f.kb) * dt;
  f.kb -= f.kb * Math.min(1, dt*9);
}

function celebrate(playersWon){
  if (playersWon){
    players.forEach(p => { if (p.state !== "ko" && p.state !== "win" && !BUSY(p.state)) setState(p, "win"); });
  } else if (ali.state !== "flex" && !BUSY(ali.state)) setState(ali, "flex");
}

function update(raw){
  now += raw;
  players.forEach(p => p.tiredT -= raw);
  if (banner){ banner.t += raw; if (banner.t > banner.dur) banner = null; }
  updateFx(raw);
  shake = Math.max(0, shake - raw*40);
  hype = Math.max(.15, hype - raw*.08);
  if (hitstop > 0){ hitstop -= raw; return; }
  timeScale = Math.min(1, timeScale + raw*.6);
  const dt = raw * timeScale;
  fight.phaseT += raw;

  if (fight.phase === "intro"){
    if (fight.phaseT > 1.7){
      fight.phase = "fight"; fight.phaseT = 0;
      setBanner("JANG!", "", .9); sfx("bell1");
    }
  } else if (fight.phase === "fight"){
    fight.time -= dt; fight.elapsed += dt;
    players.forEach(p => { p.st.comboT -= dt; updatePlayer(p, dt); });
    updateAli(dt);
    if (!ali.rage && ali.hp > 0 && ali.hp < ali.maxHp*.35){
      ali.rage = true; ali.speedMul = aliSpeed(true);
      say(LINES.rage, 2); sfx("rage"); shake = 10;
      popText(ali.x, headY(ali)-110, "G'AZAB REJIMI!", "#ef4444", 28);
    }
    if (fight.time <= 0 && fight.phase === "fight"){ fight.time = 0; endRound(); }
  } else if (fight.phase === "roundEnd"){
    if (fight.phaseT > 2.6) nextRound();
  } else if (fight.phase === "ko"){
    if (fight.phaseT > 1.2) celebrate(fight.winner === "players");
    if (fight.phaseT > 3.4) finishFight(fight.winner === "players", "ko");
  } else if (fight.phase === "decision"){
    if (fight.phaseT > 1.8 && !fight.announced){
      fight.announced = true;
      const dealt = players.reduce((s,p) => s + p.st.dealt, 0);
      const taken = players.reduce((s,p) => s + p.st.taken, 0);
      const pScore = dealt / ali.maxHp, aScore = taken / players.reduce((s,p) => s + p.maxHp, 0);
      fight.pWon = pScore > aScore;
      setBanner(fight.pWon ? (coop ? "JAMOA G'OLIB!" : players[0].name.toUpperCase()) : "ALI KACHOK",
                fight.pWon && coop ? players.map(p => p.name).join(" & ") + " · hakamlar qarori" : "hakamlar qarori bilan g'olib", 2.4);
      sfx("crowd");
      if (!fight.pWon) say(pick(LINES.win), 2.5); else say("Hakamlar sotilgan!", 2.5);
    }
    if (fight.announced) celebrate(fight.pWon);
    if (fight.phaseT > 4.4) finishFight(fight.pWon, "decision");
  }

  if (fight.phase !== "fight"){
    [ali, ...players].forEach(f => { f.vx = 0; if (f.state === "walk") f.state = "idle"; });
  }

  // stamina
  for (const p of players){
    if (p.state==="idle" || p.state==="walk") p.sta = Math.min(p.staMax, p.sta + p.staRegen*dt);
    else if (p.state==="block") p.sta = Math.min(p.staMax, p.sta + 6*dt);
  }
  // Alining muvozanati tiklanadi
  ali.poiseT -= dt; ali.recentT -= dt;
  if (ali.poiseT <= 0) ali.poise = Math.min(100, ali.poise + 14*dt);

  players.forEach(p => updateFighter(p, dt));
  updateFighter(ali, dt);

  // bir-biriga qarash
  for (const p of players) if (p.state !== "ko") p.facing = ali.x > p.x ? 1 : -1;
  if (ali.state !== "ko"){
    const t = (ai.target && ai.target.state !== "ko") ? ai.target : nearestAlive();
    if (t && !BUSY(ali.state)) ali.facing = t.x > ali.x ? 1 : -1;
  }
  // ajratish va ring chegarasi
  for (let i=0;i<2;i++){
    for (const p of players){
      if (p.state === "ko") continue;
      const dx = ali.x - p.x;
      if (Math.abs(dx) < MIN_GAP){
        const s = dx >= 0 ? 1 : -1, push = (MIN_GAP - Math.abs(dx));
        p.x -= s*push*.6; ali.x += s*push*.4;
      }
    }
    players.forEach(p => p.x = clamp(p.x, RING_L, RING_R));
    ali.x = clamp(ali.x, RING_L, RING_R);
  }
}

function endRound(){
  fight.phase = "roundEnd"; fight.phaseT = 0;
  sfx("bell");
  [ali, ...players].forEach(f => { if (f.state !== "ko"){ setState(f, "idle"); f.atk = null; } f.pending = null; });
  ai.queue = [];
  if (fight.round >= ROUNDS){
    fight.phase = "decision"; fight.announced = false;
    setBanner("VAQT TUGADI", "Hakamlar qarori...", 1.8);
  } else setBanner(fight.round + "-RAUND TUGADI", "Dam olish...", 2.4);
}
function nextRound(){
  fight.round++; fight.time = ROUND_TIME; fight.phase = "intro"; fight.phaseT = 0;
  const sx = START_X();
  players.forEach((p,i) => {
    if (p.state === "ko"){
      setState(p, "idle"); p.hp = p.maxHp*.25;
      popText(p.x, headY(p)-40, p.tag + " o'rnidan turdi!", "#86efac", 22);
    } else p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - p.hp)*.3);
    p.ghost = p.hp; p.sta = p.staMax; p.x = sx.p[i]; p.kb = 0;
  });
  ali.hp = Math.min(ali.maxHp, ali.hp + (ali.maxHp - ali.hp)*.2);
  ali.ghost = ali.hp; ali.poise = 100; ali.x = sx.a; ali.kb = 0;
  ai.target = players[0];
  setBanner(fight.round + "-RAUND", fight.round === ROUNDS ? "Oxirgi raund!" : "");
  say(pick(LINES.taunt), 1.6);
}

/* =========================================================
   EFFEKTLAR
   ========================================================= */
function updateFx(dt){
  for (let i=fx.length-1;i>=0;i--){
    const e = fx[i]; e.life += dt;
    if (e.life >= e.max){ fx.splice(i,1); continue; }
    if (e.k === "txt"){ e.y += e.vy*dt; e.vy *= .96; }
    else { e.x += e.vx*dt; e.y += e.vy*dt; e.vy += 700*dt; }
  }
}

/* =========================================================
   CHIZISH — ARENA
   ========================================================= */
const crowd = [];
for (let i=0;i<210;i++){
  const y = 115 + Math.random()*170;
  crowd.push({ x:Math.random()*W, y, r:7 + (y-115)/170*6 + Math.random()*2,
    c:`hsl(${Math.random()*360|0},${15+Math.random()*25|0}%,${14+Math.random()*16|0}%)`, ph:Math.random()*TAU, sp:2+Math.random()*3 });
}
crowd.sort((a,b) => a.y - b.y);
const flashes = [];

function drawArena(){
  let g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,"#05060a"); g.addColorStop(.55,"#121624"); g.addColorStop(1,"#0b0d14");
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);

  for (let i=0;i<6;i++){
    const x = 100 + i*152;
    const lg = ctx.createRadialGradient(x,30,2,x,30,60);
    lg.addColorStop(0,"rgba(255,244,214,.55)"); lg.addColorStop(1,"rgba(255,244,214,0)");
    ctx.fillStyle = lg; ctx.fillRect(x-60,0,120,90);
  }
  ctx.fillStyle = "#7f1d1d"; ctx.fillRect(250,62,460,40);
  ctx.fillStyle = "#fbbf24"; ctx.font = "900 22px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("★ ALI KACHOK ARENA ★", W/2, 83);

  for (const c of crowd){
    const by = -Math.abs(Math.sin(now*c.sp*(1+hype) + c.ph)) * (1 + hype*7);
    ctx.fillStyle = c.c;
    ctx.beginPath(); ctx.arc(c.x, c.y+by, c.r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(c.x, c.y+by+c.r*2, c.r*1.5, c.r*1.15, 0, 0, TAU); ctx.fill();
    if (hype > .6 && ((c.ph*10|0) % 5 === 0)){
      ctx.strokeStyle = c.c; ctx.lineWidth = c.r*.7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(c.x-c.r, c.y+by+c.r*1.4); ctx.lineTo(c.x-c.r*1.6, c.y+by-c.r*1.6); ctx.stroke();
    }
  }
  if (Math.random() < .02 + hype*.12) flashes.push({ x:Math.random()*W, y:120+Math.random()*160, t:0 });
  for (let i=flashes.length-1;i>=0;i--){
    const f = flashes[i]; f.t += 1/60;
    if (f.t > .12){ flashes.splice(i,1); continue; }
    ctx.fillStyle = `rgba(255,255,255,${1-f.t/.12})`;
    ctx.beginPath(); ctx.arc(f.x,f.y,3,0,TAU); ctx.fill();
  }
  g = ctx.createLinearGradient(0,240,0,FLOOR-40);
  g.addColorStop(0,"rgba(5,6,10,0)"); g.addColorStop(1,"rgba(5,6,10,.85)");
  ctx.fillStyle = g; ctx.fillRect(0,240,W,FLOOR-280);

  const top = FLOOR-55, bot = FLOOR+45;
  g = ctx.createLinearGradient(0,top,0,bot);
  g.addColorStop(0,"#b9b2a1"); g.addColorStop(1,"#ddd6c4");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(90,top); ctx.lineTo(870,top); ctx.lineTo(930,bot); ctx.lineTo(30,bot); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(W/2, FLOOR-5); ctx.scale(1,.28);
  ctx.fillStyle = "rgba(185,28,28,.35)"; ctx.beginPath(); ctx.arc(0,0,120,0,TAU); ctx.fill();
  ctx.fillStyle = "rgba(251,191,36,.5)"; ctx.font = "900 90px system-ui,sans-serif"; ctx.fillText("AK",0,8);
  ctx.restore();
  ctx.fillStyle = "#7f1d1d"; ctx.fillRect(30,bot,900,H-bot);
  ctx.fillStyle = "#991b1b"; ctx.fillRect(30,bot,900,6);
  ctx.fillStyle = "#fbbf24"; ctx.font = "900 30px system-ui,sans-serif";
  if (!coop){ ctx.fillText("ALI KACHOK", W/2-230, bot+36); ctx.fillText("BOKS", W/2, bot+36); ctx.fillText("ALI KACHOK", W/2+230, bot+36); }

  const ropes = ["#ef4444","#f8fafc","#3b82f6"];
  ropes.forEach((c,i) => {
    const h = 45 + i*45;
    ctx.strokeStyle = c; ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(90, top-h); ctx.lineTo(870, top-h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(90, top-h); ctx.lineTo(30, bot-h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(870, top-h); ctx.lineTo(930, bot-h); ctx.stroke();
  });
  [[90,top],[870,top]].forEach(([x,y]) => { ctx.fillStyle = "#d1d5db"; ctx.fillRect(x-6, y-150, 12, 150); });

  const sg = ctx.createRadialGradient(W/2, FLOOR-120, 20, W/2, FLOOR-120, 420);
  sg.addColorStop(0,"rgba(255,248,230,.10)"); sg.addColorStop(1,"rgba(255,248,230,0)");
  ctx.fillStyle = sg; ctx.fillRect(0,0,W,H);
}
function drawFrontPosts(){
  const bot = FLOOR+45;
  [30,930].forEach(x => {
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(x-8, bot-150, 16, 150);
    ctx.fillStyle = x < W/2 ? "#2563eb" : "#b91c1c"; ctx.fillRect(x-10, bot-150, 20, 26);
  });
}

/* =========================================================
   CHIZISH — BOKSCHI
   ========================================================= */
const G_FRONT = { x:30, y:-174 }, G_BACK = { x:16, y:-160 };
function getPose(f){
  const st = f.state;
  const bob = (st==="idle" || st==="walk" || st==="block") ? Math.sin(now*7 + f.bobPh)*3 : 0;
  const p = { lean: st==="walk" ? 3 : 0, by:bob, front:{...G_FRONT}, back:{...G_BACK} };
  if (BUSY(st) && f.atk){
    let e = 0;
    if (st === "wind") e = -Math.min(1, f.t / (f.atk.wind * f.speedMul));
    else if (st === "act") e = 1;
    else e = Math.max(0, 1 - f.t / (f.atk.rec * f.speedMul * f.recMul));
    const n = f.atkName;
    if (n === "jab"){
      const k = e < 0 ? e*.35 : e;
      p.front = lp(G_FRONT, { x:96, y:-172 }, k); p.lean = k*8;
    } else if (n === "spin"){
      if (e < 0){ const k = -e; p.back = lp(G_BACK, { x:-30, y:-200 }, k); p.front = lp(G_FRONT, { x:10, y:-205 }, k); p.by += k*6; }
      else { p.front = lp(G_FRONT, { x:100, y:-176 }, e); p.back = lp(G_BACK, { x:-84, y:-176 }, e); }
    } else if (n === "hook" || n === "hay"){
      if (e < 0){ const k = -e; p.back = lp(G_BACK, n==="hay" ? { x:-38, y:-205 } : { x:-14, y:-170 }, k); p.lean = -k*(n==="hay"?10:5); }
      else { p.back = lp(G_BACK, { x:94, y:-174 }, e); p.lean = e*(n==="hay"?16:12); }
    } else { // upper / slam
      if (e < 0){ const k = -e; p.back = lp(G_BACK, { x:8, y:-108 }, k); p.by += k*10; p.lean = -k*3; }
      else { p.back = lp(G_BACK, { x:62, y:-218 }, e); p.lean = e*10; p.by -= e*6; }
    }
  }
  if (st === "block"){ p.front = { x:34, y:-192 }; p.back = { x:30, y:-178 }; p.lean = -2; p.by += 4; }
  if (st === "dodge"){ p.lean = -18; p.by += 10; }
  if (st === "hit")  { p.lean = -12 * Math.max(0, 1 - f.t/f.stunT); }
  if (st === "stun") { p.lean = Math.sin(now*5)*7; p.front = { x:26, y:-128 }; p.back = { x:6, y:-122 }; p.by += 6; }
  if (st === "flex") { p.flex = true; p.by = Math.sin(now*10)*1.5; }
  if (st === "win")  { p.front = { x:24, y:-248 }; p.back = { x:-6, y:-244 }; p.by = -Math.abs(Math.sin(now*6))*8; }
  return p;
}

function limb(pts, w, color){
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}
function circle(x,y,r,c){ ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill(); }

function drawArm(s, g, L, skin, skinD, elbow, glow){
  let e = elbow;
  if (!e){
    const dx = g.x - s.x, dy = g.y - s.y, len = Math.hypot(dx,dy) || 1, half = 36;
    const bend = len < half*2 ? Math.sqrt(half*half - (len/2)*(len/2)) : 0;
    let nx = -dy/len, ny = dx/len; if (ny < 0){ nx = -nx; ny = -ny; }
    e = { x:(s.x+g.x)/2 + nx*bend, y:(s.y+g.y)/2 + ny*bend };
  }
  limb([s, e, g], L.aw, skin);
  if (L.ali){
    const bx = lerp(s.x, e.x, .5), by = lerp(s.y, e.y, .5);
    circle(bx, by - 2, L.aw*(elbow ? .85 : .62), skin);
    ctx.strokeStyle = skinD; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(bx, by-2, L.aw*(elbow ? .85 : .62), .2, 1.6); ctx.stroke();
  }
  if (glow){
    const gg = ctx.createRadialGradient(g.x,g.y,2,g.x,g.y,L.gr*3.2);
    gg.addColorStop(0,"rgba(239,68,68,.9)"); gg.addColorStop(1,"rgba(239,68,68,0)");
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(g.x,g.y,L.gr*3.2,0,TAU); ctx.fill();
  }
  const ang = Math.atan2(g.y - e.y, g.x - e.x);
  ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(ang);
  ctx.fillStyle = L.trim; ctx.fillRect(-L.gr-5, -L.gr*.6, 8, L.gr*1.2);
  ctx.fillStyle = L.glove; ctx.beginPath(); ctx.ellipse(0,0,L.gr*1.1,L.gr,0,0,TAU); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.beginPath(); ctx.ellipse(2,-L.gr*.4,L.gr*.55,L.gr*.3,0,0,TAU); ctx.fill();
  ctx.restore();
}

function drawFighter(f){
  const L = f.look, p = getPose(f), Y = p.by, lean = p.lean;
  const fl = f.flash > 0;
  const skin = fl ? "#ffffff" : L.skin, skinD = fl ? "#e5e7eb" : L.skinD;
  ctx.save();
  ctx.translate(f.x, FLOOR);
  ctx.fillStyle = "rgba(0,0,0,.3)";
  ctx.beginPath(); ctx.ellipse(f.state==="ko" ? -f.facing*100*L.scale*Math.min(1,f.t/.6) : 0, 4, (f.state==="ko"?110:46)*L.scale, 10*L.scale, 0, 0, TAU); ctx.fill();
  if (f.rage && f.state !== "ko"){
    const rg = ctx.createRadialGradient(0,-120*L.scale,20,0,-120*L.scale,160*L.scale);
    rg.addColorStop(0,`rgba(239,68,68,${.18+Math.sin(now*8)*.06})`); rg.addColorStop(1,"rgba(239,68,68,0)");
    ctx.fillStyle = rg; ctx.fillRect(-170*L.scale,-300*L.scale,340*L.scale,320*L.scale);
  }
  ctx.scale(f.facing * L.scale, L.scale);
  if (f.state === "ko"){
    const k = Math.min(1, f.t/.6), ease = 1 - (1-k)*(1-k);
    ctx.translate(-ease*20, 0); ctx.rotate(-ease*Math.PI/2*.96);
  }
  const shX = lean, shY = -165 + Y, tw = L.tw;
  const sB = { x:shX - 4, y:shY + 7 }, sF = { x:shX + 8, y:shY + 7 };
  const gF = { x:p.front.x + lean, y:p.front.y + Y }, gB = { x:p.back.x + lean, y:p.back.y + Y };
  let eF = null, eB = null;
  if (p.flex){
    eF = { x:shX+44, y:shY+2 }; eB = { x:shX-40, y:shY+2 };
    gF.x = shX+40; gF.y = shY-42; gB.x = shX-32; gB.y = shY-42;
  }
  const armorGlow = f.isAli && f.state === "wind" && f.atk && f.atk.armor;

  const sw = f.state === "walk" ? Math.sin(f.walk)*12 : 0;
  const shoe = "#111827";
  [[-7, -20 - sw], [7, 22 + sw]].forEach(([hx, fx_]) => {
    const hy = -92;
    const k = { x:(hx+fx_)/2 + 9, y:hy/2 - 2 + Y*.3 };
    limb([{x:hx,y:hy+Y*.5}, k, {x:fx_, y:-8}], L.lw, skinD);
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(fx_-L.lw*.5, -20, L.lw, 10);
    ctx.fillStyle = shoe; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(fx_-10, -12, 28, 12, 5) : ctx.rect(fx_-10,-12,28,12); ctx.fill();
  });

  drawArm(sB, gB, L, skinD, skinD, eB, armorGlow);

  ctx.fillStyle = L.shorts;
  ctx.beginPath();
  ctx.moveTo(-tw*.8, -104 + Y*.5); ctx.lineTo(tw*.8, -104 + Y*.5);
  ctx.lineTo(tw*.95 + 6, -62); ctx.lineTo(2, -66); ctx.lineTo(-tw*.95 - 6, -62); ctx.closePath(); ctx.fill();
  ctx.fillStyle = L.trim; ctx.fillRect(-tw*.8, -106 + Y*.5, tw*1.6, 7);

  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(shX - tw, shY);
  ctx.quadraticCurveTo(shX - tw - 3, shY + 35, -tw*.72, -100 + Y*.5);
  ctx.lineTo(tw*.72, -100 + Y*.5);
  ctx.quadraticCurveTo(shX + tw + 5, shY + 35, shX + tw, shY);
  ctx.quadraticCurveTo(shX, shY - 8, shX - tw, shY);
  ctx.fill();
  ctx.strokeStyle = skinD; ctx.lineWidth = 2;
  if (L.ali){
    ctx.beginPath(); ctx.arc(shX - 9, shY + 16, 13, .15*Math.PI, .9*Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(shX + 12, shY + 16, 13, .1*Math.PI, .85*Math.PI); ctx.stroke();
    for (let i=0;i<3;i++){
      const yy = shY + 38 + i*11;
      ctx.beginPath(); ctx.moveTo(shX*.5 - 9, yy); ctx.lineTo(shX*.5 - 2, yy+1); ctx.moveTo(shX*.5 + 3, yy+1); ctx.lineTo(shX*.5 + 10, yy); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(shX*.5, shY + 32); ctx.lineTo(shX*.3, -104); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(shX + 4, shY + 14, 10, .15*Math.PI, .85*Math.PI); ctx.stroke();
  }

  const hx = shX + 4, hy = shY - 24, hr = 17;
  ctx.fillStyle = skinD; ctx.fillRect(hx - (L.ali ? 11 : 7), hy + 8, L.ali ? 22 : 14, 18);
  if (L.ali){
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(hx, hy + 14, 14, .15*Math.PI, .85*Math.PI); ctx.stroke();
  }
  circle(hx, hy, hr, skin);
  circle(hx - 5, hy + 1, 4, skinD);
  circle(hx + hr - 1, hy + 1, 4, skin);
  const dead = f.state === "ko", dizzy = f.state === "stun";
  if (L.ali){
    ctx.fillStyle = "#1c1917";
    ctx.beginPath(); ctx.arc(hx, hy, hr + 1, Math.PI*1.0, Math.PI*1.88); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(28,25,23,.45)"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(hx + 1, hy + 2, hr - 3, .05*Math.PI, .75*Math.PI); ctx.stroke();
    ctx.strokeStyle = "#1c1917"; ctx.lineWidth = 4; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hx + 4, hy - 9); ctx.lineTo(hx + 15, hy - (f.rage || armorGlow ? 4 : 7)); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(hx + 7, hy + 7); ctx.quadraticCurveTo(hx + 14, hy + 4, hx + 19, hy + 9); ctx.stroke();
  } else {
    ctx.fillStyle = L.glove;
    ctx.beginPath(); ctx.arc(hx, hy, hr + 3, Math.PI*.75, Math.PI*1.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,.2)"; ctx.fillRect(hx - 6, hy - hr - 2, 4, 14);
  }
  ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
  if (dead){
    ctx.beginPath(); ctx.moveTo(hx+6,hy-6); ctx.lineTo(hx+12,hy); ctx.moveTo(hx+12,hy-6); ctx.lineTo(hx+6,hy); ctx.stroke();
  } else if (dizzy){
    ctx.beginPath(); ctx.arc(hx+9, hy-3, 3.5, now*8, now*8 + 5); ctx.stroke();
  } else {
    circle(hx + 9, hy - 3, 2.3, "#111");
  }
  if (!L.ali){
    ctx.beginPath(); ctx.moveTo(hx + 9, hy + 9); ctx.lineTo(hx + 15, hy + (f.state==="win" ? 7 : 9)); ctx.stroke();
  } else if (f.state === "flex" || f.state === "win"){
    ctx.fillStyle = "#fff"; ctx.fillRect(hx + 8, hy + 10, 9, 3);
  }

  drawArm(sF, gF, L, skin, skinD, eF, f.isAli && f.state === "wind" && f.atkName === "spin");
  ctx.restore();

  const sx = f.x + f.facing*L.scale*(shX + 4), sy = FLOOR + L.scale*(shY - 24);
  if (dizzy){
    for (let i=0;i<3;i++){
      const a = now*4 + i*TAU/3;
      drawStar(sx + Math.cos(a)*26, sy - 28*L.scale + Math.sin(a)*7, 7, "#fde047");
    }
  }
  if (armorGlow){
    ctx.fillStyle = "#ef4444"; ctx.font = "900 34px system-ui,sans-serif"; ctx.textAlign = "center";
    ctx.fillText(f.atkName === "spin" ? "!!" : "!", sx, sy - 40*L.scale + Math.sin(now*30)*2);
  }
  // jamoa rejimida o'yinchi belgisi
  if (coop && !f.isAli && f.state !== "ko"){
    const ty = sy - 44;
    ctx.fillStyle = L.glove; roundRect(sx - 16, ty - 13, 32, 20, 6); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx-6, ty+7); ctx.lineTo(sx+6, ty+7); ctx.lineTo(sx, ty+14); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "900 13px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(f.tag, sx, ty - 3); ctx.textBaseline = "alphabetic";
  }
}
function drawStar(x,y,r,c){
  ctx.fillStyle = c; ctx.beginPath();
  for (let i=0;i<10;i++){ const a = i*Math.PI/5 - Math.PI/2 + now*3, rr = i%2 ? r*.45 : r; ctx.lineTo(x + Math.cos(a)*rr, y + Math.sin(a)*rr); }
  ctx.closePath(); ctx.fill();
}

/* =========================================================
   CHIZISH — HUD
   ========================================================= */
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }
function bar(x,y,w,h,v,ghost,color,rtl){
  ctx.fillStyle = "rgba(0,0,0,.6)"; roundRect(x-3,y-3,w+6,h+6,7); ctx.fill();
  ctx.fillStyle = "#1f2937"; roundRect(x,y,w,h,5); ctx.fill();
  const gw = w*clamp(ghost,0,1), vw = w*clamp(v,0,1);
  ctx.save(); roundRect(x,y,w,h,5); ctx.clip();
  ctx.fillStyle = "#fef3c7"; ctx.fillRect(rtl ? x+w-gw : x, y, gw, h);
  ctx.fillStyle = color; ctx.fillRect(rtl ? x+w-vw : x, y, vw, h);
  ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(x, y, w, h*.4);
  ctx.restore();
}
function hpColor(v){ return v > .5 ? "#22c55e" : v > .25 ? "#eab308" : "#ef4444"; }

function drawPlayerHUD(p, right){
  const w = coop ? 330 : 350, x = right ? W - 24 - w : 24;
  const v = p.hp/p.maxHp;
  bar(x, 26, w, 22, v, p.ghost/p.maxHp, hpColor(v), right);
  const sw = 200, sx = right ? W - 24 - sw : 24;
  bar(sx, 56, sw, 8, p.sta/p.staMax, p.sta/p.staMax, p.sta < p.staMax*.25 ? "#f97316" : "#38bdf8", right);
  ctx.textBaseline = "alphabetic";
  ctx.font = "800 18px system-ui,sans-serif"; ctx.fillStyle = "#fff";
  ctx.textAlign = right ? "right" : "left";
  const nx = right ? W - 26 : 26;
  ctx.fillText((coop ? p.tag + " · " : "") + p.name.toUpperCase() + (netGame && p.idx === myIndex ? " (SIZ)" : ""), nx, 88);
  if (!coop){ ctx.font = "600 11px system-ui,sans-serif"; ctx.fillStyle = "#9aa3b5"; ctx.fillText("KUCH", sx + sw + 6, 64); }
  if (p.state === "ko"){
    ctx.font = "900 15px system-ui,sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
    ctx.fillText("NOKAUT · keyingi raundda turadi", x + w/2, 43);
  }
  if (p.st.combo >= 2 && p.st.comboT > 0){
    ctx.textAlign = right ? "right" : "left"; ctx.font = "900 24px system-ui,sans-serif"; ctx.fillStyle = "#fbbf24";
    ctx.fillText(p.st.combo + "x KOMBO", nx, 120);
  }
}

function drawHUD(){
  const av = ali.hp/ali.maxHp, aCol = ali.rage ? "#dc2626" : hpColor(av);
  drawPlayerHUD(players[0], false);
  if (coop){
    drawPlayerHUD(players[1], true);
    // Alining bosh-bari pastda
    const bx = 180, bw = 600, by = H - 44;
    ctx.fillStyle = "rgba(0,0,0,.55)"; roundRect(bx - 12, by - 30, bw + 24, 58, 10); ctx.fill();
    ctx.font = "900 15px system-ui,sans-serif"; ctx.fillStyle = "#fbbf24"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText("💪 ALI KACHOK", bx, by - 10);
    ctx.font = "700 12px system-ui,sans-serif"; ctx.fillStyle = "#cbd5e1"; ctx.textAlign = "right";
    ctx.fillText(lvl + "-DARAJA · " + Math.ceil(ali.hp) + " / " + ali.maxHp, bx + bw, by - 10);
    bar(bx, by, bw, 16, av, ali.ghost/ali.maxHp, aCol, false);
    bar(bx, by + 21, bw, 4, ali.poise/100, ali.poise/100, "#a78bfa", false);
  } else {
    bar(586, 26, 350, 22, av, ali.ghost/ali.maxHp, aCol, true);
    bar(716, 56, 220, 8, ali.poise/100, ali.poise/100, "#a78bfa", true);
    ctx.font = "800 18px system-ui,sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "right";
    ctx.fillText("ALI KACHOK", 934, 88);
    ctx.font = "600 11px system-ui,sans-serif"; ctx.fillStyle = "#9aa3b5";
    ctx.fillText("MUVOZANAT · " + lvl + "-DARAJA", 710, 64);
  }

  ctx.fillStyle = "rgba(0,0,0,.65)"; roundRect(W/2-58, 14, 116, 64, 12); ctx.fill();
  ctx.strokeStyle = "#374151"; ctx.lineWidth = 1; ctx.stroke();
  ctx.textAlign = "center";
  ctx.font = "900 34px system-ui,sans-serif";
  ctx.fillStyle = fight.time <= 10 && fight.phase === "fight" ? "#ef4444" : "#fff";
  ctx.fillText(Math.ceil(fight.time), W/2, 54);
  ctx.font = "700 12px system-ui,sans-serif"; ctx.fillStyle = "#fbbf24";
  ctx.fillText(fight.round + " / " + ROUNDS + " RAUND", W/2, 71);
}

function drawSpeech(){
  const s = ali.speech; if (!s) return;
  ctx.font = "800 17px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tw = ctx.measureText(s.text).width + 26, th = 36;
  const ax = ali.x, ay = headY(ali) - 46;
  const bx = clamp(ax - tw/2, 10, W - tw - 10), by = ay - th - 12;
  ctx.globalAlpha = Math.min(1, s.t*4);
  ctx.fillStyle = "#fff"; roundRect(bx, by, tw, th, 12); ctx.fill();
  const tx = clamp(ax, bx+14, bx+tw-14);
  ctx.beginPath(); ctx.moveTo(tx-8, by+th-1); ctx.lineTo(tx+8, by+th-1); ctx.lineTo(ax, ay - 4); ctx.fill();
  ctx.fillStyle = s.text === LINES.rage ? "#dc2626" : "#111827";
  ctx.fillText(s.text, bx + tw/2, by + th/2 + 1);
  ctx.globalAlpha = 1; ctx.textBaseline = "alphabetic";
}

function drawFx(){
  for (const e of fx){
    const k = 1 - e.life/e.max;
    if (e.k === "txt"){
      ctx.globalAlpha = Math.min(1, k*2.5);
      const sc = e.life < .1 ? 1 + (.1 - e.life)*5 : 1;
      ctx.font = `900 ${Math.round(e.size*sc)}px system-ui,sans-serif`; ctx.textAlign = "center";
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.strokeText(e.text, e.x, e.y);
      ctx.fillStyle = e.color; ctx.fillText(e.text, e.x, e.y);
    } else {
      ctx.globalAlpha = k; circle(e.x, e.y, e.r*k + .5, e.color);
    }
  }
  ctx.globalAlpha = 1;
}

function drawBanner(){
  if (!banner) return;
  const t = banner.t, d = banner.dur;
  const inK = Math.min(1, t/.18), outK = Math.min(1, (d - t)/.25);
  const a = Math.max(0, Math.min(inK, outK));
  const sc = 1.6 - .6*(1 - Math.pow(1-inK, 3));
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(0, H/2 - 70, W, banner.sub ? 130 : 100);
  ctx.translate(W/2, H/2); ctx.scale(sc, sc);
  ctx.textAlign = "center"; ctx.font = "900 68px system-ui,sans-serif";
  const mw = ctx.measureText(banner.text).width;
  if (mw > 860){ const f = 860/mw; ctx.scale(f, f); }
  ctx.lineWidth = 8; ctx.strokeStyle = "#000"; ctx.strokeText(banner.text, 0, 8);
  const g = ctx.createLinearGradient(0,-40,0,20); g.addColorStop(0,"#fde68a"); g.addColorStop(1,"#f59e0b");
  ctx.fillStyle = banner.text === "NOKAUT!" ? "#ef4444" : g; ctx.fillText(banner.text, 0, 8);
  if (banner.sub){ ctx.font = "700 20px system-ui,sans-serif"; ctx.fillStyle = "#e5e7eb"; ctx.fillText(banner.sub, 0, 44); }
  ctx.restore();
}

function render(){
  ctx.save();
  if (shake > 0) ctx.translate((Math.random()-.5)*shake, (Math.random()-.5)*shake);
  drawArena();
  // yiqilganlar orqada, hujum qilayotganlar oldinda chiziladi
  const order = [ali, ...players].sort((a,b) => {
    const r = f => f.state === "ko" ? 0 : BUSY(f.state) ? 2 : 1;
    return r(a) - r(b);
  });
  order.forEach(drawFighter);
  drawFrontPosts();
  drawFx();
  drawSpeech();
  ctx.restore();
  const vg = ctx.createRadialGradient(W/2,H/2,H*.45,W/2,H/2,H*.95);
  vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,.55)");
  ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
  if (ali.rage && fight.phase === "fight"){ ctx.fillStyle = `rgba(220,38,38,${.05+Math.sin(now*6)*.03})`; ctx.fillRect(0,0,W,H); }
  drawHUD();
  drawBanner();
}

/* =========================================================
   NATIJA / PAUZA OYNALARI
   ========================================================= */
const overlay = $("#overlay");
function hideOverlay(){ overlay.classList.add("hidden"); overlay.innerHTML = ""; }

function finishFight(won, method){
  if (!running) return;
  running = false;
  clearKeys();
  if (netHost()) netSend({ t:"end", won, method, round:fight.round, elapsed:fight.elapsed, st:players.map(p => p.st) });
  let newBest = false;
  for (const p of players){
    p.earned = won ? 120 + (method === "ko" ? 60 : 0) + lvl*15
                   : (method === "quit" ? 0 : 40 + Math.round(p.st.dealt/3));
    const u = accounts[p.key];
    // onlayn jangda har kim faqat o'z natijasini o'z hisobiga yozadi
    if (!u || (netGame && p.idx !== myIndex)) continue;
    ups(u);
    if (SERVER && tokens[p.key]){
      api("result", { mode: coop ? "coop" : "solo", won, method, elapsed: fight.elapsed, dealt: p.st.dealt, lvl }, p.key)
        .then(j => { accounts[p.key] = j.user; })
        .catch(() => { const n = $("#syncNote"); if (n) n.textContent = "⚠️ Natija serverga saqlanmadi (internetni tekshiring)"; });
    }
    u.coins += p.earned;
    u.fights = (u.fights||0) + 1;
    if (coop){
      won ? u.coopWins = (u.coopWins||0) + 1 : u.coopLosses = (u.coopLosses||0) + 1;
    } else if (won){
      u.wins++;
      if (method === "ko"){ u.kos++; if (!u.bestKO || fight.elapsed < u.bestKO){ u.bestKO = fight.elapsed; newBest = true; } }
    } else u.losses++;
  }
  if (!SERVER) saveDB();
  const methodTxt = method === "ko" ? "Nokaut" : method === "quit" ? "Taslim bo'ldingiz" : "Hakamlar qarori";
  let body;
  if (coop){
    const [a, b] = players;
    const acc = p => p.st.thrown ? Math.round(p.st.landed/p.st.thrown*100) + "%" : "0%";
    const row = (label, f) => `<tr><td>${label}</td><td>${f(a)}</td><td>${f(b)}</td></tr>`;
    body = `<table class="ov-table">
      <tr><th></th><th>${esc(a.name)}</th><th>${esc(b.name)}</th></tr>
      ${row("Tekkan zarbalar", p => p.st.landed + " / " + p.st.thrown)}
      ${row("Aniqlik", acc)}
      ${row("Berilgan zarar", p => Math.round(p.st.dealt))}
      ${row("Olingan zarar", p => Math.round(p.st.taken))}
      ${row("Eng uzun kombo", p => p.st.maxCombo)}
      ${row("Chap berishlar", p => p.st.dodges)}
      ${row("🪙 Tanga", p => "+" + p.earned)}
    </table>`;
    const mvp = a.st.dealt === b.st.dealt ? null : (a.st.dealt > b.st.dealt ? a : b);
    if (mvp) body += `<div class="ov-sub" style="margin:-6px 0 8px">⭐ Eng ko'p urgan: <b style="color:var(--gold)">${esc(mvp.name)}</b></div>`;
  } else {
    const s = players[0].st;
    const acc = s.thrown ? Math.round(s.landed/s.thrown*100) : 0;
    body = `<div class="ov-stats">
        <div><b>${s.landed} / ${s.thrown}</b>Tekkan zarbalar</div>
        <div><b>${acc}%</b>Aniqlik</div>
        <div><b>${Math.round(s.dealt)}</b>Berilgan zarar</div>
        <div><b>${Math.round(s.taken)}</b>Olingan zarar</div>
        <div><b>${s.maxCombo}</b>Eng uzun kombo</div>
        <div><b>${s.dodges}</b>Chap berishlar</div>
      </div>`;
  }
  const after = won
    ? (coop ? "Jamoa rejimida Ali endi kuchliroq bo'ladi!" :
       (U().wins < 10 ? "Ali Kachok endi " + Math.min(10, U().wins+1) + "-darajada. U qasos oladi!" : "Siz Ali Kachokning eng kuchli darajasini yengdingiz!"))
    : "Ali Kachok: \"" + esc(pick(LINES.win)) + "\"";
  let btns;
  if (netGame){
    btns = net && net.role === "host" ? `<button class="btn online" id="ovAgain">🥊 Do'stingiz bilan qayta jang</button>`
         : net ? `<div class="ov-sub" id="netWait" style="margin:8px 0">⏳ Xona egasi qayta jangni boshlashini kuting...</div>` : "";
    btns += `<button class="btn ghost" id="ovMenu">Menyu (xonadan chiqish)</button>`;
  } else {
    btns = `<button class="btn ${coop ? "coop" : "primary"}" id="ovAgain">🥊 Qayta jang</button>
            <button class="btn ghost" id="ovMenu">Menyu</button>`;
  }
  overlay.innerHTML = `
    <div class="ov-box">
      <div class="ov-title ${won ? "win" : "lose"}">${won ? (coop ? "JAMOA YUTDI! 🏆" : "G'ALABA! 🏆") : "MAG'LUBIYAT"}</div>
      <div class="ov-sub">${methodTxt} · ${fight.round}-raund · ${fmtTime(fight.elapsed)}${newBest ? " · yangi rekord!" : ""}</div>
      ${coop && !netGame ? "" : `<div class="coin-gain">🪙 +${players[myIndex].earned} tanga · jami ${U().coins}</div>`}
      ${body}
      <div class="ov-sub" style="margin:0 0 6px">${after}</div>
      <div class="ov-sub" id="syncNote" style="margin:0;color:#fca5a5"></div>
      ${btns}
    </div>`;
  overlay.classList.remove("hidden");
  const again = $("#ovAgain");
  if (again) again.onclick = () => netGame ? hostStart() : startGame(gameMode);
  $("#ovMenu").onclick = () => { if (netGame) leaveNet(); hideOverlay(); openMenu(); };
}

function togglePause(){ setPause(netGame ? overlay.classList.contains("hidden") : !paused); }
function setPause(v){
  if (!running || fight.phase === "ko" || fight.phase === "decision") return;
  clearKeys();
  if (netGame){ // onlayn jang to'xtamaydi — faqat menyu ochiladi
    if (!v){ hideOverlay(); return; }
    overlay.innerHTML = `
      <div class="ov-box">
        <div class="ov-title">MENYU</div>
        <div class="ov-sub">Onlayn jangda o'yin to'xtamaydi!</div>
        <button class="btn primary" id="ovResume">Jangga qaytish</button>
        <button class="btn ghost" id="ovQuit">Jangni tark etish (mag'lubiyat)</button>
      </div>`;
    overlay.classList.remove("hidden");
    $("#ovResume").onclick = () => setPause(false);
    $("#ovQuit").onclick = () => { leaveNet(); finishFight(false, "quit"); };
    return;
  }
  paused = v;
  if (paused){
    overlay.innerHTML = `
      <div class="ov-box">
        <div class="ov-title">PAUZA</div>
        <div class="ov-sub">Ali Kachok kutib turibdi... 💪</div>
        <button class="btn primary" id="ovResume">Davom etish</button>
        <button class="btn ghost" id="ovQuit">Taslim bo'lish (mag'lubiyat)</button>
      </div>`;
    overlay.classList.remove("hidden");
    $("#ovResume").onclick = () => setPause(false);
    $("#ovQuit").onclick = () => { paused = false; finishFight(false, "quit"); };
  } else hideOverlay();
}

/* =========================================================
   BOSHQARUV
   ========================================================= */
const MAP_SOLO = {
  hold:{ KeyA:[0,"left"], ArrowLeft:[0,"left"], KeyD:[0,"right"], ArrowRight:[0,"right"], KeyS:[0,"block"], ArrowDown:[0,"block"], ShiftLeft:[0,"block"] },
  tap: { KeyJ:[0,"jab"], KeyZ:[0,"jab"], KeyK:[0,"hook"], KeyX:[0,"hook"], KeyL:[0,"upper"], KeyC:[0,"upper"], Space:[0,"dodge"], KeyW:[0,"dodge"], ArrowUp:[0,"dodge"] },
};
const MAP_COOP = {
  hold:{ KeyA:[0,"left"], KeyD:[0,"right"], KeyS:[0,"block"], ArrowLeft:[1,"left"], ArrowRight:[1,"right"], ArrowDown:[1,"block"] },
  tap: { KeyF:[0,"jab"], KeyG:[0,"hook"], KeyH:[0,"upper"], KeyW:[0,"dodge"],
         Comma:[1,"jab"], Numpad1:[1,"jab"], Period:[1,"hook"], Numpad2:[1,"hook"], Slash:[1,"upper"], Numpad3:[1,"upper"],
         ArrowUp:[1,"dodge"], Numpad0:[1,"dodge"] },
};
const keyMap = () => (coop && !netGame) ? MAP_COOP : MAP_SOLO;
function gameActive(){ return $("#scr-game").classList.contains("active"); }
const isNetGuest = () => netGame && net && net.role === "guest";
function clearKeys(){
  players.forEach(p => { p.keys.left = p.keys.right = p.keys.block = false; });
  if (isNetGuest()){ guestKeys = { left:false, right:false, block:false }; netSend({ t:"in", k:guestKeys }); }
}
// tugmani bosib turish (yurish / himoya)
function setHold(i, k, v){
  if (isNetGuest()){
    if (guestKeys[k] === v) return;
    guestKeys = { ...guestKeys, [k]:v }; netSend({ t:"in", k:guestKeys });
    return;
  }
  if (players[i]) players[i].keys[k] = v;
}
// bir martalik harakat (zarba / chap berish)
function press(i, a){
  if (isNetGuest()){ if (running && fight.phase === "fight") netSend({ t:"tap", a }); return; }
  pressLocal(i, a);
}
function pressLocal(i, a){
  const p = players[i];
  if (p && p.state !== "ko" && running && !paused && fight.phase === "fight") p.pending = { a, ttl:.25 };
}

addEventListener("keydown", e => {
  if (!gameActive()) return;
  const m = keyMap(), h = m.hold[e.code], t = m.tap[e.code];
  if (h || t || e.code === "Space") e.preventDefault();
  if (e.code === "KeyP" || e.code === "Escape"){ togglePause(); return; }
  if (e.code === "KeyM"){ toggleMute(); return; }
  if (h && !paused) setHold(netGame ? myIndex : h[0], h[1], true);
  if (t && !e.repeat) press(netGame ? myIndex : t[0], t[1]);
});
addEventListener("keyup", e => {
  const h = keyMap().hold[e.code];
  if (h) setHold(netGame ? myIndex : h[0], h[1], false);
});
addEventListener("blur", () => { clearKeys(); if (running && !paused && gameActive() && !netGame) setPause(true); });

/* ---------- Teginish tugmalari (telefon) ---------- */
function tbtn(p, kind, a, label, cls){ return `<button class="tb ${cls||""}" type="button" data-p="${p}" data-${kind}="${a}">${label}</button>`; }
function buildTouch(){
  const t = $("#touch");
  if (!coop || netGame){
    const m = myIndex;
    t.className = "touch solo";
    t.innerHTML =
      `<div class="grp mv">${tbtn(m,"hold","left","◀")}${tbtn(m,"hold","block","🛡")}${tbtn(m,"hold","right","▶")}</div>` +
      `<div class="grp ak">${tbtn(m,"tap","jab","JAB","atk")}${tbtn(m,"tap","hook","XUK","atk")}` +
      `${tbtn(m,"tap","upper","APERKOT","atk")}${tbtn(m,"tap","dodge","CHAP")}</div>`;
  } else {
    // ikki o'yinchi bitta telefonda: chap tomon 1P, o'ng tomon 2P
    t.className = "touch duo";
    const cl = i => `<div class="grp pl"><span class="ptag">${i+1}P · ${esc(players[i].name)}</span>` +
      `${tbtn(i,"hold","left","◀")}${tbtn(i,"hold","block","🛡")}${tbtn(i,"hold","right","▶")}` +
      `${tbtn(i,"tap","jab","JAB","atk")}${tbtn(i,"tap","hook","XUK","atk")}${tbtn(i,"tap","upper","APER","atk")}` +
      `${tbtn(i,"tap","dodge","CHAP","wide")}</div>`;
    t.innerHTML = cl(0) + cl(1);
  }
  t.querySelectorAll(".tb").forEach(b => {
    const i = +b.dataset.p, hold = b.dataset.hold, tap = b.dataset.tap;
    const down = e => {
      e.preventDefault(); initAudio(); b.classList.add("on");
      try{ b.setPointerCapture(e.pointerId); }catch(_){}
      if (hold) setHold(i, hold, true);
      if (tap) press(i, tap);
    };
    const up = () => { b.classList.remove("on"); if (hold) setHold(i, hold, false); };
    b.addEventListener("pointerdown", down);
    ["pointerup","pointercancel","lostpointercapture"].forEach(ev => b.addEventListener(ev, up));
    b.addEventListener("contextmenu", e => e.preventDefault());
  });
}
$("#btnPause").onclick = () => togglePause();
function toggleMute(){ muted = !muted; $("#btnMute").textContent = muted ? "🔇" : "🔊"; }
$("#btnMute").onclick = toggleMute;

/* =========================================================
   ASOSIY SIKL
   ========================================================= */
let last = 0;
function loop(ts){
  const raw = Math.min(.05, (ts - last)/1000 || 0); last = ts;
  if (gameActive() && ali){
    if (running){
      if (isNetGuest()) guestTick(raw);       // mehmon: holatni xost yuboradi
      else if (!paused) update(raw);
      if (netHost()) netSendState(raw);       // xost: holatni mehmonga yuboradi
    }
    render();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* =========================================================
   ISHGA TUSHISH: server bormi? sessiyani tiklash
   ========================================================= */
(async () => {
  const hm = location.hash.match(/xona=([A-Za-z0-9]{4,8})/);
  if (hm) pendingJoin = hm[1].toUpperCase();
  try{ const j = await api("ping"); SERVER = !!j.online; }catch(e){ SERVER = false; }
  if (SERVER) accounts = {};
  $("#modeNote").innerHTML = (SERVER
    ? "🌍 Onlayn: hisobingiz va reyting serverda saqlanadi, hamma uchun umumiy."
    : "💾 Oflayn: ma'lumotlar faqat shu brauzerda saqlanadi.") +
    (pendingJoin ? "<br><b style='color:var(--gold)'>🌐 Do'stingiz sizni xonaga taklif qildi, avval kiring!</b>" : "");
  if (SERVER){
    const t = loadTok();
    if (t && t.key && t.token){
      tokens[t.key] = t.token;
      try{
        const j = await api("me", null, t.key);
        accounts[j.user.key] = j.user; userKey = j.user.key;
        openMenu(); return;
      }catch(e){ clearTok(); delete tokens[t.key]; }
    }
  } else {
    const k = getCur();
    if (k && db[k]){ userKey = k; openMenu(); return; }
  }
  show("scr-auth");
})();
