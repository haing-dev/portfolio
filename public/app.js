/* Portfolio front end.
   Visitors: renders the published content from /api/content.
   Owner (signed in): renders the draft with every text field editable; changes auto-save to the draft,
   and "Publish" makes the draft live. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = { content: null, owner: false, editing: false, dirty: false, saving: false, savedAt: null, timer: null, openProject: -1 };

// ---------- helpers ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
function svg(markup) { const t = document.createElement("template"); t.innerHTML = markup.trim(); return t.content.firstChild; }
const safeUrl = (u) => (/^(https?:\/\/|mailto:|tel:)/i.test(u || "") ? u : null);
function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }
function setPath(obj, path, value) {
  const keys = path.split("."); const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj); target[last] = value;
}
const paras = (s) => String(s || "").split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
const lines = (a) => (Array.isArray(a) ? a : String(a || "").split("\n")).map(t => t.trim()).filter(Boolean);

async function call(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-requested-with": "portfolio" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status });
  return data;
}
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 2600);
}

// ---------- editable text ----------
// kind: "text" (one line), "paras" (blank line between paragraphs), "lines" (one item per line)
const PLAIN = (() => { const d = document.createElement("div"); d.contentEditable = "plaintext-only"; return d.contentEditable === "plaintext-only"; })();

function field(tag, path, kind = "text", attrs = {}) {
  const value = getPath(state.content, path);
  if (!state.editing) {
    if (kind === "paras") return h(tag, attrs, ...paras(value).map(p => h("p", {}, p)));
    if (kind === "lines") return h(tag, attrs, ...lines(value).map(l => h("li", {}, l)));
    return h(tag, attrs, value || "");
  }
  const raw = kind === "lines" ? lines(value).join("\n") : (value || "");
  const el = h(tag === "ul" || tag === "ol" ? "div" : tag, {
    ...attrs, class: `${attrs.class || ""} editable ${kind !== "text" ? "multi" : ""}`.trim(),
    contenteditable: PLAIN ? "plaintext-only" : "true", spellcheck: "true",
    "data-placeholder": attrs["data-placeholder"] || "Empty",
    "aria-label": attrs["aria-label"] || path,
  }, raw);
  el.addEventListener("input", () => {
    const text = el.innerText.replace(/ /g, " ");
    setPath(state.content, path, kind === "lines" ? text.split("\n").map(t => t.trim()).filter(Boolean) : kind === "text" ? text.replace(/\n+/g, " ").trim() : text.trim());
    changed();
  });
  if (kind === "text") el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); el.blur(); } });
  el.addEventListener("click", e => e.stopPropagation());
  return el;
}
function urlInput(path, label) {
  const inp = h("input", { type: "url", value: getPath(state.content, path) || "", placeholder: "https://…", "aria-label": label });
  inp.addEventListener("input", () => { setPath(state.content, path, inp.value.trim()); changed(); });
  return h("label", { class: "url-edit" }, h("span", {}, label), inp);
}
function textInput(path, label, type = "text") {
  const inp = h("input", { type, value: getPath(state.content, path) || "", "aria-label": label });
  inp.addEventListener("input", () => { setPath(state.content, path, inp.value.trim()); changed(); });
  return h("label", { class: "url-edit" }, h("span", {}, label), inp);
}

// ---------- project motifs (small drawings, one per project type) ----------
const MOTIFS = {
  map: () => svg(`<svg viewBox="0 0 320 120" aria-hidden="true"><g class="m-dots">${
    [[42,30,5],[70,44,9],[96,38,4],[120,64,14],[150,52,6],[176,78,11],[198,60,4],[214,90,18],[246,72,7],[266,96,5],[286,58,9],[134,92,3],[88,74,6],[230,40,3]]
      .map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g></svg>`),
  crash: () => svg(`<svg viewBox="0 0 320 120" aria-hidden="true">
    <path class="m-line" d="M10 34 L40 30 L62 36 L84 28 L104 33 L120 30 L132 86 L146 92"/>
    <path class="m-up" d="M146 92 C190 80 220 52 310 30"/>
    <path class="m-flat" d="M146 92 C200 90 250 86 310 82"/>
    <path class="m-down" d="M146 92 C200 100 250 108 310 114"/>
    <circle class="m-pt" cx="132" cy="86" r="4"/></svg>`),
  gauge: () => svg(`<svg viewBox="0 0 320 120" aria-hidden="true">${
    [[62,0.72],[160,0.38],[258,0.2]].map(([cx,v]) => {
      const a = Math.PI * (1 - v), x = cx + 38 * Math.cos(a), y = 92 - 38 * Math.sin(a);
      return `<path class="m-arc" d="M${cx-46} 92 A46 46 0 0 1 ${cx+46} 92"/><line class="m-needle" x1="${cx}" y1="92" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/><circle class="m-pt" cx="${cx}" cy="92" r="3.5"/>`;
    }).join("")}</svg>`),
  bars: () => svg(`<svg viewBox="0 0 320 120" aria-hidden="true">${
    [40,64,52,88,70,96,58,80].map((v,i) => `<rect class="m-bar" x="${24+i*36}" y="${110-v}" width="22" height="${v}" rx="2"/>`).join("")}</svg>`),
};

// ---------- render ----------
function render() {
  const c = state.content, app = $("#app");
  document.body.classList.toggle("editing", state.editing);
  app.replaceChildren(heroSection(c), buildSection(c), expSection(c), footer(c));
  app.removeAttribute("aria-busy");
  document.title = c.profile.name || "Portfolio";
  renderToolbar();
  if (state.openProject >= 0 && $("#project").open) renderProject(state.openProject);
}

function heroSection(c) {
  const p = c.profile;
  const contacts = state.editing
    ? h("div", { class: "contact-edit" },
        textInput("profile.email", "Email", "email"), textInput("profile.phone", "Phone"),
        urlInput("profile.linkedin", "LinkedIn"), urlInput("profile.github", "GitHub"), textInput("profile.location", "Location"))
    : h("ul", { class: "contact" },
        p.email && h("li", {}, h("span", {}, "Email"), h("a", { href: "mailto:" + p.email }, p.email)),
        p.phone && h("li", {}, h("span", {}, "Phone"), h("a", { href: "tel:" + p.phone.replace(/[^\d+]/g, "") }, p.phone)),
        safeUrl(p.linkedin) && h("li", {}, h("span", {}, "LinkedIn"), h("a", { href: p.linkedin, target: "_blank", rel: "noopener" }, "linkedin.com/in/" + (p.linkedin.split("/in/")[1] || "").replace(/\/$/, ""))),
        safeUrl(p.github) && h("li", {}, h("span", {}, "GitHub"), h("a", { href: p.github, target: "_blank", rel: "noopener" }, p.github.replace(/^https?:\/\/(www\.)?/, ""))),
        p.location && h("li", {}, h("span", {}, "Based in"), h("b", {}, p.location)));
  return h("header", { class: "hero wrap" },
    h("div", { class: "hero-main" },
      field("h1", "profile.name", "text", { class: "name" }),
      field("p", "profile.headline", "text", { class: "headline" }),
      field("div", "profile.summary", "paras", { class: "summary prose" })),
    h("aside", { class: "hero-side" }, contacts));
}

function buildSection(c) {
  const cards = c.projects.map((p, i) => card(p, i));
  if (state.editing) cards.push(h("button", { class: "card add", type: "button", onclick: addProject }, h("span", {}, "+ Add project")));
  return h("section", { class: "build wrap", "aria-labelledby": "build-title" },
    h("div", { class: "build-head" },
      field("h2", "builder.title", "text", { id: "build-title" }),
      field("div", "builder.intro", "paras", { class: "prose intro" })),
    h("div", { class: "grid" }, cards));
}

function card(p, i) {
  const base = `projects.${i}`;
  const motif = (MOTIFS[p.motif] || MOTIFS.bars)();
  const body = h("div", { class: "card-body" },
    field("p", `${base}.tag`, "text", { class: "tag" }),
    field("h3", `${base}.title`, "text"),
    field("p", `${base}.summary`, "text", { class: "card-sum" }),
    field("ul", `${base}.facts`, "lines", { class: "facts", "data-placeholder": "Key facts, one per line" }));
  if (!state.editing) {
    return h("article", { class: "card clickable" },
      h("div", { class: "motif" }, motif), body,
      h("button", { type: "button", class: "more", "aria-haspopup": "dialog", onclick: () => openProject(i) },
        "Context, objective and method", h("span", { class: "sr" }, ` for ${p.title}`)));
  }
  return h("article", { class: "card" },
    h("div", { class: "motif" }, motif), body,
    h("div", { class: "card-tools" },
      h("button", { type: "button", class: "btn small", onclick: () => openProject(i) }, "Edit details"),
      h("button", { type: "button", class: "btn small ghost", disabled: i === 0, "aria-label": "Move left", onclick: () => moveProject(i, -1) }, "←"),
      h("button", { type: "button", class: "btn small ghost", disabled: i === state.content.projects.length - 1, "aria-label": "Move right", onclick: () => moveProject(i, 1) }, "→"),
      h("button", { type: "button", class: "btn small danger", onclick: () => deleteProject(i) }, "Delete")));
}

function expSection(c) {
  const rows = c.experience.map((e, i) => h("li", { class: "exp-row" },
    field("span", `experience.${i}.dates`, "text", { class: "dates" }),
    h("div", {},
      h("p", { class: "exp-title" }, field("span", `experience.${i}.org`, "text", { class: "org" }), h("span", { class: "sep" }, ", "), field("span", `experience.${i}.role`, "text")),
      field("p", `experience.${i}.note`, "text", { class: "note" })),
    state.editing && h("button", { type: "button", class: "btn small danger", onclick: () => { c.experience.splice(i, 1); changed(true); } }, "Delete")));
  return h("section", { class: "exp wrap", "aria-labelledby": "exp-title" },
    h("h2", { id: "exp-title" }, "Experience"),
    h("ol", { class: "exp-list" }, rows),
    state.editing && h("button", { type: "button", class: "btn small", onclick: () => { c.experience.push({ org: "Organisation", role: "Role", dates: "Year", note: "" }); changed(true); } }, "+ Add row"));
}

function footer(c) {
  return h("footer", { class: "foot wrap" },
    h("span", {}, `© ${new Date().getFullYear()} ${c.profile.name}`),
    state.owner
      ? h("button", { type: "button", class: "link", onclick: () => setEditing(!state.editing) }, state.editing ? "Preview as visitor" : "Edit site")
      : h("button", { type: "button", class: "link", onclick: openSignin }, "Owner sign in"));
}

// ---------- project dialog ----------
function openProject(i) {
  state.openProject = i;
  renderProject(i);
  const d = $("#project");
  if (!d.open) d.showModal();
}
function renderProject(i) {
  const p = state.content.projects[i], base = `projects.${i}`, d = $("#project");
  if (!p) { d.close(); return; }
  const link = safeUrl(p.url);
  const editLinks = state.editing && h("div", { class: "pd-edit" },
    urlInput(`${base}.url`, "Dashboard link"),
    (() => {
      const sel = h("select", { "aria-label": "Drawing" }, ...Object.keys(MOTIFS).map(k => h("option", { value: k, selected: p.motif === k }, { map: "Map dots", crash: "Crash and outcomes", gauge: "Three dials", bars: "Bars" }[k])));
      sel.addEventListener("change", () => { p.motif = sel.value; changed(true); });
      return h("label", { class: "url-edit" }, h("span", {}, "Card drawing"), sel);
    })());
  d.replaceChildren(
    h("div", { class: "pd" },
      h("button", { type: "button", class: "x", "aria-label": "Close", onclick: () => d.close() }, "×"),
      field("p", `${base}.tag`, "text", { class: "tag" }),
      field("h2", `${base}.title`, "text", { id: "pd-title" }),
      field("p", `${base}.summary`, "text", { class: "pd-sum" }),
      h("div", { class: "pd-grid" },
        h("section", {}, h("h3", {}, "Context"), field("div", `${base}.context`, "paras", { class: "prose" })),
        h("section", {}, h("h3", {}, "Objective"), field("div", `${base}.objective`, "paras", { class: "prose" }))),
      h("section", { class: "pd-method" }, h("h3", {}, "Methodology"), state.editing && h("p", { class: "edit-hint" }, "One bullet per line."), field("ul", `${base}.methodology`, "lines", { class: "method", "data-placeholder": "One step per line" })),
      editLinks,
      h("div", { class: "pd-foot" },
        state.editing
          ? field("span", `${base}.linkLabel`, "text", { class: "btn solid fake" })
          : link && h("a", { class: "btn solid", href: link, target: "_blank", rel: "noopener" }, p.linkLabel || "Open the dashboard"),
        link && h("span", { class: "pd-url" }, link.replace(/^https?:\/\//, "").replace(/\/$/, "")))));
}
$("#project").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$("#project").addEventListener("close", () => { state.openProject = -1; });

// ---------- editing actions ----------
function addProject() {
  const id = "p" + Date.now().toString(36);
  state.content.projects.push({ id, motif: "bars", tag: "Category", title: "New project", summary: "One sentence on what it does.", facts: ["Key fact"], context: "", objective: "", methodology: [], url: "", linkLabel: "Open the dashboard" });
  changed(true);
  openProject(state.content.projects.length - 1);
}
function moveProject(i, dir) {
  const a = state.content.projects; [a[i], a[i + dir]] = [a[i + dir], a[i]]; changed(true);
}
function deleteProject(i) {
  if (!confirm(`Delete "${state.content.projects[i].title}" from the draft? You can bring it back with Discard changes until you publish.`)) return;
  state.content.projects.splice(i, 1); changed(true);
}

function changed(rerender = false) {
  state.dirty = true; state.saving = true;
  if (rerender) render(); else renderToolbar();
  clearTimeout(state.timer);
  state.timer = setTimeout(saveDraft, 700);
}
async function saveDraft() {
  clearTimeout(state.timer);
  try {
    const r = await call("/draft", { method: "PUT", body: { content: state.content } });
    state.dirty = r.dirty; state.savedAt = new Date(r.updatedAt); state.error = null;
  } catch (e) {
    state.error = e.message;
    if (e.status === 401) { state.owner = false; state.editing = false; toast("Your session ended. Sign in again to keep editing."); await loadPublished(); render(); return; }
  }
  state.saving = false; renderToolbar();
}
async function flush() { if (state.saving) await saveDraft(); }

function renderToolbar() {
  const tb = $("#toolbar");
  tb.hidden = !state.owner;
  if (!state.owner) return;
  const time = state.savedAt ? state.savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  const status = state.error ? `Not saved: ${state.error}`
    : state.saving ? "Saving draft…"
    : state.dirty ? `Draft saved${time ? " at " + time : ""}. Not live yet.`
    : "No unpublished changes.";
  tb.replaceChildren(
    h("span", { class: "tb-status" + (state.error ? " err" : state.dirty ? " dirty" : "") }, status),
    h("div", { class: "tb-actions" },
      h("button", { type: "button", class: "btn small ghost", onclick: () => setEditing(!state.editing) }, state.editing ? "Preview" : "Edit"),
      h("button", { type: "button", class: "btn small ghost", disabled: !state.dirty, onclick: discard }, "Discard changes"),
      h("button", { type: "button", class: "btn small ghost", onclick: showHistory }, "History"),
      h("button", { type: "button", class: "btn small ghost", onclick: () => openForm("#password") }, "Password"),
      h("button", { type: "button", class: "btn small ghost", onclick: signOut }, "Sign out"),
      h("button", { type: "button", class: "btn small solid", disabled: !state.dirty || state.saving, onclick: publish }, "Publish")));
}

async function setEditing(on) { await flush(); state.editing = on; render(); }

async function publish() {
  await flush();
  if (!confirm("Publish the draft? Everyone will see it on the live site.")) return;
  try { await call("/publish", { method: "POST" }); state.dirty = false; toast("Published. The live site now shows your changes."); renderToolbar(); }
  catch (e) { toast(e.message); }
}
async function discard() {
  if (!confirm("Discard all unpublished changes and go back to the live version?")) return;
  clearTimeout(state.timer); state.saving = false;
  try { await call("/discard", { method: "POST" }); await loadDraft(); render(); toast("Changes discarded."); }
  catch (e) { toast(e.message); }
}
async function showHistory() {
  await flush();
  const d = $("#history"), list = $(".history-list", d);
  list.replaceChildren(h("li", {}, "Loading…"));
  d.showModal();
  try {
    const { versions } = await call("/history");
    list.replaceChildren(...(versions.length ? versions.map(v => h("li", {},
      h("span", {}, new Date(v.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })),
      h("button", { type: "button", class: "btn small", onclick: async () => {
        await call("/restore", { method: "POST", body: { index: v.index } });
        d.close(); await loadDraft(); state.editing = true; render(); toast("Version loaded into your draft. Publish to make it live.");
      } }, "Restore to draft"))) : [h("li", {}, "No earlier versions yet. Each publish keeps the previous version here.")]));
  } catch (e) { list.replaceChildren(h("li", {}, e.message)); }
}
async function signOut() {
  await flush();
  await call("/logout", { method: "POST" }).catch(() => {});
  state.owner = false; state.editing = false; await loadPublished(); render();
}

// ---------- sign in / password ----------
function openSignin() { openForm("#signin"); }
function openForm(sel) {
  const d = $(sel); $("form", d)?.reset(); $(".form-error", d) && ($(".form-error", d).textContent = ""); d.showModal();
  $("input", d)?.focus();
}
$$("dialog [data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

$("#signin-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, err = $(".form-error", f), btn = $("button[type=submit]", f);
  btn.disabled = true; err.textContent = "";
  try {
    await call("/login", { method: "POST", body: { email: f.email.value, password: f.password.value } });
    $("#signin").close(); state.owner = true; state.editing = true;
    await loadDraft(); render(); toast("Signed in. Click any text to edit it.");
    history.replaceState(null, "", location.pathname);
  } catch (x) { err.textContent = x.message; }
  btn.disabled = false;
});
$("#password-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, err = $(".form-error", f);
  try { await call("/password", { method: "POST", body: { current: f.current.value, next: f.next.value } }); $("#password").close(); toast("Password changed."); }
  catch (x) { err.textContent = x.message; }
});

// ---------- load ----------
async function loadPublished() { state.content = (await call("/content")).content; state.dirty = false; }
async function loadDraft() {
  const d = await call("/draft");
  state.content = d.content; state.dirty = d.dirty; state.savedAt = d.dirty ? new Date(d.updatedAt) : null; state.error = null;
}

window.addEventListener("beforeunload", e => { if (state.saving) { saveDraft(); e.preventDefault(); } });

(async function init() {
  try {
    const me = await call("/me");
    state.owner = me.owner;
    if (state.owner) { await loadDraft(); state.editing = true; } else await loadPublished();
    render();
    if (!state.owner && /^#(signin|admin|login)$/.test(location.hash)) openSignin();
  } catch (e) {
    $("#app").replaceChildren(h("p", { class: "wrap load-error" }, "The page couldn't load its content. Refresh to try again."));
  }
})();
