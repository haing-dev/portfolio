// Runs against a local `wrangler dev` (BASE, default http://127.0.0.1:8787) with ADMIN_PASSWORD from .dev.vars.
import assert from "node:assert/strict";
const BASE = process.env.BASE || "http://127.0.0.1:8787";
const PASS = process.env.PASS || "local-test-pass-123";
let jar = "";
async function call(path, { method = "GET", body, headers = {} } = {}) {
  const r = await fetch(BASE + "/api" + path, { method, headers: { "content-type": "application/json", "x-requested-with": "portfolio", cookie: jar, ...headers }, body: body && JSON.stringify(body) });
  const sc = r.headers.get("set-cookie"); if (sc) jar = sc.split(";")[0];
  return { status: r.status, data: await r.json() };
}
let r = await call("/me"); assert.equal(r.data.owner, false);
r = await call("/draft"); assert.equal(r.status, 401, "draft needs sign-in");
r = await call("/login", { method: "POST", body: { email: "haing.wharton@gmail.com", password: "wrong" } }); assert.equal(r.status, 401);
r = await call("/login", { method: "POST", body: { email: "someone@else.com", password: PASS } }); assert.equal(r.status, 401);
r = await call("/login", { method: "POST", body: { email: "HAING.WHARTON@gmail.com", password: PASS }, headers: { "x-requested-with": "" } }); assert.equal(r.status, 400, "csrf header required");
r = await call("/login", { method: "POST", body: { email: "HAING.WHARTON@gmail.com", password: PASS } }); assert.equal(r.status, 200);
r = await call("/me"); assert.equal(r.data.owner, true);
const pub0 = (await call("/content")).data.content;
r = await call("/draft"); const draft = r.data.content;
draft.profile.headline = "Edited headline";
draft.projects[0].url = "javascript:alert(1)";
r = await call("/draft", { method: "PUT", body: { content: draft } }); assert.equal(r.status, 400, "unsafe url rejected");
draft.projects[0].url = "https://asia-carbon-atlas.pages.dev/";
r = await call("/draft", { method: "PUT", body: { content: draft } }); assert.equal(r.status, 200); assert.equal(r.data.dirty, true);
r = await call("/content"); assert.equal(r.data.content.profile.headline, pub0.headline ?? pub0.profile.headline, "visitors still see published");
r = await call("/publish", { method: "POST" }); assert.equal(r.status, 200);
r = await call("/content"); assert.equal(r.data.content.profile.headline, "Edited headline");
r = await call("/history"); assert.ok(r.data.versions.length >= 1);
r = await call("/restore", { method: "POST", body: { index: 0 } }); assert.equal(r.status, 200);
r = await call("/draft"); assert.equal(r.data.content.profile.headline, pub0.profile.headline); assert.equal(r.data.dirty, true);
r = await call("/discard", { method: "POST" }); r = await call("/draft"); assert.equal(r.data.dirty, false);
r = await call("/logout", { method: "POST" }); r = await call("/me"); assert.equal(r.data.owner, false);
console.log("all API checks passed");

// image upload
await call("/login", { method: "POST", body: { email: "haing.wharton@gmail.com", password: PASS } });
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), c => c.charCodeAt(0));
let up = await fetch(BASE + "/api/image", { method: "POST", headers: { "content-type": "image/png", "x-requested-with": "portfolio", cookie: jar }, body: png });
let uj = await up.json(); assert.equal(up.status, 200); assert.match(uj.path, /^\/api\/image\/[a-f0-9]+$/);
const got = await fetch(BASE + uj.path); assert.equal(got.status, 200); assert.equal(got.headers.get("content-type"), "image/png");
up = await fetch(BASE + "/api/image", { method: "POST", headers: { "content-type": "image/svg+xml", "x-requested-with": "portfolio", cookie: jar }, body: "<svg/>" }); assert.equal(up.status, 400, "svg rejected");
const d2 = (await call("/draft")).data.content; d2.profile.background = "https://evil.example/x.png";
assert.equal((await call("/draft", { method: "PUT", body: { content: d2 } })).status, 400, "external background rejected");
d2.profile.background = uj.path; assert.equal((await call("/draft", { method: "PUT", body: { content: d2 } })).status, 200);
await call("/discard", { method: "POST" }); await call("/logout", { method: "POST" });
up = await fetch(BASE + "/api/image", { method: "POST", headers: { "content-type": "image/png", "x-requested-with": "portfolio" }, body: png }); assert.equal(up.status, 401, "upload needs sign-in");
console.log("image checks passed");
