# Review, feature-pomodoro-layout, 2026-08-30

**Reviewed by**: gpt-5 (author model not provided)
**Scope**: 27 files, feature-pomodoro-layout vs master
**Verdict**: Changes requested

## Summary

The change cleanly separates the timer, daily-history display, and calendar/operation surfaces, and it preserves the authenticated server history contract. Calendar state, local-date filtering, and conflict presentation are generally well structured. However, the two-column layout does not give the history panel a bounded height, so it expands instead of independently scrolling; the required keyboard focus restoration after choosing an adjacent-month date is also missing. The new settlement path inside the real controller is not exercised by tests.

## Major

### 🟠 Two-column history cannot scroll independently, `src/components/Content/_styles.scss:70`

**Problem**: Between 1088px and 1399px with both sidebars present, `.left-side-bar` is changed to `height: auto` and keeps `overflow: hidden`. `PomodoroHistoryPanel` consequently has no definite parent height for its `h-full`/flex layout, so `.history-scroll` grows with the list rather than becoming its own scrolling region.
**Why it matters**: This is the normal intermediate responsive layout for the feature. A day with enough records pushes the page beyond the viewport and removes the independently scrollable history list required by AC-3, while its header/status can no longer remain stable.
**Suggested fix**: Give the double-layout grid and left rail a definite available block size (accounting for its rail position and padding), then let the history panel fill that size and make only `.history-scroll` overflow vertically. Add a rendered layout regression test that verifies the double-layout height/overflow contract.

### 🟠 The controller settlement integration has no behavioral coverage, `src/hooks/usePomodoro.ts:101`

**Problem**: The tests mock `usePomodoro` at the page boundary and no hook-level test drives the newly added `onRecordSettled`, `isSyncing`, or `isOnline` paths. In particular, there is no test showing that a created/already-existing record reaches the coordinator before the outbox item is removed, or that a conflicting server record is surfaced correctly.
**Why it matters**: This is new branching synchronization logic behind AC-6, AC-7, AC-11, and the no-disappearance requirement. The component and helper tests can pass while the actual storage/server/controller integration regresses, leaving completed records absent from the selected day or the operation panel in an incorrect state.
**Suggested fix**: Add controller integration tests with mocked storage and `savePomodoroRecord` for success, already-exists, conflict, offline, and concurrent-sync cases; assert callback ordering, outbox transitions, and the exposed online/syncing state.

## Minor

### 🟡 Adjacent-month selection drops the grid focus, `src/components/Calendar/index.tsx:102`

**Problem**: `chooseDate` changes the visible month for an adjacent cell but never sets `focusRequestedRef`. The focused button is unmounted by the controlled-month re-render, and the focus-restoration effect therefore does not move focus to the newly selected date.
**Why it matters**: This breaks the AC-12 keyboard contract after selecting an adjacent-month date: keyboard users lose their place in the date grid and must tab back into it.
**Suggested fix**: Request focus before changing to an adjacent month and verify after the controlled rerender that the newly selected grid button owns focus.

## Strengths

- The page coordinator keeps selected date and visible month distinct, uses a timezone-aware cache key, and guards stale month responses with request IDs.
- The calendar has a genuine roving-tab-stop implementation, clear labels for marked dates, and tests covering its primary keyboard movements.
- The anonymous boundary avoids creating the timer controller or issuing history requests.

## Test coverage

Targeted Vitest coverage for the calendar, coordinator, and date helpers passed (20 tests), and lint reported no errors. The new presentation components and calendar helpers are well covered, but the real `usePomodoro` settlement/synchronization integration is untested; the Playwright case only verifies authenticated reload, not daily history, synchronization, conflicts, or responsive scrolling.
