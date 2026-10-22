import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUDIO_EXTENSIONS, documentedNames, hasAudioExtension, sniffAudio } from "./audio.mjs";

const bytes = (...parts) =>
  Uint8Array.from(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe("ses dosyası imzası", () => {
  it("yaygın biçimleri içerikten tanır", () => {
    const cases = [
      [bytes("ID3", [3, 0, 0, 0, 0, 0, 0]), "MP3 (ID3)"],
      [bytes([0xff, 0xfb, 0x90, 0x64]), "MPEG ses"],
      [bytes("fLaC", [0, 0, 0, 34]), "FLAC"],
      [bytes("OggS", [0, 2]), "Ogg"],
      [bytes("RIFF", [0, 0, 0, 0], "WAVE"), "WAV"],
      [bytes("FORM", [0, 0, 0, 0], "AIFF"), "AIFF"],
      [bytes([0, 0, 0, 0x20], "ftypM4A "), "MP4 (M4A)"],
      [bytes([0x30, 0x26, 0xb2, 0x75]), "WMA/ASF"],
      [bytes([0x1a, 0x45, 0xdf, 0xa3]), "Matroska/WebM"],
      [bytes("MThd"), "MIDI"],
    ];
    for (const [data, format] of cases) expect(sniffAudio(data)).toBe(format);
  });

  it("depodaki ses olmayan dosyaları ses sanmaz", () => {
    for (const data of [
      bytes([0x89], "PNG"),
      bytes([0xff, 0xd8, 0xff, 0xe0]), // JPEG
      bytes("RIFF", [0, 0, 0, 0], "WEBP"),
      bytes([0, 0, 0, 0x1c], "ftypavif"),
      bytes("// yorum"),
      bytes("wOF2"),
      bytes([]),
    ]) {
      expect(sniffAudio(data)).toBeNull();
    }
  });
});

describe("uzantılar", () => {
  it("büyük/küçük harf duyarsız; ses olmayanı geçirir", () => {
    expect(hasAudioExtension("a/b/Sarki.MP3")).toBe(true);
    expect(hasAudioExtension("video.mkv")).toBe(true);
    expect(hasAudioExtension("src/lib/mp3.ts")).toBe(false);
  });

  it(".gitignore aynı uzantıları dışarıda tutar", () => {
    const ignored = readFileSync(".gitignore", "utf8");
    for (const ext of AUDIO_EXTENSIONS) expect(ignored, ext).toContain(`\n*.${ext}\n`);
  });
});

it("test verisi README'sinde adı geçen dosyalar", () => {
  const names = documentedNames("ffmpeg ... uc-uc-ton.mp3\nsozlu.flac, `sozlu.mp3`");
  expect([...names]).toEqual(["uc-uc-ton.mp3", "sozlu.flac", "sozlu.mp3"]);
});
