"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // Force an update check whenever the tab regains visibility.
        const onVisible = () => {
          if (document.visibilityState === "visible") {
            reg.update().catch(() => {});
          }
        };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
          document.removeEventListener("visibilitychange", onVisible);
        };
      } catch (err) {
        console.warn("Service worker registration failed", err);
      }
    };

    const cleanupPromise = register();
    return () => {
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  return null;
}
