// Loads Google Analytics 4. The measurement id defaults to the production
// property and can be overridden (or disabled with "") via VITE_GA_ID.
// GA4 Enhanced Measurement captures SPA route changes automatically.
const GA_ID = (import.meta.env.VITE_GA_ID as string | undefined) ?? "G-CM4MEDZZ28";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function initAnalytics(): void {
  if (!GA_ID || typeof document === "undefined") return;

  const loader = document.createElement("script");
  loader.async = true;
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(loader);

  const inline = document.createElement("script");
  inline.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`;
  document.head.appendChild(inline);
}

export function trackEvent(name: string, params: Record<string, string | number | boolean | null | undefined> = {}): void {
  if (!GA_ID || typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, params);
}
