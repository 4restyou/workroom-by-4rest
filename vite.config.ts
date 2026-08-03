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
        // The xlsx export chunk (~430KB) is admin-only and lazy-loaded on click,
        // so keep it out of the install-time precache; it's runtime-cached below.
        // 장식용 고양이 SVG 3장은 합쳐 580KB(gzip 110KB)로 정적 자산 중 가장 크다.
        // 설치 시 선다운로드할 이유가 없어 제외하고, 아래 런타임 캐시로 처리한다.
        globIgnores: ["**/woff2-dynamic-subset/**", "**/xlsx-*.js", "**/cat[123]-*.svg"],
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
          {
            // 첫 방문에 필요하지 않은 큰 일러스트: 처음 요청될 때만 받아 캐시한다.
            urlPattern: ({ url }) => /\/assets\/cat[123]-.*\.svg$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "workroom-illustrations",
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Lazy-loaded xlsx export chunk: cache once an admin actually fetches it.
            urlPattern: ({ url }) => /\/assets\/xlsx-.*\.js$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "workroom-lazy",
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
