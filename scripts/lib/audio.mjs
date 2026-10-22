// Ses dosyası denetiminin saf mantığı (scripts/check-no-audio.mjs kullanır; testleri audio.test.mjs).
//
// Bir dosya iki yoldan ses sayılır: uzantısından ya da içeriğinin ilk baytlarından (dosya
// imzası). Uzantısı değiştirilmiş bir şarkı ("sarki.bin") da böylece yakalanır.

/** Ses (ve ses taşıyan video) uzantıları. .gitignore da aynı listeyi taşır (testle denetlenir). */
export const AUDIO_EXTENSIONS = [
  "mp3",
  "mp2",
  "mp1",
  "mpga",
  "flac",
  "wav",
  "wave",
  "w64",
  "rf64",
  "aif",
  "aiff",
  "aifc",
  "ogg",
  "oga",
  "opus",
  "spx",
  "m4a",
  "m4b",
  "m4p",
  "m4r",
  "mp4",
  "m4v",
  "mov",
  "3gp",
  "3g2",
  "aac",
  "ac3",
  "eac3",
  "dts",
  "caf",
  "mka",
  "mkv",
  "webm",
  "weba",
  "wma",
  "asf",
  "ape",
  "wv",
  "tta",
  "mpc",
  "dsf",
  "dff",
  "amr",
  "au",
  "snd",
  "ra",
  "rm",
  "mid",
  "midi",
];

const EXTENSION = new RegExp(`\\.(${AUDIO_EXTENSIONS.join("|")})$`, "i");

export function hasAudioExtension(path) {
  return EXTENSION.test(path);
}

const ascii = (bytes, from, text) =>
  bytes.length >= from + text.length &&
  [...text].every((char, i) => bytes[from + i] === char.charCodeAt(0));

/** İçeriğin ilk baytlarından ses biçimi adı; ses değilse `null`. */
export function sniffAudio(bytes) {
  if (ascii(bytes, 0, "ID3")) return "MP3 (ID3)";
  if (ascii(bytes, 0, "fLaC")) return "FLAC";
  if (ascii(bytes, 0, "OggS")) return "Ogg";
  if ((ascii(bytes, 0, "RIFF") || ascii(bytes, 0, "RF64")) && ascii(bytes, 8, "WAVE")) return "WAV";
  if (ascii(bytes, 0, "FORM") && (ascii(bytes, 8, "AIFF") || ascii(bytes, 8, "AIFC")))
    return "AIFF";
  if (ascii(bytes, 0, "FRM8")) return "DSDIFF";
  if (ascii(bytes, 0, "DSD ")) return "DSF";
  if (ascii(bytes, 0, "MThd")) return "MIDI";
  if (ascii(bytes, 0, "MAC ")) return "Monkey's Audio";
  if (ascii(bytes, 0, "wvpk")) return "WavPack";
  if (ascii(bytes, 0, "TTA1")) return "TTA";
  if (ascii(bytes, 0, "MPCK")) return "Musepack";
  if (ascii(bytes, 0, "caff")) return "CAF";
  if (ascii(bytes, 0, ".snd")) return "AU";
  if (ascii(bytes, 0, "#!AMR")) return "AMR";
  if (bytes[0] === 0x30 && bytes[1] === 0x26 && bytes[2] === 0xb2 && bytes[3] === 0x75) {
    return "WMA/ASF";
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "Matroska/WebM";
  }
  // MP4 ailesi: 4. bayttan "ftyp". Resim biçimleri (AVIF, HEIC) ayrılır.
  if (ascii(bytes, 4, "ftyp")) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return /^(avif|avis|heic|heix|mif1|msf1)$/.test(brand) ? null : `MP4 (${brand.trim()})`;
  }
  // Etiketsiz MPEG ses çerçevesi: 11 bit eşitleme, geçerli katman ve bit hızı.
  if (bytes.length >= 3 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    const layer = (bytes[1] >> 1) & 0x03;
    const version = (bytes[1] >> 3) & 0x03;
    const bitrate = bytes[2] >> 4;
    const rate = (bytes[2] >> 2) & 0x03;
    if (layer !== 0 && version !== 1 && bitrate !== 0x0f && rate !== 0x03) return "MPEG ses";
  }
  return null;
}

/** README'de adı geçen dosyalar: izinli klasördeki her dosyanın tarifi orada olmalı. */
export function documentedNames(readme) {
  return new Set([...readme.matchAll(/[\w.-]+\.[a-z0-9]{2,4}\b/gi)].map((m) => m[0]));
}
