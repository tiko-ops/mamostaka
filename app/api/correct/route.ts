import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX = 10000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
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
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system =
      "Du är en professionell svensk korrekturläsare. Rätta stavning, grammatik, särskrivningar och versaler. Bevara stil och betydelse. Svara endast med den korrigerade texten.";

    // Streaming via fetch (stabilt på Vercel/Next)
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: "OpenAI request failed", details: errText },
        { status: 500 }
      );
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    let buffer = "";

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.body!.getReader();

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
              if (data === "[DONE]") {
                controller.close();
                return;
              }

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
          controller.enqueue(encoder.encode("\n[Fel vid strömning]"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Serverfel i /api/correct", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
