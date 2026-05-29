"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { setRedirectHandler } from "@/lib/api";

export default function RedirectHandler() {
  const router = useRouter();
  useEffect(() => {
    setRedirectHandler(() => router.push("/login"));
  }, [router]);
  return null;
}
