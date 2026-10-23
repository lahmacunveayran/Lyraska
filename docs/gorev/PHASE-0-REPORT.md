# Phase 0 report: independent verification of Lyraska 0.0.50

Date: 20 Oct 2026 · Method: fresh code reading of the 0.0.50 sources, Node runs of the pure-TS modules, a Python copy of
the limiter · No product code or tests were changed.

## 1. What was and was not possible

- Possible: reading and grepping every register item in the real code, running `drop.ts` and `queue.ts` in Node,
  re-running the limiter experiments, checking CI and config files.
- Not possible: any of the 14 gates (no Rust toolchain, no `node_modules`, no network; see `GATES.md`). Nothing about
  runtime behavior on a real device was verified. All "verified" below means "confirmed in the code", except where a
  Node or Python run is named.

## 2. Result

36 register entries: **19 verified, 4 refuted, 7 awaiting the owner, 6 not re-verified** (`FINDINGS.json`).

Timeline fact: 0.0.50 contains audit-fix PRs 1–5 plus a docs-only PR (DENETIM-2). DENETIM-2's "open" statuses therefore
describe 0.0.50 itself, and the 16 Oct baseline was the right starting point.

### Confirmed at 0.0.50 (bugs)

| Code             | Finding                                                   | Evidence                                                        |
| ---------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| KUT-01           | Existing-but-empty/partial source deletes tracks          | `scan.rs:235`                                                   |
| KUT-05, KUT-07   | System folders scanned; missing tests                     | `scan.rs` (no skip), tests lines 341/400/437                    |
| SES-02 (+KUT-08) | Blocking `load` under the player lock in an async command | `commands.rs` `open_track`; `spawn_blocking` only at :498, :626 |
| SES-01           | Default device chosen once, no change handling            | `wasapi.rs:88-93`, zero notification hits                       |
| MAT-01           | Sample-peak limiter                                       | `limiter.rs:80`; Python: +3.13 and +1.81 → +1.42 dBTP           |
| YAY-09           | Skipped device check passes green                         | `ci.yml:203-205`, `ses_denemesi.rs:34-39`                       |
| SES-05           | webm/mka/caf accepted, no Opus decoder                    | `decode.rs:25-28`, `:89`                                        |
| N1               | Failed open silences the playing song                     | `player.rs` `restart`                                           |
| N2               | `failed` scan count never shown                           | `scan.rs:207`, `service.rs:267-272`                             |
| N3               | "Added" counts the source                                 | Node run                                                        |
| N4               | One source per file                                       | `useLibrary.ts:156`, `service.rs:150-179`                       |
| N5               | Unbounded chip list                                       | `global.css:1945-1952`                                          |
| N6               | Dropped queue stalls on a bad first song                  | `usePlayback.ts:49,57`, `PlayerScreen.tsx:131-134`              |
| N7               | Unreadable files retried every scan (locked by a test)    | `scan.rs:341-349`                                               |
| N8               | O(N²) drop handling (not measured)                        | `service.rs:150-179`                                            |
| N11              | "Bit-perfect" ignores the 10 ms start ramp                | `render.rs:45,88,186-191`                                       |
| N12              | Skipped corrupt packets invisible                         | `decode.rs:267`                                                 |
| E1               | One devlog link uses another account name                 | `docs/devlog/2026-10-15-2.md:42`                                |

## 3. Corrections to my earlier claims

1. **KUT-01's trigger is narrower than I wrote.** "Drive unplugged" is already safe: `scan.rs:141-143` returns
   `FolderMissing` when the root is missing, and a test covers it (`scan.rs:437-440`). The real risk is a root that
   exists but returns an empty or partial listing without errors. Phase 1 tests should target that case.
2. **N9 was overstated.** `addFiles` showing only the last problem is deliberate (comment at `useLibrary.ts:155`), and
   `queueFrom`'s repeated-path case is unreachable in practice (library paths are unique). Both are now refuted as bugs.
   What remains of N9 is two owner questions.
3. **N7 is intentional behavior,** asserted by a test. Changing it means a deliberate test change, which the owner must
   know about (CLAUDE.md: never loosen tests silently).
4. Dither and limiter drift stay refuted (the dither refutation rests on `render.rs:186-191`; the drift result is from my
   earlier run and was not repeated).
5. About the language point: Anthropic's published table puts major languages at roughly 92–98% of English performance.
   I could not find a Turkish figure in the pages I read, so I cannot give the Turkish number. Working in English is a
   cheap precaution, and the code, tools and docs I worked from were English-leaning anyway.

## 4. Not re-verified in this pass

MAT-03, MAT-08, ARA-01/03/04 and the DENETIM-2 §5.2 "later" list. HE-AAC support. Real-device behavior of anything.
The presence of the limiter inside `write_frame` was not re-read (earlier pass only).

## 5. Decisions needed from the owner

1. **Opus:** (a) honest "not supported" messages now, (b) real Opus support. Recommendation: (a) now, (b) once approved.
   Note: this sandbox has ffmpeg with libopus, so test files can be generated here; the owner's environment is unknown.
2. **MMCSS (audio-thread priority, needs `unsafe`):** the two documents disagree. Recommendation: not for now.
3. **Corrupt database (KUT-02):** set it aside and rebuild? Recommendation: yes.
4. **"Open file" vs dragging (N9a) and folder drop (N9b):** keep behavior and clarify messages? Recommendation: yes.
5. **Seeking (N10):** in-session seek is a design job. Recommendation: decide after Phase 4.
6. **UI drawing performance (ARA-01):** with Phase 4 or after? Recommendation: after.
7. **When should Part II (Auto-DJ) start?** Recommendation: after Phase 3, in a separate session.

## 6. Next step

Phase 1 is KUT-01 (corrected scope) and N1. Both need Rust tests, so run them where `cargo` works (Claude Code on the
owner's machine). I can draft the patches here, but I cannot compile or test them.
