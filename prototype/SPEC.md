# Product behavior

This document describes the target interaction model. The [verification scope](../docs/VERIFICATION.md) distinguishes implemented application features from prototype-only behavior.

## Workspace and navigation

- Desktop sidebar starts as an icon rail and expands on hover or keyboard focus. Detail starts collapsed. Space between the logo and Main matches the navigation rhythm.
- Mobile sidebar fills the screen width and has a back/close control. Main opens without an authentication redirect.
- Desktop Main places Notes on the left and Tasks/Finance on the right. Default width is 75%/25%, subject to minimum widths. Both dividers are draggable, persist their positions, and reset on double-click.
- Mobile uses section navigation, a compact 48px header, and reduced spacing beneath tabs. Note tabs remain compact: 46px desktop, 49px mobile in the prototype.
- English is the default interface language. Bahasa Indonesia is selectable and persisted. Never translate user content automatically.

## Note tabs and metadata

- Clicking anywhere on a tab activates it, except its independent close control. Closing hides the tab without deleting the note. Detail → Notes lists notes and reopens closed tabs; no separate All Notes button belongs in the tab bar.
- Tabs support mouse/touch reordering with persistent order. Double-click/double-tap and F2 open editing. Long press does not open editing.
- New and edit dialogs share icon, name and category fields. New notes also choose Text or Draw; existing note types are not converted during edit.
- Focus the name field immediately. Defaults are sequential `Note1`, `Note2`, etc., category `General`/`Umum`, and empty content.
- Title-case names and categories as typed, preserving caret position and composition input. Categories accept free text with suggestions from history.
- Editing offers Update and Delete; deletion requires confirmation.
- The note header is only `Category / Note name`. Omit large titles, dates, field labels, separate rename controls and local-save labels.
- The editor fills available height and accepts native caret placement throughout. Focus adds no colored side line or canvas border.

## Text and images

- Preserve normal caret placement, selection, typing, Enter and paste behavior. Image controls must not block text editing.
- Pasted images anchor at the caret in their own flow block and place the next typing position below the image. Inserting or wrapping lines above moves the image vertically without horizontal drift.
- Images render behind text and can be dragged independently. Drag offsets preserve anchoring; resizing updates reserved space. After dragging an image upward, editing below its displayed position must not move it through its former anchor.
- Paragraph spacing remains consistent before and after images. Ordinary text deletion preserves image anchors.
- Selected images expose four circular resize handles, rotation above, and deletion below. All controls remain reachable above the editor hit area. Right-side resizing must work without requiring diagonal movement.
- Delete/Backspace removes selected images. Ctrl/Cmd+A in the editor includes text and images, and deletion removes the complete selection.
- Images, transforms and content persist. New Draw exports have transparent backgrounds; existing opaque screenshots retain their original pixels.
- Typing `- `, `* ` or `• ` creates a bullet list; `1. ` or `1) ` creates numbering. Enter continues populated items and exits empty items to a normal paragraph. Tab/Shift+Tab nests/outdents; no list toolbar is required.
- Selected list items can be dragged from their text or marker into Tasks. Create one task per item, including nested labels without duplicating descendant text. Preserve source note content.

## Draw

- Use an infinite canvas with pan/zoom and the same plain background as Text. No dot grid or focus border.
- Tool order: Select, Pan, Pen, Text, Eraser, separator, then individual shape tools.
- Shapes: rectangle, ellipse, parallelogram, diamond, triangle, arrow. Support color, stroke width, undo/redo, image copy and PNG export.
- Double-click empty space creates inline text; double-click text edits it; double-click a shape edits its label. Do not use text-entry popups.
- Single-click selects. Marquee selection includes intersecting objects; Shift-click adds/removes objects. Move and delete selected groups together.
- Selected objects expose resize, rotate and delete controls. Outlines, handles and action icons rotate with objects; hit testing and resizing use rotated axes. Group rotation is supported.
- Arrows expose independent start/end handles instead of corner resizing. Either endpoint moves freely while the other stays fixed, including rotated arrows. Touch targets are enlarged.
- Shape labels interrupt outlines with transparent padding around every text line, including multiline labels and PNG exports.
- Eraser uses a circular cursor and removes touched parts of strokes/shapes rather than entire objects. Erased segments remain associated with transformed objects.
- Deletion through selection controls, toolbar or Delete/Backspace requires confirmation and remains undoable. Undo history lasts while the canvas is open.
- Shortcuts: S Select, H Pan, P Pen, T Text, R Rectangle, E Ellipse, A Arrow, X Eraser. Display hints; ignore tool shortcuts while typing. Ctrl/Cmd+A selects all canvas objects outside text/input editing.
- Mobile supports drawing, selection, moving, resizing, partial erasing, double-tap text, pinch/pan, zoom controls, Fit, Edit Text and Done. The toolbar has two horizontally scrollable rows: tools and options/actions. Export/file input provide alternatives to unavailable clipboard APIs.
- The application must store media according to guest/account boundaries with explicit limits. Prototype localStorage and large-scene performance are not production guarantees.

## Tasks

- Dated tasks always precede undated tasks. Drag rows directly to reorder within the dated/undated groups; undated rows cannot move above dated rows. No separate drag icon.
- Single-click selects; double-clicking the row or F2 edits. Completion controls act independently.
- Shift-click toggles multiple selection. Dragging a selected row moves the selected group while preserving relative order and date-group boundaries. Clicking an unselected row selects it alone; clicking outside clears selection.
- Selection highlight extends 12px left without moving text or completion controls.
- Completed text keeps its normal color with no strikethrough; the completion control indicates state.
- The target shared Tasks/Finance entry form includes description, category with history suggestions, date and amount. An amount associates the entry with Finance. This shared form is not yet implemented.

## Finance planning

- Detail → Finance uses a Main-like split: planning on the left, transaction ledger on the right, no Tasks panel. Income, recurring expenses and monthly expenses form adjacent cards. Narrow layouts scroll cards horizontally and place the ledger below.
- Keep opening, planned, projected and current balances above the cards. Each expense card shows remaining amount/percentage and a battery-style bar; low remaining budgets use amber and deficits use red. Overspent categories show their deficit.
- Plan rows display category, not a separate title. Each card has category search/free input, amount and Save at the bottom. Reject duplicate category/type/month budgets without clearing the form.
- Match realization by month, normalized category and income/expense type. Sum partial transactions and recalculate after transaction edits/deletes. Plans need no due or realization date.
- Projected balance uses the greater of budget or actual spending per category and includes unexpected expenses. Current balance uses recorded transactions. Disabled plan categories follow the exclusion rules below.
- A recorded expense without a matching recurring/monthly expense budget appears automatically in monthly expenses with zero budget. Aggregate matching transactions and avoid duplicates. Remove automatic rows when their source transactions disappear; assigning a positive budget makes a normal plan. Do not display an Unplanned badge.
- Each card shows fully realized category count / total categories. A positive actual total reaching budget counts as realized; zero-budget categories with actual spending count too. Partial realization does not.
- Rows support drag reordering, Shift-click group selection, outside-click deselection and persistent order. Double-click/F2 edits and offers Delete.
- Clicking a category opens its matching transactions with dates, total and empty state. Transactions can be edited; double-click retains budget editing. Drag/Shift interactions must not open dialogs.
- Category notes appear inline when present, or as a Note prompt when empty. Clicking opens an autofocused single-line input; Enter saves. Existing notes offer deletion of the note only. Existing multiline notes appear as one line during editing. Legacy card-level notes remain stored without arbitrary category assignment.
- A small neutral eye button includes/excludes categories, with accessible state and tooltips. Excluded rows remain editable/reorderable but do not contribute to plan/card sums, remaining bars, realized counts or planned/projected ending balances. Actual ledger balances and analysis still count their transactions. Do not reclassify them as unexpected expenses.
- Note and visibility controls do not start dragging or budget editing. The Note control sits close to the eye icon (3px gap).
- Card lists scroll independently above a maximum height of 420px desktop / 360px narrow, with sticky headers. Summaries and entry forms remain outside the scroll area.

## Finance tabs and copying

- A permanent, nonclosable Analysis tab shows monthly income/expense charts and opens month tabs. It uses a distinct teal background and extra right padding.
- Month tabs are content-sized, with calendar icons and adjacent close buttons. Closing does not delete plans. Labels and detail headings use localized month plus two-digit year, such as January 26.
- Create months explicitly from Analysis. Copy any source month's plans, preserving income/recurring expected amounts and setting one-time expense expectations to zero.
- Never copy transactions, realization state or opening balance. Skip duplicate budgets and preserve existing destination plans and transactions. Automatic zero-budget expense rows are not copied.
- Omit the generic Monthly Plan heading, introductory/projection paragraphs, and month picker/copy controls inside month detail.
- Demonstration data may populate only an unused month and must preserve existing records. Use fictitious categories/transactions rather than personal financial data.

## Goals

- Create, edit and delete goals with optional descriptions. Cards show aggregate completed-task count and total linked expenses, not growing assigned-item lists.
- Only completed tasks, including archived tasks, and expense transactions enter Unassigned. Income is excluded, including legacy income links.
- Dropping an item onto a goal assigns it exclusively and removes it from Unassigned without deleting its source. A per-item assignment control supports keyboard/touch access.
- Source edits/deletions update totals and remove stale links; tasks marked incomplete no longer count as complete. Deleting a goal returns assignments to the pool while preserving source records.
- Goal cards scroll horizontally above Unassigned on all screen sizes. Unassigned is a horizontal strip of draggable cards with source labels/amounts. Mobile supports swipe and scroll snapping.

## Accounts, offline and privacy

- Account control at lower left opens a login modal. There is no separate login/registration page and only one provisioned owner account.
- Register opens an email/message interest form; submission sends only those fields and does not create an account.
- First-visit guest onboarding explains browser-local storage, backup and the interest-form exception. Persist acknowledgement by browser/origin, never by IP.
- Normal browser/device restarts preserve login. Explicit logout, cookie deletion, expiry/revocation or credential changes can require authentication again.
- Guest notes remain editable offline. Account cache is separate and read-only offline, and is cleared on logout. Copying guest notes to the account requires explicit choice.
- Public pages may be indexed, but workspace contents must never be exposed for SEO.
