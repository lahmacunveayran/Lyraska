import { useEffect, useRef, useState } from "react";
import type { LyricsControls } from "../hooks/useLyrics";
import {
  errorMessage,
  installLyricsPackage,
  isLyricsPackageInstalled,
  pickLyricsPackageFile,
  type LyricsText,
} from "../lib/backend";
import { AUTO_TIMING_TEXT, LYRICS_SOURCE_TEXT, autoTiming, lyricsTextStats } from "../lib/lyrics";

export interface LyricsPanelProps {
  lyrics: LyricsControls;
  /** Çalan şarkının yolu ve adı (yoksa `null`). */
  trackPath: string | null;
  trackTitle: string | null;
  /** Panel ekranda mı (çekmece açık ve bu sekme seçili)? Değilse metin okunmaz. */
  visible: boolean;
}

type Loaded = { path: string; text: LyricsText | null };

/**
 * Şarkı sözlerini yapıştırma ve düzenleme: kullanıcının bulduğu düz metin ya da şarkının kendi sözleri
 * (yan `.lrc`, gömülü) burada düzeltilir. Kaydedilen metin Lyraska'nın klasöründe saklanır, müzik
 * dosyasına dokunulmaz ve şarkının kendi sözlerinden önce gelir. Zamanlı satırlar (`[01:23.45]`)
 * sahnede akar; zamanı olmayanlar şarkının sesine kendiliğinden oturtulur (söz paketi gerekir: kullanıcı
 * indirir ve burada ekler; program internete bağlanmaz). Otomatik zamanlamanın durumu burada yazar.
 */
export function LyricsPanel({ lyrics, trackPath, trackTitle, visible }: LyricsPanelProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Söz paketi kurulu mu (panel açılınca okunur; bilinmiyorsa `null`).
  const [packageInstalled, setPackageInstalled] = useState<boolean | null>(null);
  const adding = useRef(false);
  const { loadText } = lyrics;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    isLyricsPackageInstalled()
      .then((installed) => !cancelled && setPackageInstalled(installed))
      .catch(() => !cancelled && setPackageInstalled(null));
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Şarkı değişince (panel açıkken) metin yeniden okunur; düzenleme taslağı o şarkınınkiyle başlar.
  useEffect(() => {
    if (!visible || !trackPath || loaded?.path === trackPath) return;
    let cancelled = false;
    loadText()
      .then((text) => {
        if (cancelled) return;
        // Beklenmedik yanıt (eski çekirdek): söz yok sayılır.
        const valid = text && typeof text.text === "string" ? text : null;
        setLoaded({ path: trackPath, text: valid });
        setDraft(valid?.text ?? "");
        setMessage(null);
      })
      .catch((e) => !cancelled && setMessage(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [visible, trackPath, loaded?.path, loadText]);

  const current = loaded && loaded.path === trackPath ? loaded.text : null;
  const original = current?.text ?? "";
  const changed = draft !== original;
  const stats = lyricsTextStats(draft);

  const run = async (action: () => Promise<void>, done: string, next: LyricsText | null) => {
    setBusy(true);
    try {
      await action();
      if (trackPath) setLoaded({ path: trackPath, text: next });
      setMessage(done);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const timing = trackPath ? autoTiming(lyrics.lyrics, packageInstalled) : null;
  const addPackage = async () => {
    // Çift tıklama ikinci seçim penceresini ve ikinci kurulumu açmaz (düğme pencere açılmadan kilitlenir).
    if (adding.current) return;
    adding.current = true;
    setBusy(true);
    try {
      const file = await pickLyricsPackageFile();
      if (!file) return;
      setMessage("Söz paketi denetleniyor ve ekleniyor…");
      await installLyricsPackage(file);
      setPackageInstalled(true);
      lyrics.refresh?.();
      setMessage("Söz paketi eklendi: zamansız sözler şarkının sesine oturtulacak.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      adding.current = false;
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () => lyrics.saveText(draft),
      draft.trim() ? "Kaydedildi: sözler Lyraska'da saklandı." : "Boş metin: düzenleme kaldırıldı.",
      draft.trim() ? { source: "user", text: draft } : null,
    );
  const revert = async () => {
    if (
      !window.confirm("Düzenlediğiniz sözler silinsin ve şarkının kendi sözlerine dönülsün mü?")
    ) {
      return;
    }
    await run(lyrics.clearText, "Düzenleme kaldırıldı: şarkının kendi sözleri gösteriliyor.", null);
    // Şarkının kendi sözleri yeniden okunur.
    setLoaded(null);
  };

  return (
    <section className="marker lyricsedit" aria-label="Sözler">
      <header className="library__header marker__header">
        <h2 className="library__title">Sözler</h2>
        <span className="marker__track">
          {trackPath ? (trackTitle ?? "Çalan şarkı") : "Önce bir şarkı açın."}
        </span>
      </header>

      <div className="marker__body">
        <div className="marker__help">
          <p>
            Bulduğunuz sözleri buraya yapıştırın ya da şarkının sözlerini düzeltin. Kaydettiğiniz
            metin Lyraska'da saklanır; müzik dosyanıza dokunulmaz.
            {trackPath &&
              (current
                ? ` Şu an gösterilen: ${LYRICS_SOURCE_TEXT[current.source]}.`
                : " Bu şarkının sözü yok.")}
          </p>
        </div>

        {timing && (
          <div className={`lyricsedit__auto is-${timing}`}>
            <p>{AUTO_TIMING_TEXT[timing]}</p>
            {timing === "noPackage" && (
              <button
                type="button"
                className="chip chip--button"
                disabled={busy}
                onClick={() => void addPackage()}
              >
                Söz paketini ekle…
              </button>
            )}
          </div>
        )}

        <label className="lyricsedit__label" htmlFor="lyrics-edit">
          Sözler
        </label>
        <textarea
          id="lyrics-edit"
          className="lyricsedit__text"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          disabled={!trackPath || busy}
          spellCheck={false}
          placeholder={"Her satır ayrı satırda:\nGece yolunda yalnız\nIşıklar akıyor"}
          rows={14}
        />
        <p className="lyricsedit__stats" aria-live="polite">
          {stats.lines} satır
          {stats.lines > 0 &&
            (stats.timed === stats.lines
              ? " · hepsi zamanlı: sahnede akar"
              : stats.timed > 0
                ? ` · ${stats.timed} zamanlı, ${stats.lines - stats.timed} zamansız`
                : " · zamansız (sahnede akması için zamanlanmalı)")}
        </p>

        <div className="marker__actions">
          <button
            type="button"
            className="hw-button hw-button--primary"
            disabled={!trackPath || busy || !changed}
            onClick={() => void save()}
          >
            Kaydet
          </button>
          <button
            type="button"
            className="chip chip--button"
            disabled={busy || !changed}
            onClick={() => setDraft(original)}
          >
            Vazgeç
          </button>
          {current?.source === "user" && (
            <button
              type="button"
              className="chip chip--button"
              disabled={busy}
              onClick={() => void revert()}
            >
              Şarkının kendi sözlerine dön
            </button>
          )}
        </div>
        {message && (
          <p className="lyricsedit__message" role="status">
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
