// Nitro's own config supports the option that Lovable's narrow Vite wrapper
// type does not expose. Keep development and Cloudflare behaviour unchanged.
// Vite 8.2/Rolldown 1.2.x can emit cross-chunk SSR helpers that are undefined
// on Vercel's first request: https://github.com/TanStack/router/issues/8031
import { defineConfig } from "nitro";

export default defineConfig({
  ...(process.env["VERCEL"] === "1" ? { inlineDynamicImports: true } : {}),
});
