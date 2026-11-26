"use strict";
/* =========================================================
   Ali Kachok Jang — DO'ST BILAN ONLAYN O'YIN
   ---------------------------------------------------------
   Ikki qurilma to'g'ridan-to'g'ri (WebRTC) ulanadi, PeerJS orqali.
   • Xona egasi (xost) jangni o'zida hisoblaydi va har soniyada ~30 marta
     holatni mehmonga yuboradi.
   • Mehmon faqat tugma bosishlarini yuboradi va kelgan holatni chizadi.
   Bu fayl js/game.js dan OLDIN yuklanadi; game.js dagi funksiyalar
   (startGame, players, ali, fight ...) faqat ish vaqtida chaqiriladi.
   ========================================================= */

const PEER_PREFIX = "alikachok-jang-";
const PEERJS_URL = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

let net = null;                       // { role:"host"|"guest", code, peer, conn, remote }
let guestKeys = { left:false, right:false, block:false };
let pendingJoin = null;               // havola orqali kelgan xona kodi
let netEvents = [], netAcc = 0;       // xostda: mehmonga yuboriladigan effektlar

const el = id => document.getElementById(id);
const netHost = () => !!(net && net.role === "host" && netGame);
const r2 = v => Math.round(v * 100) / 100;

/* ---------- Effektlarni mehmonga uzatish ---------- */
function emit(ev){ if (netHost() && running) netEvents.push(ev); }
function netSend(m){ try{ if (net && net.conn && net.conn.open) net.conn.send(m); }catch(e){} }

/* ---------- Holat (snapshot) ---------- */
function fSnap(f){
  return [r2(f.x), f.facing, f.state, r2(f.t), f.atkName || "", r2(f.hp), r2(f.ghost), Math.round(f.sta),
          f.flash > 0 ? 1 : 0, f.rage ? 1 : 0, r2(f.walk), Math.round(f.poise), f.stunT, f.recMul, f.speedMul,
          f.speech ? [f.speech.text, r2(f.speech.t)] : 0];
}
function fApply(f, a){
  if (!f || !Array.isArray(a)) return;
  f.x = +a[0] || 0; f.facing = a[1] === -1 ? -1 : 1; f.state = String(a[2]); f.t = +a[3] || 0;
  f.atkName = a[4] ? String(a[4]) : null;
  f.hp = +a[5] || 0; f.ghost = +a[6] || 0; f.sta = +a[7] || 0; f.flash = a[8] ? .12 : 0; f.rage = !!a[9];
  f.walk = +a[10] || 0; f.poise = +a[11] || 0; f.stunT = +a[12] || .3; f.recMul = +a[13] || 1; f.speedMul = +a[14] || 1;
  const table = f.isAli ? A_ATK : P_ATK;
  f.atk = f.atkName && Object.prototype.hasOwnProperty.call(table, f.atkName) ? table[f.atkName] : null;
  f.speech = Array.isArray(a[15]) ? { text:String(a[15][0]).slice(0,60), t:+a[15][1] || 0 } : null;
}
function netSendState(raw){
  netAcc += raw;
  if (netAcc < 1/30) return;
  netAcc = 0;
  netSend({
    t:"s",
    f:[fSnap(ali), ...players.map(fSnap)],
    g:[fight.round, r2(fight.time), fight.phase, r2(shake), r2(hype)],
    c:players.map(p => [p.st.combo, r2(p.st.comboT)]),
    ev:netEvents,
  });
  netEvents = [];
}
function applySnap(m){
  if (!running || !isNetGuest() || !Array.isArray(m.f)) return;
  fApply(ali, m.f[0]);
  players.forEach((p,i) => fApply(p, m.f[i+1]));
  if (Array.isArray(m.g)){
    fight.round = (m.g[0] | 0) || 1; fight.time = +m.g[1] || 0; fight.phase = String(m.g[2]);
    shake = Math.max(shake, +m.g[3] || 0); hype = +m.g[4] || hype;
  }
  if (Array.isArray(m.c)) m.c.forEach((c,i) => { if (players[i] && Array.isArray(c)){ players[i].st.combo = c[0] | 0; players[i].st.comboT = +c[1] || 0; } });
  if (Array.isArray(m.ev)) m.ev.slice(0, 200).forEach(replayEv);
}
function replayEv(ev){
  if (!Array.isArray(ev)) return;
  switch (ev[0]){
    case "p": popText(+ev[1] || 0, +ev[2] || 0, String(ev[3]).slice(0,40), String(ev[4] || "#fff"), +ev[5] || 22); break;
    case "k": sparks(+ev[1] || 0, +ev[2] || 0, Math.min(30, ev[3] | 0), String(ev[4] || "#fde68a"), +ev[5] || 260); break;
    case "a": sfx(String(ev[1])); break;
    case "b": setBanner(String(ev[1]).slice(0,40), ev[2] ? String(ev[2]).slice(0,80) : "", +ev[3] || 1.6); break;
  }
}
// mehmonda: animatsiya vaqti va effektlar o'zida yuradi, qolgani xostdan keladi
function guestTick(raw){
  now += raw;
  if (banner){ banner.t += raw; if (banner.t > banner.dur) banner = null; }
  updateFx(raw);
  shake = Math.max(0, shake - raw*40);
}

/* ---------- Jangni boshlash (xost) ---------- */
function hostStart(){
  if (!net || net.role !== "host" || !net.remote || !net.conn || !net.conn.open) return;
  initAudio();
  startGame("online");
  netSend({ t:"start", lvl, players:players.map(p => p.profile) });
}

/* ---------- Xabarlar ---------- */
const cleanStats = s => {
  const o = {};
  for (const k of ["thrown","landed","dealt","taken","combo","comboT","maxCombo","dodges"]) o[k] = +(s && s[k]) || 0;
  return o;
};
function onNet(m){
  if (!m || typeof m !== "object" || !net) return;
  switch (m.t){
    case "hello": {
      const p = m.p || {};
      if (!p.key || p.key === userKey){ netError("Bu sizning hisobingiz! Do'stingiz o'z hisobi bilan kirsin."); leaveNet(); return; }
      net.remote = { key:String(p.key).slice(0,32), name:String(p.name || "Do'st").slice(0,16), glove:p.glove, up:p.up || {}, coopWins:p.coopWins | 0 };
      if (net.role === "host"){
        netStatusHTML(`✅ <b>${esc(net.remote.name)}</b> qo'shildi! Jang boshlanmoqda...`);
        const n = net;
        setTimeout(() => { if (net === n){ closeNetModal(); hostStart(); } }, 1200);
      } else netStatusHTML(`✅ <b>${esc(net.remote.name)}</b> xonasiga ulandingiz! Jang boshlanmoqda...`);
      break;
    }
    case "start":
      if (net.role === "guest" && Array.isArray(m.players) && m.players.length === 2){ closeNetModal(); initAudio(); startGame("online", m); }
      break;
    case "s": applySnap(m); break;
    case "in":
      if (net.role === "host" && netGame && players[1] && m.k)
        players[1].keys = { left:!!m.k.left, right:!!m.k.right, block:!!m.k.block };
      break;
    case "tap":
      if (net.role === "host" && netGame && (Object.prototype.hasOwnProperty.call(P_ATK, m.a) || m.a === "dodge")) pressLocal(1, m.a);
      break;
    case "end":
      if (net.role === "guest" && running && netGame){
        (Array.isArray(m.st) ? m.st : []).forEach((s,i) => { if (players[i]) players[i].st = cleanStats(s); });
        fight.round = (m.round | 0) || fight.round; fight.elapsed = +m.elapsed || fight.elapsed;
        finishFight(!!m.won, ["ko","decision","quit"].includes(m.method) ? m.method : "decision");
      }
      break;
    case "bye": onNetClose(); break;
    case "full": netError("Bu xona to'la, boshqa kod bilan urinib ko'ring."); leaveNet(); break;
  }
}
function onNetClose(){
  if (!net) return;
  const inGame = netGame && running;
  leaveNet(true);
  if (inGame){
    running = false;
    overlay.innerHTML = `
      <div class="ov-box">
        <div class="ov-title lose">ALOQA UZILDI</div>
        <div class="ov-sub">Do'stingiz bilan aloqa uzildi. Bu jang hisobga olinmaydi.</div>
        <button class="btn primary" id="ovMenu">Menyu</button>
      </div>`;
    overlay.classList.remove("hidden");
    el("ovMenu").onclick = () => { hideOverlay(); openMenu(); };
  } else {
    const w = el("netWait"); if (w) w.textContent = "Do'stingiz xonadan chiqib ketdi.";
    const ag = el("ovAgain"); if (ag && netGame){ ag.disabled = true; ag.textContent = "Do'stingiz chiqib ketdi"; }
    if (!el("netModal").classList.contains("hidden")) netError("Aloqa uzildi.");
  }
}
function leaveNet(silent){
  const n = net; if (!n) return;
  net = null;
  if (!silent){ try{ n.conn && n.conn.open && n.conn.send({ t:"bye" }); }catch(e){} }
  setTimeout(() => {
    try{ n.conn && n.conn.close(); }catch(e){}
    try{ n.peer && n.peer.destroy(); }catch(e){}
  }, silent ? 0 : 300);
}

/* ---------- Ulanish ---------- */
let peerLoad = null;
function loadPeer(){
  if (window.Peer) return Promise.resolve();
  if (!peerLoad) peerLoad = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = PEERJS_URL; s.async = true;
    s.onload = () => window.Peer ? res() : rej(new Error("Peer yo'q"));
    s.onerror = () => { peerLoad = null; rej(new Error("yuklanmadi")); };
    document.head.appendChild(s);
  });
  return peerLoad;
}
function genCode(){
  const a = new Uint32Array(5); crypto.getRandomValues(a);
  let s = ""; for (const v of a) s += CODE_CHARS[v % CODE_CHARS.length];
  return s;
}
const shareLink = code => location.origin + location.pathname + "#xona=" + code;
function netErrText(e){
  const t = e && e.type;
  if (t === "browser-incompatible") return "Brauzeringiz onlayn o'yinni qo'llamaydi.";
  if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed")
    return "Onlayn serverga ulanib bo'lmadi. Internetni tekshiring.";
  return "Ulanishda xatolik" + (t ? " (" + t + ")" : "") + ".";
}
function bindConn(conn, n){
  conn.on("open",  () => { if (net === n) conn.send({ t:"hello", v:1, p:profileOf(userKey) }); });
  conn.on("data",  m  => { if (net === n) onNet(m); });
  conn.on("close", () => { if (net === n) onNetClose(); });
  conn.on("error", () => { if (net === n) onNetClose(); });
}

async function hostRoom(){
  leaveNet(); netError("");
  netStatusHTML("⏳ Xona yaratilmoqda...");
  try{ await loadPeer(); }catch(e){ return netError("Onlayn kutubxonani yuklab bo'lmadi. Internetni tekshiring."); }
  const code = genCode();
  const n = net = { role:"host", code, peer:new Peer(PEER_PREFIX + code), conn:null, remote:null };
  n.peer.on("open", () => {
    if (net !== n) return;
    const link = shareLink(code);
    netStatusHTML(`Xona kodi:<div class="room-code">${code}</div>
      Shu kodni do'stingizga ayting yoki havolani yuboring:
      <div class="room-link">${esc(link)}</div>
      <button class="btn small" id="netShare" type="button">🔗 Havolani ulashish</button>
      <div class="wait">⏳ Do'stingiz kutilmoqda...</div>`);
    el("netShare").onclick = () => shareRoom(code, link);
  });
  n.peer.on("connection", conn => {
    if (net !== n){ try{ conn.close(); }catch(e){} return; }
    if (n.conn){ // xona to'la
      conn.on("open", () => { try{ conn.send({ t:"full" }); }catch(e){} setTimeout(() => conn.close(), 500); });
      return;
    }
    n.conn = conn; bindConn(conn, n);
  });
  n.peer.on("error", e => {
    if (net !== n) return;
    if (e.type === "unavailable-id"){ hostRoom(); return; }   // kod band — yangisini olamiz
    if (n.remote) return;                                      // o'yin ketyapti, signal xatosi muhim emas
    netError(netErrText(e)); leaveNet();
  });
}

async function joinRoom(raw){
  const code = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) return netError("Xona kodini kiriting.");
  leaveNet(); netError("");
  netStatusHTML(`⏳ <b>${code}</b> xonasiga ulanmoqda...`);
  try{ await loadPeer(); }catch(e){ return netError("Onlayn kutubxonani yuklab bo'lmadi. Internetni tekshiring."); }
  const n = net = { role:"guest", code, peer:new Peer(), conn:null, remote:null };
  n.peer.on("open", () => {
    if (net !== n) return;
    const conn = n.peer.connect(PEER_PREFIX + code, { reliable:true });
    n.conn = conn; bindConn(conn, n);
  });
  n.peer.on("error", e => {
    if (net !== n || n.remote) return;
    netError(e.type === "peer-unavailable" ? "Bunday xona topilmadi. Kodni tekshiring." : netErrText(e));
    leaveNet();
  });
  setTimeout(() => {
    if (net === n && !n.remote){ netError("Ulanib bo'lmadi. Kodni va internetni tekshiring."); leaveNet(); }
  }, 20000);
}

function shareRoom(code, link){
  const text = `Men bilan birga Ali Kachokka qarshi jang qil! Xona kodi: ${code}`;
  if (navigator.share){ navigator.share({ title:"Ali Kachok Jang", text, url:link }).catch(() => {}); return; }
  if (navigator.clipboard){
    navigator.clipboard.writeText(text + "\n" + link)
      .then(() => { const b = el("netShare"); if (b) b.textContent = "✓ Nusxa olindi!"; })
      .catch(() => {});
  }
}

/* ---------- Oyna (modal) ---------- */
function openNetModal(){
  el("netErr").textContent = "";
  el("netStatus").classList.add("hidden");
  el("netChoose").classList.remove("hidden");
  el("netModal").classList.remove("hidden");
}
function closeNetModal(){ el("netModal").classList.add("hidden"); }
function netStatusHTML(html){
  el("netChoose").classList.add("hidden");
  const s = el("netStatus"); s.innerHTML = html; s.classList.remove("hidden");
}
function netError(msg){
  el("netErr").textContent = msg || "";
  if (msg && !(net && net.remote)){ el("netStatus").classList.add("hidden"); el("netChoose").classList.remove("hidden"); }
}

el("netHostBtn").onclick = () => hostRoom();
el("netJoinBtn").onclick = () => joinRoom(el("netCode").value);
el("netCode").addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(el("netCode").value); });
el("netCancel").onclick = () => { leaveNet(); closeNetModal(); };
