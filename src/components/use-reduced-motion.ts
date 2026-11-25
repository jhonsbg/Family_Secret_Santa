"use client";

import { useSyncExternalStore } from "react";

const preference = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(preference);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(preference).matches;
}

export function useReducedMotion() {
  // The server and first hydration render share the same static presentation.
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
