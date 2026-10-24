import { useRef, useState, type FormEvent } from "react";
import type { Playlist } from "../lib/backend";

export interface AddToPlaylistProps {
  playlists: Playlist[] | null;
  /** Eklenecek şarkıların yolları; boşsa düğme kapalıdır. */
  paths: string[];
  /** Düğmenin ekran okuyucudaki adı ("Albümü listeye ekle"). */
  label: string;
  onAdd: (id: number, paths: string[]) => Promise<number>;
  onCreate: (name: string) => Promise<Playlist | null>;
  className?: string;
}

/**
 * "Listeye ekle" menüsü: var olan listeler ve "Yeni liste…" (adı yazılınca liste kurulur ve
 * şarkılar eklenir). Eklenince kısa bir bildirim ("3 şarkı “Yolculuk” listesine eklendi").
 */
export function AddToPlaylist({
  playlists,
  paths,
  label,
  onAdd,
  onCreate,
  className = "",
}: AddToPlaylistProps) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => {
    if (menuRef.current) menuRef.current.open = false;
    setNaming(false);
    setName("");
  };
  const addTo = async (playlist: Playlist) => {
    // Menü hemen kapanır; aynı anda yollar değişse bile tıklandığı andaki şarkılar eklenir.
    const chosen = paths;
    close();
    const added = await onAdd(playlist.id, chosen);
    if (added > 0) setNotice(`${added} şarkı “${playlist.name}” listesine eklendi.`);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    const created = await onCreate(name);
    if (created) await addTo(created);
  };

  return (
    <span className={`playlist-add ${className}`}>
      <details
        className="playlist-add__menu"
        ref={menuRef}
        onToggle={(event) => {
          if (!event.currentTarget.open) {
            setNaming(false);
            setName("");
          } else setNotice(null);
        }}
        onKeyDown={(event) => {
          // Esc önce açık menüyü kapatır (sayfayı değil).
          if (event.key === "Escape" && menuRef.current?.open) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <summary
          className={`hw-button hw-button--small${paths.length === 0 ? " is-disabled" : ""}`}
          aria-label={label}
          aria-disabled={paths.length === 0}
          onClick={(event) => {
            if (paths.length === 0) event.preventDefault();
          }}
        >
          + Listeye ekle
        </summary>
        <div className="album__menu-list playlist-add__list">
          {(playlists ?? []).map((playlist) => (
            <button key={playlist.id} type="button" onClick={() => void addTo(playlist)}>
              {playlist.name}
            </button>
          ))}
          {naming ? (
            <form className="playlist-add__form" onSubmit={(e) => void submit(e)}>
              <input
                type="text"
                value={name}
                maxLength={100}
                placeholder="Liste adı"
                aria-label="Yeni listenin adı"
                autoFocus
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" disabled={name.trim() === ""}>
                Oluştur
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setNaming(true)}>
              Yeni liste…
            </button>
          )}
        </div>
      </details>
      {notice && (
        <span className="playlist-add__notice" role="status">
          {notice}
        </span>
      )}
    </span>
  );
}
