# Rationale: 0005 · 接口安全与健壮性契约

## Context

The current server boundary mixes raw Prisma records, ad hoc response objects and string exceptions. Some public queries include complete User records, some private reads use a fixed test user, and some writes have no server side role check. Related list and count queries also use different filters.

Several writes span tags, parent records, join rows and cached counters. When those statements run outside one transaction or use create and delete semantics for a requested target state, partial failure and request retries can leave inconsistent data.

This repair must preserve the current user flows and successful response fields. It must use the existing Next.js, Prisma, MariaDB, JWT, logger and test stack, with no new schema, dependency, pagination or monitoring subsystem.

DailyStat and Prompt have no user ownership field. Under the chosen no schema change constraint, they are shared private resources for ROOT accounts. This is acceptable for the current single owner product but does not provide isolation if more than one ROOT account is introduced.

## Options considered

### Option 1: Shared result contract and coordinated in place repair

Define one typed failure vocabulary and update every affected route and action in the same feature, while preserving domain specific success data.

**Pros**:

- Removes inconsistent security and retry behavior across all known affected paths.
- Compile time exhaustiveness and shared helpers make later extensions safer.

**Cons**:

- Requires coordinated updates to several callers and focused regression tests.

### Option 2: Custom Error classes with existing thrown flow

Keep exceptions as the Server Action boundary and introduce typed error classes plus a mapper in each caller.

**Pros**:

- Smaller initial changes inside successful action paths.

**Cons**:

- Client callers still depend on correct catch logic and serialization behavior.
- Expected business outcomes continue to share control flow with unexpected failures.

### Option 3: Patch each defect locally

Add field selection, role checks and individual catches only where the review found a problem.

**Pros**:

- Lowest immediate code churn.

**Cons**:

- Keeps competing patterns and makes the next interface likely to repeat them.
- Does not provide a stable extension contract or compile time enforcement.

## Rationale

Option 1 fits the existing typed Pomodoro result pattern and extends it across the server boundary without adding infrastructure. A coordinated repair is justified because the defects share the same root cause: runtime input, identity, data projection and failure semantics are not expressed as one contract.

The runner up is Option 2. It is workable inside server only code, but is less reliable across Server Action serialization and browser callers. Returning expected outcomes as data also preserves retry decisions without parsing messages or exception types.

Keeping the schema unchanged matches the current single owner product. Audit tables and broader monitoring would require separate retention, privacy and operational decisions, so they remain outside this repair.
