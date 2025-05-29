// src/components/Navbar.jsx
"use client";

import Link from "next/link";
import Image from "next/image";

export default function Navbar() {
  return (
    <header className="bg-slate-950 border-b border-slate-800 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="Logo" width={32} height={32} />
          <h1 className="text-xl font-bold tracking-wide">Valorant Esports</h1>
        </div>
        <nav className="flex gap-6 text-sm font-medium">
          <Link href="/matches" className="hover:text-red-500 transition">Matches</Link>
          <Link href="/teams" className="hover:text-red-500 transition">Teams</Link>
          <Link href="/tournaments" className="hover:text-red-500 transition">Tournaments</Link>
          <Link href="/stats" className="hover:text-red-500 transition">Stats</Link>
        </nav>
      </div>
    </header>
  );
}
