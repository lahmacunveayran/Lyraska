//! Çalan ve sıradaki şarkının analizi: önbellekten okunur ya da arka planda başlatılır,
//! eskiyen parçası yenilenir; içe aktarılmış harita analizin önüne geçer. Oynatıcı analizi
//! boşluksuz geçişte sıradaki şarkınınkine geçirir; şarkının yapısı ve tonu buradan okunur.

use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicUsize;
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use super::Player;
use crate::analysis::background::ForegroundGuard;
use crate::analysis::cache::{AnalysisCache, CachedAnalysis, FileStamp};
use crate::analysis::map_file::MapStore;
use crate::analysis::spectrogram::{self, Spectrogram};
use crate::audio::decode::Decoder;
use crate::diagnostics;

/// Bir şarkının arka planda süren (ya da biten) spektrum analizi.
pub(super) struct Analysis {
    pub(super) path: PathBuf,
    pub(super) spectrogram: Arc<Spectrogram>,
    pub(super) thread: Option<JoinHandle<()>>,
}

/// Analizlerin ortak bağlamı: önbellek ve oynatıcının süren analiz sayacı
/// (arka plan analizi bu sayaç sıfırdan büyükken bekler).
#[derive(Clone, Default)]
pub(super) struct AnalysisContext {
    pub(super) cache: Option<Arc<AnalysisCache>>,
    pub(super) foreground: Arc<AtomicUsize>,
    /// İçe aktarılan şarkı haritaları: şarkının analizi kurulurken uygulanır.
    pub(super) maps: Option<Arc<MapStore>>,
}

impl Analysis {
    /// Şarkının analizini başlatır. Önbellekte geçerli kaydı varsa anında hazırdır.
    /// `after` verilirse (sıradaki şarkı) o analiz bitene kadar bekler: önce çalan şarkı.
    /// Şarkıya içe aktarılmış bir harita varsa (dosyası değişmediyse) analizin önüne geçer.
    pub(super) fn start(
        path: &Path,
        context: &AnalysisContext,
        after: Option<Arc<Spectrogram>>,
    ) -> Option<Self> {
        let analysis = Self::start_analysis(path, context, after)?;
        if let Some(imported) = context.maps.as_ref().and_then(|maps| maps.load(path)) {
            let (grid, map) = imported.map.rhythm();
            analysis
                .spectrogram
                .set_imported(grid, map, imported.map.musical_key());
        }
        Some(analysis)
    }

    fn start_analysis(
        path: &Path,
        context: &AnalysisContext,
        after: Option<Arc<Spectrogram>>,
    ) -> Option<Self> {
        let stamp = FileStamp::of(path);
        if let (Some(cache), Some(stamp)) = (&context.cache, stamp) {
            match cache.load(path, stamp) {
                Ok(Some(cached)) if !cached.stale.any() => {
                    return Some(Self {
                        path: path.to_path_buf(),
                        spectrogram: Spectrogram::from_saved(cached.saved),
                        thread: None,
                    })
                }
                // Bir parçası eskimiş (ör. ritim hesabı değişti): kareler hemen kullanılır,
                // yalnızca eskiyen parça yeniden hesaplanır.
                Ok(Some(cached)) => return Self::refresh(path, cached, context, after, stamp),
                Ok(None) => {}
                Err(e) => diagnostics::error(&e.to_string()),
            }
        }
        let decoder = Decoder::open(path).ok()?;
        let spectrogram = Spectrogram::new();
        // Ses yüksekliği ayrı, hızlı bir geçişle ölçülür: eşitleme kazancı çoğu zaman
        // ilk sesten önce bilinir (tam analiz birkaç saniye sürer).
        if let Ok(quick) = Decoder::open(path) {
            let target = Arc::clone(&spectrogram);
            let _ = std::thread::Builder::new()
                .name("lyraska-olcum".to_owned())
                .spawn(move || spectrogram::measure_loudness(quick, &target));
        }
        let target = Arc::clone(&spectrogram);
        let busy = ForegroundGuard::new(&context.foreground);
        let cache = context.cache.clone();
        let file = path.to_path_buf();
        let thread = std::thread::Builder::new()
            .name("lyraska-analiz".to_owned())
            .spawn(move || {
                let _busy = busy;
                if let Some(first) = after {
                    while !first.is_done() && !first.is_cancelled() && !target.is_cancelled() {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                }
                spectrogram::analyze(decoder, &target);
                if let (Some(cache), Some(stamp), Some(saved)) = (cache, stamp, target.saved()) {
                    if let Err(e) = cache.store(&file, stamp, &saved) {
                        diagnostics::error(&e.to_string());
                    }
                }
            })
            .ok()?;
        Some(Self {
            path: path.to_path_buf(),
            spectrogram,
            thread: Some(thread),
        })
    }
}

impl Analysis {
    /// Önbellekteki kaydın eskimiş parçalarını ayrı iş parçacığında yeniler ve saklar
    /// ([`spectrogram::refresh_paced`]).
    pub(super) fn refresh(
        path: &Path,
        cached: CachedAnalysis,
        context: &AnalysisContext,
        after: Option<Arc<Spectrogram>>,
        stamp: FileStamp,
    ) -> Option<Self> {
        let spectrogram = Spectrogram::new();
        let target = Arc::clone(&spectrogram);
        // Kareler önbellekten hemen: görseller iş parçacığının başlamasını (ya da çalan şarkının
        // analizinin bitmesini) beklemez.
        spectrogram::publish_cached(&target, &cached);
        let busy = ForegroundGuard::new(&context.foreground);
        let cache = context.cache.clone();
        let file = path.to_path_buf();
        let thread = std::thread::Builder::new()
            .name("lyraska-analiz".to_owned())
            .spawn(move || {
                let _busy = busy;
                if let Some(first) = after {
                    while !first.is_done() && !first.is_cancelled() && !target.is_cancelled() {
                        std::thread::sleep(Duration::from_millis(20));
                    }
                }
                let mut open = || Decoder::open(&file).ok();
                if !spectrogram::refresh_paced(cached, &mut open, &target, &mut || {}) {
                    return;
                }
                if let (Some(cache), Some(saved)) = (cache, target.saved()) {
                    if let Err(e) = cache.store(&file, stamp, &saved) {
                        diagnostics::error(&e.to_string());
                    }
                }
            })
            .ok()?;
        Some(Self {
            path: path.to_path_buf(),
            spectrogram,
            thread: Some(thread),
        })
    }
}

impl Drop for Analysis {
    /// İptal eder ama iş parçacığını **beklemez**: iş parçacığı o anda önbelleğe yazıyorsa
    /// (kütüphane taramasıyla çakışırsa 5 sn'ye kadar) oynatıcı kilidi onu beklemesin; iş
    /// parçacığı iptali ilk dilimde görür ve kendi biter (ANL-06).
    fn drop(&mut self) {
        self.spectrogram.cancel();
        drop(self.thread.take());
    }
}

impl Player {
    /// Analiz önbelleğini bağlar: analizler önce önbellekten okunur, bitenler yazılır.
    pub fn set_analysis_cache(&mut self, cache: Arc<AnalysisCache>) {
        self.analysis_context.cache = Some(cache);
    }

    /// İçe aktarılan şarkı haritalarının deposu (program açılırken).
    pub fn set_map_store(&mut self, store: Arc<MapStore>) {
        self.analysis_context.maps = Some(store);
    }

    /// Oynatıcının süren analiz sayacı (arka plan analizi bununla bekler).
    pub fn foreground_analyses(&self) -> Arc<AtomicUsize> {
        Arc::clone(&self.analysis_context.foreground)
    }

    /// Analizi verilen şarkınınkine geçirir: önceden başlatılmışsa onu kullanır.
    pub(super) fn adopt_analysis(&mut self, path: &Path) {
        if self.analysis.as_ref().is_some_and(|a| a.path == path) {
            return;
        }
        if self.next_analysis.as_ref().is_some_and(|a| a.path == path) {
            self.analysis = self.next_analysis.take();
        } else {
            self.analysis = None;
            self.analysis = Analysis::start(path, &self.analysis_context, None);
        }
    }

    /// Çalan şarkının analizi (boşluksuz geçişten hemen sonra önceden başlatılan da olabilir).
    pub(super) fn analysis_for(&self, path: &Path) -> Option<&Analysis> {
        [&self.analysis, &self.next_analysis]
            .into_iter()
            .flatten()
            .find(|a| a.path == path)
    }

    /// Çalan şarkının yapısı (analiz bittiyse).
    pub fn song_map(&self) -> Option<Arc<crate::analysis::structure::SongMap>> {
        let (track, _) = self.session.as_ref()?.now_playing();
        self.analysis_for(&track.path)?.spectrogram.song_map()
    }

    /// Çalan şarkının tonu ve tonu farklı bölümleri; ton analizi bitmediyse `None`. Ritim yoksa
    /// (bölüm yok) yalnızca şarkının tonu.
    pub fn song_key(&self) -> Option<crate::analysis::key::KeyMap> {
        let (track, _) = self.session.as_ref()?.now_playing();
        let spectrogram = &self.analysis_for(&track.path)?.spectrogram;
        let key = spectrogram.key()?;
        let sections = spectrogram
            .song_map()
            .map(|m| m.sections.clone())
            .unwrap_or_default();
        let mut map = key.key_map(&sections);
        // İçe aktarılan haritanın tonu (ör. kullanıcının düzelttiği) şarkının tonunun yerine.
        if let Some(imported) = spectrogram.imported_key() {
            map.key = Some(imported).filter(crate::analysis::key::MusicalKey::is_confident);
        }
        Some(map)
    }
}
