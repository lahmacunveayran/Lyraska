import { useCallback, useEffect, useRef, useState } from "react";
import {
  addToPlaylist,
  clearPlaylistCover,
  createPlaylist,
  deletePlaylist,
  errorMessage,
  isDesktop,
  listPlaylists,
  pickImage,
  renamePlaylist,
  setPlaylistCover,
  type Playlist,
} from "../lib/backend";

export interface PlaylistsApi {
  /** Listeler, en son değişen önce; ilk yanıt gelene kadar `null`. */
  playlists: Playlist[] | null;
  error: string | null;
  /** Bir listenin kapağı değişince artar: kapak yeniden sorulur. */
  coverRevision: number;
  /** Yeni liste; başarılıysa listeyi döndürür. */
  create: (name: string) => Promise<Playlist | null>;
  rename: (id: number, name: string) => Promise<boolean>;
  remove: (id: number) => Promise<void>;
  /** Şarkıları listenin sonuna ekler; eklenen sayı (hata olursa 0). */
  add: (id: number, paths: string[]) => Promise<number>;
  chooseCover: (id: number) => Promise<void>;
  clearCover: (id: number) => Promise<void>;
  /** Liste içeriği başka yerden değişti (çıkarma, taşıma): sayılar ve kolaj tazelenir. */
  refresh: () => void;
}

/**
 * Çalma listeleri. Kütüphane değişince (`refreshKey`: tarama, analiz) ve her değişiklikten sonra
 * yeniden sorulur; yalnızca en son sorgunun sonucu uygulanır.
 */
export function usePlaylists(refreshKey: unknown): PlaylistsApi {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [coverRevision, setCoverRevision] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (!isDesktop()) return;
    const mine = ++seq.current;
    listPlaylists()
      .then((result) => {
        if (mine !== seq.current) return;
        setPlaylists(result);
        setError(null);
      })
      .catch((e) => {
        if (mine === seq.current) setError(errorMessage(e));
      });
  }, [refreshKey, revision]);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);

  // Her değişiklik: hata gösterilir, liste tazelenir.
  const change = useCallback(
    async <T>(action: () => Promise<T>, failed: T): Promise<T> => {
      try {
        const result = await action();
        setError(null);
        return result;
      } catch (e) {
        setError(errorMessage(e));
        return failed;
      } finally {
        refresh();
      }
    },
    [refresh],
  );

  // Yeni liste hemen listeye girer: sayfası, tazelenen liste gelmeden de açılabilir.
  const create = useCallback(
    (name: string) =>
      change<Playlist | null>(async () => {
        const created = await createPlaylist(name);
        setPlaylists((list) =>
          list ? [created, ...list.filter((p) => p.id !== created.id)] : list,
        );
        return created;
      }, null),
    [change],
  );
  const rename = useCallback(
    (id: number, name: string) => change(() => renamePlaylist(id, name).then(() => true), false),
    [change],
  );
  const remove = useCallback((id: number) => change(() => deletePlaylist(id), undefined), [change]);
  const add = useCallback(
    (id: number, paths: string[]) => change(() => addToPlaylist(id, paths), 0),
    [change],
  );
  const chooseCover = useCallback(
    async (id: number) => {
      const path = await pickImage();
      if (path === null) return;
      await change(() => setPlaylistCover(id, path), undefined);
      setCoverRevision((r) => r + 1);
    },
    [change],
  );
  const clearCover = useCallback(
    async (id: number) => {
      await change(() => clearPlaylistCover(id), undefined);
      setCoverRevision((r) => r + 1);
    },
    [change],
  );

  return {
    playlists,
    error,
    coverRevision,
    create,
    rename,
    remove,
    add,
    chooseCover,
    clearCover,
    refresh,
  };
}
