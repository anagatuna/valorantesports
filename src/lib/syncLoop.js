// src/lib/syncLoop.js
import { refreshMatches } from "@/lib/refresh";

let started = false;

export function startLocalSync() {
  if (started) return;
  started = true;

  if (process.env.NODE_ENV !== "development") {
    console.log("[syncLoop] Desactivado en producción");
    return;
  }

  console.log("[syncLoop] iniciando loop local de refresh cada 60s");
  setInterval(async () => {
    try {
      const res = await refreshMatches();
      console.log("[syncLoop] refresh ok:", res);
    } catch (err) {
      console.error("[syncLoop] error:", err.message);
    }
  }, 60 * 1000);
}
