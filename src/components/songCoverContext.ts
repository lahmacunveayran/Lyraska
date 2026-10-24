import { createContext } from "react";

/** Şarkı satırlarının kapak işlemleri (kütüphane paneli verir; yoksa satırda kapak menüsü olmaz). */
export interface SongCoverActions {
  choose: (path: string) => void;
  clear: (path: string) => void;
}

export const SongCoverContext = createContext<SongCoverActions | null>(null);
