export const HOUR = 3_600_000;

export type Dispute = {
  id: string; orderId: string; month: string;
  reason: string; stage: string; customer: string; item: string;
  amount: number; currency: string; dueAt: number; evidence: string;
  paid: number; refunded: number; fee: number; expectedFee: number; settled: number;
  refunds: { id: string; date: string; amount: number }[];
  evidenceFiles: string[];
};

export const EVIDENCE_FOR: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: 'Tracking number or proof of delivery, or refund ID',
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: 'Product description, return policy, or refund ID',
  UNAUTHORISED: 'Carrier name + tracking number, or refund ID',
  CREDIT_NOT_PROCESSED: 'Refund ID or credit notes',
  DUPLICATE_TRANSACTION: 'Refund ID or notes',
  CANCELED_RECURRING_BILLING: 'Subscription agreement or refund ID',
};

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r2 = (n: number) => Math.round(n * 100) / 100;

const items = ['Headphones', 'Yoga mat', 'Phone case', 'Smart watch', 'Backpack', 'Desk lamp', 'Running shoes', 'Coffee maker'];
const names = ['amit', 'sara', 'john', 'priya', 'liam', 'mei', 'carlos', 'fatima', 'noah', 'anna'];
const files = ['Tracking proof', 'Invoice', 'Chat log', 'Delivery photo'];
const reasons = Object.keys(EVIDENCE_FOR);

export function makeDisputes(n = 2000): Dispute[] {
  const now = Date.now();
  const rnd = rng(42);
  const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const rows: Dispute[] = [];
  for (let i = 0; i < n; i++) {
    const month = `2026-${String(Math.floor(rnd() * 10) + 1).padStart(2, '0')}`;
    const paid = r2(15 + rnd() * 285);
    const expectedFee = r2(paid * 0.029 + 0.3);
    const fee = rnd() < 0.12
      ? r2(Math.max(0.3, expectedFee + (rnd() < 0.5 ? 1 : -1) * (1 + rnd() * 5)))
      : expectedFee;
    const refunds: Dispute['refunds'] = [];
    if (rnd() < 0.4) {
      const first = r2(paid * (rnd() < 0.5 ? 1 : 0.3 + rnd() * 0.6));
      refunds.push({ id: `RF-${i}-1`, date: `${month}-15`, amount: first });
      if (rnd() < 0.1) refunds.push({ id: `RF-${i}-2`, date: `${month}-16`, amount: first });
    }
    const refunded = r2(refunds.reduce((s, x) => s + x.amount, 0));
    const settled = r2(paid - fee - refunded - (rnd() < 0.06 ? 2 + rnd() * 20 : 0));
    const reason = pick(reasons);
    rows.push({
      id: `PP-D-${10001 + i}`,
      orderId: `ORD-${50001 + i}`,
      month,
      reason,
      stage: rnd() < 0.45 ? 'CHARGEBACK' : 'INQUIRY',
      customer: `${pick(names)}.${i}@${rnd() < 0.04 ? 'gmial.com' : 'example.com'}`,
      item: pick(items),
      amount: r2(paid * (rnd() < 0.8 ? 1 : 0.5)),
      currency: 'USD',
      dueAt: now + Math.floor(1 + rnd() * 240) * HOUR,
      evidence: EVIDENCE_FOR[reason],
      paid, refunded, fee, expectedFee, settled, refunds,
      evidenceFiles: files.filter(() => rnd() < 0.45),
    });
  }
  return rows;
}