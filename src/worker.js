// Portfolio worker: serves the static site (./public) and a small content API backed by KV.
//
// Content lives in KV, never in code, so deploying new code never overwrites wording the owner edited:
//   published  -> what visitors see
//   draft      -> the owner's working copy (only visible when signed in)
//   history    -> the last 20 published versions (for restore)
// content.default.json only seeds an empty store, and fills in fields that a newer code version added.

import DEFAULTS from "../content.default.json";

const HISTORY_MAX = 20;
const SESSION_DAYS = 14;
const MAX_FAILS = 5;          // failed sign-ins per IP ...
const LOCK_SECONDS = 15 * 60; // ... before a 15-minute lockout
const MAX_BYTES = 200_000;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });

const enc = new TextEncoder();
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sha256(s) { return crypto.subtle.digest("SHA-256", enc.encode(s)); }
function sameBytes(a, b) {
  const x = new Uint8Array(a), y = new Uint8Array(b);
  if (x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256);
}

// ---------- defaults merge ----------
// Adds keys that exist in the defaults but not in stored content. Never overwrites a stored value,
// and never touches arrays (projects/experience are the owner's to add or remove).
function fillMissing(stored, defaults) {
  if (Array.isArray(stored) || Array.isArray(defaults)) return stored;
  if (typeof stored !== "object" || stored === null || typeof defaults !== "object" || defaults === null) return stored;
  const out = { ...stored };
  for (const k of Object.keys(defaults)) {
    if (!(k in out)) out[k] = structuredClone(defaults[k]);
    else out[k] = fillMissing(out[k], defaults[k]);
  }
  return out;
}

async function getDoc(env, key) {
  const raw = await env.CONTENT.get(key);
  return raw ? JSON.parse(raw) : null;
}
// The live content counts as "seeded" until the owner first publishes. While it is seeded and the owner has no
// draft, it follows content.default.json, so starter wording can be improved in code. After the first publish
// (or once a draft exists) code never replaces it.
let defaultsHash;
async function hashDefaults() {
  if (!defaultsHash) defaultsHash = b64url(await sha256(JSON.stringify(DEFAULTS)));
  return defaultsHash;
}
const isSeeded = (doc) => doc.seeded === true || (doc.version === 1 && !("seeded" in doc));

async function getPublished(env) {
  let doc = await getDoc(env, "published");
  const hash = await hashDefaults();
  if (!doc || (isSeeded(doc) && doc.seedHash !== hash && !(await env.CONTENT.get("draft")))) {
    doc = { content: structuredClone(DEFAULTS), updatedAt: new Date().toISOString(), version: 1, seeded: true, seedHash: hash };
    await env.CONTENT.put("published", JSON.stringify(doc));
  }
  doc.content = fillMissing(doc.content, DEFAULTS);
  return doc;
}
async function getDraft(env) {
  const draft = await getDoc(env, "draft");
  if (draft) { draft.content = fillMissing(draft.content, DEFAULTS); return draft; }
  const pub = await getPublished(env);
  return { content: pub.content, updatedAt: pub.updatedAt, basedOn: pub.version, clean: true };
}

// ---------- sessions ----------
async function sessionKey(env) {
  let k = await env.CONTENT.get("session_secret");
  if (!k) {
    k = b64url(crypto.getRandomValues(new Uint8Array(32)));
    await env.CONTENT.put("session_secret", k);
  }
  return crypto.subtle.importKey("raw", enc.encode(k), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function makeToken(env) {
  const gen = (await env.CONTENT.get("session_gen")) || "0";
  const payload = `${Date.now() + SESSION_DAYS * 864e5}.${gen}`;
  const sig = await crypto.subtle.sign("HMAC", await sessionKey(env), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}
async function isOwner(request, env) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)sid=([^;]+)/);
  if (!m) return false;
  const parts = m[1].split(".");
  if (parts.length !== 3) return false;
  const [exp, gen, sig] = parts;
  if (Number(exp) < Date.now()) return false;
  if (gen !== ((await env.CONTENT.get("session_gen")) || "0")) return false;
  const expected = await crypto.subtle.sign("HMAC", await sessionKey(env), enc.encode(`${exp}.${gen}`));
  return b64url(expected) === sig;
}
const cookie = (value, maxAge) =>
  `sid=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function checkPassword(env, password) {
  const stored = await getDoc(env, "password");   // set by "Change password"
  if (stored) return sameBytes(await pbkdf2(password, stored.salt), Uint8Array.from(atob(stored.hash), c => c.charCodeAt(0)));
  if (!env.ADMIN_PASSWORD) return false;
  return sameBytes(await sha256(password), await sha256(env.ADMIN_PASSWORD));
}

// ---------- validation ----------
const SAFE_URL = /^(https?:\/\/|mailto:|tel:)/i;
const IMAGE_PATH = /^\/api\/image\/[a-z0-9]{6,40}$/;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE = 5 * 1024 * 1024;
function validate(c) {
  if (!c || typeof c !== "object" || !c.profile || !Array.isArray(c.projects)) return "Content is missing the profile or projects.";
  for (const p of c.projects) {
    if (!p || typeof p !== "object" || !p.id) return "Each project needs an id.";
    if (p.url && !SAFE_URL.test(p.url)) return `The link for "${p.title}" must start with https://.`;
    if (p.image && !IMAGE_PATH.test(p.image)) return `The picture for "${p.title}" must be an uploaded image.`;
  }
  for (const k of ["linkedin", "github"]) if (c.profile[k] && !SAFE_URL.test(c.profile[k])) return `The ${k} link must start with https://.`;
  if (c.profile.background && !IMAGE_PATH.test(c.profile.background)) return "The background must be an uploaded image.";
  return null;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BYTES) throw new Error("too large");
  return JSON.parse(text);
}

// ---------- API ----------
async function api(request, env, url) {
  const path = url.pathname.replace(/^\/api/, "");
  const method = request.method;

  // Mutations must come from this site's own script (blocks cross-site form posts).
  if (method !== "GET" && request.headers.get("x-requested-with") !== "portfolio") return json({ error: "Bad request." }, 400);

  // Uploaded images are public once referenced; ids are random and never reused, so they cache forever.
  const img = path.match(/^\/image\/([a-z0-9]{6,40})$/);
  if (img && method === "GET") {
    const { value, metadata } = await env.CONTENT.getWithMetadata(`img:${img[1]}`, { type: "arrayBuffer" });
    if (!value) return new Response("Not found", { status: 404 });
    return new Response(value, { headers: { "content-type": metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" } });
  }

  if (path === "/content" && method === "GET") {
    const pub = await getPublished(env);
    return json({ content: pub.content, updatedAt: pub.updatedAt });
  }

  if (path === "/login" && method === "POST") {
    const ip = request.headers.get("cf-connecting-ip") || "local";
    const lockKey = `fails:${ip}`;
    const fails = Number(await env.CONTENT.get(lockKey)) || 0;
    if (fails >= MAX_FAILS) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
    let body; try { body = await readJson(request); } catch { return json({ error: "Bad request." }, 400); }
    const emailOk = String(body.email || "").trim().toLowerCase() === String(env.ADMIN_EMAIL).toLowerCase();
    const passOk = await checkPassword(env, String(body.password || ""));
    if (!emailOk || !passOk) {
      await env.CONTENT.put(lockKey, String(fails + 1), { expirationTtl: LOCK_SECONDS });
      return json({ error: "Email or password is incorrect." }, 401);
    }
    await env.CONTENT.delete(lockKey);
    return json({ ok: true }, 200, { "set-cookie": cookie(await makeToken(env), SESSION_DAYS * 86400) });
  }

  if (path === "/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });

  if (path === "/me" && method === "GET") return json({ owner: await isOwner(request, env) });

  // Everything below needs the owner.
  if (!(await isOwner(request, env))) return json({ error: "Sign in to edit." }, 401);

  if (path === "/draft" && method === "GET") {
    const [draft, pub] = await Promise.all([getDraft(env), getPublished(env)]);
    const dirty = JSON.stringify(draft.content) !== JSON.stringify(pub.content);
    return json({ content: draft.content, updatedAt: draft.updatedAt, publishedAt: pub.updatedAt, dirty });
  }

  if (path === "/draft" && method === "PUT") {
    let body; try { body = await readJson(request); } catch { return json({ error: "Content is too large or not valid." }, 400); }
    const err = validate(body.content);
    if (err) return json({ error: err }, 400);
    const pub = await getPublished(env);
    const doc = { content: body.content, updatedAt: new Date().toISOString() };
    await env.CONTENT.put("draft", JSON.stringify(doc));
    return json({ ok: true, updatedAt: doc.updatedAt, dirty: JSON.stringify(doc.content) !== JSON.stringify(pub.content) });
  }

  if (path === "/image" && method === "POST") {
    const type = (request.headers.get("content-type") || "").split(";")[0].trim();
    if (!IMAGE_TYPES.includes(type)) return json({ error: "Upload a JPEG, PNG or WebP image." }, 400);
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_IMAGE) return json({ error: "The image is larger than 5 MB." }, 400);
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, "0")).join("");
    await env.CONTENT.put(`img:${id}`, body, { metadata: { type } });
    return json({ ok: true, path: `/api/image/${id}` });
  }

  if (path === "/discard" && method === "POST") {
    await env.CONTENT.delete("draft");
    return json({ ok: true });
  }

  if (path === "/publish" && method === "POST") {
    const [draft, pub] = await Promise.all([getDraft(env), getPublished(env)]);
    const err = validate(draft.content);
    if (err) return json({ error: err }, 400);
    const history = (await getDoc(env, "history")) || [];
    history.unshift({ content: pub.content, updatedAt: pub.updatedAt, version: pub.version || 1 });
    const next = { content: draft.content, updatedAt: new Date().toISOString(), version: (pub.version || 1) + 1, seeded: false };
    await env.CONTENT.put("history", JSON.stringify(history.slice(0, HISTORY_MAX)));
    await env.CONTENT.put("published", JSON.stringify(next));
    await env.CONTENT.delete("draft");
    return json({ ok: true, updatedAt: next.updatedAt });
  }

  if (path === "/history" && method === "GET") {
    const history = (await getDoc(env, "history")) || [];
    return json({ versions: history.map((h, i) => ({ index: i, updatedAt: h.updatedAt, version: h.version })) });
  }

  if (path === "/restore" && method === "POST") {
    let body; try { body = await readJson(request); } catch { return json({ error: "Bad request." }, 400); }
    const history = (await getDoc(env, "history")) || [];
    const h = history[Number(body.index)];
    if (!h) return json({ error: "That version no longer exists." }, 404);
    await env.CONTENT.put("draft", JSON.stringify({ content: h.content, updatedAt: new Date().toISOString() }));
    return json({ ok: true });
  }

  if (path === "/password" && method === "POST") {
    let body; try { body = await readJson(request); } catch { return json({ error: "Bad request." }, 400); }
    if (!(await checkPassword(env, String(body.current || "")))) return json({ error: "Current password is incorrect." }, 401);
    const next = String(body.next || "");
    if (next.length < 10) return json({ error: "Use at least 10 characters." }, 400);
    const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const hash = btoa(String.fromCharCode(...new Uint8Array(await pbkdf2(next, salt))));
    await env.CONTENT.put("password", JSON.stringify({ salt, hash }));
    const gen = String(Number((await env.CONTENT.get("session_gen")) || "0") + 1); // signs out other devices
    await env.CONTENT.put("session_gen", gen);
    return json({ ok: true }, 200, { "set-cookie": cookie(await makeToken(env), SESSION_DAYS * 86400) });
  }

  return json({ error: "Not found." }, 404);
}

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request, env, url); }
      catch (e) { return json({ error: "Something went wrong on the server. Try again." }, 500); }
    }
    const res = await env.ASSETS.fetch(request);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) out.headers.set(k, v);
    if (/\.(js|css|html)$|\/$/.test(url.pathname)) out.headers.set("cache-control", "no-cache");
    return out;
  },
};
