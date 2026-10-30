import { useCallback, useState } from "react";
import { loadIntensity, saveIntensity, type Intensity } from "../lib/lightShow";

/**
 * Işık Ustası'nın yoğunluğu ("Sakin / Normal / Çılgın"): ışın sayısı, strob ve kamera hızı.
 * Kaydedilir (bu bilgisayarda); varsayılan Normal. Epilepsi güvenli modundan ayrıdır: güvenli
 * mod açıkken her yoğunlukta strob yoktur.
 */
export function useLightShowIntensity(): [Intensity, (intensity: Intensity) => void] {
  const [intensity, setState] = useState<Intensity>(loadIntensity);
  const set = useCallback((next: Intensity) => {
    setState(next);
    saveIntensity(next);
  }, []);
  return [intensity, set];
}
