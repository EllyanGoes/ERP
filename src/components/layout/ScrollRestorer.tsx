"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Resets the main scroll container to top whenever the route changes.
 * Prevents the "white space" effect caused by scroll position carrying over
 * when switching tabs.
 */
export default function ScrollRestorer() {
  const pathname = usePathname();

  useEffect(() => {
    document.getElementById("erp-main")?.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
