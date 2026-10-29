/**
 * Ekran kartı süresi ölçümü (geliştirici göstergesi için): `EXT_disjoint_timer_query_webgl2`
 * varsa bir karenin ekran kartında geçen süresi ölçülür. Sonuç 1–3 kare gecikmeli gelir; ölçüm
 * sırasında ekran kartı başka işe geçtiyse ("disjoint") o ölçüm atılır. Eklenti yoksa (bazı
 * sürücüler, yazılımsal çizim) `null` döner; gösterge o zaman yalnızca kare aralığını yazar.
 *
 * Sorgular bir halkada yeniden kullanılır: karede bellek ayrılmaz.
 */
export interface GpuTimer {
  /** Karenin ekran kartı işi başlıyor (önceki ölçüm bitmediyse bu kare atlanır). */
  begin(): void;
  end(): void;
  /** Son ölçülen sürelerin üstel ortalaması (ms); henüz yoksa `null`. */
  readonly averageMs: number | null;
  dispose(): void;
}

interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

const RING = 4;
/** Ortalamanın yeni ölçüme verdiği pay. */
const SMOOTHING = 0.1;

export function createGpuTimer(gl: WebGL2RenderingContext): GpuTimer | null {
  const ext = timerExtension(gl);
  if (!ext) return null;
  const queries: (WebGLQuery | null)[] = Array.from({ length: RING }, () => gl.createQuery());
  const pending: boolean[] = Array.from({ length: RING }, () => false);
  let next = 0;
  let open = -1;
  let average: number | null = null;
  const timeElapsed = ext.TIME_ELAPSED_EXT;
  const disjointFlag = ext.GPU_DISJOINT_EXT;

  const collect = () => {
    for (let i = 0; i < RING; i++) {
      const query = queries[i];
      if (!pending[i] || !query || i === open) continue;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) continue;
      pending[i] = false;
      const disjoint = gl.getParameter(disjointFlag) as boolean;
      if (disjoint) continue;
      const ms = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
      if (!Number.isFinite(ms) || ms < 0) continue;
      average = average === null ? ms : average + (ms - average) * SMOOTHING;
    }
  };

  return {
    begin() {
      collect();
      const query = queries[next];
      if (!query || pending[next]) return;
      gl.beginQuery(timeElapsed, query);
      open = next;
    },
    end() {
      if (open < 0) return;
      gl.endQuery(timeElapsed);
      pending[open] = true;
      open = -1;
      next = (next + 1) % RING;
    },
    get averageMs() {
      return average;
    },
    dispose() {
      if (gl.isContextLost()) return;
      for (const query of queries) if (query) gl.deleteQuery(query);
    },
  };
}

function timerExtension(gl: WebGL2RenderingContext): TimerExtension | null {
  try {
    return gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExtension | null;
  } catch {
    return null;
  }
}
