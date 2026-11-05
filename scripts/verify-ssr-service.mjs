// A successful Vite build is not enough: Rolldown may emit SSR chunks that
// throw "__exportAll is not a function" on Vercel's first request.
// Import the exact generated service module in a new Node process to catch it.
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const roots = [
  ".output/server/_ssr",
  ".vercel/output/functions/__server.func/_ssr",
  ".vercel/output/functions/server.func/_ssr",
];

const found = roots.flatMap((root) =>
  existsSync(root)
    ? readdirSync(root)
        .filter((name) => /^server-[a-zA-Z0-9_-]+\.mjs$/.test(name))
        .map((name) => resolve(root, name))
    : [],
);

if (found.length === 0) {
  throw new Error(
    "SSR service smoke check: no generated server-*.mjs module found in Nitro output.",
  );
}

for (const file of found) {
  console.log(`Verifying production SSR service import: ${file}`);
  try {
    const module = await import(pathToFileURL(file).href);
    if (!module || typeof module !== "object") {
      throw new Error("SSR service did not export a module namespace");
    }
  } catch (error) {
    console.error("SSR service imports fail although vite build succeeded.", error);
    process.exitCode = 1;
    break;
  }
}
