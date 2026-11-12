export type Fact = { id: string; label: string; text: string };
export type BriefSentence = { text: string; cites: string[] };

const AMOUNT = /\$\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/g;

function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT)) {
    const whole = m[1].replace(/,/g, '');
    const cents = (m[2] ?? '0').padEnd(2, '0');
    out.push(Math.round(parseFloat(whole + '.' + cents) * 100));
  }
  return out;
}

export function verifyBrief(raw: unknown, facts: Fact[]): { sentences: BriefSentence[]; dropped: number } {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const list =
    raw && typeof raw === 'object' && Array.isArray((raw as { sentences?: unknown }).sentences)
      ? ((raw as { sentences: unknown[] }).sentences)
      : [];
  const out: BriefSentence[] = [];
  let dropped = 0;
  for (const s of list.slice(0, 8)) {
    const o = (s ?? {}) as { text?: unknown; cites?: unknown };
    const text = typeof o.text === 'string' ? o.text.trim().slice(0, 400) : '';
    const cites = Array.isArray(o.cites)
      ? (o.cites as unknown[]).filter((c): c is string => typeof c === 'string' && byId.has(c))
      : [];
    const uniq = Array.from(new Set(cites));
    let ok = text.length > 0 && uniq.length > 0;
    if (ok) {
      const allowed = new Set<number>();
      for (const c of uniq) {
        for (const a of amountsIn(byId.get(c)!.text)) allowed.add(a);
      }
      ok = amountsIn(text).every((a) => allowed.has(a));
    }
    if (ok && out.length < 5) out.push({ text, cites: uniq });
    else dropped++;
  }
  return { sentences: out, dropped };
}
