import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const MAX = 10000;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function requireEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = body?.text;

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Ingen text angiven." }, { status: 400 });
    }
    if (text.length > MAX) {
      return NextResponse.json({ error: `Texten får vara max ${MAX} tecken.` }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });

    const system =
      "Du är en svensk korrekturläsare. Korrigera stavning, grammatik och versaler utan att ändra betydelsen. " +
      "Bevara person- och platsnamn som egennamn. Svara endast med den korrigerade texten utan förklaringar.";

    const completion = await openai.chat.completions.create({
  model: MODEL,
  messages: [
    { role: "system", content: system },
    { role: "user", content: text },
  ],
  // temperature removed because some models only support default value
});

    const corrected = (completion.choices[0]?.message?.content ?? "").trim();

    return new Response(corrected, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Serverfel i /api/correct", details: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
