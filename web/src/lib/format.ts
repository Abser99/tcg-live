export function formatTimer(endTime?: string | Date): string {
  if (!endTime) return "—";
  const diff = Math.max(0, new Date(endTime).getTime() - Date.now());
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
