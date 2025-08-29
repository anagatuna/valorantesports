// src/components/Navbar.jsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();
  const isActive = (href) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav className="valo-wrapper">
      {/* UL con SOLO LI como hijos directos */}
      <ul className="valo-bar">
        {/* Lado izquierdo */}
        <li className="valo-side left">
          <ul className="side-list">
            <li><Link href="/matches" className={isActive("/matches") ? "is-active" : undefined} aria-current={isActive("/matches") ? "page" : undefined}>Matches</Link></li>
            <li><Link href="/events" className={isActive("/events") ? "is-active" : undefined} aria-current={isActive("/events") ? "page" : undefined}>Events</Link></li>
            <li><Link href="/results" className={isActive("/results") ? "is-active" : undefined} aria-current={isActive("/results") ? "page" : undefined}>Results</Link></li>
          </ul>
        </li>

        {/* Spacer central (ocupa el hueco del chip) */}
        <li className="center-spacer" aria-hidden />

        {/* Lado derecho */}
        <li className="valo-side right">
          <ul className="side-list">
            <li><Link href="/teams" className={isActive("/teams") ? "is-active" : undefined} aria-current={isActive("/teams") ? "page" : undefined}>Teams</Link></li>
            <li><Link href="/stats" className={isActive("/stats") ? "is-active" : undefined} aria-current={isActive("/stats") ? "page" : undefined}>Stats</Link></li>
            <li><Link href="/pickems" className={isActive("/pickems") ? "is-active" : undefined} aria-current={isActive("/pickems") ? "page" : undefined}>Pick'ems</Link></li>
          </ul>
        </li>

        {/* Botón central */}
        <li className="valo-center">
          <Link href="/" className={`play-chip ${pathname === "/" ? "is-active" : ""}`}>
            <span className="play-label">HOME</span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}
