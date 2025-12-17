"use client";

import { useEffect, useRef, useState } from "react";

export default function Page() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Abort om användaren klickar "Rätta" igen
  const abortRef = useRef<AbortController | null>(null);

  // Typewriter-kö
  const queueRef = useRef<string>("");
  const typingTimerRef = useRef<number | null>(null);
  const streamDoneRef = useRef<boolean>(false);

  function startTypewriter() {
    if (typingTimerRef.current) return;

    typingTimerRef.current = window.setInterval(() => {
      const q = queueRef.current;

      if (q.length > 0) {
        // skriv 1–3 tecken per tick (snabbt men naturligt)
        const n = Math.min(3, q.length);
        const chunk = q.slice(0, n);
        queueRef.current = q.slice(n);
        setOutput((prev) => prev + chunk);
        return;
      }

      // Om streamen är klar och kön är tom: stoppa
      if (streamDoneRef.current) {
        stopTypewriter();
      }
    }, 10);
  }

  function stopTypewriter() {
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopTypewriter();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCorrect() {
    setError("");
    setOutput("");
    queueRef.current = "";
    streamDoneRef.current = false;

    // avbryt pågående request
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setIsLoading(true);
    startTypewriter();

    try {
      const res = await fetch("/api/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Ett fel inträffade.");
        streamDoneRef.current = true;
        return;
      }

      if (!res.body) {
        setError("Ingen respons-body från servern.");
        streamDoneRef.current = true;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) queueRef.current += chunk;
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        setError(e?.message || "Något gick fel.");
      }
    } finally {
      streamDoneRef.current = true;
      setIsLoading(false);
    }
  }

  function handleClear() {
    abortRef.current?.abort();
    setInput("");
    setOutput("");
    setError("");
    queueRef.current = "";
    streamDoneRef.current = true;
    stopTypewriter();
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>
        Mamosta Grammatik-kontroll
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Text</h2>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            style={{
              width: "100%",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 10,
              fontSize: 14,
              resize: "vertical",
            }}
            placeholder="Skriv din text här..."
          />

          <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center" }}>
            <button
              onClick={handleCorrect}
              disabled={isLoading}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #111",
                background: "#111",
                color: "white",
                cursor: isLoading ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              {isLoading ? "Rättar..." : "Rätta"}
            </button>

            <button
              onClick={handleClear}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Rensa
            </button>

            <div style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
              {input.length} tecken
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 10, color: "#b00020", fontSize: 13, fontWeight: 600 }}>
              {error}
            </div>
          )}
        </section>

        <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Korrigerad text</h2>

          <textarea
            value={output}
            readOnly
            rows={10}
            style={{
              width: "100%",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 10,
              fontSize: 14,
              resize: "vertical",
              background: "#fafafa",
            }}
            placeholder="Här visas resultatet..."
          />
        </section>
      </div>
    </main>
  );
}
