// Loads Google Analytics 4 only when VITE_GA_ID is configured. With no id set
// (e.g. local dev or before setup) nothing is injected, so there is no tracking
// and no console noise. GA4 Enhanced Measurement captures SPA route changes.
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;

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
