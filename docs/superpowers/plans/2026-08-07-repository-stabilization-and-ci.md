# Repository Stabilization and CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every corrupted tracked text file without overwriting concurrent user work, migrate CI to the required pnpm/Node runtime, and establish executable source, workflow, database, browser, and build gates.

**Architecture:** Start with dependency-free Node contract tests so the broken package scripts cannot hide the corruption. Recover only paths whose worktree content is unchanged from the corrupted commit, reconcile user-modified paths separately, then introduce the test harness and split CI into independent evidence-producing jobs.

**Tech Stack:** Node.js 22, pnpm 10.28.1, TypeScript 5.8, Vitest 4.1.10, Testing Library, Playwright 1.62.1, Supabase CLI 2.95.2, pgTAP, Actionlint 1.7.12, GitHub Actions.

## Global Constraints

- Preserve all concurrent worktree changes, including `.env`, `package-lock.json`, deleted AstroStack/Cosmos files, generated types, route tree, and migration edits, until each is explicitly reconciled.
- Do not rewrite published Git history: no rebase, amend, squash, reset, or force-push.
- Node.js is version 22.
- pnpm is version 10.28.1 and is activated through Corepack.
- Supabase CLI is version 2.95.2.
- Never expose a service-role key to client code or untrusted pull-request jobs.
- Every production behavior change follows red-green-refactor.
- Use French-first copy and retain all valid accents as UTF-8 NFC.

## File Structure

- `tests/contracts/source-recovery.test.mjs`: dependency-free corruption regression test.
- `tests/contracts/package-contract.test.mjs`: dependency-free runtime/package contract.
- `scripts/validate-source-integrity.mjs`: reusable source validator used locally and in CI.
- `scripts/lib/source-integrity.mjs`: pure validation functions.
- `scripts/lib/source-integrity.test.mjs`: Vitest unit tests for the validator.
- `vitest.config.ts`, `src/test/setup.ts`: application test harness.
- `tests/workflows/ci-contract.test.ts`: semantic contract for the GitHub workflow.
- `playwright.config.ts`, `e2e/app-smoke.spec.ts`: browser smoke gate.
- `supabase/tests/database/smoke.test.sql`: local database and RLS smoke gate.
- `.github/workflows/ci.yml`: split CI pipeline.
- `package.json`, `pnpm-lock.yaml`: reproducible commands and dependencies.

---

### Task 1: Prove and repair the lexical corruption safely

**Files:**
- Create: `tests/contracts/source-recovery.test.mjs`
- Modify mechanically: tracked paths changed by `df78a82`, only when the path has no worktree delta
- Inspect without overwriting: every path currently listed by `git status --short`

**Interfaces:**
- Consumes: Git object `818fecc45acd79e7340d00f12632da084e8cfd45` and corrupted commit `df78a82`.
- Produces: valid tracked text plus a regression test that detects the known corruption signatures.

- [ ] **Step 1: Write the failing dependency-free corruption test**

```js
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const signatures = [
  /"(?:dev|build|preview)":"vite(?:dev|build|preview)/,
  /<\/?[a-z][a-z0-9]*className=/,
  /\b(?:CREATE|ALTER|INSERT|SELECT|UPDATE|DELETE)(?:TABLE|POLICY|INTO|FROM|PUBLIC)\b/i,
  /\b(?:export|function|const|let|return)(?:function|const|let|return|[A-Z][a-z])\b/,
];

test("tracked source has no whitespace-stripping signatures", () => {
  const files = execFileSync("git", ["ls-files", "-z"])
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((path) => /\.(?:[cm]?[jt]sx?|json|sql|ya?ml)$/.test(path));
  const failures = files.flatMap((path) => {
    const text = readFileSync(path, "utf8");
    return signatures.some((signature) => signature.test(text)) ? [path] : [];
  });
  assert.deepEqual(failures, []);
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/contracts/source-recovery.test.mjs`

Expected: FAIL listing representative corrupted paths such as `package.json` and `src/routes/index.tsx`.

- [ ] **Step 3: Snapshot concurrent worktree paths**

Run: `git status --porcelain=v1 > "$env:TEMP\sky-map-pre-recovery-status.txt"`

Expected: the snapshot includes the current `.env`, package lock, deletions, route/type edits, and migration edit.

- [ ] **Step 4: Restore only untouched corrupted paths from the healthy parent**

Use a scoped mechanical recovery: enumerate `git diff-tree --name-only -r df78a82^ df78a82`; for each `$candidatePath`, restore the blob from `818fecc45acd79e7340d00f12632da084e8cfd45` only if `git diff --quiet -- $candidatePath` succeeds. Skip and report every modified or deleted worktree path. This is a bulk recovery operation; do not use a broad `git restore`, checkout, reset, or a whitespace-guessing script.

- [ ] **Step 5: Reconcile skipped paths one by one**

For `AppNav.tsx`, generated Supabase types, `routeTree.gen.ts`, the edited social migration, and user-deleted AstroStack/Cosmos files, compare the healthy blob, the current worktree, and post-corruption semantic commits. Apply only the lexical repair portions while retaining the user’s semantic choice. Regenerate generated files after their source routes/schema are settled.

- [ ] **Step 6: Run the regression test and confirm GREEN**

Run: `node --test tests/contracts/source-recovery.test.mjs`

Expected: PASS with zero corruption signatures.

- [ ] **Step 7: Commit the isolated restoration**

Stage only reconciled source files and the contract test. Commit: `fix: restore lexical source integrity`.

### Task 2: Establish the pnpm and command contract

**Files:**
- Create: `tests/contracts/package-contract.test.mjs`
- Create: `pnpm-lock.yaml`
- Modify: `package.json`

**Interfaces:**
- Produces scripts `typecheck`, `test`, `test:unit`, `test:coverage`, `test:e2e`, `test:db`, `validate:source`, and `validate:workflow`.

- [ ] **Step 1: Write the failing package contract**

```js
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("package manager and critical scripts are explicit", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(pkg.packageManager, "pnpm@10.28.1");
  assert.equal(pkg.engines.node, "22.x");
  assert.equal(pkg.scripts.build, "vite build");
  assert.equal(pkg.scripts.dev, "vite dev");
  for (const name of ["typecheck", "format:check", "test", "test:coverage", "test:e2e", "test:db", "validate:source", "validate:workflow"]) {
    assert.equal(typeof pkg.scripts[name], "string", `missing script ${name}`);
  }
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run: `node --test tests/contracts/package-contract.test.mjs`

Expected: FAIL because `packageManager`, `engines`, and test scripts are absent or corrupted.

- [ ] **Step 3: Repair the manifest and add pinned test dependencies**

Set the runtime fields and scripts, then install with:

```powershell
corepack enable
corepack prepare pnpm@10.28.1 --activate
pnpm add -D vitest@4.1.10 @vitest/coverage-v8@4.1.10 `
  @testing-library/react@16.3.2 @testing-library/jest-dom@7.0.0 `
  @testing-library/user-event@14.6.3 jsdom@30.0.1 `
  @playwright/test@1.62.1 yaml@2.9.0
```

Set `format` to `prettier --write .` and `format:check` to `prettier --check .`; CI uses only the non-mutating `format:check` command.

- [ ] **Step 4: Generate and freeze the pnpm lock**

Run: `pnpm install --lockfile-only`

Expected: `pnpm-lock.yaml` exists. Do not delete or modify the user’s dirty `package-lock.json` in this task.

- [ ] **Step 5: Run the package contract and confirm GREEN**

Run: `node --test tests/contracts/package-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the package contract**

Commit: `build: standardize node and pnpm toolchain`.

### Task 3: Build the non-mutating source-integrity validator

**Files:**
- Create: `scripts/lib/source-integrity.mjs`
- Create: `scripts/lib/source-integrity.test.mjs`
- Create: `scripts/validate-source-integrity.mjs`
- Create: `.gitattributes`

**Interfaces:**
- Produces: `validateText(path, bytes): string[]` and CLI exit code 1 on violations.

- [ ] **Step 1: Write focused failing tests**

```js
import { describe, expect, test } from "vitest";
import { validateText } from "./source-integrity.mjs";

describe("validateText", () => {
  test("rejects invalid UTF-8", () => {
    expect(validateText("bad.md", Uint8Array.from([0xc3, 0x28]))).toContain("invalid UTF-8");
  });
  test("rejects replacement characters", () => {
    expect(validateText("copy.ts", Buffer.from('const copy = "Communaut�"'))).toContain("contains U+FFFD");
  });
  test("rejects known whitespace stripping", () => {
    expect(validateText("package.json", Buffer.from('{"build":"vitebuild"}'))).toContain("known whitespace corruption");
  });
});
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `pnpm exec vitest run scripts/lib/source-integrity.test.mjs`

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the minimal validator**

Use `TextDecoder("utf-8", { fatal: true })`, an NFC comparison for user-facing text, JSON parsing for `.json`, and the approved corruption signature list. The CLI obtains tracked paths from `git ls-files -z`, ignores binary extensions, prints all failures, and never writes files.

- [ ] **Step 4: Run unit and repository validation**

Run: `pnpm exec vitest run scripts/lib/source-integrity.test.mjs` then `pnpm validate:source`.

Expected: both PASS.

- [ ] **Step 5: Commit the validator**

Commit: `test: guard source encoding and lexical integrity`.

### Task 4: Add application unit and component test infrastructure

**Files:**
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/lib/astro.test.ts`
- Create: `src/components/AppNav.test.tsx`

**Interfaces:**
- Produces: jsdom test environment and coverage thresholds of 80% globally.

- [ ] **Step 1: Write baseline astronomy tests**

```ts
import { describe, expect, test } from "vitest";
import { cardinalName, julianDay, moonPhaseName } from "./astro";

describe("astronomy primitives", () => {
  test("uses the J2000 epoch", () => {
    expect(julianDay(new Date("2000-01-01T12:00:00.000Z"))).toBeCloseTo(2451545, 6);
  });
  test("formats cardinal sectors", () => {
    expect(cardinalName(0)).toBe("N");
    expect(cardinalName(90)).toBe("E");
  });
  test("names a near-full moon", () => {
    expect(moonPhaseName(0.5)).toMatch(/pleine/i);
  });
});
```

- [ ] **Step 2: Run the test and confirm the harness is RED**

Run: `pnpm test:unit -- src/lib/astro.test.ts`

Expected: FAIL because Vitest config/setup is missing or corrupted source still blocks imports.

- [ ] **Step 3: Add Vitest config and DOM setup**

Configure `vite-tsconfig-paths`, jsdom, `src/test/setup.ts`, coverage provider `v8`, and global thresholds of 80 for lines, functions, statements, and branches.

- [ ] **Step 4: Add an AppNav behavior test**

Render the navigation with a memory router and assert visible French labels and active-route semantics rather than implementation classes.

- [ ] **Step 5: Run unit/component tests and coverage**

Run: `pnpm test:unit` then `pnpm test:coverage`.

Expected: PASS. If legacy coverage is below 80, add focused behavior tests for the uncovered astronomy, search, store, upload, auth, and UI paths until the approved global threshold is met; do not lower or scope away the threshold.

- [ ] **Step 6: Commit the test harness**

Commit: `test: add vitest and component harness`.

### Task 5: Test the GitHub workflow as data

**Files:**
- Create: `tests/workflows/ci-contract.test.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: parsed YAML document.
- Produces: assertions for runtime, pnpm, required jobs, secret isolation, immutable action references, and summary dependencies.

- [ ] **Step 1: Write the failing workflow contract**

```ts
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { describe, expect, test } from "vitest";

const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
const required = ["source-integrity", "workflow-lint", "lint-and-types", "unit-and-component-tests", "database-tests", "e2e-tests", "production-build", "security-audit", "ci-summary"];

describe("CI contract", () => {
  test("contains every required job", () => expect(Object.keys(workflow.jobs)).toEqual(expect.arrayContaining(required)));
  test("uses immutable action references", () => {
    const text = readFileSync(".github/workflows/ci.yml", "utf8");
    for (const ref of text.matchAll(/uses:\s*([^\s]+)/g)) expect(ref[1]).toMatch(/@[0-9a-f]{40}$/);
  });
  test("summary depends on every gate", () => expect(workflow.jobs["ci-summary"].needs.sort()).toEqual(required.filter((job) => job !== "ci-summary").sort()));
  test("does not use npm ci", () => expect(readFileSync(".github/workflows/ci.yml", "utf8")).not.toContain("npm ci"));
});
```

- [ ] **Step 2: Run the contract and confirm RED**

Run: `pnpm exec vitest run tests/workflows/ci-contract.test.ts`

Expected: FAIL because the current workflow has only `validate` and `summary` and uses major tags/npm.

- [ ] **Step 3: Replace the workflow with the approved job graph**

Use immutable commits:

- `actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955`
- `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020`
- `pnpm/action-setup@a7487c7e89a18df4991f7f222e4898a00d66ddda`
- `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02`
- `actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093`

Every Node job uses 22 and `pnpm install --frozen-lockfile`. Secrets are absent at workflow-global scope.

- [ ] **Step 4: Add Actionlint 1.7.12 verification**

Download `actionlint_1.7.12_linux_amd64.tar.gz`, verify SHA-256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`, extract to the runner temp directory, and execute it against `.github/workflows/*.yml`.

- [ ] **Step 5: Run workflow contract and Actionlint locally**

Run: `pnpm validate:workflow` and the platform-appropriate Actionlint binary.

Expected: PASS.

- [ ] **Step 6: Commit the workflow tests**

Commit: `ci: test and split validation workflow`.

### Task 6: Add local Supabase/pgTAP smoke coverage

**Files:**
- Create: `supabase/tests/database/smoke.test.sql`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm test:db` invoking `pnpm dlx supabase@2.95.2 test db`.

- [ ] **Step 1: Write a failing pgTAP smoke test**

```sql
begin;
select plan(4);
select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'user_images', 'user images exist');
select ok((select relrowsecurity from pg_class where oid = 'public.user_images'::regclass), 'RLS active on user_images');
select isnt_empty('select policyname from pg_policies where tablename = ''user_images''');
select * from finish();
rollback;
```

- [ ] **Step 2: Start/reset the local database and confirm RED**

Run: `pnpm dlx supabase@2.95.2 start`, `pnpm dlx supabase@2.95.2 db reset`, then `pnpm test:db`.

Expected: FAIL on any schema name that differs from the recovered migration; adjust the assertion to the authoritative recovered schema, not to a mock.

- [ ] **Step 3: Repair migration syntax without changing applied history**

Restore corrupted existing migration text from the healthy commit while preserving the user’s current semantic edit. Add only new migrations for new behavior; do not edit production-applied semantics.

- [ ] **Step 4: Run database tests and lint**

Run: `pnpm test:db` and `pnpm dlx supabase@2.95.2 db lint --local`.

Expected: PASS.

- [ ] **Step 5: Commit database smoke coverage**

Commit: `test: add supabase schema smoke gates`.

### Task 7: Add Playwright smoke coverage and final CI gates

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/app-smoke.spec.ts`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: browser evidence that the restored app starts, renders French copy, and navigates without a fatal error.

- [ ] **Step 1: Write the failing browser smoke test**

```ts
import { expect, test } from "@playwright/test";

test("opens the sky and navigates to Explorer", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Carte du Ciel/i })).toBeVisible();
  await page.getByRole("link", { name: /Explorer/i }).click();
  await expect(page).toHaveURL(/\/explorer/);
  await expect(page.getByRole("heading", { name: /Explorer le ciel/i })).toBeVisible();
});
```

- [ ] **Step 2: Run it and confirm RED**

Run: `pnpm exec playwright install chromium` then `pnpm test:e2e`.

Expected: FAIL until the restored app builds/serves correctly.

- [ ] **Step 3: Configure deterministic local environment values**

Use non-secret local Supabase test values or a local instance; never inject production service-role secrets. Configure `webServer.command` as `pnpm dev --host 127.0.0.1` and reuse false in CI.

- [ ] **Step 4: Run all local gates**

Run in order: `pnpm validate:source`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage`, `pnpm test:db`, `pnpm test:e2e`, `pnpm build`.

Expected: every command exits 0 with no hidden warnings treated as success.

- [ ] **Step 5: Commit the browser and final gates**

Commit: `test: add end-to-end release gate`.

### Task 8: Verify the recovered branch as a whole

**Files:**
- Modify only if verification exposes a regression.

- [ ] **Step 1: Re-run the full command suite from a clean install**

Delete only generated dependency/build directories after resolving their absolute workspace paths, then run `pnpm install --frozen-lockfile` followed by every gate in Task 7.

- [ ] **Step 2: Audit requirements and dirty worktree preservation**

Compare `git status --short` with the pre-recovery snapshot. Confirm every pre-existing user modification is either still present or explicitly incorporated with evidence.

- [ ] **Step 3: Inspect the final diff and CI workflow**

Run: `git diff --check`, `git diff --stat`, `pnpm validate:workflow`.

- [ ] **Step 4: Commit only necessary verification fixes**

Commit: `chore: finalize repository stabilization`.
