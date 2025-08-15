// src/components/HomeMatches.jsx
"use client";

import { useEffect, useMemo, useState } from "react";
import ScheduleCard from "@/components/ScheduleCard";
import { loadLogosFromCache, saveLogosToCache } from "@/utils/teamLogoCache";

/** Carga/actualiza logos sólo si hacen falta para los partidos visibles */
async function ensureLogosFor(matches) {
    const needed = new Set();
    for (const m of matches) (m.teams || []).forEach(t => t?.name && needed.add(t.name.toLowerCase().trim()));

    const cached = loadLogosFromCache();
    const logoMap = cached?.logoMap || {};
    const norm = (s) => s.toLowerCase().replace(/[\s\-_\.]+/g, "").trim();
    const hasAll = () => [...needed].every(n => logoMap[norm(n)]);

    if (hasAll()) return cached;

    let page = 1;
    const maxPages = 5;
    while (page <= maxPages && !hasAll()) {
        const res = await fetch(`https://vlr.orlandomm.net/api/v1/teams?page=${page}&size=200`);
        if (!res.ok) break;
        const json = await res.json();
        (json?.data || []).forEach(team => {
            const key = norm(team?.name || "");
            const img = team?.img || team?.image;
            if (key && img) logoMap[key] = img;
        });
        page++;
    }
    saveLogosToCache(logoMap, []); // tu util acepta (logoMap, teamList)
    return { logoMap, teamList: [] };
}

export default function HomeMatches({ today, next, completed }) {
    const [logoMap, setLogoMap] = useState({});
    const [teamList, setTeamList] = useState([]);

    // 1) UPCOMING: hoy + siguiente día (máx 8)
    const upcomingCombined = useMemo(() => {
        const a = today?.items || [];
        const b = next?.items || [];
        return [...a, ...b].slice(0, 8);
    }, [today, next]);

    // 2) COMPLETED: máx 8
    const completedLimited = useMemo(
        () => (completed?.items || []).slice(0, 8),
        [completed]
    );

    // 3) Asegura logos para lo visible
    useEffect(() => {
        (async () => {
            const visible = [...upcomingCombined, ...completedLimited];
            const cache = await ensureLogosFor(visible);
            setLogoMap(cache?.logoMap || {});
            setTeamList(cache?.teamList || []);
        })();
    }, [upcomingCombined, completedLimited]);

    return (
        <div className="space-y-10">
            {/* UPCOMING */}
            <section>
                <div className="flex items-end justify-between mb-3">
                    <h2 className="text-2xl font-bold">Upcoming matches</h2>
                    <span className="opacity-70 text-sm">
                        {today?.date}{next?.date && today?.date !== next?.date ? ` · ${next?.date}` : ""}
                    </span>
                </div>

                {upcomingCombined.length ? (
                    <div className="divide-y divide-red-900/40 rounded-lg overflow-hidden border border-red-900/30">
                        {upcomingCombined.map(m => (
                            <ScheduleCard key={`u-${m.id}`} match={m} logos={logoMap} teamList={teamList} />
                        ))}
                    </div>
                ) : (
                    <p className="opacity-70">No hay partidos próximos.</p>
                )}
            </section>

            {/* COMPLETED */}
            <section>
                <div className="flex items-end justify-between mb-3">
                    <h2 className="text-2xl font-bold">Completed matches</h2>
                    <span className="opacity-70 text-sm">{completed?.date}</span>
                </div>

                {completedLimited.length ? (
                    <div className="divide-y divide-red-900/40 rounded-lg overflow-hidden border border-red-900/30">
                        {completedLimited.map(m => (
                            <ScheduleCard key={`c-${m.id}`} match={m} logos={logoMap} teamList={teamList} />
                        ))}
                    </div>
                ) : (
                    <p className="opacity-70">No hay resultados disponibles.</p>
                )}
            </section>
        </div>
    );
}
