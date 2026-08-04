export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEventById, getEventMatches } from '@/lib/events';
import { getLogo } from '@/lib/teams';

const fmtDate = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
};

const proxied = (url) => (getLogo(url) ? `/api/image-proxy?url=${encodeURIComponent(url)}` : null);

function TeamSide({ name, logo, score, won, align = 'left' }) {
  const src = proxied(logo);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 p-1">
        {src ? <img src={src} alt="" className="max-h-full max-w-full object-contain" /> : <div className="h-full w-full rounded-full bg-white/10" />}
      </div>
      <span className={`truncate text-sm ${won ? 'font-bold text-white' : 'text-slate-400'}`}>{name || 'TBD'}</span>
      <span className={`ml-auto shrink-0 text-sm tabular-nums ${won ? 'font-bold text-white' : 'text-slate-500'}`}>
        {score ?? '-'}
      </span>
    </div>
  );
}

function MatchRow({ m }) {
  const done = m.status === 'COMPLETED' || m.status === 'FINAL';
  const a = Number(m.score_a) || 0;
  const b = Number(m.score_b) || 0;

  return (
    <Link
      href={`https://www.vlr.gg/${m.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/20 sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex w-full items-center gap-3 sm:w-auto sm:flex-1">
        <TeamSide name={m.team_a} logo={m.team_a_logo} score={m.score_a} won={done && a > b} />
        <span className="shrink-0 text-xs text-slate-600">vs</span>
        <TeamSide name={m.team_b} logo={m.team_b_logo} score={m.score_b} won={done && b > a} align="right" />
      </div>

      <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500 sm:w-52 sm:justify-end">
        {m.match_stage && <span className="truncate">{m.match_stage}</span>}
        <span className={m.status === 'LIVE' ? 'font-bold text-red-500' : ''}>
          {m.status === 'LIVE' ? 'LIVE' : fmtDate(m.start_datetime) || m.status}
        </span>
      </div>
    </Link>
  );
}

export default async function EventDetailPage({ params }) {
  const { id } = await params;
  const ev = await getEventById(id);
  if (!ev) notFound();

  const matches = await getEventMatches(id);

  return (
    <div>
      <Link href="/events" className="text-xs text-slate-500 hover:text-slate-300">
        ← Events
      </Link>

      <header className="mb-8 mt-3 flex gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/5 p-2">
          {ev.img ? <img src={ev.img} alt="" className="max-h-full max-w-full object-contain" /> : <div className="h-full w-full rounded bg-white/10" />}
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-white sm:text-2xl">{ev.name}</h1>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
            {ev.dates && <span>{ev.dates}</span>}
            {ev.region && <span className="uppercase tracking-wider">{ev.region}</span>}
            {ev.status && <span className="uppercase tracking-wider">{ev.status}</span>}
          </div>
        </div>
      </header>

      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
        Matches · {matches.length}
      </h2>

      {matches.length === 0 ? (
        // Los partidos se enlazan con scrape_events.mjs, y la API fuente solo
        // cubre los ~250 mas recientes: los torneos viejos salen vacios.
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
          No matches linked to this event yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {matches.map((m) => (
            <MatchRow key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
