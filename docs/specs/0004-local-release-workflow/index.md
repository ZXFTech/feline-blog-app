# 0004. Local release workflow

**Date**: 2026-08-30
**Status**: Accepted

## Summary

A single `pnpm release` command handles the whole publishing pipeline: it reads the current version from `package.json`, generates a changelog from conventional commit history, bumps the patch number, builds the production bundle, deploys to Vercel, and commits the version bump with a tag. Each step shows a live progress bar with elapsed time; on completion a summary table reports per step duration, total wall time, release start time, memory usage, and output size. Every successful release also creates `releases/v{version}/CHANGELOG.md` and `releases/v{version}/release.json` with the full release record including per step performance data and build output details. CI environments can run the same script in dry-run mode by setting `DRY_RUN=true`, so the same entry point works for local and remote publishing without duplication.

See [rationale.md](./rationale.md) for the decision record (Context, Options considered, Rationale, References).

## Requirements

**User stories**:

- As the developer, I want one command to publish so that I do not have to remember the right order of steps
- As the developer, I want the changelog to reflect what actually shipped so that the record is trustworthy
- As the developer in a CI environment, I want the same script to preview what it would do without changing anything

**Acceptance criteria**:

- **AC-1**: `pnpm release` updates `package.json` version from patch (e.g. 0.1.0 to 0.1.1) when `DRY_RUN` is not set
- **AC-2**: `pnpm release` generates `CHANGELOG.md` from commits since the last tag, grouping by fix and feat
- **AC-3**: `pnpm release` runs `pnpm build` using the production `.env` file (`.env.production`)
- **AC-4**: `pnpm release` calls `vercel --prod` to deploy the built output
- **AC-5**: `pnpm release` commits the version bump and `CHANGELOG.md` update, then tags the commit with the new version
- **AC-6**: `pnpm release` exits with a non zero code and prints the failing step name when any step fails
- **AC-7**: When `DRY_RUN=true` is set, the script prints the planned steps and skips all mutating commands (no version change, no commit, no tag, no build, no deploy)
- **AC-8**: During execution the console shows the current step name and a progress bar that updates live. After the release finishes (success or failure) the script prints a summary table with: release start time, total wall time, per step duration, peak memory usage, and the size of the built output directory.
- **AC-9**: After a successful release, the script creates `releases/v{version}/CHANGELOG.md` with this release's changelog entries (copied from `CHANGELOG.md`, scoped to this version) and `releases/v{version}/release.json` with the full release record including start time, end time, version, changelog path, total duration, per step durations, build output details (name, size, path), and step performance metrics.
- **AC-10**: `release.json` is committed as part of the git commit step so the release record is versioned alongside the code.

## Decision

**Chosen option**: Option 2: Node.js script with dotenv-cli

A single TypeScript script at `bin/release.ts` that runs each step in sequence using `child_process.execSync`, prints the step name on failure, and respects the `DRY_RUN` environment variable to skip mutations. It reuses the `dotenv-cli` already in `devDependencies` to load `.env.production` before the build step. The changelog generation uses `conventional-changelog` via a small inline script to avoid adding another CLI dependency.

**Implementation skills**: none

## Feature design

This is a build pipeline, not a data feature, so no data model or API surface applies.

**State transitions**: not applicable

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| read current version | "0.1.0" | `package.json` `version` field |
| compute next version | "0.1.1" | `standard-version` logic (patch bump) |
| load env for build | database URLs, secrets | `.env.production` via `dotenv-cli` |
| build output | `/.next/` directory | `pnpm build` |
| deploy to production | live URL | `vercel --prod` stdout |
| git commit | new commit SHA | `git commit` stdout |
| git tag | tag name e.g. "v0.1.1" | `git tag` stdout |

**Key invariants**:

- The version in `package.json` always matches the latest git tag (enforced by the commit step)
- `CHANGELOG.md` grows at the top; it is never truncated by the release script

**Security model**:

- The script reads `.env.production` locally. It never outputs secrets; the build and deploy steps inherit environment from the script's process.
- No third party credentials are created by this script; Vercel credentials are assumed to be configured via `vercel login` on the machine.

**Configuration required**:

- No new environment variables. The script reads `.env.production` through the existing `dotenv-cli` setup. `DRY_RUN` is the only new env var and it is optional.

**Critical test scenarios**:

- Happy path: `pnpm release` on a clean tree with uncommitted changes succeeds and ends with the new version committed and tagged, verifies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-8**
- Dry run: `DRY_RUN=true pnpm release` prints the plan and exits zero with no filesystem or git changes, verifies **AC-7**
- Build failure: if `pnpm build` returns non zero, the script prints "Build failed" and exits 1, verifies **AC-6**
- Deploy failure: if `vercel --prod` returns non zero, the script prints "Deploy failed" and exits 1, the version is already committed and tagged, verifies **AC-6**
- Stats summary: after a successful run the summary table shows start time, each step duration in ms, total duration, memory delta, and output size, verifies **AC-8**

## Build plan

1. Create `bin/release.ts` with the step runner: DRY_RUN check, version read, standard-version bump, changelog generation, Prisma client generate, dotenv build, vercel deploy, git commit and tag. Each step uses `child_process.execSync` with a try/catch that prints the step name on failure and exits 1. When `DRY_RUN=true`, skip the mutating steps and print the plan instead. satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**
   - **Progress bar**: render a single line progress bar (step name + elapsed seconds) that updates in place via `\r`. Clear the line on step complete.
   - **Stats tracking**: record `performance.now()` at release start and at the end of each step. After all steps, compute per step duration and total wall time. Read `process.memoryUsage().heapUsed` before and after the build step and report the delta. Use `du -sh .next` (or equivalent cross platform: `execSync` a size check) to report the built output size.
   - **Summary table**: on completion print a formatted table: `| Step | Duration |` rows plus a footer `| Total | Xms |`. Also print start time (ISO string), peak memory delta, and `.next` output size.
2. Add `standard-version` to `devDependencies` and configure it in `package.json` to target `package.json` as the only file to bump. satisfies **AC-1**
3. Add `standard-changelog` via `standard-version` for changelog generation inside the release script (standard-changelog ships with standard-version). satisfies **AC-2**
4. Add `pnpm release` script to `package.json` that runs `npx tsx bin/release.ts`. satisfies the entry point
5. Add a note in the script header documenting which variables from `.env.production` the build needs (so the developer knows what to configure on a fresh machine). satisfies the developer setup requirement
6. After the last step, create `releases/v{version}/` directory, copy the changelog entry for this version into `releases/v{version}/CHANGELOG.md`, and write `releases/v{version}/release.json` with the full release record. satisfies **AC-9**, **AC-10**

## Consequences

**Positive**:

- One command replaces a sequence of manual steps
- Version, changelog, and tag stay in sync automatically
- CI can run the same script in dry-run mode with no changes

**Negative / tradeoffs**:

- A new file (`bin/release.ts`) to maintain
- `standard-version` adds a dev dependency

**Neutral**:

- The script uses `tsx` (already available in the project) to run TypeScript locally
- `vercel` CLI must be installed on the machine (separate from the npm package)

## Follow-up

- [ ] Add a GitHub Actions workflow file (`.github/workflows/release.yml`) that listens to git tags matching `v*` and runs the production build and Vercel deploy. This is the natural next step for the "remote publishing" scenario; the local script is already CI compatible.
- [ ] Add `vercel.json` to configure `projectId` and `productionEnvironment` so that `vercel --prod` deploys to the correct Vercel project in multi project environments.
