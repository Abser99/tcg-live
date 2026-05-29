import posthog from "posthog-js";

export function useAnalytics() {
  const capture = (event: string, props?: Record<string, unknown>) => {
    try {
      posthog.capture(event, props);
    } catch {}
  };

  return { capture };
}
