# Lyraska

> **Early development (towards 1.0, March 2027).** Phases 1–3 of the [roadmap](docs/ROADMAP.md) —
> a playing program, the Visual Director and professional audio — are implemented; Phase 4 (the
> visual library and 1.0) is in progress. Lyraska plays local audio files on Windows (MP3, FLAC,
> WAV, AIFF, OGG Vorbis, AAC/ALAC), keeps a library, analyses every track (beats, bars, sections,
> drops, key) and drives 16 scenes from that analysis (five classic scenes, a gallery of ten and MilkDrop with
> your own `.milk` presets). Test builds are published continuously;
> see **Download**.

An offline music player for Windows whose visuals **know the song before it plays**.

The name comes from the _lyre_ and the _Lyra_ constellation.

Every track is analysed ahead of time — beats, bars, sections, drops and energy — producing a
_song map_. A **Visual Director** then choreographs the visuals in three layers (**atmosphere**,
**rhythm** and **texture**) so that scenes anticipate the music instead of merely reacting to it.

Alongside the visuals, Lyraska is a serious audio player: parametric EQ, AutoEq headphone
profiles, EBU R128 loudness normalisation, crossfeed and a bit-perfect output mode.

## Highlights

- **Fully offline** — no accounts, no telemetry, no network required.
- **Song-aware visuals** — WebGL2 scenes driven by pre-computed analysis, with
  latency compensation targeting ±20 ms audio/visual sync; time-synced lyrics from your own `.lrc`
  or embedded lyrics.
- **Nostalgia modes** — original designs inspired by classic car-stereo displays and VU meters.
  No third-party brand names or assets are used.
- **Photosensitivity-safe** — no scene pulses more than three times per second; a safe mode lowers
  that to one per second, and the app honours the system "reduce motion" preference.
- **Pro audio** — 64-bit internal processing, WASAPI output, parametric EQ, AutoEq, loudness,
  crossfeed, bit-perfect mode and a blind ABX test.

See the [roadmap](docs/ROADMAP.md) (in Turkish) for phases and dates. Version 1.0 is planned for
early March 2027.

## Download

The latest test build of the Windows installer is always available at the same link:

**<https://github.com/lahmacunveayran/Lyraska/releases/download/test-surumu/Lyraska-Kurulum.exe>**

It is rebuilt automatically every time `main` changes and CI passes. Builds are not code-signed
yet, so Windows SmartScreen will show an "unknown publisher" warning: click **More info → Run
anyway**. Every build carries a GitHub build provenance attestation, so you can check that the file
was built from this repository:

```sh
gh attestation verify Lyraska-Kurulum.exe --repo lahmacunveayran/Lyraska
```

The app needs Microsoft Edge WebView2, which Windows 10/11 already ships. If it is missing, the
installer downloads it once; the player itself never connects to the internet.

Data lives in two folders named after the app identifier (it keeps the project's original account
name so that existing data is never lost):

- `%APPDATA%\io.github.gozlemesevdalisi.lyraska` — settings, your beat/drop annotations and imported
  song maps. Small, and **not reproducible**: deleting it loses your annotations.
- `%LOCALAPPDATA%\io.github.gozlemesevdalisi.lyraska` — library database with the analysis cache,
  and logs. Deleting it is safe but you will have to add your music folders again, and every track
  is re-analysed.

## Tech stack

| Area     | Technology                                                   |
| -------- | ------------------------------------------------------------ |
| Shell    | [Tauri 2](https://tauri.app)                                 |
| Audio    | Rust — `symphonia` (decoding), `wasapi` (output), 64-bit DSP |
| Analysis | Rust                                                         |
| UI       | React + TypeScript + Vite                                    |
| Visuals  | WebGL2                                                       |
| Storage  | SQLite                                                       |

Windows comes first; macOS and Linux are planned after 1.0.

## Building from source

Requirements: [Node.js 22](https://nodejs.org) (`.nvmrc`), [rustup](https://rustup.rs) (the Rust
version is pinned in `rust-toolchain.toml` and installed automatically) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform.

```sh
npm ci
npm run tauri dev     # run the app in development mode
npm run tauri build   # build the installer
```

Checks (the same ones CI runs, from the repository root):

```sh
npm ci && npm run build   # the Rust build embeds dist/
npm run check             # format, lint, types, tests, check:commands/licenses/rules/docs/audio
npm audit --audit-level=high
(cd src-tauri && cargo fmt --check && cargo clippy --all-targets --locked -- -D warnings)
(cd src-tauri && cargo test --locked)   # also regenerates src/lib/bindings (must be unchanged)
(cd src-tauri && cargo deny check licenses bans sources advisories)
(cd src-tauri && cargo fetch --locked --target x86_64-pc-windows-msvc) && npm run check:notices
```

CI additionally runs Clippy and the tests on Windows, audits the workflows with
[zizmor](https://github.com/zizmorcore/zizmor) and [actionlint](https://github.com/rhysd/actionlint),
and renders the WebGL2 scenes in Microsoft Edge (`npm run check:scenes`).

## Project layout

```
src/          React + TypeScript UI
src-tauri/    Rust core: audio engine, analysis, Visual Director, visual bridge, library
scripts/      Quality gates (licences, audio files, command contract, docs, rules, notices, scenes)
docs/         Roadmap, architecture, audits and development log (Turkish)
```

## Contributing & bug reports

Bug reports are welcome via the issue form (in Turkish). Security issues: please report them
privately, see [SECURITY.md](SECURITY.md). The primary language of the project is Turkish; code
identifiers are in English.

## License

[GPL-3.0-only](LICENSE). Dependencies licensed under the AGPL or under terms that forbid
commercial use are not accepted: only the licences allowed in `src-tauri/deny.toml` are, for both
Rust crates and npm packages, and this is enforced in CI. Third-party notices for everything
shipped in the installer are generated into `public/lisanslar/UCUNCU-TARAF.txt`; they and the full
GPL text are shown under **Settings → Licenses** in the app.
