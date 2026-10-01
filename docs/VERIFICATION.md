# Verification

## Automated coverage

Verified locally on 2026-10-01:

| Check               | Result                | Coverage                                                                                                                                                                     |
| ------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Svelte/TypeScript   | No errors or warnings | Types and component diagnostics                                                                                                                                              |
| Frontend unit tests | 20 passed             | Notes/media persistence, conflicts and backups; Draw geometry; task validation, ordering, archives, legacy migration, stale revisions and workspace isolation                |
| Rust unit tests     | 6 passed              | Notes conflicts and recovery; Draw/Text validation; task calendar validation and atomic revision checks                                                                      |
| Browser scenarios   | 25 passed             | Notes/Draw/images/lists; account/offline flows; Tasks modal, dates, amount, group drag, archive/restore, mobile touch, list transfer, backup, SSE and explicit guest copying |
| Container restart   | Passed                | Notes and sessions survive service restart                                                                                                                                   |

The complete browser suite passed with one worker. Repeated local runs can exhaust the 15-minute login-attempt limit; restart the local API between repeated acceptance runs or allow that window to expire. Do not disable the limit for deployment. Browser checks use Chrome, a desktop viewport, and a 390px mobile viewport. The persistent-session test closes and reopens a browser process. Touch tests dispatch Chrome touch events for Draw and Tasks. PNG output is checked for a transparent corner pixel. This is not physical-phone testing or a production load test.

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

14. Add tasks through `+`, including an optional due date and amount. Double-click or press F2 to edit; delete through the modal and confirm. Dated tasks remain above undated tasks. Shift-select several rows and drag them together; click outside to clear selection.
15. Complete a task and confirm its text stays unchanged. Archive completed tasks, open the archive and restore one. Verify active totals exclude archived tasks.
16. Drag a list line or selected list lines from Notes into Tasks. Verify one task per nonempty label and unchanged source text. Export a backup and confirm active/archived tasks are included.
17. Test guest tasks offline and account tasks from another authenticated browser. Verify account writes are disabled offline, stale revisions are rejected, logout restores the guest list and explicit workspace copy transfers guest tasks.

## Scope

Rich formatting beyond automatic lists, Finance, Goals, shared Tasks/Finance entry, Web Push, prototype-data migration, and deployment remain outside the implemented flow. Task amounts currently remain metadata. Account backup import can complete partially if a request fails; it is not an atomic server transaction. Large collections and real-device performance need separate verification.

Workspace styling was compared with the prototype at 1864×1000 and 390×844 viewports. Tabs start at the workspace top; account status stays in the sidebar. Finance remains a labeled preview.
