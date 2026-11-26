// Ali Kachok Jang — server (Vercel Function)
// Hisoblar, umumiy reyting, tangalar va kuchaytirishlar Neon Postgres bazasida saqlanadi.
// Baza ulanmagan bo'lsa (DATABASE_URL yo'q), ?a=ping "online:false" qaytaradi
// va o'yin oflayn rejimda (brauzer xotirasida) ishlaydi.

import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";

const DB_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const sql = DB_URL ? neon(DB_URL) : null;

const GLOVES = ["#e11d48", "#2563eb", "#16a34a", "#a855f7", "#06b6d4"];
const UP_IDS = ["hp", "dmg", "sta", "spd", "def"];
const UP_MAX = 5;
const upCost = l => 80 * (l + 1);

let ready = null;
function init() {
  if (!ready) {
    ready = (async () => {
      await sql`CREATE TABLE IF NOT EXISTS ak_players (
        key         TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        pass_hash   TEXT NOT NULL,
        salt        TEXT NOT NULL,
        glove       TEXT NOT NULL DEFAULT '#e11d48',
        wins        INT  NOT NULL DEFAULT 0,
        losses      INT  NOT NULL DEFAULT 0,
        kos         INT  NOT NULL DEFAULT 0,
        fights      INT  NOT NULL DEFAULT 0,
        best_ko     REAL,
        coop_wins   INT  NOT NULL DEFAULT 0,
        coop_losses INT  NOT NULL DEFAULT 0,
        coins       INT  NOT NULL DEFAULT 0,
        up          JSONB NOT NULL DEFAULT '{}'::jsonb,
        created     TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS ak_sessions (
        token   TEXT PRIMARY KEY,
        key     TEXT NOT NULL REFERENCES ak_players(key) ON DELETE CASCADE,
        created TIMESTAMPTZ NOT NULL DEFAULT now()
      )`;
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}

function pub(r) {
  const up = {};
  for (const id of UP_IDS) up[id] = Math.max(0, Math.min(UP_MAX, (r.up && r.up[id]) | 0));
  return {
    key: r.key, name: r.name, glove: r.glove,
    wins: r.wins, losses: r.losses, kos: r.kos, fights: r.fights,
    bestKO: r.best_ko == null ? null : Number(r.best_ko),
    coopWins: r.coop_wins, coopLosses: r.coop_losses,
    coins: r.coins, up,
  };
}

const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 32).toString("hex");
function checkPass(pass, salt, hash) {
  const a = Buffer.from(hashPass(pass, salt), "hex"), b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function newSession(key) {
  const token = crypto.randomBytes(24).toString("hex");
  await sql`INSERT INTO ak_sessions (token, key) VALUES (${token}, ${key})`;
  return token;
}
async function session(req) {
  const h = req.headers.authorization || "";
  const tok = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!/^[a-f0-9]{48}$/.test(tok)) return null;
  const r = await sql`SELECT p.* FROM ak_sessions s JOIN ak_players p ON p.key = s.key WHERE s.token = ${tok}`;
  return r[0] ? { user: r[0], token: tok } : null;
}
const cleanName = n => String(n || "").trim().replace(/\s+/g, " ").slice(0, 16);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const a = String((req.query && req.query.a) || "");
  const fail = (code, error) => res.status(code).json({ error });

  if (a === "ping") return res.status(200).json({ ok: true, online: !!sql });
  if (!sql) return fail(503, "Onlayn baza hali ulanmagan.");

  let b = req.body || {};
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }

  try {
    await init();
    switch (a) {
      case "register": {
        const name = cleanName(b.name), key = name.toLowerCase(), pass = String(b.pass || "");
        if (name.length < 2) return fail(400, "Ism kamida 2 ta harfdan iborat bo'lsin.");
        if (/[\u0000-\u001f<>]/.test(name)) return fail(400, "Ismda noto'g'ri belgi bor.");
        if (key.replace(/\s/g, "") === "alikachok") return fail(400, "Ali Kachok faqat bitta! Boshqa ism tanlang 😄");
        if (pass.length < 4 || pass.length > 64) return fail(400, "Parol kamida 4 ta belgidan iborat bo'lsin.");
        const glove = GLOVES.includes(b.glove) ? b.glove : GLOVES[0];
        const salt = crypto.randomBytes(16).toString("hex");
        const r = await sql`INSERT INTO ak_players (key, name, pass_hash, salt, glove)
          VALUES (${key}, ${name}, ${hashPass(pass, salt)}, ${salt}, ${glove})
          ON CONFLICT (key) DO NOTHING RETURNING *`;
        if (!r[0]) return fail(409, "Bu ism band. \"Kirish\" bo'limidan kiring.");
        return res.status(200).json({ token: await newSession(key), user: pub(r[0]) });
      }

      case "login": {
        const key = cleanName(b.name).toLowerCase(), pass = String(b.pass || "");
        const r = await sql`SELECT * FROM ak_players WHERE key = ${key}`;
        if (!r[0]) return fail(404, "Bunday o'yinchi topilmadi. Avval ro'yxatdan o'ting.");
        if (!checkPass(pass, r[0].salt, r[0].pass_hash)) return fail(401, "Parol noto'g'ri.");
        return res.status(200).json({ token: await newSession(key), user: pub(r[0]) });
      }

      case "me": {
        const s = await session(req);
        if (!s) return fail(401, "Qaytadan kiring.");
        return res.status(200).json({ user: pub(s.user) });
      }

      case "logout": {
        const s = await session(req);
        if (s) await sql`DELETE FROM ak_sessions WHERE token = ${s.token}`;
        return res.status(200).json({ ok: true });
      }

      case "result": {
        const s = await session(req);
        if (!s) return fail(401, "Qaytadan kiring.");
        const u = s.user;
        const solo = b.mode !== "coop", won = b.won === true;
        const method = ["ko", "decision", "quit"].includes(b.method) ? b.method : "decision";
        const ko = won && method === "ko";
        const elapsed = Math.max(1, Math.min(600, Number(b.elapsed) || 0));
        const dealt = Math.max(0, Math.min(3000, Number(b.dealt) || 0));
        const lvl = solo ? Math.min(10, u.wins + 1) : Math.max(1, Math.min(10, b.lvl | 0));
        const earned = won ? 120 + (ko ? 60 : 0) + lvl * 15 : (method === "quit" ? 0 : 40 + Math.round(dealt / 3));
        const sw = solo && won ? 1 : 0, sl = solo && !won ? 1 : 0, sk = solo && ko ? 1 : 0;
        const cw = !solo && won ? 1 : 0, cl = !solo && !won ? 1 : 0;
        const r = await sql`UPDATE ak_players SET
            coins = coins + ${earned}, fights = fights + 1,
            wins = wins + ${sw}, losses = losses + ${sl}, kos = kos + ${sk},
            best_ko = CASE WHEN ${sk}::int = 1 AND (best_ko IS NULL OR ${elapsed}::real < best_ko)
                           THEN ${elapsed}::real ELSE best_ko END,
            coop_wins = coop_wins + ${cw}, coop_losses = coop_losses + ${cl}
          WHERE key = ${u.key} RETURNING *`;
        return res.status(200).json({ earned, user: pub(r[0]) });
      }

      case "upgrade": {
        const s = await session(req);
        if (!s) return fail(401, "Qaytadan kiring.");
        const id = String(b.id || "");
        if (!UP_IDS.includes(id)) return fail(400, "Noto'g'ri kuchaytirish.");
        const cur = pub(s.user).up[id];
        if (cur >= UP_MAX) return fail(400, "Bu kuchaytirish allaqachon maksimal.");
        const cost = upCost(cur);
        const r = await sql`UPDATE ak_players SET
            coins = coins - ${cost},
            up = jsonb_set(up, ARRAY[${id}]::text[], to_jsonb(${cur + 1}::int), true)
          WHERE key = ${s.user.key} AND coins >= ${cost} AND COALESCE((up->>${id})::int, 0) = ${cur}
          RETURNING *`;
        if (!r[0]) return fail(400, "Tanga yetarli emas.");
        return res.status(200).json({ user: pub(r[0]) });
      }

      case "board": {
        const list = await sql`SELECT key, name, wins, losses, kos, coop_wins FROM ak_players
          ORDER BY wins DESC, kos DESC, coop_wins DESC, losses ASC, created ASC LIMIT 20`;
        const t = await sql`SELECT COALESCE(SUM(losses + coop_losses), 0)::int AS aw,
                                   COALESCE(SUM(wins + coop_wins), 0)::int AS al,
                                   COUNT(*)::int AS n FROM ak_players`;
        return res.status(200).json({
          list: list.map(r => ({ key: r.key, name: r.name, wins: r.wins, losses: r.losses, kos: r.kos, coopWins: r.coop_wins })),
          aliWins: t[0].aw, aliLosses: t[0].al, players: t[0].n,
        });
      }

      default:
        return fail(404, "Noma'lum so'rov.");
    }
  } catch (e) {
    console.error(e);
    return fail(500, "Server xatosi. Keyinroq urinib ko'ring.");
  }
}
