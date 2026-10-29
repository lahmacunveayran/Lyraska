import { useCallback, useState } from "react";
import {
  clampDensity,
  loadParticleDensity,
  loadParticleStyle,
  saveParticleDensity,
  saveParticleStyle,
  type ParticleStyle,
} from "../lib/photoParticles";

export interface PhotoParticleControls {
  style: ParticleStyle;
  setStyle: (style: ParticleStyle) => void;
  /** Yoğunluk (doğum hızının çarpanı, 0,25–2). */
  density: number;
  setDensity: (density: number) => void;
}

/** "Kendi resmin" sahnesinin parçacıkları (Kıvılcım, Kar, Kapalı) ve yoğunluğu; seçim hatırlanır. */
export function usePhotoParticles(): PhotoParticleControls {
  const [style, setStyleState] = useState<ParticleStyle>(loadParticleStyle);
  const setStyle = useCallback((next: ParticleStyle) => {
    setStyleState(next);
    saveParticleStyle(next);
  }, []);
  const [density, setDensityState] = useState<number>(loadParticleDensity);
  const setDensity = useCallback((next: number) => {
    const clamped = clampDensity(next);
    setDensityState(clamped);
    saveParticleDensity(clamped);
  }, []);
  return { style, setStyle, density, setDensity };
}
