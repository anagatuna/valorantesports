export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getEvents } from '@/lib/events';

const STATUS_LABEL = {
  ongoing: 'En curso',
  upcoming: 'Próximos',
  completed: 'Finalizados',
  paused: 'En pausa',
};

const STATUS_CHIP = {
  ongoing: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  upcoming: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  completed: 'bg-white/5 text-slate-400 border-white/10',
  paused: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

// La API da el premio como cadena de dígitos ("250000"); vlr.gg lo muestra
// formateado. Si viniera con símbolo o texto lo dejamos tal cual.
function formatPrize(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits || digits !== String(raw).trim()) return String(raw);
  return `$${Number(digits).toLocaleString('en-US')}`;
}

function EventCard({ ev }) {
  const prize = formatPrize(ev.prizepool);
  return (
    <Link
      href={`/events/${ev.id}`}
      className="group flex gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-white/25 hover:bg-white/[0.06]"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white/5 p-2">
        {ev.img ? (
          // Logos de owcdn: sin optimizar para no pasarlos por el optimizador.
          <img src={ev.img} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <div className="h-full w-full rounded bg-white/10" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="truncate font-semibold text-white group-hover:text-accent">{ev.name}</h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
          {ev.dates && <span>{ev.dates}</span>}
          {prize && <span className="text-slate-300">{prize}</span>}
          {ev.region && (
            <span className="rounded border border-white/10 px-1.5 py-0.5 uppercase tracking-wider">
              {ev.region}
            </span>
          )}
        </div>
      </div>

      <span
        className={`h-fit shrink-0 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          STATUS_CHIP[ev.status] || STATUS_CHIP.completed
        }`}
      >
        {STATUS_LABEL[ev.status] || ev.status || '—'}
      </span>
    </Link>
  );
}

export default async function EventsPage() {
  const { events, source } = await getEvents();

  // Agrupamos por estado, como vlr.gg: lo que se juega ahora arriba.
  const groups = ['ongoing', 'upcoming', 'completed', 'paused']
    .map((status) => ({ status, items: events.filter((e) => e.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-wider">Events</h1>
        <span className="text-xs text-slate-500">
          {events.length} eventos
          {source === 'api' && ' · sin sincronizar'}
        </span>
      </div>

      {events.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-slate-400">
          No hay eventos. Corre <code className="text-slate-300">node scrape_events.mjs</code> para
          sincronizarlos.
        </p>
      )}

      {groups.map((g) => (
        <section key={g.status} className="mb-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">
            {STATUS_LABEL[g.status]} · {g.items.length}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {g.items.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
