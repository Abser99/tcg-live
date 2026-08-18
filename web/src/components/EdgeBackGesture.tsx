"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/* Global "swipe from the left edge → go back" gesture for mobile, on every
   screen. The full-screen live view has its own drag-to-dismiss, so we skip
   when it's mounted (marked with [data-fullscreen-live]). */
export default function EdgeBackGesture() {
  const router = useRouter();

  useEffect(() => {
    const EDGE = 26;        // px from the left edge to start the gesture
    const DIST = 70;        // min horizontal distance to trigger back
    const MAX_OFF = 55;     // max vertical drift (keep it horizontal)
    let startX: number | null = null;
    let startY = 0;

    const onStart = (e: TouchEvent) => {
      // ignore when a fullscreen live view is active (it handles its own gesture)
      if (document.querySelector("[data-fullscreen-live]")) { startX = null; return; }
      const t = e.touches[0];
      startX = t && t.clientX <= EDGE ? t.clientX : null;
      startY = t ? t.clientY : 0;
    };
    const onEnd = (e: TouchEvent) => {
      if (startX == null) return;
      const t = e.changedTouches[0];
      const dx = (t?.clientX ?? 0) - startX;
      const dy = Math.abs((t?.clientY ?? 0) - startY);
      startX = null;
      if (dx > DIST && dy < MAX_OFF) router.back();
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchend", onEnd);
    };
  }, [router]);

  return null;
}
