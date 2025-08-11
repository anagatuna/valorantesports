// src/components/Navbar.jsx
"use client";
import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="valo-wrapper">
      <ul className="valo-bar">
        <div className="valo-side left">
          <li><Link href="/">Inicio</Link></li>
          <li><Link href="/matches">Partidos</Link></li>
          <li><Link href="/teams">Equipos</Link></li>
        </div>

        <li className="valo-center">
          <Link href="/play" className="play-chip">PLAY</Link>
        </li>

        <div className="valo-side right">
          <li><Link href="/tournaments">Torneos</Link></li>
          <li><Link href="/stats">Stats</Link></li>
          <li><Link href="/store">Tienda</Link></li>
        </div>
      </ul>
    </nav>
  );
}
