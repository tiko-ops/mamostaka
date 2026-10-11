(() => {
  "use strict";

  const MAX = 5000;
  const TIMEOUT_MS = 60_000;
  const EXPLAIN_TIMEOUT_MS = 40_000;
  // Markör som API:t lägger till om strömningen avbryts
  const STREAM_ERROR = "[Fel vid strömning]";
  // Över så här många ändringar visas bara den färdiga texten
  const MAX_EDITS = 2000;
  // Så många ändringar förklaras (samma gräns som i API:t)
  const MAX_EXPLAIN = 40;
  const CONTEXT_CHARS = 50;
  const LANG_KEY = "mamosta-lang";

  const MODE_HINTS = {
    ratta: "Rättar stavning, grammatik och särskrivningar. Din stil behålls.",
    formell: "Rättar fel och gör texten mer formell och professionell.",
    enkel: "Rättar fel och skriver om med korta meningar och vanliga ord.",
    kortare: "Rättar fel och kortar ner texten till det viktigaste.",
  };
  const RTL = new Set(["ar", "ckb"]);
  const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

  const $ = (id) => document.getElementById(id);
  const form = $("form");
  const input = $("text");
  const counter = $("counter");
  const modeHint = $("mode-hint");
  const submitBtn = $("submit");
  const submitLabel = submitBtn.querySelector(".label");
  const clearBtn = $("clear");
  const errorEl = $("error");
  const result = $("result");
  const resultTitle = $("result-title");
  const summary = $("summary");
  const output = $("output");
  const legend = $("legend");
  const copyBtn = $("copy");
  const statusEl = $("status");
  const changesSection = $("changes");
  const changeList = $("change-list");
  const changesNote = $("changes-note");
  const langSelect = $("lang");
  const viewBtns = document.querySelectorAll("[data-view]");
  const modeInputs = form.querySelectorAll('input[name="mode"]');

  const nf = new Intl.NumberFormat("sv-SE");

  let controller = null;
  let explainController = null;
  let loading = false;
  let original = "";
  let corrected = "";
  let mode = "ratta";
  let chunks = null; // null = ingen diff tillgänglig
  let listed = []; // index i chunks för ändringar som visas i "Vad ändrades?"
  let reasonsByLang = {};
  let view = "diff";

  // ---------- Inställningar som bara sparas i webbläsaren ----------

  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && langSelect.querySelector(`option[value="${saved}"]`)) langSelect.value = saved;
  } catch {}

  const selectedMode = () => form.querySelector('input[name="mode"]:checked').value;

  // ---------- Teckenräknare ----------

  function updateCounter() {
    const n = input.value.length;
    const over = n > MAX;
    counter.textContent = `${nf.format(n)} / ${nf.format(MAX)} tecken`;
    counter.classList.toggle("over", over);
    input.setAttribute("aria-invalid", String(over));

    if (over) {
      if (errorEl.dataset.kind !== "length") showError(tooLongMessage(), "length");
    } else if (errorEl.dataset.kind === "length" || errorEl.dataset.kind === "empty") {
      hideError();
    }
  }

  function tooLongMessage() {
    return `Texten är för lång – max ${nf.format(MAX)} tecken. Korta ner den och försök igen.`;
  }

  // ---------- Fel ----------

  function showError(message, kind = "other") {
    errorEl.textContent = message;
    errorEl.dataset.kind = kind;
    errorEl.hidden = false;
  }

  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = "";
    delete errorEl.dataset.kind;
  }

  function friendlyError(status, serverMessage) {
    if (status === 400) return serverMessage || "Kontrollera texten och försök igen.";
    if (status === 429) return serverMessage || "Många använder tjänsten just nu. Vänta en stund och försök igen.";
    if (status === 504) return "Det tog för lång tid att rätta texten. Försök igen.";
    return "Något gick fel hos oss. Försök igen om en stund.";
  }

  class FriendlyError extends Error {}

  // ---------- Laddläge ----------

  function setLoading(on) {
    loading = on;
    submitBtn.classList.toggle("is-loading", on);
    submitBtn.setAttribute("aria-disabled", String(on));
    submitLabel.textContent = on ? "Korrigerar…" : "Korrigera";
    output.setAttribute("aria-busy", String(on));
    copyBtn.disabled = on;
    viewBtns.forEach((b) => (b.disabled = on));
  }

  // ---------- Skicka ----------

  async function correct() {
    if (loading) return;
    const text = input.value;

    if (!text.trim()) {
      showError("Skriv eller klistra in en text först.", "empty");
      input.focus();
      return;
    }
    if (text.length > MAX) {
      showError(tooLongMessage(), "length");
      input.focus();
      return;
    }

    hideError();
    if (explainController) explainController.abort();
    controller = new AbortController();
    const ac = controller;
    const timer = setTimeout(() => ac.abort("timeout"), TIMEOUT_MS);

    original = text;
    corrected = "";
    mode = selectedMode();
    chunks = null;
    listed = [];
    reasonsByLang = {};
    output.textContent = "";
    summary.textContent = "Korrigerar…";
    legend.hidden = true;
    changesSection.hidden = true;
    result.hidden = false;
    setLoading(true);
    statusEl.textContent = "Korrigerar texten…";
    if (result.getBoundingClientRect().top > window.innerHeight) {
      result.scrollIntoView({ block: "start" });
    }

    try {
      const res = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new FriendlyError(friendlyError(res.status, data && data.error));
      }
      if (!res.body) throw new FriendlyError(friendlyError(500));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        corrected += decoder.decode(value, { stream: true });
        output.textContent = corrected;
      }
      corrected += decoder.decode();

      if (corrected.includes(STREAM_ERROR)) {
        throw new FriendlyError("Rättningen avbröts. Försök igen.");
      }
      if (!corrected.trim()) throw new FriendlyError(friendlyError(500));

      showResult();
    } catch (err) {
      // Användaren tryckte på Rensa – visa inget fel
      if (ac.signal.aborted && ac.signal.reason !== "timeout") return;

      let message;
      if (ac.signal.reason === "timeout") {
        message = "Det tog för lång tid att rätta texten. Försök igen.";
      } else if (err instanceof FriendlyError) {
        message = err.message;
      } else if (!navigator.onLine) {
        message = "Du verkar vara offline. Kontrollera anslutningen och försök igen.";
      } else {
        message = "Kunde inte nå servern. Försök igen om en stund.";
      }
      result.hidden = true;
      statusEl.textContent = "";
      showError(message);
    } finally {
      clearTimeout(timer);
      if (controller === ac) {
        controller = null;
        setLoading(false);
      }
    }
  }

  // ---------- Resultat ----------

  const isChange = (c) => c.eq === undefined;
  const finalText = () =>
    chunks ? chunks.map((c) => (isChange(c) ? (c.rejected ? c.del : c.ins) : c.eq)).join("") : corrected;

  function showResult() {
    chunks = diffWords(original, corrected);
    const total = chunks ? chunks.filter(isChange).length : null;

    // Rättningsläget visar ändringarna; omskrivningarna visar texten direkt
    const rewrite = mode !== "ratta";
    const initialView = rewrite || !chunks || total === 0 ? "plain" : view;

    updateSummary();
    setView(initialView, { remember: false });

    if (!rewrite && total > 0) {
      listed = chunks
        .map((c, i) => (isChange(c) && (c.del.trim() || c.ins.trim()) ? i : -1))
        .filter((i) => i >= 0);
      renderChangeList();
      if (listed.length) loadReasons();
    }

    statusEl.textContent = `Klart. ${summary.textContent}`;
    resultTitle.focus();
  }

  function updateSummary() {
    if (!chunks) {
      summary.textContent = mode === "ratta" ? "Texten har skrivits om mycket." : "Texten är omskriven.";
      return;
    }
    const changes = chunks.filter(isChange);
    const undone = changes.filter((c) => c.rejected).length;
    if (changes.length === 0) {
      summary.textContent =
        mode === "ratta" ? "Inga fel hittades – texten ser bra ut." : "Texten behövde inga ändringar.";
      return;
    }
    let text = changes.length === 1 ? "1 ändring" : `${nf.format(changes.length)} ändringar`;
    if (undone) text += ` · ${nf.format(undone)} ångrad${undone === 1 ? "" : "e"}`;
    summary.textContent = text;
  }

  function setView(next, { remember = true } = {}) {
    if (remember) view = next;
    const showDiff = next === "diff" && chunks !== null;
    viewBtns.forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.view === (showDiff ? "diff" : "plain")))
    );
    legend.hidden = !showDiff || !chunks.some(isChange);
    render(showDiff);
  }

  function currentView() {
    const pressed = document.querySelector('[data-view][aria-pressed="true"]');
    return pressed ? pressed.dataset.view : "plain";
  }

  function render(showDiff) {
    output.textContent = "";
    if (!showDiff) {
      output.textContent = finalText();
      return;
    }
    const frag = document.createDocumentFragment();
    chunks.forEach((c, i) => {
      if (!isChange(c)) {
        frag.append(c.eq);
        return;
      }
      const span = document.createElement("span");
      span.className = "chg";
      span.dataset.i = String(i);
      if (c.rejected) {
        span.classList.add("rejected");
        span.textContent = c.del;
        span.title = "Ångrad – klicka för att använda rättningen igen";
      } else {
        span.title = "Klicka för att ångra ändringen";
        if (c.del) {
          const el = document.createElement("del");
          el.textContent = c.del;
          span.append(el);
        }
        if (c.ins) {
          const el = document.createElement("ins");
          el.textContent = c.ins;
          span.append(el);
        }
      }
      frag.append(span);
    });
    output.append(frag);
  }

  // Ångra eller återställ en enskild ändring
  function toggleChange(i) {
    const c = chunks && chunks[i];
    if (!c || !isChange(c)) return;
    c.rejected = !c.rejected;
    updateSummary();
    render(currentView() === "diff");
    const li = changeList.querySelector(`[data-i="${i}"]`);
    if (li) updateListItem(li, c);
    statusEl.textContent = c.rejected
      ? `Ändringen är ångrad. ${summary.textContent}`
      : `Ändringen används igen. ${summary.textContent}`;
  }

  // ---------- Vad ändrades? ----------

  const shown = (s) => (s.trim() ? s.trim() : s.includes("\n") ? "(radbrytning)" : "(mellanslag)");

  function renderChangeList() {
    changeList.textContent = "";
    changesSection.hidden = listed.length === 0;
    if (!listed.length) return;

    const items = listed.slice(0, MAX_EXPLAIN);
    for (const i of items) {
      const c = chunks[i];
      const li = document.createElement("li");
      li.dataset.i = String(i);

      const pair = document.createElement("p");
      pair.className = "pair";
      if (c.del && c.ins) {
        const d = document.createElement("del");
        d.textContent = shown(c.del);
        const n = document.createElement("ins");
        n.textContent = shown(c.ins);
        pair.append(d, " → ", n);
      } else if (c.ins) {
        const n = document.createElement("ins");
        n.textContent = shown(c.ins);
        pair.append("Lagt till ", n);
      } else {
        const d = document.createElement("del");
        d.textContent = shown(c.del);
        pair.append("Tagit bort ", d);
      }

      const reason = document.createElement("p");
      reason.className = "reason";

      const actions = document.createElement("p");
      actions.className = "item-actions";
      const undo = document.createElement("button");
      undo.type = "button";
      undo.className = "link-btn";
      undo.addEventListener("click", () => toggleChange(i));
      actions.append(undo);

      const guide = guideFor(c.del, c.ins);
      if (guide) {
        const a = document.createElement("a");
        a.href = `/guider/${guide.slug}`;
        a.textContent = `Läs mer: ${guide.name}`;
        actions.append(a);
      }

      li.append(pair, reason, actions);
      updateListItem(li, c);
      changeList.append(li);
    }

    setRestNote();
    showReasons();
  }

  function setRestNote() {
    const rest = listed.length - MAX_EXPLAIN;
    changesNote.hidden = rest <= 0;
    changesNote.textContent =
      rest > 0 ? `Ytterligare ${nf.format(rest)} ändringar syns i texten ovan men förklaras inte.` : "";
  }

  function updateListItem(li, c) {
    li.classList.toggle("rejected", Boolean(c.rejected));
    const btn = li.querySelector(".link-btn");
    const label = c.del && c.ins ? `${shown(c.del)} till ${shown(c.ins)}` : shown(c.del || c.ins);
    btn.textContent = c.rejected ? "Använd rättningen" : "Ångra";
    btn.setAttribute("aria-label", `${c.rejected ? "Använd rättningen" : "Ångra ändringen"} ${label}`);
  }

  function showReasons(state) {
    const lang = langSelect.value;
    const reasons = reasonsByLang[lang];
    changeList.setAttribute("aria-busy", String(state === "loading"));
    changeList.querySelectorAll("li").forEach((li, n) => {
      const p = li.querySelector(".reason");
      p.classList.remove("muted");
      p.removeAttribute("dir");
      p.lang = "sv";
      if (reasons && reasons[n]) {
        p.textContent = reasons[n];
        p.lang = lang === "sv-enkel" ? "sv" : lang;
        if (RTL.has(lang) && ARABIC_SCRIPT.test(reasons[n])) p.dir = "rtl";
      } else if (state === "loading") {
        p.textContent = "Hämtar förklaring…";
        p.classList.add("muted");
      } else {
        p.textContent = "";
      }
    });
    if (state === "error") {
      changesNote.hidden = false;
      changesNote.textContent = "Förklaringarna kunde inte hämtas just nu. Rättningarna fungerar ändå.";
    }
  }

  function contextFor(i) {
    const before = (chunks[i - 1] && chunks[i - 1].eq) || "";
    const after = (chunks[i + 1] && chunks[i + 1].eq) || "";
    const c = chunks[i];
    const tidy = (s) => s.replace(/\s+/g, " ");
    return tidy(
      `…${before.slice(-CONTEXT_CHARS)}[${c.del} → ${c.ins}]${after.slice(0, CONTEXT_CHARS)}…`
    ).slice(0, 380);
  }

  async function loadReasons() {
    const lang = langSelect.value;
    if (reasonsByLang[lang]) {
      showReasons();
      return;
    }
    if (explainController) explainController.abort();
    const ac = new AbortController();
    explainController = ac;
    const timer = setTimeout(() => ac.abort("timeout"), EXPLAIN_TIMEOUT_MS);
    const items = listed.slice(0, MAX_EXPLAIN);

    showReasons("loading");
    try {
      const res = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lang,
          changes: items.map((i) => ({
            from: chunks[i].del.slice(0, 380),
            to: chunks[i].ins.slice(0, 380),
            context: contextFor(i),
          })),
        }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      if (explainController !== ac) return;
      reasonsByLang[lang] = Array.isArray(data.reasons) ? data.reasons : [];
      if (langSelect.value === lang) showReasons();
    } catch {
      if (explainController === ac && !(ac.signal.aborted && ac.signal.reason !== "timeout")) {
        showReasons("error");
      }
    } finally {
      clearTimeout(timer);
      if (explainController === ac) explainController = null;
    }
  }

  // Länk till en guide som passar ändringen
  const GUIDES = {
    "de-eller-dem": "De eller dem?",
    "var-eller-vart": "Var eller vart?",
    "och-eller-att": "Och eller att?",
    "sin-eller-hans": "Sin eller hans?",
    komma: "När ska man sätta komma?",
    "ihop-eller-isar": "Ihop eller isär?",
    sarskrivning: "Särskrivning",
    "stor-eller-liten-bokstav": "Stor eller liten bokstav?",
  };

  const I_WORDS = /^i ?(dag|går|morgon|kväll|stället|alla ?fall)$/;
  const WORD_GUIDES = [
    [["de", "dem", "dom"], "de-eller-dem"],
    [["var", "vart", "blev"], "var-eller-vart"],
    [["och", "att", "å"], "och-eller-att"],
    [["sin", "sitt", "sina", "hans", "hennes", "deras"], "sin-eller-hans"],
  ];

  function guideFor(from, to) {
    const f = from.trim();
    const t = to.trim();
    const lf = f.toLowerCase();
    const lt = t.toLowerCase();
    if (f === t) return null;
    let slug = null;

    const noSpace = (s) => s.replace(/[\s,-]/g, "");
    const noComma = (s) => s.replace(/,/g, "");
    if (noSpace(lf) === noSpace(lt) && noComma(lf) !== noComma(lt)) {
      // Samma bokstäver, olika mellanrum: särskrivning eller i dag/idag
      slug = I_WORDS.test(noComma(lf)) || I_WORDS.test(noComma(lt)) ? "ihop-eller-isar" : "sarskrivning";
    } else if (noComma(lf) === noComma(lt) && noComma(f) === noComma(t)) {
      slug = "komma";
    } else {
      const fw = noComma(f).split(/\s+/).filter(Boolean);
      const tw = noComma(t).split(/\s+/).filter(Boolean);
      const rule = (a, b) => {
        const la = a.toLowerCase();
        const lb = b.toLowerCase();
        for (const [set, g] of WORD_GUIDES) {
          if ((set.includes(la) || !la) && (set.includes(lb) || !lb) && (la || lb)) return g;
        }
        return a !== b && la === lb ? "stor-eller-liten-bokstav" : null;
      };
      if (fw.length === tw.length) {
        for (let k = 0; k < fw.length && !slug; k++) if (fw[k] !== tw[k]) slug = rule(fw[k], tw[k]);
      } else if (fw.length + tw.length === 1) {
        slug = rule(fw[0] || "", tw[0] || "");
      }
    }

    return slug ? { slug, name: GUIDES[slug] } : null;
  }

  // ---------- Ord-diff (Myers) ----------

  const TOKEN = /\s+|[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;

  function diffWords(a, b) {
    const ops = myers(a.match(TOKEN) || [], b.match(TOKEN) || []);
    return ops ? toChunks(ops) : null;
  }

  // Returnerar [{t: "eq"|"del"|"ins", s: token}] eller null om texterna skiljer sig för mycket
  function myers(a, b) {
    const n = a.length;
    const m = b.length;
    const max = n + m;
    const offset = max + 1;
    const v = new Int32Array(2 * max + 3);
    const trace = [];

    for (let d = 0; d <= max; d++) {
      if (d > MAX_EDITS) return null;
      trace.push(v.slice(offset - d, offset + d + 1));
      for (let k = -d; k <= d; k += 2) {
        let x =
          k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
            ? v[offset + k + 1]
            : v[offset + k - 1] + 1;
        let y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[offset + k] = x;
        if (x >= n && y >= m) return backtrack(trace, a, b);
      }
    }
    return null;
  }

  function backtrack(trace, a, b) {
    const ops = [];
    let x = a.length;
    let y = b.length;
    for (let d = trace.length - 1; d >= 0; d--) {
      const v = trace[d]; // index k + d
      const k = x - y;
      let prevX = 0;
      let prevY = 0;
      if (d > 0) {
        const prevK = k === -d || (k !== d && v[k - 1 + d] < v[k + 1 + d]) ? k + 1 : k - 1;
        prevX = v[prevK + d];
        prevY = prevX - prevK;
      }
      while (x > prevX && y > prevY) {
        x--;
        y--;
        ops.push({ t: "eq", s: a[x] });
      }
      if (d > 0) {
        if (x === prevX) ops.push({ t: "ins", s: b[--y] });
        else ops.push({ t: "del", s: a[--x] });
      }
    }
    return ops.reverse();
  }

  // Slår ihop tokens till läsbara bitar: {eq} eller {del, ins}.
  // Mellanslag mellan två ändringar räknas in i ändringen ("sjuk sköterska" → "sjuksköterska").
  function toChunks(ops) {
    const out = [];
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const last = out[out.length - 1];
      if (op.t === "eq") {
        const nextIsChange = ops[i + 1] && ops[i + 1].t !== "eq";
        if (last && last.eq === undefined && nextIsChange && /^\s+$/.test(op.s)) {
          last.del += op.s;
          last.ins += op.s;
        } else if (last && last.eq !== undefined) {
          last.eq += op.s;
        } else {
          out.push({ eq: op.s });
        }
      } else {
        const chunk = last && last.eq === undefined ? last : (out.push({ del: "", ins: "" }), out[out.length - 1]);
        chunk[op.t] += op.s;
      }
    }
    return trimShared(out);
  }

  // Flyttar gemensamma mellanslag i början/slutet av en ändring ut till omgivande text
  function trimShared(chunks) {
    const out = [];
    const pushEq = (s) => {
      if (!s) return;
      const last = out[out.length - 1];
      if (last && last.eq !== undefined) last.eq += s;
      else out.push({ eq: s });
    };
    for (const c of chunks) {
      if (c.eq !== undefined || !c.del || !c.ins) {
        if (c.eq !== undefined) pushEq(c.eq);
        else out.push(c);
        continue;
      }
      let { del, ins } = c;
      let pre = 0;
      while (pre < del.length && pre < ins.length && del[pre] === ins[pre] && /\s/.test(del[pre])) pre++;
      let suf = 0;
      while (
        suf < del.length - pre && suf < ins.length - pre &&
        del[del.length - 1 - suf] === ins[ins.length - 1 - suf] && /\s/.test(del[del.length - 1 - suf])
      ) suf++;
      pushEq(del.slice(0, pre));
      out.push({ del: del.slice(pre, del.length - suf), ins: ins.slice(pre, ins.length - suf) });
      pushEq(del.slice(del.length - suf));
    }
    return out;
  }

  // ---------- Kopiera ----------

  async function copy() {
    const text = finalText();
    let ok = false;
    try {
      // Vissa webbläsare låter anropet hänga – ge upp efter en stund
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) => setTimeout(reject, 1500)),
      ]);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }

    const message = ok ? "Kopierat!" : "Kunde inte kopiera";
    copyBtn.textContent = message;
    statusEl.textContent = ok
      ? "Den färdiga texten är kopierad."
      : "Kunde inte kopiera. Markera texten och kopiera den själv.";
    clearTimeout(copy.timer);
    copy.timer = setTimeout(() => (copyBtn.textContent = "Kopiera"), 2500);
  }

  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {}
    ta.remove();
    copyBtn.focus();
    return ok;
  }

  // ---------- Rensa ----------

  function clearAll() {
    if (controller) controller.abort();
    if (explainController) explainController.abort();
    controller = null;
    setLoading(false);
    input.value = "";
    original = corrected = "";
    chunks = null;
    listed = [];
    reasonsByLang = {};
    output.textContent = "";
    changeList.textContent = "";
    result.hidden = true;
    hideError();
    updateCounter();
    statusEl.textContent = "Texten är rensad.";
    input.focus();
  }

  // ---------- Händelser ----------

  input.addEventListener("input", updateCounter);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      correct();
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    correct();
  });
  modeInputs.forEach((r) =>
    r.addEventListener("change", () => (modeHint.textContent = MODE_HINTS[selectedMode()]))
  );
  clearBtn.addEventListener("click", clearAll);
  copyBtn.addEventListener("click", copy);
  viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  output.addEventListener("click", (e) => {
    const span = e.target.closest(".chg");
    if (span && !loading) toggleChange(Number(span.dataset.i));
  });
  langSelect.addEventListener("change", () => {
    try {
      localStorage.setItem(LANG_KEY, langSelect.value);
    } catch {}
    setRestNote();
    if (listed.length) loadReasons();
  });

  modeHint.textContent = MODE_HINTS[selectedMode()];
  updateCounter();
})();
