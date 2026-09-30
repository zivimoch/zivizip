# Verification

## Automated coverage

Verified locally on 2026-09-30:

| Check               | Result                | Coverage                                                                                                                                                                                |
| ------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Svelte/TypeScript   | No errors or warnings | Types and component diagnostics                                                                                                                                                         |
| Frontend unit tests | 16 passed             | Persistence, conflicts, backup validation, storage isolation, stale-response protection, empty HTTP responses, Draw geometry, rotation, image documents and media backup validation     |
| Rust unit tests     | 5 passed              | Conflicts, recovery after deletion, input, Draw and Text document validation                                                                                                            |
| Browser scenarios   | 21 passed             | Guest onboarding, languages, mobile, account isolation, copying, SSE, offline, logout, browser restart, Draw transforms/export, image anchoring/controls/sync, touch resize/move/delete |
| Container restart   | Passed                | Notes and sessions survive service restart                                                                                                                                              |

The complete browser suite passed with one worker; an earlier parallel run had one intermittent workspace-startup timeout. Browser checks use Chrome, a desktop viewport, and a 390px mobile viewport. The persistent-session test closes and reopens a browser process. Draw tests additionally dispatch Chrome touch events for drawing, resizing, double-tap text and pinch zoom. PNG output is checked for a transparent corner pixel. This is not physical-phone testing or a production load test.

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

## Scope

Rich formatting beyond automatic lists, Tasks, Finance, Goals, Web Push, prototype-data migration, and deployment remain outside the implemented Notes/account flow. Account backup import can complete partially if a request fails; it is not an atomic server transaction. Large collections and real-device performance need separate verification.
