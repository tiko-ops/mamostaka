(() => {
  "use strict";

  const MAX = 5000;
  const TIMEOUT_MS = 60_000;
  // Markör som API:t lägger till om strömningen avbryts
  const STREAM_ERROR = "[Fel vid strömning]";
  // Över så här många ändringar visas bara den korrigerade texten
  const MAX_EDITS = 2000;

  const $ = (id) => document.getElementById(id);
  const form = $("form");
  const input = $("text");
  const counter = $("counter");
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
  const viewBtns = document.querySelectorAll("[data-view]");

  const nf = new Intl.NumberFormat("sv-SE");

  let controller = null;
  let loading = false;
  let original = "";
  let corrected = "";
  let chunks = null; // null = ingen diff tillgänglig
  let view = "diff";

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
    if (status === 429) return "Många använder tjänsten just nu. Vänta en stund och försök igen.";
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
    controller = new AbortController();
    const ac = controller;
    const timer = setTimeout(() => ac.abort("timeout"), TIMEOUT_MS);

    original = text;
    corrected = "";
    chunks = null;
    output.textContent = "";
    summary.textContent = "Korrigerar…";
    legend.hidden = true;
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
        body: JSON.stringify({ text }),
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

  function showResult() {
    chunks = diffWords(original, corrected);
    const changes = chunks ? chunks.filter((c) => c.del || c.ins).length : null;

    let text;
    if (changes === 0) text = "Inga fel hittades – texten ser bra ut.";
    else if (changes === null) text = "Texten har skrivits om mycket.";
    else text = changes === 1 ? "1 ändring" : `${nf.format(changes)} ändringar`;

    summary.textContent = text;
    setView(chunks && changes > 0 ? view : "plain", { remember: false });
    statusEl.textContent = `Klart. ${text}`;
    resultTitle.focus();
  }

  function setView(next, { remember = true } = {}) {
    if (remember) view = next;
    const showDiff = next === "diff" && chunks !== null;
    viewBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === (showDiff ? "diff" : "plain"))));
    legend.hidden = !showDiff || !chunks.some((c) => c.del || c.ins);
    render(showDiff);
  }

  function render(showDiff) {
    output.textContent = "";
    if (!showDiff) {
      output.textContent = corrected;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const c of chunks) {
      if (c.eq !== undefined) {
        frag.append(c.eq);
        continue;
      }
      if (c.del) {
        const el = document.createElement("del");
        el.textContent = c.del;
        frag.append(el);
      }
      if (c.ins) {
        const el = document.createElement("ins");
        el.textContent = c.ins;
        frag.append(el);
      }
    }
    output.append(frag);
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
    let ok = false;
    try {
      // Vissa webbläsare låter anropet hänga – ge upp efter en stund
      await Promise.race([
        navigator.clipboard.writeText(corrected),
        new Promise((_, reject) => setTimeout(reject, 1500)),
      ]);
      ok = true;
    } catch {
      ok = legacyCopy(corrected);
    }

    const message = ok ? "Kopierat!" : "Kunde inte kopiera";
    copyBtn.textContent = message;
    statusEl.textContent = ok
      ? "Den korrigerade texten är kopierad."
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
    controller = null;
    setLoading(false);
    input.value = "";
    original = corrected = "";
    chunks = null;
    output.textContent = "";
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
  clearBtn.addEventListener("click", clearAll);
  copyBtn.addEventListener("click", copy);
  viewBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  updateCounter();
})();
