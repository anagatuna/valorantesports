// app/matches/page.jsx
import MatchGrid from "@/components/MatchGrid";

export default function MatchesPage() {
  return (
    <div className="valorant-bg text-white">
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-10">Upcoming Matches</h1>
        <MatchGrid />
      </main>
    </div>
  );
}
