import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

async function prepareClient() {
  // Stale SW caches break Vite dev (blank page / half-loaded UI on localhost).
  if (import.meta.env.DEV && "serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  }
}

prepareClient().then(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});

const SW_BUILD = "gym-app-v4";

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const previousBuild = localStorage.getItem("sw-build");
    if (previousBuild && previousBuild !== SW_BUILD) {
      void navigator.serviceWorker.getRegistrations().then((regs) =>
        Promise.all(regs.map((r) => r.unregister())),
      );
      if ("caches" in window) {
        void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
      }
    }
    localStorage.setItem("sw-build", SW_BUILD);

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        void registration.update();
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "activated" && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => {});
  });
}
