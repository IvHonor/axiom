# Daily Plan overview checks

## Overview movement checks

Run `node tests/overview-movement.mjs` against Vite on port 1427 with the Playwright setup below. The isolated fixture renders the real Overview and persistence hooks with inert summaries. Checks cover mouse/touch pointer handling, keyboard movement, saved grid coordinates, displaced tiles, Escape/pointer cancellation, cleanup on unmount, edge scrolling, resize at the grid boundary, preserved summary state, reinstalling areas, narrow windows and invalid saved settings.

## Theme extension checks

Run `node tests/theme-extensions.mjs` against Vite on port 1427, with the same `PLAYWRIGHT_MODULE` setup below. The isolated fixture uses the real installation hook, theme provider, extension details and theme picker. It verifies all five optional packages and fourteen variants, unique IDs, install/apply/uninstall, reload persistence, restoration after reinstall, system mode switching, local font loading, and at least 4.5:1 primary/secondary text and filled-button contrast. It also checks compact and wide Daily Plan and Project Board tiles with every new font pairing. Screenshots go to ignored `.qa.local`.

`overview-preview.html` renders the real tile, menu and planner components with an in-memory planner API. It never reads or changes the desktop app's database.

Start Vite with `npm run dev -- --port 1427`, then run `node tests/overview-layout.mjs` in an environment with Playwright and its Chromium browser installed. If Playwright is installed outside the project, set `PLAYWRIGHT_MODULE` to the file URL of its `index.mjs`. `OVERVIEW_TEST_URL` can override the fixture URL.

The checks exercise all eleven views, disabled options, completion, pagination, preferences per grid size, empty data, light theme, overlapping events near midnight, fallback when the window narrows, and 126 combinations of tile size and viewport width. Assertions check actual rendered overflow, not just whether scrollbars have been hidden. Screenshots are written to the ignored `.qa.local` directory.

Auto chooses from the actual **content area**, excluding the header and padding. At a 1440px fixture viewport, representative defaults are:

| Tile size | Automatic view |
| --- | --- |
| 2×2 | At a glance |
| 3×3 | Now & next |
| 4×4 | Today's agenda |
| 8×5 | Day strip |
| 4×9 | Fitted timeline |
| 8×9 | Schedule + tasks |

These are examples rather than fixed mappings: the sidebar, window size and theme can change the available width. Every view's minimum usable space and recommendation rules live in `src/features/daily_plan/overview/model.ts`.

# Project Board overview checks

`board-overview-preview.html` uses the real summary, menu, full board and card drawer with in-memory API replacements. Run `node tests/board-overview-layout.mjs` against the same Vite server and Playwright installation. `BOARD_OVERVIEW_TEST_URL` overrides its fixture URL.

The board suite checks all fifteen views, all available choices at six representative sizes with comfortable spacing, and every supported grid size (2–12 columns by 2–16 rows) at three viewport widths: **495 size/window combinations**. It also checks real card-to-project navigation, completion and failed completion, missing Done columns, partial data, retry, deleted project preferences, filters, pagination, subtasks, archived-card exclusion, keyboard access, persisted layouts, window-size fallback, bounded concurrent reads, and date arithmetic across daylight saving.

Representative defaults at a 1440px fixture viewport:

| Tile size | Automatic view |
| --- | --- |
| 2×2 | At a glance |
| 3×3 | Next actions |
| 4×4 | Task list |
| 8×5 | Mini Kanban |
| 4×9 | Project progress |
| 8×9 | Project dashboard |

All fifteen choices and their intended uses:

| View | Content and behavior |
| --- | --- |
| At a glance | Open and overdue counts; extremely narrow tiles prioritise the overdue count. |
| Next actions | Open cards ordered by overdue, today, high priority, upcoming, then other work. |
| Task list | Cards in the configured order, with optional completed work. |
| Deadlines | All overdue cards plus deadlines in the selected 7/14/30/90-day window, sorted by date. |
| High priority | Open high-priority cards. |
| Without deadlines | Open cards without a due date, including cards with only a start date. |
| Overall progress | Completion percentage, open and overdue counts, estimated hours and missing estimates. |
| Project progress | Per-project progress, ordered by overdue count, then project order. |
| Project cards | A paginated portfolio grid with progress, estimates and undated work. |
| Workflow load | Custom columns, full active-card counts and configured card limits. |
| Mini Kanban | Real columns, paginated horizontally; cards paginate within lanes without scrolling. |
| Deadline timeline | Fitted date range, paginated task rows, older overdue work pinned visibly to the range start. |
| Label breakdown | Open-card counts grouped by label name, with an unlabelled group; click to filter the task list. |
| Recent activity | Latest 300 changes per project, filtered to matching active cards. |
| Project dashboard | Progress, next actions, per-project progress and workflow-limit indicators. |

Settings are independent for each grid size: view, project scope, sort, density, deadline range, priority and label filters, completed cards, subtasks and metadata visibility. The former view resumes after a narrow-window fallback. Reset clears only the current size's preferences.

Counting rules are intentional: archived cards are excluded; subtasks are excluded by default; progress always includes matching completed cards; attention and label views show open work. Full-column counts drive card-limit warnings even when tile filters hide cards. Labels with the same name across projects share a group, and a card with multiple labels contributes to multiple groups. Estimate totals are sums of included card estimates, not a capacity forecast; including parent and child estimates can count overlapping work. Partial load failures are marked explicitly and can be retried.

The summary reads full active boards, avoiding the old eight-card summary limit. At most four project reads run concurrently. The title and body share one snapshot, activity is loaded only when selected, and board mutations refresh an active overview. The shared `TileDisplayMenu` handles pointer positioning, focus restoration, keyboard navigation and viewport constraints for both areas.
