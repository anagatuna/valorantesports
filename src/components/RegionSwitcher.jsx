// src/components/RegionSwitcher.jsx
"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const BUCKET_LABELS = ["AMERICAS", "EMEA", "PACIFIC", "CN"];

export default function RegionSwitcher({ region }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function onChange(e) {
    const nextRegion = e.target.value;

    const fd = new FormData();
    fd.append("region", nextRegion);

    const res = await fetch("/api/set_region", { 
      method: "POST",
      body: fd,
      cache: "no-store",
    });

    if (!res.ok) {
      console.error("No se pudo setear la cookie de región:", res.status);
      return;
    }

    startTransition(() => router.refresh());
  }

  return (
    <label className="inline-flex items-center gap-2">
      <span className="text-sm opacity-80">Cambiar región:</span>
      <select
        defaultValue={region}
        onChange={onChange}
        disabled={isPending}
        className="bg-black/30 border border-white/10 rounded px-3 py-2"
      >
        {BUCKET_LABELS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </label>
  );
}
