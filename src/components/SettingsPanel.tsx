import { useState } from "react";
import { errorMessage, openLog, type AppInfo, type PlaybackStatus } from "../lib/backend";
import { signalPathText } from "../lib/format";
import { SKY_LOOKS } from "../lib/sky";
import type { PlaybackOptionsControls } from "../hooks/usePlaybackOptions";
import type { SkyLookControls } from "../hooks/useSkyLook";
import type { LyricsControls } from "../hooks/useLyrics";
import type { VisualSafeControls } from "../hooks/useVisualSafe";

export interface SettingsPanelProps {
  info: AppInfo;
  status: PlaybackStatus;
  available: boolean;
  visualSafe: VisualSafeControls;
  playback: PlaybackOptionsControls;
  skyLook: SkyLookControls;
  /** Şarkı sözleri (verilmezse bölüm gösterilmez). */
  lyrics?: LyricsControls;
}

const SHORTCUTS: [string, string][] = [
  ["Boşluk", "Çal / duraklat"],
  ["← →", "5 saniye geri / ileri"],
  ["1 – 9, 0", "Sahne seç"],
  ["PageDown / PageUp", "Sonraki / önceki sahne"],
  ["Ctrl + O", "Dosya aç"],
  ["Esc", "Paneli kapat"],
];

/** Ayarlar: gece göğünün görünümü, görsel güvenlik, ses, sesin yolu, kısayollar, program bilgisi, hata günlüğü, lisanslar. */
export function SettingsPanel({
  info,
  status,
  available,
  visualSafe,
  playback,
  skyLook,
  lyrics,
}: SettingsPanelProps) {
  const [logError, setLogError] = useState<string | null>(null);
  const signalPath = signalPathText(status);
  const notice = status.output?.notice ?? null;

  return (
    <section className="settings" aria-label="Ayarlar">
      <div className="settings__group">
        <h2 className="settings__title">Gece göğü</h2>
        <div className="settings__looks" role="group" aria-label="Gece göğünün görünümü">
          {SKY_LOOKS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`settings__look${skyLook.look === option.id ? " is-on" : ""}`}
              aria-pressed={skyLook.look === option.id}
              aria-label={option.name}
              aria-describedby={`sky-look-${option.id}`}
              onClick={() => skyLook.setLook(option.id)}
            >
              <span className="settings__look-name">{option.name}</span>
              <span className="settings__look-hint" id={`sky-look-${option.id}`}>
                {option.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      {lyrics && (
        <div className="settings__group">
          <h2 className="settings__title">Şarkı sözleri</h2>
          <button
            type="button"
            className={`settings__toggle${lyrics.visible ? " is-on" : ""}`}
            aria-pressed={lyrics.visible}
            onClick={() => lyrics.setVisible(!lyrics.visible)}
          >
            <span className="settings__switch" aria-hidden />
            Sahnede şarkı sözleri: {lyrics.visible ? "Açık" : "Kapalı"}
          </button>
          <p className="settings__hint">
            Sözler yalnızca sizin dosyalarınızdan okunur: şarkının yanındaki aynı adlı{" "}
            <code>.lrc</code> dosyası ya da şarkının içine gömülü sözler. Zamanlı sözler kelime
            kelime akar; Lyraska söz indirmez, saklamaz.
            {lyrics.lyrics &&
              (lyrics.lyrics.synced
                ? ` Çalan şarkının sözleri: ${lyrics.lyrics.source === "file" ? ".lrc dosyasından" : "şarkının içinden"}.`
                : " Çalan şarkının sözleri zamanlı değil; sahnede gösterilmez.")}
          </p>
        </div>
      )}

      <div className="settings__group">
        <h2 className="settings__title">Görsel güvenlik</h2>
        <button
          type="button"
          className={`settings__toggle${visualSafe.safe ? " is-on" : ""}`}
          aria-pressed={visualSafe.safe}
          onClick={() => void visualSafe.setSafe(!visualSafe.safe)}
        >
          <span className="settings__switch" aria-hidden />
          Epilepsi güvenli modu: {visualSafe.safe ? "Açık" : "Kapalı"}
        </button>
        <p className="settings__hint">
          Açıkken görseller daha sakin olur: saniyede en fazla bir vuruş, parlaklık daha yavaş
          değişir. Kapalıyken de hiçbir sahne saniyede üçten fazla parlamaz.
        </p>
        {visualSafe.error && <p className="settings__warn">{visualSafe.error}</p>}
      </div>

      <div className="settings__group">
        <h2 className="settings__title">Ses</h2>
        <button
          type="button"
          className={`settings__toggle${playback.options.normalize ? " is-on" : ""}`}
          aria-pressed={playback.options.normalize}
          onClick={() => void playback.setNormalize(!playback.options.normalize)}
        >
          <span className="settings__switch" aria-hidden />
          Ses yüksekliği eşitleme: {playback.options.normalize ? "Açık" : "Kapalı"}
        </button>
        <p className="settings__hint">
          Bütün şarkılar aynı yükseklikte çalar (EBU R128, −14 LUFS); yüksek kaydedilmiş şarkılar
          kısılır, sessiz kaydedilmişler bozulmadan yükseltilir. Ekolayzer de sesi kısmadan
          yükseltebilir: bas dediğinizde bas gerçekten artar. Diğer programlardan biraz kısık
          gelirse Windows sesini açın.
        </p>
        <button
          type="button"
          className={`settings__toggle${playback.options.bitPerfect ? " is-on" : ""}`}
          aria-pressed={playback.options.bitPerfect}
          onClick={() => void playback.setBitPerfect(!playback.options.bitPerfect)}
        >
          <span className="settings__switch" aria-hidden />
          Bit-perfect (özel mod): {playback.options.bitPerfect ? "Açık" : "Kapalı"}
        </button>
        <p className="settings__hint">
          Şarkı ses aygıtına hiç değiştirilmeden, kendi hızında ve çözünürlüğünde gider; aygıt
          yalnızca Lyraska'ya ayrılır. Açıkken ekolayzer, kulaklık düzeltmesi ve ses yüksekliği
          eşitleme çalışmaz, diğer programların sesi duyulmaz.
        </p>
        <p className="settings__warn">
          Dikkat: özel modda Windows ses düzeyi çoğu aygıtta etkisizdir ve ses tam yükseklikte
          gelebilir. Açmadan önce kulaklığı çıkarın ya da aygıtın kendi ses düğmesini kısın.
        </p>
        {notice && (
          <p className="settings__warn">
            Bit-perfect açılamadı: {notice}. Ses normal yoldan çalıyor.
          </p>
        )}
        {playback.error && <p className="settings__warn">{playback.error}</p>}
      </div>

      <div className="settings__group">
        <h2 className="settings__title">Sesin yolu</h2>
        <p className="settings__text">
          {signalPath ?? "Bir şarkı açılınca sesin dosyadan hoparlöre giden yolu burada görünür."}
        </p>
        {status.track && (
          <p className={status.underruns > 0 ? "settings__warn" : "settings__hint"}>
            Kesinti: {status.underruns}
          </p>
        )}
        <p className="settings__hint">
          Şarkı, ses aygıtının kendi hızına Lyraska'nın stüdyo kalitesindeki dönüştürücüsüyle
          çevrilir; Windows sese dokunmaz. Taşma koruması, yüksek kayıtlardaki tepelerin cızırtı
          yapmasını önler.
        </p>
      </div>

      <div className="settings__group">
        <h2 className="settings__title">Klavye</h2>
        <dl className="settings__keys">
          {SHORTCUTS.map(([key, action]) => (
            <div key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="settings__group">
        <h2 className="settings__title">Program</h2>
        <p className="settings__text">
          {info.phase} · Sürüm {info.version} · {info.commit}
        </p>
        <p className="settings__hint">Ses motoru: {info.audioEngine}</p>
        {available && (
          <button
            type="button"
            className="glass-button"
            title="Hata ve çökme günlüğünü dosya gezgininde gösterir. Hata kaydı açarken bu dosyayı ekleyin."
            onClick={() => {
              openLog()
                .then(() => setLogError(null))
                .catch((e) => setLogError(errorMessage(e)));
            }}
          >
            Hata günlüğü
          </button>
        )}
        {logError && <p className="settings__warn">{logError}</p>}
      </div>

      <div className="settings__group">
        <h2 className="settings__title">Lisanslar</h2>
        <p className="settings__text">
          Lyraska özgür yazılımdır: GNU Genel Kamu Lisansı sürüm 3 (yalnızca bu sürüm, GPL-3.0-only)
          ile dağıtılır ve hiçbir garanti verilmez. Bu lisansın koşullarıyla kopyalayabilir,
          değiştirebilir ve dağıtabilirsiniz. © 2026 Lyraska katkıcıları. Kaynak kodu:
          github.com/lahmacunveayran/Lyraska
        </p>
        <p className="settings__hint">
          Program açık kaynak kütüphaneler içerir; telif sahipleri ve lisans metinleri aşağıda.
        </p>
        <LicenseText src="/lisanslar/GPL-3.0.txt" title="GNU GPL sürüm 3 (lisans metni)" />
        <LicenseText src="/lisanslar/UCUNCU-TARAF.txt" title="Üçüncü taraf lisans bildirimleri" />
      </div>
    </section>
  );
}

/**
 * Programın içine paketlenmiş bir lisans metni; yalnızca açılınca yüklenir (bildirimler 450 KB).
 * `fetch().text()` her zaman UTF-8 okur: Türkçe harfler, sunucunun bildirdiği karakter kümesinden
 * bağımsız olarak doğru görünür.
 */
function LicenseText({ src, title }: { src: string; title: string }) {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <details
      className="settings__notices"
      onToggle={(event) => {
        if (!event.currentTarget.open || text !== null) return;
        fetch(src)
          .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
          .then(setText)
          .catch(() => setFailed(true));
      }}
    >
      <summary className="glass-button">{title}</summary>
      {failed ? (
        <p className="settings__warn">Metin açılamadı ({src}).</p>
      ) : (
        text !== null && (
          <pre className="settings__notices-text" tabIndex={0} aria-label={title}>
            {text}
          </pre>
        )
      )}
    </details>
  );
}
