'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CellStyleModule,
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  ColumnAutoSizeModule,
  ColumnApiModule,
  enableDevValidations,
  NumberFilterModule,
  QuickFilterModule,
  RenderApiModule,
  RowApiModule,
  ScrollApiModule,
  RowSelectionModule,
  TextFilterModule,
  themeQuartz,
  type ColDef,  type AdvancedFilterModel,
  type ChartRef,
  type GridApi,
  type ModelUpdatedEvent,
} from 'ag-grid-community';
import { AgGridProvider, AgGridReact } from 'ag-grid-react';

import {
  AdvancedFilterModule,
  AggregationModule,
  ColumnsToolPanelModule,
  FiltersToolPanelModule,
  LicenseManager,
  MasterDetailModule,
  RowGroupingModule,
  RowGroupingPanelModule,
  SetFilterModule,
  SideBarModule,  StatusBarModule,
  IntegratedChartsModule,
  PivotModule,
} from 'ag-grid-enterprise';
import { AgChartsEnterpriseModule } from 'ag-charts-enterprise';

import { HOUR, makeDisputes, type Dispute } from './disputes-data';
import type { Fact, BriefSentence } from '../../../lib/case-brief';
import { LivePanel } from './live-panel';
import {  buildAdvancedFilterModel,
  describePlan,
  sanitizePlan,
  type Plan,
} from '../../../lib/nl-plan';

if (process.env.NODE_ENV !== 'production') {
  enableDevValidations();
}

if (process.env.NEXT_PUBLIC_AG_GRID_LICENSE) {
  LicenseManager.setLicenseKey(process.env.NEXT_PUBLIC_AG_GRID_LICENSE);
}

const modules = [
  ClientSideRowModelModule,
  ClientSideRowModelApiModule,
  ColumnApiModule,
  RowSelectionModule,
  CellStyleModule,
  TextFilterModule,
  NumberFilterModule,
  QuickFilterModule,
  ColumnAutoSizeModule,
  RenderApiModule,
  RowApiModule,
  ScrollApiModule,
  AdvancedFilterModule,
  AggregationModule,
  ColumnsToolPanelModule,
  FiltersToolPanelModule,
  MasterDetailModule,
  RowGroupingModule,
  RowGroupingPanelModule,
  SetFilterModule,  SideBarModule,
  StatusBarModule,
  PivotModule,
  IntegratedChartsModule.with(AgChartsEnterpriseModule),
];

const theme = themeQuartz.withParams({
  fontFamily: 'var(--pp-font)',
  accentColor: 'var(--pp-blue)',
  foregroundColor: 'var(--pp-ink)',
  borderColor: 'var(--pp-border)',
  headerFontWeight: 600,
  headerTextColor: 'var(--pp-muted)',
  rowHoverColor: 'var(--pp-highlight)',
});

function countdown(ms: number): string {
  if (ms <= 0) return 'EXPIRED';
  const d = Math.floor(ms / (24 * HOUR));
  const h = Math.floor((ms % (24 * HOUR)) / HOUR);
  const m = Math.floor((ms % HOUR) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d >= 2) return `${d}d ${h}h`;
  return `${h + d * 24}h ${m}m ${s}s`;
}

function urgencyStyle(ms: number) {
  if (ms < 24 * HOUR) return { backgroundColor: '#fde8e8', color: '#b42318', fontWeight: 700 };
  if (ms < 72 * HOUR) return { backgroundColor: '#fff4e0', color: '#b54708', fontWeight: 600 };
  return { backgroundColor: '#e7f6ec', color: '#067647', fontWeight: 600 };
}

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const r2 = (n: number) => Math.round(n * 100) / 100;

function DetailPanel({ data }: { data: Dispute }) {
  const feeGap = r2(data.fee - data.expectedFee);
  const settleGap = r2(data.paid - data.fee - data.refunded - data.settled);
  const overRefund = data.refunded > data.paid;
  const bad = 'font-semibold text-red-700';
  return (
    <div className="grid grid-cols-3 gap-4 p-4 text-sm">
      <div>
        <div className="mb-1 font-semibold text-pp-navy">Payment</div>
        <div>Order: {data.orderId}</div>
        <div>Paid: {money(data.paid)}</div>
        <div>Disputed: {money(data.amount)}</div>
        <div>Settled: {money(data.settled)}</div>
        <div className={settleGap > 0.01 ? bad : ''}>
          Settlement gap: {money(settleGap)}
        </div>
      </div>
      <div>
        <div className="mb-1 font-semibold text-pp-navy">Refunds and fee</div>
        {data.refunds.length === 0 && <div>No refunds</div>}
        {data.refunds.map((r) => (
          <div key={r.id}>{r.id} · {r.date} · {money(r.amount)}</div>
        ))}
        <div className={overRefund ? bad : ''}>
          Total refunded: {money(data.refunded)}
          {overRefund ? ' (more than paid!)' : ''}
        </div>
        <div className={Math.abs(feeGap) > 0.01 ? bad : ''}>
          Fee: {money(data.fee)} (expected {money(data.expectedFee)})
        </div>
      </div>
      <div>
        <div className="mb-1 font-semibold text-pp-navy">Evidence</div>
        <div>PayPal needs: {data.evidence}</div>
        <div>
          You have:{' '}
          {data.evidenceFiles.length ? data.evidenceFiles.join(', ') : 'nothing yet'}
        </div>
      </div>
    </div>
  );
}

type Gaps = { fee: number; refund: number; settle: number; total: number; issues: string };

function gapsOf(d: Dispute): Gaps {
  const fee = Math.max(0, r2(d.fee - d.expectedFee));
  const seen: number[] = [];
  let dup = 0;
  for (const x of d.refunds) {
    if (seen.includes(x.amount)) dup += x.amount;
    else seen.push(x.amount);
  }
  const refund = r2(dup);
  const settle = Math.max(0, r2(d.paid - d.fee - d.refunded - d.settled));
  const list: string[] = [];
  if (fee > 0.01) list.push('Fee overcharge');
  if (refund > 0.01) list.push('Duplicate refund');
  if (settle > 0.01) list.push('Settlement gap');
  return {
    fee,
    refund,
    settle,
    total: r2(fee + refund + settle),
    issues: list.length ? list.join(', ') : 'Clean',
  };
}

const gapCell = (p: { value?: unknown }) =>
  Number(p.value) > 0.01
    ? { backgroundColor: '#fde8e8', color: '#b42318', fontWeight: 600 }
    : undefined;

const gapFormat = (p: { value?: unknown }) =>
  typeof p.value === 'number' ? (p.value > 0.01 ? money(p.value) : '–') : '';

const gapCol = (
  colId: string,
  headerName: string,
  get: (g: Gaps) => number,
): ColDef<Dispute> => ({
  colId,
  headerName,
  minWidth: 130,
  cellDataType: 'number',
  filter: 'agNumberColumnFilter',
  aggFunc: 'sum',
  enableValue: true,
  valueGetter: (p) => (p.data ? get(gapsOf(p.data)) : undefined),
  valueFormatter: gapFormat,
  cellStyle: gapCell,
});

const columns: ColDef<Dispute>[] = [
  {
    field: 'dueAt',
    headerName: 'Time left',
    sort: 'asc',
    valueFormatter: (p) => countdown(Number(p.value) - Date.now()),
    cellStyle: (p) => urgencyStyle(Number(p.value) - Date.now()),
  },
  { field: 'id', headerName: 'Dispute ID', cellRenderer: 'agGroupCellRenderer' },
  { field: 'orderId', headerName: 'Order' },
  { field: 'month', headerName: 'Month', filter: 'agSetColumnFilter' },
  {
    field: 'reason',
    headerName: 'Reason',
    filter: 'agSetColumnFilter',
    valueFormatter: (p) => String(p.value ?? '').replace(/_/g, ' ').toLowerCase(),
  },
  { field: 'stage', headerName: 'Stage', filter: 'agSetColumnFilter' },
  {
    field: 'amount',
    headerName: 'Amount',
    aggFunc: 'sum',
    enableValue: true,
    filter: 'agNumberColumnFilter',
    valueFormatter: (p) =>
      typeof p.value === 'number'
        ? p.value.toLocaleString('en-US', { style: 'currency', currency: p.data?.currency ?? 'USD' })
        : '',
  },

  gapCol('feeOver', 'Fee overcharge', (g) => g.fee),
  gapCol('dupRefund', 'Duplicate refund', (g) => g.refund),
  gapCol('settleGap', 'Settlement gap', (g) => g.settle),
  gapCol('toRecover', 'Total to recover', (g) => g.total),
  {
    colId: 'issues',
    headerName: 'Issues found',
    minWidth: 190,
    cellDataType: 'text',
    filter: 'agSetColumnFilter',
    valueGetter: (p) => (p.data ? gapsOf(p.data).issues : undefined),
  },

  { field: 'customer', headerName: 'Customer' },
  { field: 'item', headerName: 'Item', filter: 'agSetColumnFilter' },
  { field: 'evidence', headerName: 'Evidence PayPal needs' },
];

const defaultColDef: ColDef<Dispute> = { filter: true, enableRowGroup: true, enablePivot: true };
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-pp-border bg-white px-4 py-2">
      <div className="text-xs text-pp-muted">{label}</div>
      <div className="text-lg font-semibold text-pp-navy">{value}</div>
    </div>
  );
}

const sideBar = { toolPanels: ['columns'] };
const rowSelection = { mode: 'multiRow' } as const;
const autoSizeStrategy = { type: 'fitGridWidth', defaultMinWidth: 110 } as const;

const EXAMPLES = [
  {
    label: 'Killer demo',
    text: 'Show me products with the highest refund discrepancies, group them by month, and exclude transactions where the difference is below $20',
  },
  {
    label: 'Fee overcharges by item',
    text: 'Which items lose the most money to fee overcharges? Group by item, biggest first',
  },
  {
    label: 'Chargebacks with gaps',
    text: 'Show chargebacks with a settlement gap over $5, grouped by reason',
  },
];

function factsOf(d: Dispute): Fact[] {
  const g = gapsOf(d);
  const f: Fact[] = [];
  let n = 1;
  const add = (label: string, text: string) => {
    f.push({ id: 'F' + n, label, text });
    n++;
  };
  add('Payment ' + d.orderId, 'Order ' + d.orderId + ' was paid ' + money(d.paid) + ' for ' + d.item + '.');
  add(
    'Dispute ' + d.id,
    'Dispute ' + d.id + ' (' + String(d.reason).replace(/_/g, ' ').toLowerCase() + ', stage ' + d.stage + ') is for ' + money(d.amount) + '.',
  );
  for (const r of d.refunds.slice(0, 8)) {
    add('Refund ' + r.id, 'Refund ' + r.id + ' on ' + r.date + ' was ' + money(r.amount) + '.');
  }
  add('Total refunded', 'Total refunded on this order: ' + money(d.refunded) + '.');
  add('Fee', 'Fee charged was ' + money(d.fee) + ' and the expected fee was ' + money(d.expectedFee) + '.');
  add('Settlement', 'Amount settled to the merchant: ' + money(d.settled) + '.');
  add(
    'Money to recover',
    'Code found ' + money(g.total) + ' to recover: fee overcharge ' + money(g.fee) + ', duplicate refund ' + money(g.refund) + ', settlement gap ' + money(g.settle) + '.',
  );
  add(
    'Evidence',
    'PayPal needs: ' + d.evidence + '. Evidence on file: ' + (d.evidenceFiles.length ? d.evidenceFiles.join(', ') : 'none') + '.',
  );
  return f;
}

function nextStep(d: Dispute): string {
  if (d.refunded > 0 && d.refunded >= d.amount - 0.005) {
    return 'Fight with proof of refund: the buyer already got ' + money(d.refunded) + ' back.';
  }
  if (d.evidenceFiles.length) {
    return 'Fight: evidence is already on file (' + d.evidenceFiles.join(', ') + ').';
  }
  return 'Collect evidence first. PayPal needs: ' + d.evidence + '. Nothing on file yet.';
}

const AGG_COLS = ['amount', 'feeOver', 'dupRefund', 'settleGap', 'toRecover'];

function leavePivot(api: GridApi<Dispute>) {
  api.setGridOption('pivotMode', false);
  api.applyColumnState({
    state: AGG_COLS.map((colId) => ({ colId, aggFunc: 'sum' })),
    defaultState: { pivot: false },
  });
}

function resetGrid(api: GridApi<Dispute>) {
  leavePivot(api);  api.setAdvancedFilterModel(null);
  api.setRowGroupColumns([]);
  api.applyColumnState({
    state: [{ colId: 'dueAt', sort: 'asc' }],
    defaultState: { sort: null },
  });
}

function applyPlan(api: GridApi<Dispute>, plan: Plan) {
  resetGrid(api);  api.setAdvancedFilterModel(
    buildAdvancedFilterModel(plan) as unknown as AdvancedFilterModel | null,
  );
  api.setRowGroupColumns(plan.groupBy);
  if (plan.sort) {
    api.applyColumnState({
      state: [{ colId: plan.sort.column, sort: plan.sort.direction }],
      defaultState: { sort: null },
    });
  }
}

export function DisputesGrid() {
  const gridRef = useRef<AgGridReact<Dispute>>(null);
  const [rows, setRows] = useState<Dispute[]>([]);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<Dispute | null>(null);
  const [brief, setBrief] = useState<{ id: string; sentences: BriefSentence[]; dropped: number } | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefErr, setBriefErr] = useState('');
  const found = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const r of rows) {
      const g = gapsOf(r);
      total += g.total;
      if (g.total > 0.01) count++;
    }
    return { total: r2(total), count };
  }, [rows]);

  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [aiErr, setAiErr] = useState('');
  const [applied, setApplied] = useState<string[]>([]);  const [shown, setShown] = useState({ count: 0, total: 0 });
  const [pivotOn, setPivotOn] = useState(false);
  const [popupParent, setPopupParent] = useState<HTMLElement | null>(null);
  const chartDiv = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartRef | null>(null);
  const heatMaxRef = useRef(1);

  useEffect(() => {
    setPopupParent(document.body);
  }, []);

  const destroyChart = () => {
    chartRef.current?.destroyChart();
    chartRef.current = null;
  };

  const makeChart = () => {
    const api = gridRef.current?.api;
    const el = chartDiv.current;
    if (!api || !el) return;
    destroyChart();
    chartRef.current =
      api.createPivotChart({
        chartType: 'groupedColumn',
        chartContainer: el,
        chartThemeOverrides: {
          common: {
            title: { enabled: true, text: 'Money to recover, by month and item (demo data)' },
            legend: { position: 'right' },
          },
        },
      }) ?? null;
  };

  const showHeatMap = () => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.applyColumnState({
      state: [
        { colId: 'month', rowGroup: true, rowGroupIndex: 0, sort: 'asc' },
        { colId: 'item', pivot: true, pivotIndex: 0 },
        { colId: 'toRecover', aggFunc: 'sum' },
      ],
      defaultState: { rowGroup: false, pivot: false, aggFunc: null, sort: null },
    });
    api.setGridOption('pivotMode', true);
    setPivotOn(true);
    setTimeout(makeChart, 400);
  };

  const backToGrid = () => {
    const api = gridRef.current?.api;
    destroyChart();
    setPivotOn(false);
    if (api) resetGrid(api);
  };

  const heatStyle = useCallback(
    (p: { value?: unknown; node?: { footer?: boolean } | null }) => {
      const v = Number(p.value);
      if (p.node?.footer || !Number.isFinite(v) || v <= 0.01) return undefined;
      const t = Math.min(1, v / heatMaxRef.current);
      return {
        backgroundColor: 'rgba(180, 35, 24, ' + (0.08 + 0.72 * t).toFixed(2) + ')',
        color: t > 0.55 ? '#ffffff' : '#7a1a12',
        fontWeight: 600,
      };
    },
    [],
  );

  const processPivotResultColDef = useCallback(
    (colDef: ColDef) => {
      colDef.cellStyle = heatStyle;
    },
    [heatStyle],
  );

  async function ask(text?: string) {
    const q = (text ?? question).trim();
    const api = gridRef.current?.api;
    if (!q || busy || !api) return;
    setQuestion(q);
    setBusy(true);
    setAiErr('');
    try {
      const res = await fetch('/api/nl-grid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const plan = sanitizePlan(data.plan);
      if (!plan.filters.length && !plan.groupBy.length && !plan.sort) {
        setApplied([]);
        setAiMsg(plan.explanation || 'I could not turn that into grid settings. Try rewording it.');
        return;
      }      destroyChart();
      setPivotOn(false);
      applyPlan(api, plan);
      setApplied(describePlan(plan));
      setAiMsg(plan.explanation);
    } catch (e) {
      setAiErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function clearAll() {    const api = gridRef.current?.api;
    destroyChart();
    setPivotOn(false);
    if (api) resetGrid(api);
    setQuestion('');
    setAiMsg('');
    setAiErr('');
    setApplied([]);
  }

  const onModelUpdated = useCallback((e: ModelUpdatedEvent<Dispute>) => {
    let count = 0;
    let total = 0;    const cells = new Map<string, number>();
    let max = 0;
    e.api.forEachNodeAfterFilter((n) => {
      if (!n.group && !n.footer && n.data) {
        count++;
        const gap = gapsOf(n.data).total;
        total += gap;
        const key = n.data.month + '|' + n.data.item;
        const sum = (cells.get(key) ?? 0) + gap;
        cells.set(key, sum);
        if (sum > max) max = sum;
      }
    });
    heatMaxRef.current = max || 1;
    setShown({ count, total: r2(total) });
  }, []);

  useEffect(() => {
    setRows(makeDisputes());
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Repaint the countdown column every second.
  useEffect(() => {
    gridRef.current?.api?.refreshCells({ columns: ['dueAt'], force: true });
  }, [now]);

    async function makeBrief() {
    if (!picked || briefBusy) return;
    const d = picked;
    setBriefBusy(true);
    setBriefErr('');
    try {
      const res = await fetch('/api/case-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: factsOf(d) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
      setBrief({ id: d.id, sentences: data.sentences || [], dropped: data.dropped || 0 });
    } catch (e) {
      setBriefErr(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBriefBusy(false);
    }
  }

  function jumpTo(id: string) {
    const api = gridRef.current?.api;
    if (!api) return;
    const go = () => {
      const node = api.getRowNode(id);
      if (!node) return;
      node.setSelected(true, true);
      api.ensureNodeVisible(node, 'middle');
      node.setExpanded(true);
    };
    const wasPivot = pivotOn;
    if (wasPivot) backToGrid();
    const n0 = api.getRowNode(id);
    if (wasPivot || !n0 || !n0.displayed) {
      if (!wasPivot) resetGrid(api);
      setTimeout(go, 600);
    } else {
      go();
    }
  }

  const urgent = rows.filter((r) => r.dueAt - now < 24 * HOUR);
  const atRisk = urgent.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="flex flex-wrap gap-3">
        <Stat label="Open disputes" value={String(rows.length)} />
        <Stat label="Expiring in 24h" value={String(urgent.length)} />
        <Stat
          label="Money at risk (24h)"
          value={atRisk.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        />
        <Stat label="Disputes with issues" value={String(found.count)} />
        <Stat label="Leakage flagged (not yet recovered)" value={money(found.total)} />
        <Stat label="Selected rows" value={String(selected)} />
        <LivePanel flagged={found.total} />
      </div>
      <div className="rounded border border-pp-border bg-white p-3">
        <div className="mb-2 text-sm font-semibold text-pp-navy">
          Ask the grid in plain English
        </div>
        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-pp-border px-3 py-2 text-sm"
            placeholder="e.g. Show chargebacks with a settlement gap over $5, grouped by reason"
            value={question}
            maxLength={500}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask();
            }}
          />
          <button
            type="button"
            className="rounded bg-pp-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={busy || !question.trim()}
            onClick={() => ask()}
          >
            {busy ? 'Thinking...' : 'Ask'}
          </button>
          <button
            type="button"
            className="rounded border border-pp-border px-4 py-2 text-sm"
            onClick={clearAll}
          >
            Reset
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              disabled={busy}
              className="rounded-full border border-pp-border px-3 py-1 text-xs text-pp-muted disabled:opacity-50"
              onClick={() => ask(ex.text)}
            >
              {ex.label}
            </button>
          ))}
        </div>
        {aiErr && <div className="mt-2 text-sm text-red-700">{aiErr}</div>}
        {aiMsg && (
          <div className="mt-3 rounded bg-slate-50 p-3 text-sm">
            <div className="mb-1 font-semibold text-pp-navy">What the AI did</div>
            <div>{aiMsg}</div>
            {applied.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-pp-muted">Applied to the grid:</span>
                {applied.map((a) => (
                  <span key={a} className="rounded border border-pp-border bg-white px-2 py-1 text-xs">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {rows.length > 0 && (
          <div className="mt-2 text-xs text-pp-muted">
            In view: {shown.count.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} disputes.
            Leakage flagged in these rows: {money(shown.total)} (not yet recovered).
          </div>
        )}
      </div>      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded bg-pp-navy px-4 py-2 text-sm font-semibold text-white"
          onClick={showHeatMap}
        >
          Heat map + chart: money to recover by month and item
        </button>
        {pivotOn && (
          <button
            type="button"
            className="rounded border border-pp-border px-4 py-2 text-sm"
            onClick={backToGrid}
          >
            Back to dispute grid
          </button>
        )}
        {pivotOn && (
          <span className="text-xs text-pp-muted">Darker red = more money to recover.</span>
        )}
      </div>
      <div className="rounded border border-pp-border bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-pp-navy">Case brief with proof</div>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-pp-muted">demo data</span>
          <button
            type="button"
            className="rounded bg-pp-navy px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
            disabled={!picked || briefBusy}
            onClick={makeBrief}
          >
            {briefBusy ? 'Writing...' : 'Write brief for selected dispute'}
          </button>
          {!picked && <span className="text-xs text-pp-muted">Tick exactly one dispute row in the grid first.</span>}
        </div>
        {briefErr && <div className="mb-2 text-sm text-red-700">{briefErr}</div>}
        {picked && (
          <div className="mb-2 rounded bg-slate-50 p-2 text-sm">
            <div className="text-xs text-pp-muted">Next step (rule-based, not AI)</div>
            <div className="font-semibold text-pp-navy">{nextStep(picked)}</div>
            <div className="mt-1 text-xs">
              If you accept, you lose {money(picked.amount)}. Money the code found to recover on this order: {money(gapsOf(picked).total)}.
            </div>
          </div>
        )}
        {brief && picked && brief.id === picked.id && (
          <div className="text-sm">
            {brief.sentences.map((s, i) => (
              <div key={i} className="mb-1">
                {s.text}{' '}
                {s.cites.map((c) => {
                  const f = factsOf(picked).find((x) => x.id === c);
                  return f ? (
                    <button
                      key={c}
                      type="button"
                      title={f.text}
                      className="mr-1 rounded border border-pp-border bg-white px-2 py-0.5 text-xs text-pp-navy"
                      onClick={() => jumpTo(picked.id)}
                    >
                      {f.label}
                    </button>
                  ) : null;
                })}
              </div>
            ))}
            <div className="mt-1 text-xs text-pp-muted">
              Every dollar amount above was checked against the records by code.
              {brief.dropped > 0 ? ' ' + brief.dropped + ' AI sentence(s) were removed because they failed the check.' : ''}
            </div>
          </div>
        )}
      </div>
      <div className="min-h-[560px] shrink-0 flex-1">
        <AgGridProvider modules={modules}>
          <AgGridReact<Dispute>
            ref={gridRef}
            theme={theme}
            rowData={rows}
            columnDefs={columns}
            defaultColDef={defaultColDef}
            getRowId={(p) => p.data.id}
            rowSelection={rowSelection}
            onSelectionChanged={() => {
              const sel = gridRef.current?.api.getSelectedRows() ?? [];
              setSelected(sel.length);
              setPicked(sel.length === 1 ? sel[0] : null);
            }}
            autoSizeStrategy={autoSizeStrategy}
            rowGroupPanelShow="always"
            grandTotalRow="bottom"            masterDetail={!pivotOn}
            detailCellRenderer={DetailPanel}
            detailRowHeight={190}
            sideBar={sideBar}            onModelUpdated={onModelUpdated}            enableCharts={true}
            enableAdvancedFilter={true}
            pivotPanelShow="onlyWhenPivoting"
            processPivotResultColDef={processPivotResultColDef}
            popupParent={popupParent}
          />        </AgGridProvider>
      </div>
      <div
        ref={chartDiv}
        className={pivotOn ? 'h-96 shrink-0 rounded border border-pp-border bg-white' : 'hidden'}
      />
    </div>
  );
}