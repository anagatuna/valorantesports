// app/matches/page.jsx
import Navbar from "@/components/Navbar";
import MatchGrid from "@/components/MatchGrid";

export default function MatchesPage() {
  return (
    <div className="valorant-bg text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold mb-6">Recent Matches</h1>
        <MatchGrid />
      </main>
    </div>
  );
}
