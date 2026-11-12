import type { Metadata } from 'next';
import Link from 'next/link';
import { DisputesGrid } from './disputes-grid';

export const metadata: Metadata = { title: 'DisputeShield' };

export default function DisputesPage() {
  return (
    <main className="flex h-dvh flex-col bg-pp-canvas px-8 py-6 font-paypal text-pp-ink">
      <Link href="/" className="text-sm font-semibold text-pp-blue hover:underline">
        &larr; All pages
      </Link>
      <h1 className="mt-3 text-[28px] font-semibold text-pp-navy">DisputeShield</h1>
      <p className="mt-1 text-sm text-pp-muted">
        Every open dispute, sorted by the clock. Demo data for now.
      </p>
      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <DisputesGrid />
      </div>
    </main>
  );
}