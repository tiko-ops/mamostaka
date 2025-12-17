"use client";

import { useMemo, useState } from "react";

export default function Page() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  async function onCorrect() {
    setError("");
    setOutput("");
    setLoading(true);

    try {
      const res = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
      });

      if (!res.ok) {
        // API returns JSON on error
        const data = await res.json().catch(() => null);
        const msg = data?.error ? String(data.error) : `Serverfel (${res.status})`;
        const details = data?.details ? `\n\n${String(data.details)}` : "";
        throw new Error(msg + details);
      }

      // Success returns plain text
      const corrected = await res.text();
      setOutput(corrected);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function onClear() {
    setInput("");
    setOutput("");
    setError("");
  }

  return (
    <main>
      <h1>Mamosta Grammatik-kontroll</h1>

      <div className="grid">
        <div className="card">
          <div className="section-title">Text</div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Skriv eller klistra in text här..."
          />
          <div className="controls">
            <button className="primary" onClick={onCorrect} disabled={!canSubmit}>
              {loading ? "Rättar..." : "Rätta"}
            </button>
            <button onClick={onClear} disabled={loading && input.length === 0 && output.length === 0}>
              Rensa
            </button>
            <div className="notice">{input.length > 0 ? `${input.length} tecken` : ""}</div>
          </div>
          {error ? <div className="error">{error}</div> : null}
        </div>

        <div className="card">
          <div className="section-title">Korrigerad text</div>
          <textarea value={output} readOnly placeholder="Här visas den korrigerade texten..." />
        </div>
      </div>
    </main>
  );
}
