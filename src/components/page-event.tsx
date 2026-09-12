"use client";

import { useEffect, useState } from "react";

import {
  createPageVisit,
  trackBrowserEvent,
  type BrowserEvent,
} from "@/lib/browser-events";

export function PageEvent({ event }: { event: BrowserEvent }) {
  const [trackVisit] = useState(() =>
    createPageVisit(() => trackBrowserEvent(event)),
  );

  useEffect(() => {
    void trackVisit();
  }, [trackVisit]);

  return null;
}
