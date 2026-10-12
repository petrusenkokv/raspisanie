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

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
    // Check for SW updates every page load (fixes stale SW on mobile)
    setInterval(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        if (reg) await reg.update();
      } catch {}
    }, 60 * 60 * 1000); // check every hour
  });
}
