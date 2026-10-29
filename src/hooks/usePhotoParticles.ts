import { useCallback, useState } from "react";
import { loadParticleStyle, saveParticleStyle, type ParticleStyle } from "../lib/photoParticles";

export interface PhotoParticleControls {
  style: ParticleStyle;
  setStyle: (style: ParticleStyle) => void;
}

/** "Kendi resmin" sahnesinin parçacıkları (Kıvılcım, Kar, Kapalı); seçim hatırlanır. */
export function usePhotoParticles(): PhotoParticleControls {
  const [style, setStyleState] = useState<ParticleStyle>(loadParticleStyle);
  const setStyle = useCallback((next: ParticleStyle) => {
    setStyleState(next);
    saveParticleStyle(next);
  }, []);
  return { style, setStyle };
}
