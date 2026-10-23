# GATES (Phase 0, 20 Oct 2026)

## Environment this run used

| Item           | Value                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| OS             | Linux 6.18 (sandbox)                                                                                                                |
| Node / Python  | v22.22.2 / 3.12.3                                                                                                                   |
| ffmpeg         | present; encoders `opus` and `libopus` available (useful for generating synthetic Opus test files in Phase 3, in this sandbox only) |
| Rust toolchain | **absent** (no `cargo`, no `rustc`)                                                                                                 |
| `node_modules` | **absent**; no network (installs impossible)                                                                                        |

## Gate status in this environment

None of the 14 project gates could be run here. Nothing was skipped silently: they are impossible without the Rust
toolchain, `node_modules` and network access.

| Gate                | Command                                           | Status here                    |
| ------------------- | ------------------------------------------------- | ------------------------------ |
| Format (UI)         | `npm run format:check`                            | not runnable (no node_modules) |
| Lint                | `npm run lint`                                    | not runnable                   |
| Types               | `npm run typecheck`                               | not runnable                   |
| UI tests            | `npm test`                                        | not runnable                   |
| Contracts           | `npm run check:commands`                          | not runnable                   |
| Licenses (UI)       | `npm run check:licenses`                          | not runnable                   |
| No audio files      | `npm run check:audio`                             | not runnable                   |
| Notices             | `npm run check:notices`                           | not runnable                   |
| Rust format         | `cargo fmt --check`                               | not runnable (no cargo)        |
| Clippy              | `cargo clippy --all-targets -- -D warnings`       | not runnable                   |
| Rust tests          | `cargo test`                                      | not runnable                   |
| Licenses (Rust)     | `cargo deny check licenses bans sources`          | not runnable                   |
| Windows-only clippy | `cargo clippy --target x86_64-pc-windows-gnu ...` | not runnable                   |
| Real-device check   | `cargo run --example ses_denemesi`                | not runnable                   |

## What did run

- `node --experimental-strip-types` on `src/lib/drop.ts` and `src/lib/queue.ts` (pure TypeScript, no imports).
- Python 3.12 re-implementation of the limiter (adversarial inputs, true-peak measurement).
- `grep`/`sed` code reading of the 0.0.50 sources.

## Baseline reference (not measured by this run)

`docs/denetim-2/kapilar-ozet.tsv` (16 Oct, `main` @ `25f83f8`): 13 of 14 gates passed; `cargo deny check advisories`
failed only on an unmaintained crate in the Linux `gtk` chain. Timings: vitest ~54 s, clippy ~4 min, `cargo test`
~5 min.

## Shortest full gate order for a complete environment

`npm ci` → `npm run format:check` → `npm run lint` → `npm run typecheck` → `npm test` → `npm run check:commands` →
`npm run check:licenses` → `npm run check:audio` → `npm run check:notices` → `npm run build` →
`cd src-tauri && cargo fmt --check` → `cargo clippy --all-targets -- -D warnings` → `cargo test` →
`cargo deny check licenses bans sources` → Windows-target clippy → `cargo run --example ses_denemesi`.
