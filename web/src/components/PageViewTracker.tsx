"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import posthog from "posthog-js";

export default function PageViewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    posthog.capture("$pageview", { path: pathname });
  }, [pathname]);
  return null;
}
