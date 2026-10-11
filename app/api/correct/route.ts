import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX = 5000;
// Hela anropet mot OpenAI (inklusive strömning) avbryts efter denna tid
const TIMEOUT_MS = 45_000;

// Användarens text loggas eller sparas aldrig – bara felstatus loggas.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }

  const text = body?.text;

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Ingen text angiven." }, { status: 400 });
  }

  if (text.length > MAX) {
    return NextResponse.json(
      { error: `Texten får vara max ${MAX} tecken.` },
      { status: 400 }
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[api/correct] OPENAI_API_KEY saknas");
    return NextResponse.json(
      { error: "Tjänsten är inte tillgänglig just nu. Försök igen senare." },
      { status: 500 }
    );
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system =
    "Du är en professionell svensk korrekturläsare. Rätta stavning, grammatik, särskrivningar och versaler. Bevara stil och betydelse. Svara endast med den korrigerade texten.";

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);

  let upstream: Response;
  try {
    // Streaming via fetch (stabilt på Vercel/Next)
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
        // Sätt INTE temperature här (vissa modeller kräver default)
      }),
      signal: abort.signal,
    });
  } catch (err: any) {
    clearTimeout(timer);
    const timedOut = err?.name === "AbortError";
    console.error(`[api/correct] upstream ${timedOut ? "timeout" : "nätverksfel"}`);
    return NextResponse.json(
      {
        error: timedOut
          ? "Det tog för lång tid att rätta texten. Försök igen."
          : "Något gick fel. Försök igen om en stund.",
      },
      { status: timedOut ? 504 : 500 }
    );
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timer);
    console.error(`[api/correct] upstream status ${upstream.status}`);
    return NextResponse.json(
      {
        error:
          upstream.status === 429
            ? "Många använder tjänsten just nu. Vänta en stund och försök igen."
            : "Något gick fel. Försök igen om en stund.",
      },
      { status: upstream.status === 429 ? 429 : 500 }
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  let buffer = "";
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // OpenAI SSE kommer som "data: {...}\n\n"
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const line = part.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;

            const data = line.slice("data: ".length).trim();
            if (data === "[DONE]") return;

            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // ignorera trasiga chunks
            }
          }
        }
      } catch {
        // Timeout eller avbrott mitt i strömningen
        if (!cancelled) {
          try {
            controller.enqueue(encoder.encode("\n[Fel vid strömning]"));
          } catch {}
        }
      } finally {
        clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      }
    },
    cancel() {
      // Klienten avbröt – stoppa anropet mot OpenAI
      cancelled = true;
      clearTimeout(timer);
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
