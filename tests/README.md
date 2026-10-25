# Daily Plan overview checks

## Activity bar ordering

Run `node tests/activity-order.mjs` against Vite on port 1427 with the Playwright setup below. Checks cover pointer and keyboard sorting, local persistence, Escape cancellation, normal clicks and context menus, disabled/re-enabled extensions, corrupt preferences, and fixed shell/required icons. Only switchable area icons can move. Order is stored locally under `axiom.activityOrder.v1`; it does not change overview tile positions or the extension registry.

## University overview checks

Run `node tests/uni-overview-layout.mjs` against Vite on port 1427 using the same Playwright setup. `uni-overview-preview.html` renders the real overview, display menu, resizing and navigation with in-memory responses; it never reads the desktop database. `UNI_SKIP_MATRIX=1` runs the behavior and boundary checks without the full size sweep; `UNI_ONLY_MATRIX=1` runs just the 660 combinations. `node tests/uni-overview-boundaries.mjs` separately sweeps all twelve views at their minimum widths and the heading/footer height boundaries, with long text across all twenty font/theme variants.

University has twelve fitted views: At a glance, Module strip, Term pulse, Module list, Module cards, Catch up, Coming up, Teaching term, Study progress, Needs attention, Coming week and University dashboard. Auto adapts to measured tile content space. View, density, module order, module filter and detail visibility are saved independently for each grid size. A saved view temporarily falls back when the window narrows and resumes when it fits again.

The suite checks all 165 supported sizes at four window widths (**660 size/window combinations**), exact view minima, every available view at six sizes with comfortable density, and compact/expanded layouts across all twenty theme variants. It also checks actual content/button bounds, pagination, shrinking data, empty terms/modules, long unbroken names, missing lectures, no backlog, dates outside term, filters and sorting, safe weighted progress, caught-up mutations and failures, duplicate-submit protection, deep links, setup actions, keyboard controls, reload persistence, retry, stale responses and corrupt preferences. Screenshots go to ignored `.qa.local`.

Counts and progress follow the selected module filter. Catch-up progress is the sum of caught-up lectures divided by all lectures in those modules. It is separate from teaching weeks elapsed. Behind stays longest overdue first; Coming up covers the next seven days. Lecture rows open their module, and sufficiently wide catch-up lists can mark a lecture caught up. Sidebar/main-view counts remain unfiltered. The summary refreshes after local edits, sync, focus and once a minute.

## Reading overview checks

Run `node tests/reading-overview-layout.mjs` against Vite on port 1427, using the `PLAYWRIGHT_MODULE` setup below. `reading-overview-preview.html` renders the real Reading summary, display menu, resize context and navigation state with in-memory API responses; it never touches the desktop database.

The suite covers all twelve views, all 165 grid sizes at four window widths (**660 size/window combinations**), exact view minima and layout breakpoints, compact and expanded tiles across all twenty theme variants, and every available view at six sizes with comfortable density. It checks actual content and button bounds, pagination, saved preferences per size, narrow-window fallback and restoration, keyboard controls, book/shelf/goal/add navigation, empty and one-book libraries, long unbroken titles, audio and ebook progress, missing covers and totals, unset and exceeded goals, load failures and retry, partial shelves, lazy library/statistics reads, stale responses and corrupt saved preferences. Screenshots go to ignored `.qa.local`.

Auto uses measured content space after the tile header and padding. It chooses a horizontal reading strip for wide shallow tiles, a compact cover shelf for narrow tall tiles, a featured current book for compact tiles, a reading list or cover shelf for medium tiles, and a dashboard for larger tiles. The display menu can select a specific view, list density, reading order and cover visibility independently for each grid size. Views that stop fitting temporarily fall back to Auto and resume when space returns.

## Overview visibility and text hierarchy checks

Run `node tests/overview-visibility.mjs` against Vite on port 1427 with the Playwright setup below. The fixture uses the real shell, installation and visibility hooks with inert summaries. It checks hide/unhide from overview tiles, both left navigation lists and installed extension cards; persistence; preserved installation, tile size and position; accessible hidden areas; restore-all; keyboard navigation and focus; viewport bounds; invalid preferences; and extension text fitting across all theme fonts. Visibility is a local display preference, saved independently of installation.

## Shell motion checks

Run `node tests/shell-motion.mjs` against Vite on port 1427 with the same Playwright setup. It checks actual tile displacement animations, continuity when a collision reverses before settling, immediate movement of the grabbed tile, cleanup and live reduced-motion changes. Sidebar checks cover opening/closing, retained exit content, focus restoration, inert closed content, rapid reversals, panel switches and narrow windows, plus menu motion and reduced-motion behavior. Screenshots go to ignored `.qa.local`.

Motion uses 120ms hover feedback, 160ms menu entrances and 240ms layout transitions. Displaced tiles use translation without scaling their content. The operating system's reduced-motion preference disables these transitions.

## Overview movement checks

Run `node tests/overview-movement.mjs` against Vite on port 1427 with the Playwright setup below. The isolated fixture renders the real Overview and persistence hooks with inert summaries. Checks cover mouse/touch pointer handling, keyboard movement, saved grid coordinates, displaced tiles, Escape/pointer cancellation, cleanup on unmount, edge scrolling, resize at the grid boundary, preserved summary state, reinstalling areas, narrow windows and invalid saved settings.

Run `node tests/overview-drag-motion.mjs` for continuous pointer tracking, snap-boundary resistance, landing animation, picking up a tile mid-animation, single-frame releases, click tolerance, blur/window/sidebar cancellation, unchanged content dimensions across fifteen size/window combinations, and reduced motion. The dragged tile follows the pointer with frame-batched translation; a dashed outline marks its snapped destination. Nearby tiles gently move out of the way and return when the drag reverses. Previews remain temporary until release, and Escape restores the saved arrangement. Edge scrolling accelerates gradually and uses elapsed time, so its speed is independent of the display refresh rate.

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

Journal and Notes responsive summaries: run `node tests/writing-overview-layout.mjs` with Vite on port 1427 and the same PLAYWRIGHT_MODULE setup. The isolated writing fixture checks 1,512 tile-size, window-width and content-state combinations, plus pagination and navigation. No desktop data is used.

## Production colours

Run `npm run build`, then `node tests/production-colours.mjs` with the Playwright setup above. It checks the built CSS and the real theme application function, including light/dark colours and theme switching. This catches colour rules that work in development but break during production CSS optimization.
