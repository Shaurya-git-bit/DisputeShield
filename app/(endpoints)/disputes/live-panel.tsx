'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react';

type Live = {
  id: string;
  status: string;
  stage: string;
  reason: string;
  amount: number;
  currency: string;
  due: string;
  txn: string;
  actions: string[];
  outcome: string;
  wants: string[];
};
type Info = { facts: { id: string; label: string; text: string }[]; dropped: number };

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const DEFAULT_MSG =
  'Hello, thank you for contacting us. We are checking your order and will share proof of delivery shortly.';
const canRule = (d: Live) => d.status === 'UNDER_REVIEW' && d.actions.some((a) => a.startsWith('adjudicate'));

export function LivePanel({ flagged }: { flagged: number }) {
  const [items, setItems] = useState<Live[]>([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [busyKind, setBusyKind] = useState('');
  const [text, setText] = useState(DEFAULT_MSG);
  const [track, setTrack] = useState('122533485');
  const [sent, setSent] = useState<string[]>([]);
  const [proved, setProved] = useState<string[]>([]);
  const [ruled, setRuled] = useState<string[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<Record<string, Info>>({});
  const [activeId, setActiveId] = useState('');
  const [log, setLog] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const r = await fetch('/api/live-disputes', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
      setItems(j.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(body: object): Promise<any> {
    const r = await fetch('/api/live-disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Request failed (' + r.status + ')');
    return j;
  }

  async function run(id: string, kind: string, fn: () => Promise<void>) {
    if (busyId) return;
    setBusyId(id);
    setBusyKind(kind);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusyId('');
      setBusyKind('');
    }
  }

  const stamp = (s: string) => setLog((l) => [s + ' at ' + new Date().toLocaleTimeString(), ...l]);

  function approve(d: Live) {
    if (!window.confirm('Send this message to the buyer on ' + d.id + '? (PayPal sandbox)')) return;
    run(d.id, 'message', async () => {
      await call({ id: d.id, action: 'message', text });
      setSent((s) => (s.includes(d.id) ? s : [...s, d.id]));
      stamp('Message sent on ' + d.id);
      await load();
    });
  }

  function draft(d: Live) {
    run(d.id, 'draft', async () => {
      const j = await call({ id: d.id, action: 'draft', tracking: track, carrier: 'FEDEX' });
      setNotes((n) => ({ ...n, [d.id]: j.text }));
      setInfo((n) => ({ ...n, [d.id]: { facts: j.facts || [], dropped: j.dropped || 0 } }));
      setActiveId(d.id);
    });
  }

  function evidence(d: Live) {
    const note = (notes[d.id] || '').trim();
    const msg =
      'Send proof of fulfillment (tracking ' + track + ') to PayPal for ' + d.id + '?\n\nNote:\n' +
      (note || '(no note written, a short default will be used)') + '\n\nSandbox demo only.';
    if (!window.confirm(msg)) return;
    run(d.id, 'evidence', async () => {
      await call({ id: d.id, action: 'evidence', tracking: track, carrier: 'FEDEX', notes: note });
      setProved((s) => (s.includes(d.id) ? s : [...s, d.id]));
      stamp('Evidence sent on ' + d.id);
      await load();
    });
  }

  function rule(d: Live) {
    if (!window.confirm('SIMULATED sandbox ruling: tell PayPal the seller wins ' + d.id + '? This is a test action, not a real decision.')) return;
    run(d.id, 'rule', async () => {
      await call({ id: d.id, action: 'rule' });
      setRuled((s) => (s.includes(d.id) ? s : [...s, d.id]));
      stamp('Simulated ruling (seller wins) on ' + d.id);
      await load();
    });
  }

  const sums = useMemo(() => {
    const total = items.reduce((a, i) => a + i.amount, 0);
    const approved = items
      .filter((i) => sent.includes(i.id) || proved.includes(i.id))
      .reduce((a, i) => a + i.amount, 0);
    const recovered = items
      .filter((i) => i.status === 'RESOLVED' && /SELLER_FAVOU?R/.test(i.outcome))
      .reduce((a, i) => a + i.amount, 0);
    return { total, approved, recovered };
  }, [items, sent, proved]);

  const busy = (d: Live, k: string) => busyId === d.id && busyKind === k;
  const active = items.find((i) => i.id === activeId);

  return (
    <div className="w-full basis-full rounded border border-pp-border bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="text-sm font-semibold text-pp-navy">Live PayPal sandbox disputes</div>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-pp-muted">sandbox, real PayPal API</span>
        <button type="button" className="rounded border border-pp-border px-3 py-1 text-xs" onClick={load} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-sm">
        <div>Flagged (demo data): <b>{money(flagged)}</b></div>
        <div>Live at stake: <b>{money(sums.total)}</b></div>
        <div>Approved (sandbox): <b>{money(sums.approved)}</b></div>
        <div>Recovered (sandbox, simulated ruling): <b>{money(sums.recovered)}</b></div>
      </div>
      <textarea
        className="mb-2 w-full rounded border border-pp-border px-3 py-2 text-sm"
        rows={2}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="text-xs text-pp-muted">Demo tracking number (FedEx):</span>
        <input
          className="w-48 rounded border border-pp-border px-2 py-1 text-sm"
          value={track}
          maxLength={30}
          onChange={(e) => setTrack(e.target.value)}
        />
      </div>
      {err && <div className="mb-2 text-sm text-red-700">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-pp-muted">
            <tr>
              <th className="py-1 pr-3">Dispute</th>
              <th className="pr-3">Status</th>
              <th className="pr-3">Amount</th>
              <th className="pr-3">Due</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="border-t border-pp-border align-top">
                <td className="py-1 pr-3 font-mono text-xs">{d.id}</td>
                <td className="pr-3">
                  {d.status}
                  {d.outcome ? ' · ' + d.outcome : ''}
                  <div className="text-xs text-pp-muted">{d.stage}</div>
                </td>
                <td className="pr-3">{money(d.amount)}</td>
                <td className="pr-3 text-xs">{d.due ? new Date(d.due).toLocaleString() : 'n/a'}</td>
                <td>
                  <div className="flex flex-wrap gap-2 py-1">
                    <button
                      type="button"
                      className="rounded bg-pp-navy px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      disabled={!!busyId || !d.actions.includes('send_message') || !text.trim()}
                      onClick={() => approve(d)}
                    >
                      {busy(d, 'message') ? 'Sending...' : sent.includes(d.id) ? 'Sent. Send again' : 'Approve and send'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-pp-navy px-3 py-1 text-xs font-semibold text-pp-navy disabled:opacity-50"
                      disabled={!!busyId || !d.actions.includes('provide_evidence')}
                      onClick={() => draft(d)}
                    >
                      {busy(d, 'draft') ? 'Drafting...' : 'Draft note (AI)'}
                    </button>
                    <button
                      type="button"
                      className="rounded border border-pp-navy px-3 py-1 text-xs font-semibold text-pp-navy disabled:opacity-50"
                      disabled={!!busyId || !d.actions.includes('provide_evidence') || track.trim().length < 6}
                      onClick={() => evidence(d)}
                    >
                      {busy(d, 'evidence') ? 'Sending...' : proved.includes(d.id) ? 'Evidence sent' : 'Send evidence'}
                    </button>
                    {canRule(d) && (
                      <button
                        type="button"
                        className="rounded bg-green-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        disabled={!!busyId}
                        onClick={() => rule(d)}
                      >
                        {busy(d, 'rule') ? 'Asking PayPal...' : ruled.includes(d.id) ? 'Ruled' : 'Simulated ruling: seller wins'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {active && notes[active.id] !== undefined && (
        <div className="mt-3 rounded bg-slate-50 p-3 text-sm">
          <div className="mb-1 font-semibold text-pp-navy">Evidence note for {active.id} (AI draft, edit before sending)</div>
          <textarea
            className="w-full rounded border border-pp-border px-3 py-2 text-sm"
            rows={4}
            maxLength={1000}
            value={notes[active.id]}
            onChange={(e) => setNotes((n) => ({ ...n, [active.id]: e.target.value }))}
          />
          {info[active.id] && (
            <div className="mt-2 text-xs text-pp-muted">
              <div>The AI could only use these facts from PayPal:</div>
              {info[active.id].facts.map((f) => (
                <div key={f.id}>{f.id}: {f.text}</div>
              ))}
              <div className="mt-1">
                Code checked every dollar amount and blocked claims like delivered or signed.
                {info[active.id].dropped > 0 ? ' ' + info[active.id].dropped + ' sentence(s) were removed.' : ''}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 text-xs text-pp-muted">
        The ruling button shows only when PayPal lists the adjudicate action and the status is UNDER_REVIEW. It is a sandbox test, not a real decision. Recovered counts only disputes PayPal marks resolved in the seller's favour.
      </div>
      {log.length > 0 && (
        <div className="mt-2 text-xs">
          {log.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
