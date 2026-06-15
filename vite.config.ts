import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png", "og.jpg"],
      manifest: {
        name: "WORKROOM by 4REST",
        short_name: "WORKROOM",
        description: "필요한 시간만큼 머무는 조용한 작업 공간. 예약·출근부·이용권을 한 곳에서.",
        lang: "ko",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#FAF8F1",
        theme_color: "#FAF8F1",
        categories: ["productivity", "lifestyle", "business"],
        icons: [
          { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache only the app shell (JS/CSS/HTML/SVG). Fonts are large and the
        // Pretendard dynamic subset loads per-glyph on demand, so they're handled
        // by runtime caching instead of bloating the install-time precache.
        globPatterns: ["**/*.{js,css,html,svg}"],
        globIgnores: ["**/woff2-dynamic-subset/**"],
        navigateFallback: "/index.html",
        // Don't let the SW intercept Supabase/auth/API or admin deep links.
        navigateFallbackDenylist: [/^\/admin/, /\/auth\//, /supabase/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Self-hosted fonts and OG/illustration images: cache-first, long TTL.
            urlPattern: ({ url }) => url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/"),
            handler: "CacheFirst",
            options: {
              cacheName: "workroom-assets",
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
