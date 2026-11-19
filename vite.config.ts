import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // The app sits behind Cloudflare Access, so the manifest must be fetched
      // with the sign-in cookie; without it the browser can't install the app.
      useCredentials: true,
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Recipe Box",
        short_name: "Recipes",
        description: "Family recipes, pantry and costs",
        theme_color: "#2f6f4f",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        id: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        // Lets an installed app appear in Android's Share menu.
        share_target: {
          action: "/share",
          method: "GET",
          params: { title: "title", text: "text", url: "url" }
        }
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Recipe data: always fresh when online, cached copy when offline.
            urlPattern: ({ url }) => url.pathname.startsWith("/api/recipes"),
            handler: "NetworkFirst",
            options: { cacheName: "api-recipes", networkTimeoutSeconds: 5 }
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
