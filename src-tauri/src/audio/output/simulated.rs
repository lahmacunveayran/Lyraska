//! Testler için sanal ses çıkışı.
//!
//! Gerçek çıkışla aynı [`Renderer`]'ı kullanır ama bir ses aygıtı yerine halka
//! tamponu hızlandırılmış zamanda tüketir. Böylece oynatıcının bütün akışı
//! (aç, duraklat, sar, durdur, şarkı sonu) her makinede test edilebilir.

use std::cell::Cell;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread::JoinHandle;
use std::time::Duration;

use rtrb::Consumer;

use super::{DeviceInfo, FadeWatch, IntFormat, OutputMode, OutputSpec};
use crate::audio::player::SharedState;
use crate::audio::render::Renderer;
use crate::audio::{AudioError, Sample};

/// Her turda tüketilen süre (şarkı zamanı) ve turlar arası bekleme (gerçek zaman):
/// 50 ms ses / 1 ms → yaklaşık 50 kat hız.
const STEP_SECONDS: f64 = 0.05;
const STEP_SLEEP: Duration = Duration::from_millis(1);

thread_local! {
    /// Testin seçtiği sanal aygıt hızı; `None` ise aygıt bilgisi yok sayılır.
    static DEVICE_RATE: Cell<Option<u32>> = const { Cell::new(None) };
    /// Sanal aygıtın özel modda kabul ettiği biçim (`None`: özel mod yok).
    static EXCLUSIVE: Cell<Option<IntFormat>> = const { Cell::new(None) };
    /// Özel mod açılırken aygıt başka programca tutuluyor mu?
    static EXCLUSIVE_BUSY: Cell<bool> = const { Cell::new(false) };
}

/// Sanal aygıtta açılan akışların kaydı (bütün iş parçacıkları için ortak; testler kendi dosya
/// adlarıyla süzer). Oynatıcı testleri "aynı anda tek oturum aygıtı tutar" kuralını bununla ölçer.
#[derive(Default)]
struct Streams {
    /// Açık akışlar: kimlik ve şarkının yolu.
    open: Vec<(u64, PathBuf)>,
    /// Her açılışta o an açık olan akışların yolları (yeni akış dahil).
    opened: Vec<(PathBuf, Vec<PathBuf>)>,
    /// Bu şarkının akışı açılırken çağrılır (aygıt açılırken durdurmak için); bir kez.
    hooks: Vec<(PathBuf, Box<dyn FnOnce() + Send>)>,
}

static STREAMS: Mutex<Option<Streams>> = Mutex::new(None);
static STREAM_IDS: AtomicU64 = AtomicU64::new(0);

fn streams() -> MutexGuard<'static, Option<Streams>> {
    STREAMS
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// `path`'in akışı sanal aygıtta kaç kez açıldı.
pub fn stream_opens(path: &Path) -> usize {
    streams()
        .as_ref()
        .map_or(0, |s| s.opened.iter().filter(|(p, _)| p == path).count())
}

/// `paths`'ten birinin akışı açılırken bu yollardan aynı anda en çok kaç akış açıktı.
pub fn max_open_streams(paths: &[&Path]) -> usize {
    streams().as_ref().map_or(0, |s| {
        s.opened
            .iter()
            .filter(|(p, _)| paths.contains(&p.as_path()))
            .map(|(_, open)| open.iter().filter(|p| paths.contains(&p.as_path())).count())
            .max()
            .unwrap_or(0)
    })
}

/// `path`'in akışı açılırken (akış açık sayıldıktan sonra) `hook` bir kez çağrılır.
pub fn on_stream_open(path: &Path, hook: impl FnOnce() + Send + 'static) {
    streams()
        .get_or_insert_with(Streams::default)
        .hooks
        .push((path.to_path_buf(), Box::new(hook)));
}

/// Akış açıldı; dönen kimlik akış kapanınca [`stream_closed`]'a verilir.
fn stream_opened(path: Option<PathBuf>) -> Option<u64> {
    let path = path?;
    let id = STREAM_IDS.fetch_add(1, Ordering::Relaxed);
    let hook = {
        let mut guard = streams();
        let s = guard.get_or_insert_with(Streams::default);
        s.open.push((id, path.clone()));
        let open = s.open.iter().map(|(_, p)| p.clone()).collect();
        s.opened.push((path.clone(), open));
        s.hooks
            .iter()
            .position(|(p, _)| *p == path)
            .map(|index| s.hooks.remove(index).1)
    };
    if let Some(hook) = hook {
        hook();
    }
    Some(id)
}

fn stream_closed(id: Option<u64>) {
    if let (Some(id), Some(s)) = (id, streams().as_mut()) {
        s.open.retain(|(open, _)| *open != id);
    }
}

/// Bu iş parçacığındaki testler için sanal aygıtın örnekleme hızını ayarlar.
pub fn set_device_rate(rate: Option<u32>) {
    DEVICE_RATE.with(|r| r.set(rate));
}

/// Bu iş parçacığındaki testler için sanal aygıtın özel mod desteğini ayarlar.
/// `busy`: biçim desteklense de akış açılamaz (ör. başka program aygıtı tutuyor).
pub fn set_exclusive(format: Option<IntFormat>, busy: bool) {
    EXCLUSIVE.with(|f| f.set(format));
    EXCLUSIVE_BUSY.with(|b| b.set(busy));
}

pub fn exclusive_format(sample_rate: u32, channels: usize) -> Result<IntFormat, String> {
    let _ = (sample_rate, channels);
    EXCLUSIVE
        .with(Cell::get)
        .ok_or_else(|| "sanal aygıt özel modu desteklemiyor".to_owned())
}

pub fn device_info() -> Option<DeviceInfo> {
    DEVICE_RATE.with(Cell::get).map(|sample_rate| DeviceInfo {
        name: "Sanal aygıt".to_owned(),
        sample_rate,
        channels: 2,
    })
}

pub fn spawn(
    spec: OutputSpec,
    mut source: Consumer<Sample>,
    shared: Arc<SharedState>,
) -> Result<JoinHandle<()>, AudioError> {
    if matches!(spec.mode, OutputMode::Exclusive(_)) && EXCLUSIVE_BUSY.with(Cell::get) {
        return Err(AudioError::Exclusive(
            "aygıtı başka bir program özel modda kullanıyor".to_owned(),
        ));
    }
    let frames_per_step = (f64::from(spec.sample_rate) * STEP_SECONDS) as usize;
    let stream = stream_opened(shared.first_path());
    let spawned = std::thread::Builder::new()
        .name("lyraska-sanal-cikis".to_owned())
        .spawn(move || {
            // Akış iş parçacığı bitince (durdurma, şarkı sonu) kapanmış sayılır.
            struct Close(Option<u64>);
            impl Drop for Close {
                fn drop(&mut self) {
                    stream_closed(self.0);
                }
            }
            let _close = Close(stream);
            let mut renderer =
                Renderer::new(spec.channels, spec.sample_rate, shared.controls.clone());
            let mut out: Vec<Sample> = vec![0.0; frames_per_step * spec.channels];
            let mut consumed = 0u64;
            let mut fade = FadeWatch::default();
            while !shared.stop.load(Ordering::Acquire) {
                if shared.decode_done.load(Ordering::Acquire) && source.is_empty() {
                    shared.ended.store(true, Ordering::Release);
                    return;
                }
                let paused = shared.paused.load(Ordering::Acquire);
                let outcome = renderer.render(&mut source, &mut out, paused);
                consumed += outcome.frames_consumed as u64;
                shared.record_heard(consumed, false);
                // Sanal aygıtın arabelleği yok: yazılan hemen "çalınır".
                let silent = paused && renderer.gain() == 0.0;
                fade.wrote(frames_per_step, silent, renderer.latency_frames());
                shared.faded_out.store(fade.faded_out(0), Ordering::Release);
                std::thread::sleep(STEP_SLEEP);
            }
        });
    if spawned.is_err() {
        stream_closed(stream);
    }
    spawned.map_err(|e| AudioError::Output(e.to_string()))
}
