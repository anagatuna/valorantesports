"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

const STATUS_LABEL = {
  ongoing: "Ongoing",
  upcoming: "Upcoming",
  completed: "Completed",
  paused: "Paused",
};

const STATUS_CHIP = {
  ongoing: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  upcoming: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  completed: "bg-white/5 text-slate-400 border-white/10",
  paused: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

// Mismo juego de filtros que vlr.gg. El value es lo que devuelven tierOf() y
// regionOf(); el label es la abreviatura corta que muestra vlr.gg.
const TIERS = [
  { value: "ALL", label: "All" },
  { value: "VCT", label: "VCT" },
  { value: "VCL", label: "VCL" },
  { value: "T3", label: "T3" },
  { value: "GC", label: "GC" },
  { value: "CG", label: "CG" },
  { value: "OFF", label: "Off" },
];

const REGIONS = [
  { value: "ALL", label: "All" },
  { value: "AMERICAS", label: "AMER" },
  { value: "EMEA", label: "EMEA" },
  { value: "PACIFIC", label: "PAC" },
  { value: "CN", label: "CN" },
];

// La API da el premio como cadena de dígitos ("250000"); vlr.gg lo muestra
// formateado. Si viniera con símbolo o texto lo dejamos tal cual.
function formatPrize(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits || digits !== String(raw).trim()) return String(raw);
  return `$${Number(digits).toLocaleString("en-US")}`;
}

function FilterRow({ label, options, value, onChange, counts }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const n = counts[opt.value] ?? 0;
          const active = value === opt.value;
          // Los filtros sin ningun evento se dejan visibles pero apagados, para
          // que se note que la categoria existe y hoy esta vacia.
          const empty = n === 0 && opt.value !== "ALL";
          return (
            <button
              key={opt.value}
              type="button"
              disabled={empty}
              onClick={() => onChange(opt.value)}
              className={`rounded px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                active
                  ? "bg-accent text-black"
                  : empty
                  ? "cursor-not-allowed bg-white/[0.02] text-slate-600"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              {opt.label}
              <span className={`ml-1.5 font-normal ${active ? "text-black/50" : "text-slate-600"}`}>{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
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
          <span className="rounded border border-accent/30 px-1.5 py-0.5 font-bold uppercase tracking-wider text-accent/80">
            {ev.tier}
          </span>
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
        {STATUS_LABEL[ev.status] || ev.status || "—"}
      </span>
    </Link>
  );
}

export default function EventsBrowser({ events, source }) {
  const [tier, setTier] = useState("ALL");
  const [region, setRegion] = useState("ALL");

  // Cada contador se calcula con el OTRO filtro ya aplicado, asi el numero
  // dice cuantos eventos veria si pulsara ese boton, no cuantos hay en total.
  const tierCounts = useMemo(() => {
    const base = region === "ALL" ? events : events.filter((e) => e.region === region);
    const out = { ALL: base.length };
    for (const t of TIERS) if (t.value !== "ALL") out[t.value] = base.filter((e) => e.tier === t.value).length;
    return out;
  }, [events, region]);

  const regionCounts = useMemo(() => {
    const base = tier === "ALL" ? events : events.filter((e) => e.tier === tier);
    const out = { ALL: base.length };
    for (const r of REGIONS) if (r.value !== "ALL") out[r.value] = base.filter((e) => e.region === r.value).length;
    return out;
  }, [events, tier]);

  const filtered = useMemo(
    () =>
      events.filter(
        (e) => (tier === "ALL" || e.tier === tier) && (region === "ALL" || e.region === region)
      ),
    [events, tier, region]
  );

  // Agrupamos por estado, como vlr.gg: lo que se juega ahora arriba.
  const groups = ["ongoing", "upcoming", "completed", "paused"]
    .map((status) => ({ status, items: filtered.filter((e) => e.status === status) }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-extrabold uppercase tracking-wider">Events</h1>
        <span className="text-xs text-slate-500">
          {filtered.length === events.length
            ? `${events.length} total`
            : `${filtered.length} de ${events.length}`}
          {source === "api" && " · not synced"}
        </span>
      </div>

      <div className="mb-8 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <FilterRow label="Tier" options={TIERS} value={tier} onChange={setTier} counts={tierCounts} />
        <FilterRow label="Region" options={REGIONS} value={region} onChange={setRegion} counts={regionCounts} />
      </div>

      {events.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-slate-400">
          No events yet. Run <code className="text-slate-300">node scrape_events.mjs</code> to sync them.
        </p>
      )}

      {events.length > 0 && filtered.length === 0 && (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-slate-400">
          No hay eventos con estos filtros.
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
    </>
  );
}
