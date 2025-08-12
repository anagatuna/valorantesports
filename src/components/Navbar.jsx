// src/components/Navbar.jsx
"use client";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="valo-wrapper">
      <ul className="valo-bar">
        {/* Lado izquierdo */}
        <div className="valo-side left">
          <li><Link href="/">Matches</Link></li>
          <li><Link href="/matches">Events</Link></li>
          <li><Link href="/teams">Results</Link></li>
        </div>

        {/* 🔸 Spacer invisible que ocupa el ancho del PLAY + hombros */}
        <li className="center-spacer" aria-hidden />

        {/* Lado derecho */}
        <div className="valo-side right">
          <li><Link href="/tournaments">Teams</Link></li>
          <li><Link href="/stats">Stats</Link></li>
          <li><Link href="/store">Pick'ems</Link></li>
        </div>

        {/* Botón PLAY (posicionado absoluto, arriba del spacer) */}
        <li className="valo-center">
          <Link href="/play" className="play-chip">HOME</Link>
        </li>
      </ul>
    </nav>
  );
}
