# Verification

## Automated coverage

Verified locally on 2026-10-06:

| Check               | Result                | Coverage                                                                                                                                                                                  |
| ------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Svelte/TypeScript   | No errors or warnings | Types and component diagnostics                                                                                                                                                           |
| Frontend unit tests | 29 passed             | Notes/media persistence, conflicts and backups; Draw geometry; task validation, chronological ordering, archives, stale revisions, late-response cache protection and workspace isolation |
| Rust unit tests     | 8 passed              | Notes conflicts and recovery; Draw/Text validation; task calendar validation and atomic revision checks                                                                                   |
| Browser scenarios   | 34 passed             | Notes/Draw/images/lists; native list selection and drag feedback; Tasks bulk deletion, dates, archives, mobile touch, backup, SSE, guest copying and stable controls during note edits    |
| Container restart   | Passed                | Notes and sessions survive service restart                                                                                                                                                |

The browser scenarios were checked with one worker, including targeted reruns after correcting field selectors and waiting for Draw selection rendering. Repeated local runs can exhaust the 15-minute login-attempt limit; restart the local API between repeated acceptance runs or allow that window to expire. Do not disable the limit for deployment. Browser checks use Chrome, a desktop viewport, and a 390px mobile viewport. The persistent-session test closes and reopens a browser process. Touch tests dispatch Chrome touch events for Draw and Tasks. PNG output is checked for a transparent corner pixel. This is not physical-phone or physical-touchpad testing, or a production load test.

## Manual acceptance

1. Open the preview in a fresh browser profile and acknowledge the guest explanation.
2. Create a guest note; reload and confirm it persists. Close its tab and reopen it through Detail → Notes.
3. Log in and choose the account workspace. Confirm the guest note was not uploaded.
4. Create an account note; open it in a second authenticated profile and verify updates appear.
5. After the PWA is cached, disconnect. Account notes are read-only; guest notes remain editable offline.
6. Reconnect and log out. The guest workspace returns and account cache is removed.
7. Sign in again and explicitly copy guest notes. Confirm the server copy and local original both remain.
8. Submit a registration-interest request; verify receipt without account creation. Inspect it as the owner.

9. Create a Draw note. Add shapes and text, marquee-select several objects, rotate, resize, and move an arrow endpoint. Delete selected objects without confirmation and undo the change.
10. Partially erase a shape, reload, and export a transparent PNG. Repeat with an account and verify changes from another session.

11. Paste an image between paragraphs. Type above and below it, drag it upward, resize both right corners, rotate, delete and undo. Verify Ctrl/Cmd+A includes images and the backup contains their media. After moving an image, verify its former space is editable and the text below stays at the same position. Backspace from the paragraph below and Delete from the paragraph above remove an adjacent image; Undo restores it.
12. Open an image note from another authenticated browser and then offline after caching it. Verify mobile image movement, resize and deletion.

13. Type `- ` or `1. ` to start a list. Verify Enter continuation, empty-item exit, Tab/Shift+Tab nesting, alternating letters/numbers, and persistence after reload. Confirm Add image remains in the breadcrumb row.

14. Add tasks through `+`, including an optional due date and amount. Double-click or press F2 to edit. Dates sort earliest first, above undated tasks; drag reorders within the same date or the undated group. Shift-select several rows and drag them together, or press Delete/use the selected-items Delete button and confirm to remove them together. Click outside to clear selection.
15. Complete a task and confirm its text stays unchanged. Archive completed tasks, open the archive and restore one. Verify active totals exclude archived tasks.
16. Double-click and extend a text selection in a list without moving its content. Drag selected list text from Notes into Tasks. Verify the dashed drop target and cyan hover feedback, one task per nonempty label, and unchanged source text. Export a backup and confirm active/archived tasks are included. Type in an account note while watching Tasks: background synchronization must not disable or replace unchanged task rows.
17. Test guest tasks offline and account tasks from another authenticated browser. Verify account writes are disabled offline, stale revisions are rejected, logout restores the guest list and explicit workspace copy transfers guest tasks.

18. Add income and expenses through Finance, change the month and toggle date/category grouping. Edit an amount, cancel deletion and then confirm it. Check recalculated totals and category suggestions.
19. Test guest transactions offline, backup/import, mobile forms and Indonesian labels. In two account sessions, verify live updates, stale-write rejection with retained form values, offline reading, logout isolation and explicit guest copying.

## Scope

Web Push and prototype-data migration remain outside the implemented flow. Task amounts currently remain metadata. Account backup import can complete partially if a request fails; it is not an atomic server transaction. Large collections and real-device performance need separate verification.

Workspace styling was compared with the prototype at 1864×1000 and 390×844 viewports. Tabs start at the workspace top; account status stays in the sidebar. Finance transactions were also checked at 1600×1000 and 390×844; the ledger and monthly planning have automated browser coverage. Planning checks cover category budgets, notes, inclusion, copying months, backups, and account synchronization. Sidebar checks cover expanded hierarchy and collapsed icon alignment.

The October 6 production container build reused the successful Rust test layer; frontend diagnostics, 29 unit tests and all 34 browser scenarios were rerun. Deployment configuration passed Compose validation, Caddy validation and Nginx configuration checks.

## HTTPS deployment verification — 2026-10-07

Release `1934dfa` passed HTTPS certificate validation, HTTP-to-HTTPS redirection, API health, anonymous access rejection, owner login and Secure/HttpOnly/SameSite cookie checks. A temporary note was created, updated, read and deleted. Authenticated Notes, Tasks, Finance and planning reads and the SSE refresh stream passed.

A fresh Chrome profile at a 390px viewport verified guest creation, persistence, service-worker registration, offline reload and offline editing on the production origin. An authenticated browser loaded the workspace. A consistent SQLite snapshot passed `quick_check` and was copied off the server. These checks do not establish physical-device performance, load capacity, scheduled backup coverage or automated CI/CD.

## Finance interaction update — 2026-10-09

Frontend diagnostics passed without errors or warnings; 32 frontend unit tests and 9 Rust tests passed. The final targeted browser run passed 13 Finance, planning and Tasks scenarios. Nine image/list editor scenarios also passed after link rendering changed. Coverage includes optional transaction descriptions, field-width suggestions, display currency formatting, daily totals, equal-height planning cards and safe clickable web links. Mobile checks use simulated Chrome viewports and touch events, not physical devices.

## Finance planning and form refinements — 2026-10-15

Frontend diagnostics, 33 unit tests and the production build passed. Twenty targeted browser scenarios passed across Notes, Tasks, Finance and monthly planning, including nested marker alignment, first-letter capitalization, unchanged category input, mobile header layout, and negative remaining funds. Planning checks cover excluded categories, copying months, account conflicts and offline data. Mobile checks use Chromium viewports, not physical devices. Legacy task amounts and opening-balance data remain stored; their removed controls do not erase existing records.

## Collapsible workspace panels and text tools — 2026-10-15

Frontend diagnostics, 33 unit tests and the production build passed. Sixteen targeted browser scenarios passed, followed by four focused checks after adding persisted expanded dimensions. Coverage includes the four-state panel cycle, dragging to collapsed edges, restoring custom dimensions after reload, mobile navigation, toolbar icons and formatting, and unexpected expense categories appearing without a pre-created monthly plan. Automatic categories aggregate case-insensitive matches and survive reload. Desktop screenshots and a 390px mobile viewport were inspected; physical-device testing remains separate.

## Automatic monthly budgets — 2026-10-15

Frontend diagnostics, 35 unit tests and the production build passed. All eleven targeted browser scenarios passed across planning, Tasks and panel controls after correcting persistence of derived budget values. Automatic monthly budgets follow category actuals; explicit nonzero budgets remain unchanged. Derived amounts are normalized before persistence, preserving the API contract and keeping notes, exclusion and reordering compatible. Regression coverage includes transaction edits/removal and empty manually planned categories. Tasks archive access remains in the header, with no footer consuming list space.

## Financial overview summaries — 2026-10-16

Frontend diagnostics completed without warnings; 35 unit tests, the build and six planning browser scenarios passed. Planned remaining has a distinct visual treatment, while actual remaining uses recorded monthly income minus recorded monthly expenses. Status separates negative cash balance from over-budget spending. Month cards include income, expenses, planned/actual remainder and transaction count; desktop screenshots and a 390px viewport were checked. Repeated subtotal lines and percentage labels were removed without changing stored plans or transactions.

## Goals and remaining alignment — 2026-10-16

Goals support title/description editing, bundled cover choices, exclusive completed-task and expense assignment, and aggregate progress. Guest storage is local; account state uses authenticated, revision-checked API writes and SSE refresh. Backup v7 preserves assignments while remapping imported source IDs; earlier backup versions remain accepted. Deleting a goal preserves its source records. Income and incomplete tasks do not contribute to progress.

37 frontend unit tests and 11 Rust tests passed. Browser checks cover drag assignment, mobile assignment controls, persisted covers, offline guest editing, source restoration on goal deletion, account synchronization, anonymous access rejection and stale writes. Six Finance planning regressions passed. Desktop and 390px screenshots were inspected; these are not physical-device tests. The remaining card uses equal columns and top-aligned labels, with a solid centered divider.

## Goal contribution drag and growth — 2026-10-17

Goals now allow the same source in multiple goals, while rejecting duplicate references within one goal. Backup tests verify shared references survive ID remapping. Cards expose a bounded, scrollable contribution list with ellipsis, and dragging into Unassigned removes only the originating goal link. Native drag and Chrome touch-event tests cover assignment and removal; a brief hold starts touch dragging without blocking ordinary scrolling. Keyboard pickup/drop and cancellation are available without adding an assignment menu. Account synchronization and guest copying remain covered.

The cover selector and bundled photographs were replaced with a procedural SVG garden driven by contribution count rather than expense amount. Legacy cover IDs remain valid data. Frontend diagnostics reported no errors or warnings; 37 unit tests and 11 Rust tests passed. Browser coverage includes native sharing, duplicate prevention, touch drag, persistence, authentication, account synchronization and explicit guest copying. Physical-phone testing remains separate.

## Procedural goal worlds — 2026-10-17

Goal worlds replace the fixed tree stages with seeded island terrain, settlements and successive regions. New optional seed/completion fields retain compatibility with older goal documents and backup v7. Imports retain the original seed while remapping IDs. Manual completion is reversible and independent of contributions.

Unit coverage checks deterministic geometry, distinct seeds, per-contribution changes, regeneration of earlier regions, bounded scenes at one million points, legacy decoding and backup preservation. Browser coverage includes completion/reopening, persistence, Explore/focus/Escape, and the existing drag, touch, account synchronization and offline flows. The generator's large-count tests do not claim million-record storage capacity or physical-device performance.

Local validation passed: Svelte check with no errors/warnings, 39 frontend unit tests, 12 Rust tests, production Docker builds and all six Goals browser scenarios. Desktop and 390px mobile screenshots were inspected. Touch checks use Chrome emulation; physical-phone testing remains separate.

## Goal DNA and contribution layout — 2026-10-17

World generator v2 adds Island, Garden and Space themes while retaining v1 decoding/rendering. Goal documents accept optional theme, generator version and mixed contribution-order keys. Both API and browser validation reject invalid themes, unsupported versions, duplicate order keys and keys outside the goal's source references. Backup remapping preserves DNA and maps ordering keys to imported source IDs.

Coverage includes species/climate diversity, deterministic coordinate lookup, shared object coordinates across detail levels, latest-step visibility, bounded object generation through the safe-integer range, ordering, backup preservation, theme form selection, completion landmarks and offscreen renderer removal. Large-count generator support does not raise workspace storage limits. Browser touch checks remain emulated rather than physical-device measurements.

Local checks passed: Svelte validation without errors or warnings, 41 frontend unit tests, 12 Rust tests, production builds and seven Goals browser scenarios. Screenshots were inspected at desktop and 390px mobile widths. List bounds are checked against the card, and native drag targets the visible drop strip when taller cards require page scrolling.

## Link brand identity — 2026-10-17

The sidebar and shared-note header use the Link SVG monogram. Desktop and mobile
wordmarks share section-heading styling and an accent terminal dot. PWA launcher
icons and the Apple touch icon are generated from the same geometry.

Formatting, Svelte checks, all 41 frontend unit tests, production build and the
existing sidebar browser scenario passed. Desktop (1600px) and mobile (390px)
screenshots were inspected. Browser checks confirmed 192px/512px manifest icons,
a 180px Apple touch icon and offline availability of all five brand assets through
the service worker. Installed launcher refresh on physical devices was not tested.

## Compact Goals and touch controls — 2026-10-17

Goals use bounded card heights and scrollable contribution lists. Touch gestures
start immediately from a 44px grip with `touch-action: none`; the item body keeps
native scrolling. The edit dialog exposes Delete goal with source-preservation
confirmation and a sticky action footer.

Local Docker checks passed with no Svelte diagnostics and all 41 frontend unit
tests. All eight Goals browser scenarios passed, including multi-step touch drag,
cancellation, return to Unassigned and native item-body scrolling at 390×667 and
390×844. Deletion cancellation and completion verify unchanged Tasks and Finance
snapshots. Desktop/mobile screenshots were inspected. Tests emulate Chrome touch;
physical-device verification remains separate.

## Goal completion and reversible Unassigned tray — 2026-10-18

Card completion is a persisted checkbox control. Unassigned excludes active
completed tasks, shows two rows in one horizontal scroller, and supports Clear
and individual/all restoration through Set aside. Set aside shares Goals revision
checks, account synchronization and backup v8 with source-ID remapping. Earlier
backup versions remain importable. Touch uses a brief hold on the item body with
non-passive touch-move handling; quick swipes retain native scrolling.

Local production builds passed Svelte diagnostics, 42 frontend unit tests and
Rust tests. All nine Goals browser scenarios passed, including the extended
account synchronization/read-only scenario. Coverage includes tray persistence,
restore, archived-only eligibility, completion toggling, two-row scroll alignment,
backup remapping with no goals, and touch drag/cancel/return at 390×667 and 390×844.
Screenshots were inspected; touch remains browser-emulated, not physical-device
verification.

All 22 Tasks, Finance, Planning and image browser regressions passed. The account
Tasks scenario was rerun after clearing the local test login rate limit.

## Finance plan controls — 2026-10-18

Local preview checks passed: Svelte/TypeScript with no diagnostics, 42 unit tests, the production frontend image build, nine Goals browser scenarios, six existing planning scenarios, and the new Finance plan-controls regression. The latter verifies the current-month ledger default, independence from opened plans, reload behavior, cancellation, tab closing without deletion, and plan deletion preserving transactions. It is included in Jenkins browser verification. Goals coverage includes desktop and simulated mobile touch; physical-device testing remains separate.

## To do overview and brand refinement — 2026-10-18

Svelte/TypeScript checks, 44 unit tests and the production frontend image build passed. Five existing task browser scenarios and 13 overview/Goals/sidebar/brand scenarios passed locally. The overview tests cover empty state, live completion counts, deadline buckets, archived completions, restoring tasks and responsive layouts at 1440px and 390px. Unit tests check calendar boundaries and exclude completed tasks from outstanding workload. Goal tests verify the edit form has no completion checkbox while card completion still works. Versioned favicon, PWA and Apple icons decode successfully while offline. Desktop/mobile screenshots and the generated 192px icon were inspected; physical-device launcher refresh remains unverified. The overview and brand regressions are included in Jenkins.

## Draw clipboard and images — 2026-10-18

Svelte/TypeScript checks, 47 frontend unit tests, 14 Rust tests and local frontend/API image builds passed. Twenty Draw/Text-image/shared browser scenarios passed. The three focused clipboard scenarios also passed after extending shared-image upload coverage. Checks cover editable object copying between notes, image paste, undo/redo, PNG pixel content, attachment backup, offline reload, owner persistence, shared media access, read-only links and the mobile file-picker alternative. Storage tests round-trip Draw attachments and reject backups missing their bytes. These clipboard browser scenarios are included in Jenkins. Clipboard events and mobile viewport/file selection are automated; physical-device clipboard permissions remain browser-dependent.
