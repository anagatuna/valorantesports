// app/matches/page.jsx
import MatchGrid from "@/components/MatchGrid";

export const dynamic = "force-dynamic"; // no-cache en App Router

function apiBase() {
  // En prod usa NEXT_PUBLIC_API_BASE (tu dominio de vercel) si lo pones,
  // si no, usa relativo (funciona también en Vercel).
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }
  // fallback en dev
  return "http://localhost:3000";
}

export default async function MatchesPage() {
  const base = apiBase();

  // lee SIEMPRE desde tu API (que habla con Atlas)
  const res = await fetch(`${base}/api/matches?pageSize=200`, { cache: "no-store" });
  if (!res.ok) {
    // evita reventar la página si hay 502/500; muestra vacío
    return (
      <div className="valorant-bg text-white">
        <main className="max-w-7xl mx-auto px-6 py-8">
          <h1 className="text-3xl font-bold mb-10">Upcoming Matches</h1>
          <p className="text-gray-400">No se pudo cargar desde la base. Intenta más tarde.</p>
        </main>
      </div>
    );
  }

  const { items = [] } = await res.json();

  return (
    <div className="valorant-bg text-white">
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-10">Upcoming Matches</h1>
        <MatchGrid matches={items} />
      </main>
    </div>
  );
}