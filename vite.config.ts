// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Vercel production: Rolldown 1.2.x can initialize cross-chunk runtime helpers
// in the wrong order. The emitted build passes typecheck yet throws
// "__exportAll is not a function" when importing the SSR service.
// Nitro's verified workaround inlines the dynamic server imports.
// See https://github.com/TanStack/router/issues/8031
const isVercelBuild = process.env["VERCEL"] === "1";

export default defineConfig({
  ...(isVercelBuild
    ? {
        nitro: {
          preset: "vercel" as const,
        },
      }
    : {}),
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
