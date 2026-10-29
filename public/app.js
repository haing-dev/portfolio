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
  keys.reduce((o, k) => o[k], obj)[last] = value;
}
const paras = (s) => String(s || "").split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
const lines = (a) => (Array.isArray(a) ? a : String(a || "").split("\n")).map(t => t.trim()).filter(Boolean);

async function call(path, opts = {}) {
  const res = await fetch("/api" + path, {
    method: opts.method || "GET", credentials: "same-origin",
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

// ---------- editable fields ----------
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
    "data-placeholder": attrs["data-placeholder"] || "Empty", "aria-label": attrs["aria-label"] || path,
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
function input(path, label, type = "text") {
  const inp = h("input", { type, value: getPath(state.content, path) || "", "aria-label": label, placeholder: type === "url" ? "https://…" : "" });
  inp.addEventListener("input", () => { setPath(state.content, path, inp.value.trim()); changed(); });
  return h("label", { class: "inline-edit" }, h("span", {}, label), inp);
}
const removeBtn = (onclick, label = "Remove") => h("button", { type: "button", class: "tb-btn danger", onclick }, label);

// ---------- drawings ----------
// Seeded random numbers so the hero drawing is the same on every visit.
function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }

function waves() {
  // Quiet grey sea: stacked wave lines, denser and stronger toward the bottom.
  const W = 1200, H = 400, r = rng(7), out = [];
  for (let i = 0; i < 26; i++) {
    const base = 40 + i * 14.5, amp = 4 + i * 0.55, f1 = 0.004 + r() * 0.003, f2 = 0.011 + r() * 0.006, ph = r() * 6.28;
    let d = "";
    for (let x = 0; x <= W; x += 16) {
      const y = base + amp * Math.sin(x * f1 + ph) + amp * 0.35 * Math.sin(x * f2 + ph * 1.7);
      d += (x ? " L" : "M") + x + " " + y.toFixed(1);
    }
    out.push(`<path d="${d}" stroke-opacity="${(0.15 + i * 0.02).toFixed(3)}"/>`);
  }
  return svg(`<svg class="waves" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${out.join("")}</svg>`);
}

const MOTIFS = {
  map: () => svg(`<svg viewBox="0 0 320 150" aria-hidden="true"><g class="m-dots">${
    [[42,40,5],[70,54,9],[96,48,4],[120,78,15],[150,62,6],[176,96,11],[198,72,4],[214,108,19],[246,86,7],[266,116,5],[286,70,9],[134,112,3],[88,92,6],[230,50,3],[58,100,4],[160,36,3]]
      .map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g></svg>`),
  crash: () => svg(`<svg viewBox="0 0 320 150" aria-hidden="true">
    <path class="m-line" d="M14 40 L40 36 L62 42 L84 32 L104 38 L120 34 L132 100 L146 106"/>
    <path class="m-up" d="M146 106 C190 92 220 62 306 36"/>
    <path class="m-flat" d="M146 106 C200 104 250 100 306 96"/>
    <path class="m-down" d="M146 106 C200 116 250 126 306 136"/>
    <circle class="m-pt" cx="132" cy="100" r="4"/></svg>`),
  gauge: () => svg(`<svg viewBox="0 0 320 150" aria-hidden="true">${
    [[62,0.72],[160,0.38],[258,0.2]].map(([cx,v]) => {
      const a = Math.PI * (1 - v), x = cx + 36 * Math.cos(a), y = 108 - 36 * Math.sin(a);
      return `<path class="m-arc" d="M${cx-44} 108 A44 44 0 0 1 ${cx+44} 108"/><line class="m-needle" x1="${cx}" y1="108" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/><circle class="m-pt" cx="${cx}" cy="108" r="3"/>`;
    }).join("")}</svg>`),
  bars: () => svg(`<svg viewBox="0 0 320 150" aria-hidden="true">${
    [40,64,52,88,70,96,58,80].map((v,i) => `<rect class="m-bar" x="${26+i*36}" y="${130-v}" width="20" height="${v}"/>`).join("")}</svg>`),
};
const MOTIF_NAMES = { map: "Map dots", crash: "Crash and outcomes", gauge: "Three dials", bars: "Bars" };

// ---------- render ----------
function render() {
  const c = state.content;
  document.body.classList.toggle("editing", state.editing);
  $("#app").replaceChildren(topbar(), hero(c), work(c), experience(c), education(c), footer(c));
  $("#app").removeAttribute("aria-busy");
  document.title = c.profile.title || c.profile.name || "Portfolio";
  renderToolbar();
  if (state.openProject >= 0 && $("#project").open) renderProject(state.openProject);
}

function topbar() {
  const light = document.documentElement.dataset.theme === "light";
  return h("nav", { class: "topbar wrap", "aria-label": "Page" },
    h("div", { class: "tb-left" },
      h("a", { class: "bracket", href: "#work" }, "Tools"),
      h("a", { class: "bracket", href: "#experience" }, "Experience"),
      h("a", { class: "bracket", href: "#education" }, "Education")),
    h("button", { type: "button", class: "bracket", "aria-pressed": String(light), onclick: toggleTheme }, light ? "Dark mode" : "Light mode"));
}

// Dark by default; each visitor's choice is remembered in their own browser.
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem("theme", t); } catch {} }
function toggleTheme() { setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"); render(); }

function panelBackground(p) {
  return isImg(p.background) ? h("img", { class: "panel-img", src: p.background, alt: "", decoding: "async" }) : waves();
}
// Upload / replace / remove controls for an image stored at obj[key]; noun is what the buttons call it.
function imageTools(obj, key, noun, maxWidth, cls) {
  const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr", "aria-label": `${noun} image` });
  file.addEventListener("change", () => file.files[0] && uploadImage(file.files[0], maxWidth, path => { obj[key] = path; }, noun));
  return h("div", { class: cls }, file,
    h("button", { type: "button", class: "tb-btn", onclick: e => { e.stopPropagation(); file.click(); } }, obj[key] ? `Replace ${noun}` : `Upload ${noun}`),
    obj[key] && h("button", { type: "button", class: "tb-btn danger", onclick: e => { e.stopPropagation(); obj[key] = ""; changed(true); } }, `Remove ${noun}`));
}
const isImg = (v) => /^\/api\/image\/[a-z0-9]+$/.test(v || "");

// Shrink large photos in the browser before upload (JPEG, at most maxWidth px wide).
async function uploadImage(f, maxWidth, apply, noun) {
  try {
    toast(`Uploading ${noun}…`);
    const bmp = await createImageBitmap(f);
    const scale = Math.min(1, maxWidth / bmp.width);
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.85));
    const res = await fetch("/api/image", { method: "POST", credentials: "same-origin", headers: { "content-type": "image/jpeg", "x-requested-with": "portfolio" }, body: blob });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Upload failed.");
    apply(data.path); changed(true);
    toast(`${noun[0].toUpperCase() + noun.slice(1)} updated in your draft. Publish to make it live.`);
  } catch (e) { toast(e.message || "That file couldn't be read as an image."); }
}

function hero(c) {
  const p = c.profile;
  const contacts = state.editing
    ? h("div", { class: "contact-edit" }, input("profile.email", "Email", "email"), input("profile.email2", "Second email", "email"), input("profile.phone", "Phone"),
        input("profile.linkedin", "LinkedIn", "url"), input("profile.github", "GitHub", "url"),
        input("profile.location", "Location"))
    : h("ul", { class: "clist" },
        (p.email || p.email2) && h("li", {}, h("span", { class: "ck" }, "Email"), h("span", { class: "stack" },
          ...[p.email, p.email2].filter(Boolean).map(e => h("a", { href: "mailto:" + e }, e)))),
        p.phone && h("li", {}, h("span", { class: "ck" }, "Phone"), h("a", { href: "tel:" + p.phone.replace(/[^\d+]/g, "") }, p.phone)),
        safeUrl(p.linkedin) && h("li", {}, h("span", { class: "ck" }, "LinkedIn"), h("a", { href: p.linkedin, target: "_blank", rel: "noopener" }, "Profile", h("span", { class: "ext", "aria-hidden": "true" }, " ↗"))),
        safeUrl(p.github) && h("li", {}, h("span", { class: "ck" }, "GitHub"), h("a", { href: p.github, target: "_blank", rel: "noopener" }, p.github.replace(/^https?:\/\/(www\.)?github\.com\//, ""), h("span", { class: "ext", "aria-hidden": "true" }, " ↗"))),
        p.location && h("li", {}, h("span", { class: "ck" }, "Based in"), h("span", {}, p.location)));
  return h("header", { class: "hero wrap" },
    field("h1", "profile.title", "text", { class: "name" }),
    h("div", { class: "panel" }, panelBackground(p), state.editing && imageTools(p, "background", "background", 2400, "bg-tools"),
      h("div", { class: "panel-body" },
        h("section", { class: "panel-about", "aria-label": "About" }, h("h2", { class: "label" }, "About"), field("div", "profile.about", "paras", { class: "prose" })),
        h("section", { class: "panel-contact", id: "contact", "aria-label": "Contact" }, h("h2", { class: "label" }, "Contact"), contacts))));
}

const section = (id, label, ...body) =>
  h("section", { class: "sec wrap", id, "aria-labelledby": `${id}-h` }, h("h2", { class: "label", id: `${id}-h` }, label), h("div", { class: "sec-body" }, ...body));

function work(c) {
  const cards = c.projects.map((p, i) => card(p, i));
  if (state.editing) cards.push(h("button", { class: "card add", type: "button", onclick: addProject }, "+ Add tool"));
  return section("work", "Tools", h("div", { class: "grid" }, cards));
}

function card(p, i) {
  const base = `projects.${i}`;
  const body = [
    h("div", { class: "motif" + (isImg(p.image) ? " has-img" : "") },
      isImg(p.image) ? h("img", { src: p.image, alt: "", loading: "lazy", decoding: "async" }) : (MOTIFS[p.motif] || MOTIFS.bars)(),
      state.editing && imageTools(p, "image", "picture", 1600, "img-tools")),
    field("p", `${base}.tag`, "text", { class: "card-tag" }),
    field("h3", `${base}.title`, "text"),
    field("p", `${base}.summary`, "text", { class: "card-sum" }),
  ];
  if (!state.editing) {
    return h("article", { class: "card clickable" }, ...body,
      h("button", { type: "button", class: "more bracket", "aria-haspopup": "dialog", onclick: () => openProject(i) },
        "Open the project", h("span", { class: "chev", "aria-hidden": "true" }, "›"), h("span", { class: "sr" }, `: ${p.title}`)));
  }
  const last = state.content.projects.length - 1;
  return h("article", { class: "card" }, ...body,
    h("div", { class: "card-tools" },
      h("button", { type: "button", class: "btn small", onclick: () => openProject(i) }, "Edit project page"),
      h("button", { type: "button", class: "tb-btn", disabled: i === 0, "aria-label": "Move left", onclick: () => moveProject(i, -1) }, "←"),
      h("button", { type: "button", class: "tb-btn", disabled: i === last, "aria-label": "Move right", onclick: () => moveProject(i, 1) }, "→"),
      removeBtn(() => deleteProject(i), "Delete")));
}

function experience(c) {
  const rows = c.experience.map((e, i) => {
    const b = `experience.${i}`;
    return h("li", { class: "xrow" },
      h("div", { class: "x-org" }, field("p", `${b}.org`, "text", { class: "org" }), field("p", `${b}.dates`, "text", { class: "mono" })),
      field("p", `${b}.role`, "text", { class: "x-role" }),
      h("div", { class: "x-note" }, field("p", `${b}.note`, "text"), state.editing && removeBtn(() => { c.experience.splice(i, 1); changed(true); })));
  });
  return section("experience", "Experience", h("ol", { class: "xlist" }, rows),
    state.editing && h("button", { type: "button", class: "tb-btn", onclick: () => { c.experience.push({ org: "Organisation", dates: "Year", role: "Role", note: "" }); changed(true); } }, "+ Add role"));
}

function education(c) {
  const rows = c.education.map((e, i) => {
    const b = `education.${i}`;
    return h("li", { class: "erow" },
      h("div", {}, field("p", `${b}.degree`, "text", { class: "org" }), field("p", `${b}.school`, "text", { class: "muted" }),
        field("p", `${b}.note`, "text", { class: "muted small", "data-placeholder": "Note (optional)" })),
      h("div", { class: "e-side" }, field("p", `${b}.dates`, "text", { class: "mono" }), state.editing && removeBtn(() => { c.education.splice(i, 1); changed(true); })));
  });
  return section("education", "Education", h("ol", { class: "elist" }, rows),
    state.editing && h("button", { type: "button", class: "tb-btn", onclick: () => { c.education.push({ degree: "Degree", school: "School", dates: "Years", note: "" }); changed(true); } }, "+ Add school"));
}

function footer(c) {
  return h("footer", { class: "foot wrap" },
    h("span", { class: "mono" }, `© ${new Date().getFullYear()} ${c.profile.name || ""}`),
    state.owner
      ? h("button", { type: "button", class: "bracket", onclick: () => setEditing(!state.editing) }, state.editing ? "Preview as visitor" : "Edit site")
      : h("button", { type: "button", class: "bracket", onclick: openSignin }, "Owner sign in"));
}


// ---------- project dialog ----------
function openProject(i) {
  state.openProject = i; renderProject(i);
  const d = $("#project"); if (!d.open) d.showModal();
}
function renderProject(i) {
  const p = state.content.projects[i], base = `projects.${i}`, d = $("#project");
  if (!p) { d.close(); return; }
  const link = safeUrl(p.url);
  const row = (label, el, extra) => h("div", { class: "pd-row" }, h("h3", { class: "label" }, label), h("div", {}, extra, el));
  d.replaceChildren(h("div", { class: "pd" },
    state.editing && h("p", { class: "edit-banner" }, "Editing this project page. Click any text to change it; changes save to your draft and go live when you publish."),
    h("div", { class: "pd-top" }, field("p", `${base}.tag`, "text", { class: "kicker" }),
      h("button", { type: "button", class: "bracket", "aria-label": "Close", onclick: () => d.close() }, "Close")),
    field("h2", `${base}.title`, "text", { id: "pd-title", class: "pd-title" }),
    field("p", `${base}.summary`, "text", { class: "pd-sum" }),
    row("Context", field("div", `${base}.context`, "paras", { class: "prose" })),
    row("Objective", field("div", `${base}.objective`, "paras", { class: "prose" })),
    row("Methodology", field("ul", `${base}.methodology`, "lines", { class: "method", "data-placeholder": "One step per line" }),
      state.editing && h("p", { class: "edit-hint" }, "One bullet per line.")),
    state.editing && row("Settings", h("div", { class: "pd-edit" }, input(`${base}.url`, "Dashboard link", "url"),
      (() => {
        const sel = h("select", { "aria-label": "Card drawing" }, ...Object.keys(MOTIFS).map(k => h("option", { value: k, selected: p.motif === k }, MOTIF_NAMES[k])));
        sel.addEventListener("change", () => { p.motif = sel.value; changed(true); });
        return h("label", { class: "inline-edit" }, h("span", {}, "Card drawing"), sel);
      })())),
    h("div", { class: "pd-foot" },
      state.editing ? field("span", `${base}.linkLabel`, "text", { class: "btn" })
        : link && h("a", { class: "btn", href: link, target: "_blank", rel: "noopener" }, p.linkLabel || "Open the dashboard", h("span", { "aria-hidden": "true" }, " ↗")),
      link && h("span", { class: "mono muted" }, link.replace(/^https?:\/\//, "").replace(/\/$/, "")))));
}
$("#project").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$("#project").addEventListener("close", () => { state.openProject = -1; });

// ---------- editing actions ----------
function addProject() {
  state.content.projects.push({ id: "p" + Date.now().toString(36), motif: "bars", image: "", tag: "Category", title: "New tool", summary: "One sentence on what it does.", context: "", objective: "", methodology: [], url: "", linkLabel: "Open the dashboard" });
  changed(true); openProject(state.content.projects.length - 1);
}
function moveProject(i, dir) { const a = state.content.projects; [a[i], a[i + dir]] = [a[i + dir], a[i]]; changed(true); }
function deleteProject(i) {
  if (!confirm(`Delete "${state.content.projects[i].title}" from the draft? Discard changes brings it back until you publish.`)) return;
  state.content.projects.splice(i, 1); changed(true);
}

function changed(rerender = false) {
  state.dirty = true; state.saving = true;
  if (rerender) render(); else renderToolbar();
  clearTimeout(state.timer); state.timer = setTimeout(saveDraft, 700);
}
async function saveDraft() {
  clearTimeout(state.timer);
  try {
    const r = await call("/draft", { method: "PUT", body: { content: state.content } });
    state.dirty = r.dirty; state.savedAt = new Date(r.updatedAt); state.error = null;
  } catch (e) {
    state.error = e.message;
    if (e.status === 401) { state.owner = false; state.editing = false; state.saving = false; toast("Your session ended. Sign in again to keep editing."); await loadPublished(); render(); return; }
  }
  state.saving = false; renderToolbar();
}
async function flush() { if (state.saving) await saveDraft(); }

function renderToolbar() {
  const tb = $("#toolbar"); tb.hidden = !state.owner;
  if (!state.owner) return;
  const time = state.savedAt ? state.savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  const status = state.error ? `Not saved: ${state.error}` : state.saving ? "Saving draft…"
    : state.dirty ? `Draft saved${time ? " " + time : ""} · not live yet` : "Live site is up to date";
  tb.replaceChildren(
    h("span", { class: "tb-status" + (state.error ? " err" : state.dirty ? " dirty" : "") }, status),
    h("div", { class: "tb-actions" },
      h("button", { type: "button", class: "tb-btn", onclick: () => setEditing(!state.editing) }, state.editing ? "Preview" : "Edit"),
      h("button", { type: "button", class: "tb-btn", disabled: !state.dirty, onclick: discard }, "Discard changes"),
      h("button", { type: "button", class: "tb-btn", onclick: showHistory }, "History"),
      h("button", { type: "button", class: "tb-btn", onclick: () => openForm("#password") }, "Password"),
      h("button", { type: "button", class: "tb-btn", onclick: signOut }, "Sign out"),
      h("button", { type: "button", class: "btn small", disabled: !state.dirty || state.saving, onclick: publish }, "Publish")));
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
  list.replaceChildren(h("li", {}, "Loading…")); d.showModal();
  try {
    const { versions } = await call("/history");
    list.replaceChildren(...(versions.length ? versions.map(v => h("li", {},
      h("span", {}, new Date(v.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })),
      h("button", { type: "button", class: "tb-btn", onclick: async () => {
        await call("/restore", { method: "POST", body: { index: v.index } });
        d.close(); await loadDraft(); state.editing = true; render(); toast("Version loaded into your draft. Publish to make it live.");
      } }, "Restore to draft"))) : [h("li", {}, "No earlier versions yet. Each publish keeps the previous version here.")]));
  } catch (e) { list.replaceChildren(h("li", {}, e.message)); }
}
async function signOut() {
  await flush(); await call("/logout", { method: "POST" }).catch(() => {});
  state.owner = false; state.editing = false; await loadPublished(); render();
}

// ---------- sign in / password ----------
function openSignin() { openForm("#signin"); }
function openForm(sel) {
  const d = $(sel); $("form", d)?.reset(); const err = $(".form-error", d); if (err) err.textContent = "";
  d.showModal(); $("input", d)?.focus();
}
$$("dialog [data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));

$("#signin-form").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, err = $(".form-error", f), btn = $("button[type=submit]", f);
  btn.disabled = true; err.textContent = "";
  try {
    await call("/login", { method: "POST", body: { password: f.password.value } });
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
  try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; } catch {}
  try {
    state.owner = (await call("/me")).owner;
    if (state.owner) { await loadDraft(); state.editing = true; } else await loadPublished();
    render();
    if (!state.owner && /^#(signin|admin|login)$/.test(location.hash)) openSignin();
  } catch (e) {
    $("#app").replaceChildren(h("p", { class: "wrap load-error" }, "The page couldn't load its content. Refresh to try again."));
  }
})();
