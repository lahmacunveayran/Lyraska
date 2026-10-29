import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { BackgroundImageControls } from "../hooks/useBackgroundImage";
import type { MilkdropControls } from "../hooks/useMilkdrop";
import type { PhotoParticleControls } from "../hooks/usePhotoParticles";
import type { ScenePresetControls } from "../hooks/useScenePresets";
import { INTENSITIES, type Intensity } from "../lib/lightShow";
import { GALLERY_SCENES, NEW_SCENES, sceneKey, type Scene } from "../lib/scene";
import {
  SCENE_PALETTES,
  SPEED_MAX,
  SPEED_MIN,
  SPEED_STEP,
  formatSpeed,
  paletteName,
  sameLook,
} from "../lib/sceneLook";
import { DENSITY_MAX, DENSITY_MIN, DENSITY_STEP, PARTICLE_STYLES } from "../lib/photoParticles";
import { MAX_PRESET_NAME, MAX_USER_PRESETS, presetSceneName } from "../lib/scenePreset";
import { SHADER_SCENES, isShaderScene } from "../lib/shaderScene";

export interface SceneGalleryProps {
  scene: Scene;
  onChoose: (scene: Scene) => void;
  /** Galeri sahnelerinin görünümleri ve hazır ayarlar. */
  presets: ScenePresetControls;
  /** MilkDrop sahnesinin denetimleri (sahne seçiliyken listenin altında görünür). */
  milkdrop?: MilkdropControls;
  /** "Kendi resmin" sahnesinin resmi (sahne seçiliyken listenin altında). */
  background?: BackgroundImageControls;
  /** "Kendi resmin" sahnesinin parçacıkları (resmin altında seçilir). */
  particles?: PhotoParticleControls;
  /** Işık Ustası'nın yoğunluğu (sahne seçiliyken listenin altında). */
  intensity?: Intensity;
  onIntensity?: (intensity: Intensity) => void;
}

/** Ok tuşlarıyla gezilen düğmeler: sahneler ve hazır ayarlar. */
const NAVIGABLE = ".scene-gallery__item, .scene-gallery__preset";

/**
 * Üst çubuktaki "Galeri" düğmesi ve açılan sahne listesi. Galeriden bir sahne seçiliyse düğme
 * onun adını gösterir; listenin altında o sahnenin görünümü (hız, renk paleti) ve hazır ayarlar
 * (sahne ve görünüm birlikte; kullanıcı kendi ayarını kaydedip silebilir). Liste dışarı tıklayınca,
 * Esc'ye basınca ya da bir sahne seçilince kapanır; görünüm ve hazır ayarlar listeyi kapatmaz.
 */
export function SceneGallery({
  scene,
  onChoose,
  presets,
  milkdrop,
  background,
  particles,
  intensity,
  onIntensity,
}: SceneGalleryProps) {
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const active = GALLERY_SCENES.find((s) => s.id === scene) ?? null;
  const shader = isShaderScene(scene) ? scene : null;
  const look = shader ? presets.looks[shader] : null;
  const userCount = presets.presets.filter((p) => !p.builtIn).length;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Açılınca seçili (yoksa ilk) sahneye odaklan: klavyeyle hemen gezilebilsin.
  useEffect(() => {
    if (!open) return;
    // Seçici listesi belge sırasındaki ilk eşleşmeyi verir; seçili olan ayrıca aranır.
    const item =
      root.current?.querySelector<HTMLButtonElement>('.scene-gallery__item[aria-pressed="true"]') ??
      root.current?.querySelector<HTMLButtonElement>(".scene-gallery__item");
    item?.focus();
  }, [open]);

  useEffect(() => {
    if (naming) nameInput.current?.select();
  }, [naming]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault(); // çekmece de kapanmasın
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (!open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    // Hız kaydırıcısı ok tuşlarını kendisi kullanır.
    if (!(event.target instanceof Element) || !event.target.matches(NAVIGABLE)) return;
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>(NAVIGABLE) ?? [])];
    const index = items.findIndex((item) => item === document.activeElement);
    const next =
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    event.preventDefault();
    next?.focus();
  };

  const startNaming = () => {
    if (!shader || !look) return;
    if (userCount >= MAX_USER_PRESETS) {
      setNotice(`En fazla ${MAX_USER_PRESETS} hazır ayar kaydedilebilir; önce birini silin.`);
      return;
    }
    const sceneName = SHADER_SCENES.find((s) => s.id === shader)?.name ?? shader;
    setName(`${sceneName} · ${paletteName(look.palette)} · ${formatSpeed(look.speed)}`);
    setNotice(null);
    setNaming(true);
  };

  const stopNaming = () => {
    setNaming(false);
    // Odak kaybolmasın: "Kaydet" düğmesi yeniden çizildikten sonra ona dön.
    window.setTimeout(() => saveButton.current?.focus(), 0);
  };

  const onSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!shader) return;
    const saved = presets.savePreset(name, shader);
    if (!saved) {
      setNotice(
        name.trim().length === 0
          ? "Hazır ayara bir ad verin."
          : `En fazla ${MAX_USER_PRESETS} hazır ayar kaydedilebilir; önce birini silin.`,
      );
      return;
    }
    setNotice(`"${saved.name}" kaydedildi.`);
    stopNaming();
  };

  return (
    <div className="scene-gallery" ref={root} onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        className={`pill scene-gallery__toggle${active ? " is-on" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        title="Galerideki sahneler (PageDown / PageUp: sıradaki / önceki sahne)"
        onClick={() => {
          setNaming(false);
          setNotice(null);
          setOpen((o) => !o);
        }}
      >
        {active ? active.name : "Galeri"}
        <span className="scene-gallery__caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="scene-gallery__panel" id={panelId}>
          <div className="scene-gallery__list" role="group" aria-label="Yeni sahneler">
            {NEW_SCENES.map(({ id, name: sceneName, hint }) => (
              <button
                key={id}
                type="button"
                className="scene-gallery__item scene-gallery__item--new"
                aria-pressed={scene === id}
                onClick={() => {
                  onChoose(id);
                  setOpen(false);
                  button.current?.focus();
                }}
              >
                <span className="scene-gallery__name">
                  {sceneName}
                  <span className="scene-gallery__badge">Yeni</span>
                </span>
                <span className="scene-gallery__hint">{hint}</span>
              </button>
            ))}
          </div>
          {scene === "lightshow" && intensity && onIntensity && (
            <section className="scene-gallery__section" role="group" aria-label="Yoğunluk">
              <h3 className="scene-gallery__heading">Yoğunluk</h3>
              <div className="scene-gallery__chips">
                {INTENSITIES.map(({ id, name: label, hint }) => (
                  <button
                    key={id}
                    type="button"
                    className="scene-gallery__chip"
                    aria-pressed={intensity === id}
                    title={hint}
                    onClick={() => onIntensity(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="scene-gallery__list" role="group" aria-label="Galeri">
            {GALLERY_SCENES.map(({ id, name: sceneName, hint }) => {
              const key = sceneKey(id);
              return (
                <button
                  key={id}
                  type="button"
                  className="scene-gallery__item"
                  aria-pressed={scene === id}
                  onClick={() => {
                    onChoose(id);
                    setOpen(false);
                    // Seçilen düğme kaybolur: odak gövdeye düşmesin, galeri düğmesine dönsün.
                    button.current?.focus();
                  }}
                >
                  <span className="scene-gallery__name">
                    {sceneName}
                    {key && <kbd>{key}</kbd>}
                  </span>
                  <span className="scene-gallery__hint">{hint}</span>
                </button>
              );
            })}
          </div>

          {scene === "milkdrop" && milkdrop && <MilkdropSection controls={milkdrop} />}
          {scene === "photo" && background && (
            <PhotoSection controls={background} particles={particles} />
          )}

          {shader && look && (
            <section
              className="scene-gallery__section"
              role="group"
              aria-label={`Görünüm: ${active?.name ?? shader}`}
            >
              <h3 className="scene-gallery__heading">Görünüm</h3>
              <label className="scene-gallery__speed">
                <span>Hız</span>
                <input
                  type="range"
                  min={SPEED_MIN}
                  max={SPEED_MAX}
                  step={SPEED_STEP}
                  value={look.speed}
                  aria-label="Hareket hızı"
                  aria-valuetext={formatSpeed(look.speed)}
                  onChange={(event) =>
                    presets.setLook(shader, { ...look, speed: Number(event.target.value) })
                  }
                />
                <output aria-hidden>{formatSpeed(look.speed)}</output>
              </label>
              <div className="scene-gallery__chips" role="group" aria-label="Renk paleti">
                {SCENE_PALETTES.map(({ id, name: label }) => (
                  <button
                    key={id}
                    type="button"
                    className="scene-gallery__chip"
                    aria-pressed={look.palette === id}
                    onClick={() => presets.setLook(shader, { ...look, palette: id })}
                  >
                    <span
                      className={`scene-gallery__swatch scene-gallery__swatch--${id}`}
                      aria-hidden
                    />
                    {label}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="scene-gallery__section" role="group" aria-label="Hazır ayarlar">
            <h3 className="scene-gallery__heading">Hazır ayarlar</h3>
            <ul className="scene-gallery__presets">
              {presets.presets.map((preset) => {
                const current =
                  scene === preset.scene && sameLook(presets.looks[preset.scene], preset);
                return (
                  <li key={preset.id} className="scene-gallery__preset-row">
                    <button
                      type="button"
                      className="scene-gallery__preset"
                      aria-pressed={current}
                      onClick={() => {
                        presets.setLook(preset.scene, preset);
                        onChoose(preset.scene);
                      }}
                    >
                      <span className="scene-gallery__name">{preset.name}</span>
                      <span className="scene-gallery__hint">
                        {presetSceneName(preset)} · {paletteName(preset.palette)} ·{" "}
                        {formatSpeed(preset.speed)}
                      </span>
                    </button>
                    {!preset.builtIn && (
                      <button
                        type="button"
                        className="scene-gallery__delete"
                        aria-label={`"${preset.name}" hazır ayarını sil`}
                        title="Sil"
                        onClick={() => {
                          presets.deletePreset(preset.id);
                          setNotice(`"${preset.name}" silindi.`);
                          window.setTimeout(() => saveButton.current?.focus(), 0);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {shader &&
              (naming ? (
                <form className="scene-gallery__save" onSubmit={onSave}>
                  <input
                    ref={nameInput}
                    type="text"
                    value={name}
                    maxLength={MAX_PRESET_NAME}
                    aria-label="Hazır ayarın adı"
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      // Esc yalnızca ad girmeyi bırakır; liste açık kalır.
                      event.preventDefault();
                      event.stopPropagation();
                      stopNaming();
                    }}
                  />
                  <button type="submit" className="scene-gallery__button">
                    Kaydet
                  </button>
                  <button type="button" className="scene-gallery__button" onClick={stopNaming}>
                    Vazgeç
                  </button>
                </form>
              ) : (
                <button
                  ref={saveButton}
                  type="button"
                  className="scene-gallery__button"
                  title="Bu sahnenin görünümünü hazır ayar olarak kaydet"
                  onClick={startNaming}
                >
                  Kaydet
                </button>
              ))}
            <p className="scene-gallery__notice" role="status">
              {notice ?? ""}
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

/** Klasör yolunun son parçası (gösterim için; tam yol ipucunda). */
function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** "Kendi resmin" sahnesinin denetimleri: resim seçme ve kaldırma, parçacıklar. */
function PhotoSection({
  controls,
  particles,
}: {
  controls: BackgroundImageControls;
  particles?: PhotoParticleControls;
}) {
  return (
    <section className="scene-gallery__section" role="group" aria-label="Arka plan resmi">
      <h3 className="scene-gallery__heading">Arka plan resmi</h3>
      <p className="scene-gallery__milk-line">
        {controls.url ? "Seçtiğiniz resim gösteriliyor." : "Resim seçilmedi."} Kopyası Lyraska'da
        saklanır; özgün dosyaya dokunulmaz.
      </p>
      <div className="scene-gallery__chips">
        <button
          type="button"
          className="scene-gallery__button"
          onClick={() => void controls.choose()}
        >
          Resim seç…
        </button>
        <button
          type="button"
          className="scene-gallery__button"
          disabled={!controls.url}
          onClick={() => void controls.clear()}
        >
          Resmi kaldır
        </button>
      </div>
      {controls.error && (
        <p className="scene-gallery__notice" role="alert">
          {controls.error}
        </p>
      )}
      {particles && (
        <>
          <h3 className="scene-gallery__heading">Parçacıklar</h3>
          <div className="scene-gallery__chips" role="group" aria-label="Parçacıklar">
            {PARTICLE_STYLES.map(({ id, name }) => (
              <button
                key={id}
                type="button"
                className="scene-gallery__chip"
                aria-pressed={particles.style === id}
                onClick={() => particles.setStyle(id)}
              >
                {name}
              </button>
            ))}
          </div>
          {particles.style !== "off" && (
            <label className="scene-gallery__speed">
              <span>Yoğunluk</span>
              <input
                type="range"
                min={DENSITY_MIN}
                max={DENSITY_MAX}
                step={DENSITY_STEP}
                value={particles.density}
                aria-label="Parçacık yoğunluğu"
                aria-valuetext={formatSpeed(particles.density)}
                onChange={(event) => particles.setDensity(Number(event.target.value))}
              />
              <output aria-hidden>{formatSpeed(particles.density)}</output>
            </label>
          )}
          <p className="scene-gallery__milk-line">
            Kıvılcım yukarı süzülür, kar aşağı dökülür. Epilepsi güvenli modunda ve "animasyonları
            azalt" açıkken gösterilmez.
          </p>
        </>
      )}
    </section>
  );
}

/**
 * MilkDrop sahnesinin denetimleri: seçilen klasör, çalan görsel, önceki/sonraki, klasör seçme ve
 * müzikle kendiliğinden değiştirme. Lyraska hazır görsel içermez.
 */
function MilkdropSection({ controls }: { controls: MilkdropControls }) {
  const { library, loading, currentName, simplified, shaderNote, notice, auto, skippedCount } =
    controls;
  const count = library.presets.length;
  const none = count === 0;
  return (
    <section className="scene-gallery__section" role="group" aria-label="MilkDrop görselleri">
      <h3 className="scene-gallery__heading">MilkDrop</h3>
      <p className="scene-gallery__milk-line" title={library.folder ?? undefined}>
        {library.folder
          ? `Klasör: ${folderName(library.folder)} · ${count} görsel${
              library.truncated ? " (fazlası listelenmedi)" : ""
            }`
          : "Klasör seçilmedi"}
      </p>
      {currentName && (
        <p className="scene-gallery__milk-line scene-gallery__milk-current">
          <span className="scene-gallery__name">{currentName}</span>
          {simplified && (
            <span className="scene-gallery__hint">
              Gölgelendiricisi çevrilemedi, sade hâliyle çalıyor.
              {shaderNote && <> Neden: {shaderNote}</>}
            </span>
          )}
        </p>
      )}
      <div className="scene-gallery__chips">
        <button
          type="button"
          className="scene-gallery__button"
          disabled={none}
          aria-label="Önceki MilkDrop görseli"
          onClick={controls.previous}
        >
          Önceki
        </button>
        <button
          type="button"
          className="scene-gallery__button"
          disabled={none}
          aria-label="Sonraki MilkDrop görseli"
          onClick={controls.next}
        >
          Sonraki
        </button>
        <button
          type="button"
          className="scene-gallery__button"
          disabled={loading}
          aria-label="MilkDrop görsellerinin klasörünü seç"
          onClick={() => void controls.chooseFolder()}
        >
          Klasör seç
        </button>
      </div>
      <label className="scene-gallery__check">
        <input
          type="checkbox"
          checked={auto}
          onChange={(event) => controls.setAuto(event.target.checked)}
        />
        Müzikle kendiliğinden değiştir (bölüm başlarında)
      </label>
      <p className="scene-gallery__notice" role="status">
        {notice ?? ""}
      </p>
      {skippedCount > 0 && (
        <div className="scene-gallery__milk-line">
          <span>
            {skippedCount} görsel atlandı: önceki açılışlarda program onları çalarken kapandı.
          </span>
          <button
            type="button"
            className="scene-gallery__button"
            aria-label="Atlanan görselleri yeniden dene"
            onClick={controls.retrySkipped}
          >
            Atlananları yeniden dene
          </button>
        </div>
      )}
      <p className="scene-gallery__milk-note">
        Lyraska hazır görsel içermez; kendi .milk dosyalarınızı seçersiniz. Görüntü her zaman
        parlaklık freninden geçer.
      </p>
    </section>
  );
}
