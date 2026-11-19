import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Recipe Box",
        short_name: "Recipes",
        description: "Family recipes, pantry and costs",
        theme_color: "#2f6f4f",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Recipe data: show cached copy offline, refresh when online.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/recipes"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "api-recipes" }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/photos/"),
            handler: "CacheFirst",
            options: { cacheName: "photos", expiration: { maxEntries: 500 } }
          }
        ]
      }
    })
  ],
  server: {
    // `npm run dev` serves the UI; API calls go to `wrangler dev` on 8787.
    proxy: { "/api": "http://localhost:8787" }
  },
  build: { outDir: "dist" }
});
