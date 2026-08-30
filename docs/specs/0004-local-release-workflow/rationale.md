# 0004. Local release workflow: Rationale

_Build spec in [index.md](./index.md). This file is the decision record; /develop skips it._

## Context

The site already has separate development and production `.env` files, and `package.json` holds a version number. Publishing today means running commands by hand in the right order and keeping the version and changelog in sync. That is error prone and slows down the shipping cycle. The goal is one command that takes the current state all the way to a production deployment, with a clear record of what changed.

## Options considered

### Option 1: Shell script per step

A `release.sh` that chains shell commands together. Simplest possible shape, no extra dependencies.

**Pros**: No new package to install, works on any machine with bash, easy to read.

**Cons**: Cross platform on Windows needs Git Bash or WSL. Error handling is crude (set -e, no step names in error output).

### Option 2: Node.js script with dotenv-cli

A TypeScript entry point under `bin/release.ts` that uses the same `dotenv-cli` already in the project to switch environments, `child_process.execSync` to run each step, and `console.log` for the plan. The script is committed to the repo, so it is versioned with the code.

**Pros**: Uses existing tools (`dotenv-cli`, `tsx`). Step by step error messages are easy to implement. Can read and write `package.json` programmatically. Works on all platforms where Node runs.

**Cons**: Adds a new entry point to maintain. Still needs a thin shell wrapper for the `DRY_RUN` environment variable to reach the script.

### Option 3: npm release-it package

A mature community package that handles versioning, changelog, git operations, and plugin hooks. Version is in `package.json` and `standard-version` is the recommended tool in the stack walk answers.

**Pros**: Battle tested, handles edge cases (pre release tags, scope, rollback). Many plugins available.

**Cons**: Introduces a new dependency that needs configuration. Its defaults (especially around git push) differ from the chosen workflow and need careful override. Overkill for the stated simple workflow.

## Rationale

The workflow is intentionally simple. A Node.js script keeps everything in one place, uses existing tooling, and is easy to extend when the CI scenario arrives. `standard-version` is the right tool for the version bump logic (it handles conventional commit parsing and tag formats) but wrapping it in a custom script gives full control over the build and deploy steps without fighting `standard-version`'s plugin system. The `DRY_RUN` environment variable is a natural fit for CI because it requires no changes to the script itself; the CI platform sets an env var and the same command runs in check mode.

**Runtime note**: the script uses `tsx` instead of `ts-node/esm` because Node 24 has compatibility issues with `ts-node/esm`'s experimental loader. `tsx` is already available in the project (used by Playwright and other tooling) and is more reliable.

## References

**Project sources**:

- `AGENTS.md`: current commands and project conventions
- `package.json`: existing `build-local:prod` script that demonstrates `dotenv-cli` usage with `.env.production`

**Practices and standards**:

- Single responsibility entry point: one command handles the whole workflow
- CI compatible by default: environment variable gates avoid script duplication
