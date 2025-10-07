// pages/api/scoreboard.js
const VLRGG = "https://vlrggapi.vercel.app/match/scoreboard";

const toNum = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

function extractId(input) {
  if (!input) return null;
  const s = String(input);
  if (/^\d+$/.test(s)) return s;                              // "554511"
  let m = /\/match\/(\d+)/.exec(s); if (m?.[1]) return m[1]; // "/match/554511/"
  m = /\/(\d+)(?:\/|$)/.exec(s); if (m?.[1]) return m[1];    // "/554511/...”
  return null;
}

function normalizeFromVlrgg(j) {
  const P = j?.data?.players || [];
  const T = j?.data?.teams || [];
  const t1id = String(T?.[0]?.id ?? "1");
  const t2id = String(T?.[1]?.id ?? "2");

  const row = (r) => ({
    name: r?.name || r?.player || "",
    tag: r?.tag || r?.handle || "",
    agent: r?.agent || r?.agent_name || "",
    agentImg: r?.agent_img || r?.agentIcon || "",
    acs: toNum(r?.acs),
    k: toNum(r?.kills ?? r?.k),
    d: toNum(r?.deaths ?? r?.d),
    a: toNum(r?.assists ?? r?.a),
    plusMinus: toNum(r?.plusMinus ?? r?.plus_minus ?? (toNum(r?.kills) - toNum(r?.deaths))),
  });

  return {
    playersT1: P.filter((x) => String(x?.team || x?.team_id) === t1id).map(row),
    playersT2: P.filter((x) => String(x?.team || x?.team_id) === t2id).map(row),
    mapIndex: j?.data?.mapIndex ?? null,
  };
}

export default async function handler(req, res) {
  try {
    const { id: idRaw, path } = req.query;
    const id = extractId(idRaw || path);
    if (!id) return res.status(400).json({ ok: false, error: "missing id or path" });

    const r = await fetch(`${VLRGG}?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ ok: false, error: "upstream error", upstream: j });

    return res.status(200).json({ ok: true, data: normalizeFromVlrgg(j) });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
