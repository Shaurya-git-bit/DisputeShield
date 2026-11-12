import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT, sanitizePlan } from '../../../lib/nl-plan';

// Small guard so a public demo cannot burn your Gemini quota.
let windowStart = 0;
let hits = 0;
function allowed() {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    hits = 0;
  }
  hits++;
  return hits <= 20;
}

type GeminiPart = { text?: string; thought?: boolean };

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is empty in .env.local. Add it and restart npm run dev.' },
      { status: 500 },
    );
  }
  if (!allowed()) {
    return NextResponse.json({ error: 'Too many requests. Wait a minute and try again.' }, { status: 429 });
  }

  let question = '';
  try {
    const body = await req.json();
    question = String(body?.question ?? '').trim().slice(0, 500);
  } catch {
    // bad body, handled below
  }
  if (!question) {
    return NextResponse.json({ error: 'Type a question first.' }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    return NextResponse.json({ error: 'Gemini did not answer in time. Try again.' }, { status: 504 });
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = String(data?.error?.message ?? res.statusText).slice(0, 200);
    return NextResponse.json({ error: `Gemini error (${res.status}): ${msg}` }, { status: 502 });
  }

  const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'The AI did not return valid JSON. Try asking again.' }, { status: 502 });
  }
  return NextResponse.json({ plan: sanitizePlan(parsed) });
}