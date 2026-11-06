//! Windows WASAPI çıkışı.
//!
//! - **Paylaşımlı mod** (olay güdümlü): ses motoru her periyotta (genellikle 10 ms) bir
//!   olay gönderir; arabellekteki boş yer halka tampondan doldurulur. Arabellek 100 ms'dir:
//!   işletim sistemi iş parçacığımızı kısa süre geciktirse bile ses kesilmez.
//! - **Özel mod** (bit-perfect): aygıt yalnızca Lyraska'ya ayrılır; şarkının hızında ve aygıtın
//!   kabul ettiği tamsayı biçiminde açılır. İki zamanlama vardır, ikisi de bazı sürücülerde bozuk:
//!   yoklamalı (arabellek ~100 ms) standart USB ses sürücüsünde iyidir ama Realtek'te aygıt
//!   arabelleği boşaltmaz, ilk arabelleği döngüyle çalar (vızıltı); olaylı (arabellek bir periyot)
//!   Realtek'te iyidir ama USB sürücüsünde takılabilir (wasapi-rs belgesi). Önce yoklamalı denenir:
//!   açılışta sessizlikle aygıtın gerçekten tükettiği ölçülür, tüketmiyorsa olaylıya geçilir. Karar
//!   aygıt başına hatırlanır (sarmada yeniden ölçülmez).
//! - **Aygıt değişimi**: ayrı bir izleme iş parçacığı yarım saniyede bir varsayılan aygıtın
//!   kimliğine bakar; değişmişse (kulaklık takıldı) ya da akış koparsa (kulaklık çıkarıldı)
//!   `SharedState::device_changed` kaldırılır ve oynatıcı şarkıyı yeni varsayılan aygıtta
//!   kaldığı yerden açar (SES-01).
//! - **Öncelik**: ses iş parçacığı MMCSS "Pro Audio" sınıfına alınır; ağır analiz iş
//!   parçacıkları ve WebView çizimi onu geciktiremez (SES-03). Bu, depodaki tek `unsafe`
//!   çağrıdır; gerekçesi [`boost_thread_priority`] içinde.

use std::sync::atomic::Ordering;
use std::sync::mpsc::{self, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use rtrb::Consumer;
use wasapi::{
    initialize_mta, AudioClient, Device, DeviceEnumerator, Direction, Handle, SampleType,
    StreamMode, WasapiError, WaveFormat,
};

use super::{DeviceInfo, FadeWatch, IntFormat, OutputMode, OutputSpec};
use crate::audio::player::SharedState;
use crate::audio::render::Renderer;
use crate::audio::{AudioError, Sample};

/// Paylaşımlı modda aygıt arabelleğinin süresi (100 ns birimi): 100 ms.
const BUFFER_DURATION_HNS: i64 = 1_000_000;
/// Bu süre içinde olay gelmezse aygıt kopmuş sayılır.
const EVENT_TIMEOUT_MS: u32 = 2_000;
/// Özel modda açılıştaki ilk olayın en geç geleceği süre; gelmezse aygıt paylaşımlı yoldan çalar.
const EXCLUSIVE_FIRST_EVENT_MS: u32 = 500;
/// Yoklamalı özel modu açılışta sessizlikle ölçme süresi.
const POLLING_PROBE: Duration = Duration::from_millis(400);
/// Ölçümün ilk kısmı sayılmaz: aygıt saatini geç yakalasa (USB DAC hız değişiminde, uyanan codec)
/// da yanlış karar çıkmasın.
const POLLING_SETTLE: Duration = Duration::from_millis(150);
/// Yoklamalı özel modda aygıt ölçüm penceresinin en az bu kadarını tüketmeli (Realtek: 0).
const POLLING_MIN_RATIO: f64 = 0.5;
/// Yoklamalı akış bırakıldıktan sonra olaylı açılış "aygıt kullanımda" derse deneme sayısı ve arası.
const REOPEN_TRIES: usize = 3;
const REOPEN_WAIT: Duration = Duration::from_millis(50);
/// Şarkı sonunda aygıttaki son örneklerin çalınmasını beklerken yoklama aralığı.
const DRAIN_POLL: Duration = Duration::from_millis(5);
/// Intel HDA uyumlu aygıtlar özel modda arabelleğin 128 baytın katı olmasını ister.
const EXCLUSIVE_ALIGN_BYTES: u32 = 128;
/// Varsayılan aygıt değişti mi diye bakma aralığı (ayrı iş parçacığında; ses yolunda değil).
const DEVICE_POLL: Duration = Duration::from_millis(500);

/// WASAPI hata kodları (`AUDCLNT_E_…`, audioclient.h).
const AUDCLNT_E_UNSUPPORTED_FORMAT: u32 = 0x8889_0008;
const AUDCLNT_E_DEVICE_IN_USE: u32 = 0x8889_000A;
const AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED: u32 = 0x8889_000E;

type Ready = SyncSender<Result<(), AudioError>>;

/// WASAPI hatasını kullanıcıya gösterilecek Türkçe bir mesajla sarar.
fn fail(context: &'static str) -> impl FnOnce(WasapiError) -> AudioError {
    move |error| AudioError::Output(format!("{context}: {error}"))
}

/// Windows hata kodu (HRESULT), varsa.
fn hresult(error: &WasapiError) -> Option<u32> {
    match error {
        WasapiError::Windows(e) => Some(e.code().0 as u32),
        _ => None,
    }
}

/// Özel modun açılamama nedeni, kullanıcının anlayacağı biçimde.
/// Aygıt başka bir akışa ayrılmışken özel modun nedeni.
const IN_USE: &str = "aygıtı başka bir program özel modda kullanıyor";

fn exclusive_reason(error: &WasapiError) -> String {
    match hresult(error) {
        Some(AUDCLNT_E_DEVICE_IN_USE) => IN_USE.to_owned(),
        Some(AUDCLNT_E_EXCLUSIVE_MODE_NOT_ALLOWED) => "Windows bu aygıtta özel moda izin vermiyor \
             (Ses ayarları > aygıt > Gelişmiş: \"Uygulamaların bu cihazın özel denetimini \
             almasına izin ver\")"
            .to_owned(),
        Some(AUDCLNT_E_UNSUPPORTED_FORMAT) => "aygıt bu biçimi özel modda desteklemiyor".to_owned(),
        _ => format!("özel mod açılamadı ({error})"),
    }
}

/// Örnekleme hızı, Türkçe yazımla ("44,1 kHz").
fn khz(sample_rate: u32) -> String {
    format!("{} kHz", f64::from(sample_rate) / 1000.0).replace('.', ",")
}

fn int_wave_format(format: IntFormat, sample_rate: u32, channels: usize) -> WaveFormat {
    WaveFormat::new(
        usize::from(format.container_bits),
        usize::from(format.valid_bits),
        &SampleType::Int,
        sample_rate as usize,
        channels,
        None,
    )
}

fn default_device() -> Result<Device, AudioError> {
    let enumerator = DeviceEnumerator::new().map_err(fail("Ses aygıtları listelenemedi"))?;
    enumerator
        .get_default_device(&Direction::Render)
        .map_err(|_| AudioError::NoOutputDevice)
}

/// Varsayılan çıkış aygıtının adı ve paylaşımlı mod biçimi (mix format).
pub fn device_info() -> Option<DeviceInfo> {
    // COM bu iş parçacığında başka kipte başlatılmış olabilir; aygıt sorgusu yine çalışır.
    let _ = initialize_mta();
    let device = default_device().ok()?;
    let name = device.get_friendlyname().unwrap_or_default();
    let format = device.get_iaudioclient().ok()?.get_mixformat().ok()?;
    Some(DeviceInfo {
        name,
        sample_rate: format.get_samplespersec(),
        channels: usize::from(format.get_nchannels()),
    })
}

/// Varsayılan aygıtın bu hızda ve kanal sayısında özel modda kabul ettiği en iyi biçim.
pub fn exclusive_format(sample_rate: u32, channels: usize) -> Result<IntFormat, String> {
    let _ = initialize_mta();
    let device = default_device().map_err(|e| e.to_string())?;
    let client = device
        .get_iaudioclient()
        .map_err(|e| exclusive_reason(&e))?;
    IntFormat::CANDIDATES
        .into_iter()
        .find(|&format| {
            client
                .is_supported_exclusive_with_quirks(&int_wave_format(format, sample_rate, channels))
                .is_ok()
        })
        .ok_or_else(|| {
            format!(
                "aygıt {} ve {channels} kanalı özel modda desteklemiyor",
                khz(sample_rate)
            )
        })
}

/// Ses iş parçacığını Windows'un çoklu ortam sınıf zamanlayıcısına (MMCSS) "Pro Audio" görevi
/// olarak kaydeder: iş parçacığı normal önceliğin üstüne çıkar, ağır yükte bile
/// aygıt arabelleği boşalmadan sıraya girer. Dönen tutamaç iş parçacığı bitince geri verilir.
/// Başarısızlık (eski Windows, kısıtlı hesap) hata değildir: normal öncelikle sürülür.
///
/// GÜVENLİK: `AvSetMmThreadCharacteristicsW` ve `AvRevertMmThreadCharacteristics` Windows
/// API çağrılarıdır (`windows` crate'i bunları `unsafe` olarak dışa verir). Girdileri burada
/// kurulan geçerli, sıfırla biten bir UTF-16 dizisi ve geçerli bir `u32` adresidir; çağrı
/// yalnızca bu iş parçacığının zamanlayıcı sınıfını değiştirir, belleğe dokunmaz. Tutamaç
/// yalnızca aynı iş parçacığında ve bir kez geri verilir. CLAUDE.md kuralı gereği `unsafe`
/// yalnızca bu modülde ve proje sahibine bildirilerek (DENETIM-2 bölüm 5.3) açılmıştır.
#[allow(unsafe_code, reason = "MMCSS Windows API çağrısı; GÜVENLİK: yukarıda")]
fn boost_thread_priority() -> Option<ThreadPriority> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Threading::AvSetMmThreadCharacteristicsW;
    let task_name: Vec<u16> = "Pro Audio\0".encode_utf16().collect();
    let mut task_index = 0u32;
    // GÜVENLİK: bkz. fonksiyon belgesi.
    let handle =
        unsafe { AvSetMmThreadCharacteristicsW(PCWSTR(task_name.as_ptr()), &mut task_index) };
    match handle {
        Ok(handle) if !handle.is_invalid() => Some(ThreadPriority(handle)),
        _ => {
            crate::diagnostics::info(
                "Ses iş parçacığına MMCSS önceliği verilemedi; normal öncelikle sürüyor",
            );
            None
        }
    }
}

/// MMCSS kaydı; düşünce geri verilir.
struct ThreadPriority(windows::Win32::Foundation::HANDLE);

impl Drop for ThreadPriority {
    #[allow(unsafe_code, reason = "MMCSS kaydını geri verme; GÜVENLİK: aşağıda")]
    fn drop(&mut self) {
        use windows::Win32::System::Threading::AvRevertMmThreadCharacteristics;
        // GÜVENLİK: tutamaç `boost_thread_priority`'den geldi, bu iş parçacığına aittir ve bir
        // kez geri verilir (bkz. oradaki açıklama).
        let _ = unsafe { AvRevertMmThreadCharacteristics(self.0) };
    }
}

/// Varsayılan çıkış aygıtının kimliği (COM bu iş parçacığında başlatılmış olmalı).
fn default_device_id() -> Option<String> {
    default_device().ok()?.get_id().ok()
}

/// Varsayılan aygıt değişene ya da oturum bitene kadar yarım saniyede bir bakar; değişince
/// `device_changed` kaldırır ve biter. Aygıt hiç bulunamazsa (hepsi çıkarıldı) akışın kendisi
/// hata verir; burada bir şey yapılmaz.
fn watch_default_device(shared: Arc<SharedState>, current: String) {
    let _ = initialize_mta();
    loop {
        if shared.stop.load(Ordering::Acquire) || shared.ended.load(Ordering::Acquire) {
            return;
        }
        std::thread::sleep(DEVICE_POLL);
        if default_device_id().is_some_and(|id| id != current) {
            shared.device_changed.store(true, Ordering::Release);
            return;
        }
    }
}

pub fn spawn(
    spec: OutputSpec,
    source: Consumer<Sample>,
    shared: Arc<SharedState>,
) -> Result<JoinHandle<()>, AudioError> {
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    let handle = std::thread::Builder::new()
        .name("lyraska-ses-cikisi".to_owned())
        .spawn(move || {
            let mut ready = Some(ready_tx);
            let _priority = boost_thread_priority();
            if let Err(error) = run(spec, source, &shared, &mut ready) {
                match ready.take() {
                    // Açılışta hata: oynatıcıya hemen bildir.
                    Some(tx) => {
                        let _ = tx.send(Err(error));
                    }
                    // Çalarken hata (çoğunlukla aygıt koptu: kulaklık çıkarıldı): günlüğe ve
                    // duruma yazılır; oynatıcı şarkıyı o anki varsayılan aygıtta sürdürmeyi dener.
                    None => {
                        shared.fail(error.to_string());
                        shared.device_changed.store(true, Ordering::Release);
                    }
                }
            }
        })
        .map_err(|e| AudioError::Output(e.to_string()))?;

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(handle),
        Ok(Err(error)) => {
            let _ = handle.join();
            Err(error)
        }
        Err(_) => {
            let _ = handle.join();
            Err(AudioError::Output(
                "ses iş parçacığı beklenmedik şekilde kapandı".to_owned(),
            ))
        }
    }
}

/// Akışın zamanlaması.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Timing {
    /// Paylaşımlı mod: ses motorunun olayı, boş yer kadar yazılır.
    Shared,
    /// Yoklamalı özel mod: arabellek ~100 ms, periyodun yarısında bir boş yer doldurulur.
    Polling,
    /// Olaylı özel mod: arabellek bir periyot; her olayda tam bir arabellek yazılır (azı aygıt
    /// hatası 0x88890016). Dolu kısım (padding) hep bir arabellek görünür, bitişi ölçemez.
    Events,
}

/// Bir aygıt ve hız için özel modun ölçülmüş sonucu (program açık kaldıkça).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Verdict {
    Polling,
    Events,
    /// İki zamanlama da bir kez çalışmadı: bir sonraki açılışta yeniden ölçülür (geçici aksaklık
    /// kalıcı karara dönmesin).
    FailedOnce,
    /// İki zamanlama da iki kez üst üste çalışmadı: özel mod hemen reddedilir, şarkı paylaşımlı
    /// yoldan çalar (her sarmada boşuna beklenmez).
    Unusable,
}

/// Ölçülmüş kararlar; anahtar aygıt kimliği ve hız. Yalnızca akış açılırken (ses döngüsünden önce)
/// okunur ve yazılır.
static VERDICTS: Mutex<Vec<(String, Verdict)>> = Mutex::new(Vec::new());

fn verdict_key(id: &str, sample_rate: u32) -> String {
    format!("{id}|{sample_rate}")
}

fn verdict(key: &str) -> Option<Verdict> {
    let verdicts = VERDICTS.lock().ok()?;
    verdicts.iter().find(|(k, _)| k == key).map(|&(_, v)| v)
}

fn remember(key: &str, value: Verdict) {
    if let Ok(mut verdicts) = VERDICTS.lock() {
        verdicts.retain(|(k, _)| k != key);
        verdicts.push((key.to_owned(), value));
    }
}

/// Varsayılan aygıtta bu hızda özel modun hangi zamanlamayla çaldığı (ölçüldüyse): "yoklamalı",
/// "olaylı" ya da "kullanılamıyor". Denemeler ve tanı için.
pub fn exclusive_timing(sample_rate: u32) -> Option<&'static str> {
    let _ = initialize_mta();
    let id = default_device().ok()?.get_id().ok()?;
    Some(match verdict(&verdict_key(&id, sample_rate))? {
        Verdict::Polling => "yoklamalı",
        Verdict::Events => "olaylı",
        Verdict::FailedOnce | Verdict::Unusable => "kullanılamıyor",
    })
}

/// Açılmış akış: istemci, biçim ve nasıl beklendiği.
struct Stream {
    client: AudioClient,
    timing: Timing,
    /// Aygıt bir arabellek daha isteyince gelen olay (yoklamalı özel modda `None`).
    event: Option<Handle>,
    /// Yoklamalı özel modda yoklama aralığı.
    poll: Duration,
    /// Aygıta yazılan örnek: `None` 32-bit kayan nokta, `Some` tamsayı.
    int: Option<IntFormat>,
    block_align: usize,
    /// Açılıştaki ölçümde sessizlikle başlatıldı mı.
    started: bool,
}

/// Paylaşımlı mod: şarkının (aygıta çevrilmiş) biçiminde 32-bit kayan nokta akış.
fn open_shared(device: &Device, spec: OutputSpec) -> Result<Stream, AudioError> {
    let mut client = device
        .get_iaudioclient()
        .map_err(fail("Ses aygıtı açılamadı"))?;
    // Akış zaten aygıtın hızında; değilse (aygıt bilgisi alınamadıysa) Windows dönüştürür.
    let format = WaveFormat::new(
        32,
        32,
        &SampleType::Float,
        spec.sample_rate as usize,
        spec.channels,
        None,
    );
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: BUFFER_DURATION_HNS,
    };
    client
        .initialize_client(&format, &Direction::Render, &mode)
        .map_err(fail("Ses akışı başlatılamadı"))?;
    let event = client
        .set_get_eventhandle()
        .map_err(fail("Ses olayı oluşturulamadı"))?;
    Ok(Stream {
        block_align: format.get_blockalign() as usize,
        client,
        timing: Timing::Shared,
        event: Some(event),
        poll: DRAIN_POLL,
        int: None,
        started: false,
    })
}

/// Özel mod (bit-perfect): şarkının hızında, aygıtın tamsayı biçiminde. Açılamazsa
/// [`AudioError::Exclusive`] döner; oynatıcı paylaşımlı moda geçer.
///
/// Yoklamalı özel mod önce sessizlikle ölçülür ([`polling_consumes`]): Realtek sürücüsü bu modda
/// arabelleği hiç boşaltmıyordu (dolu kısım hep tam, saniyede 44 100 yerine ~7 500 kare), ilk
/// arabelleği döngüyle çalıyordu: şarkı yerine "uyarı sesi gibi" vızıltı (5 Kasım 2026). O zaman
/// olaylı özel mod denenir; ilk olayı da gelmezse özel mod bu aygıtta kullanılamaz.
fn open_exclusive(device: &Device, spec: OutputSpec, int: IntFormat) -> Result<Stream, AudioError> {
    let key = device
        .get_id()
        .ok()
        .map(|id| verdict_key(&id, spec.sample_rate));
    let note = |value: Verdict| {
        if let Some(key) = &key {
            remember(key, value);
        }
    };
    let probe = |e: WasapiError| AudioError::Exclusive(exclusive_reason(&e));
    let known = key.as_deref().and_then(verdict);
    match known {
        Some(Verdict::Polling) => return open_exclusive_with(device, spec, int, Timing::Polling),
        Some(Verdict::Unusable) => return Err(AudioError::Exclusive(NO_EVENTS.to_owned())),
        Some(Verdict::Events) => {}
        None | Some(Verdict::FailedOnce) => {
            let mut stream = open_exclusive_with(device, spec, int, Timing::Polling)?;
            if polling_consumes(&mut stream, spec.sample_rate).map_err(probe)? {
                note(Verdict::Polling);
                return Ok(stream);
            }
            // Aygıt bırakılır (istemci düşer), aynı aygıt olaylı açılır.
            let _ = stream.client.stop_stream();
        }
    }
    let mut stream = open_events_after_release(device, spec, int)?;
    if first_event_arrives(&mut stream).map_err(probe)? {
        note(Verdict::Events);
        Ok(stream)
    } else {
        let _ = stream.client.stop_stream();
        note(if known == Some(Verdict::FailedOnce) {
            Verdict::Unusable
        } else {
            Verdict::FailedOnce
        });
        Err(AudioError::Exclusive(NO_EVENTS.to_owned()))
    }
}

/// Olaylı özel mod. Az önce bırakılan yoklamalı akışı sürücü geç bırakırsa "aygıt kullanımda"
/// dönebilir: kısa aralarla birkaç kez denenir.
fn open_events_after_release(
    device: &Device,
    spec: OutputSpec,
    int: IntFormat,
) -> Result<Stream, AudioError> {
    let mut tries = 1;
    loop {
        match open_exclusive_with(device, spec, int, Timing::Events) {
            Err(AudioError::Exclusive(reason)) if tries < REOPEN_TRIES && reason == IN_USE => {
                tries += 1;
                std::thread::sleep(REOPEN_WAIT);
            }
            other => return other,
        }
    }
}

/// İki zamanlama da çalışmayınca sinyal yolunda gösterilen neden.
const NO_EVENTS: &str = "aygıt özel modda ses istemedi (sürücü yanıt vermiyor)";

fn open_exclusive_with(
    device: &Device,
    spec: OutputSpec,
    int: IntFormat,
    timing: Timing,
) -> Result<Stream, AudioError> {
    let exclusive = |e: WasapiError| AudioError::Exclusive(exclusive_reason(&e));
    let mut client = device.get_iaudioclient().map_err(exclusive)?;
    // Aygıt biçimi kanal maskesi ya da yapı türüyle kabul etmiş olabilir: kabul edileni kullan.
    let format = client
        .is_supported_exclusive_with_quirks(&int_wave_format(int, spec.sample_rate, spec.channels))
        .map_err(exclusive)?;
    let (default_period, _) = client.get_device_period().map_err(exclusive)?;
    let period = client
        .calculate_aligned_period_near(default_period, Some(EXCLUSIVE_ALIGN_BYTES), &format)
        .map_err(exclusive)?
        .max(1);
    let events = timing == Timing::Events;
    let mode = if events {
        StreamMode::EventsExclusive { period_hns: period }
    } else {
        // Arabellek periyodun tam katı ve en az ~100 ms (hizası da periyodunki gibi kalır).
        let periods = (BUFFER_DURATION_HNS + period - 1) / period;
        StreamMode::PollingExclusive {
            period_hns: period,
            buffer_duration_hns: period * periods.max(2),
        }
    };
    client
        .initialize_client(&format, &Direction::Render, &mode)
        .map_err(exclusive)?;
    let event = if events {
        Some(client.set_get_eventhandle().map_err(exclusive)?)
    } else {
        None
    };
    Ok(Stream {
        block_align: format.get_blockalign() as usize,
        client,
        timing,
        event,
        // 100 ns birimindeki periyodun yarısı.
        poll: Duration::from_nanos((period as u64 * 100 / 2).max(1_000_000)),
        int: Some(int),
        started: false,
    })
}

/// Yoklamalı özel modda aygıt sesi gerçekten tüketiyor mu: arabellek sessizlikle doldurulup akış
/// başlatılır, [`POLLING_PROBE`] boyunca boşalan yer sessizlikle doldurulur. Tüketilen kare
/// (yazılan + arabellekte azalan) ilk [`POLLING_SETTLE`] sayılmadan, kalan pencerede ölçülür; hızın
/// en az [`POLLING_MIN_RATIO`] kadarı olmalı. Akış başlamış kalır; ses döngüsü arabelleği şarkıyla
/// doldurmayı sürdürür.
fn polling_consumes(stream: &mut Stream, sample_rate: u32) -> Result<bool, WasapiError> {
    let client = &stream.client;
    let render = client.get_audiorenderclient()?;
    let buffer = client.get_buffer_size()? as usize;
    let zeros = vec![0u8; buffer * stream.block_align];
    render.write_to_device(buffer, &zeros, None)?;
    client.start_stream()?;
    stream.started = true;
    let begin = Instant::now();
    let mut written = 0usize;
    // Pencerenin başı: (an, o ana kadar tüketilen).
    let mut window: Option<(Instant, usize)> = None;
    loop {
        std::thread::sleep(stream.poll);
        let space = (client.get_available_space_in_frames()? as usize).min(buffer);
        if space > 0 {
            render.write_to_device(space, &zeros[..space * stream.block_align], None)?;
            written += space;
        }
        let now = Instant::now();
        let elapsed = now.duration_since(begin);
        if elapsed < POLLING_SETTLE {
            continue;
        }
        let padding = client.get_current_padding()? as usize;
        let consumed = (written + buffer).saturating_sub(padding);
        match window {
            None => window = Some((now, consumed)),
            Some((from, at_from)) if elapsed >= POLLING_PROBE => {
                let frames = consumed.saturating_sub(at_from) as f64;
                let expected = now.duration_since(from).as_secs_f64() * f64::from(sample_rate);
                return Ok(frames >= POLLING_MIN_RATIO * expected);
            }
            Some(_) => {}
        }
    }
}

/// Olaylı özel mod bazı sürücülerde hiç olay vermez (ses donar): bir arabellek sessizlikle
/// başlatılıp ilk olay [`EXCLUSIVE_FIRST_EVENT_MS`] beklenir.
fn first_event_arrives(stream: &mut Stream) -> Result<bool, WasapiError> {
    let client = &stream.client;
    let render = client.get_audiorenderclient()?;
    let buffer = client.get_buffer_size()? as usize;
    let zeros = vec![0u8; buffer * stream.block_align];
    render.write_to_device(buffer, &zeros, None)?;
    client.start_stream()?;
    stream.started = true;
    Ok(stream
        .event
        .as_ref()
        .is_some_and(|event| event.wait_for_event(EXCLUSIVE_FIRST_EVENT_MS).is_ok()))
}

fn run(
    spec: OutputSpec,
    mut source: Consumer<Sample>,
    shared: &Arc<SharedState>,
    ready: &mut Option<Ready>,
) -> Result<(), AudioError> {
    initialize_mta()
        .ok()
        .map_err(|e| AudioError::Output(format!("COM başlatılamadı: {e}")))?;

    let device = default_device()?;
    let stream = match spec.mode {
        OutputMode::Shared => open_shared(&device, spec)?,
        OutputMode::Exclusive(int) => open_exclusive(&device, spec, int)?,
    };
    // Aygıt değişimini ayrı iş parçacığı izler: ses döngüsü COM sorgusu yapmaz, bellek ayırmaz.
    if let Ok(id) = device.get_id() {
        let watcher_shared = Arc::clone(shared);
        let _ = std::thread::Builder::new()
            .name("lyraska-aygit-izleme".to_owned())
            .spawn(move || watch_default_device(watcher_shared, id));
    }
    let client = &stream.client;
    let render_client = client
        .get_audiorenderclient()
        .map_err(fail("Ses yazıcısı alınamadı"))?;
    let buffer_frames = client
        .get_buffer_size()
        .map_err(fail("Arabellek boyutu alınamadı"))? as usize;

    // Bütün bellek burada, bir kez ayrılır; döngüde ayırma yapılmaz.
    let mut samples: Vec<Sample> = vec![0.0; buffer_frames * spec.channels];
    let mut bytes = vec![0u8; buffer_frames * stream.block_align];
    let mut renderer = Renderer::new(spec.channels, spec.sample_rate, shared.controls.clone());
    let mut consumed: u64 = 0;
    // Özel mod açılıştaki ölçümde sessizlikle başlamış olabilir.
    let mut started = stream.started;
    // Şarkı bitince taşma korumasının gecikme hattında kalan son kareler de yazılır.
    let mut tail_left = renderer.latency_frames();
    // Özel modda şarkının ardına yazılan sessizlik (kare). Özel modda arabelleğin boşalması bir
    // kesinti sayılır ve bazı sürücüler döngüsel arabellekteki eski veriyi yeniden çalar (şarkı
    // sonunda tık). Son kareden sonra bir arabellek dolusu sessizlik yazılır; "bitti" ancak aygıtta
    // yalnızca o sessizlik kalınca (olaylıda: aygıt onu da isteyince) denir (#79).
    let timing = stream.timing;
    let mut silence_written: u64 = 0;
    // Duraklatma geçişi hoparlöre ulaştı mı (oturum ancak o zaman kapatılır)?
    let mut fade = FadeWatch::default();

    if let Some(tx) = ready.take() {
        let _ = tx.send(Ok(()));
    }

    let result = loop {
        if shared.stop.load(Ordering::Acquire) {
            break Ok(());
        }

        // Şarkı tamamen çözüldü ve tampon boşaldıysa yeni veri yazma; aygıtta
        // kalan son örneklerin çalınmasını bekle. (Sessizlik yazmaya devam etseydik
        // arabellek hiç boşalmaz, "bitti" durumuna geçilemezdi.)
        let source_done = shared.decode_done.load(Ordering::Acquire) && source.is_empty();
        let draining = source_done && tail_left == 0;

        if !draining {
            let space = client
                .get_available_space_in_frames()
                .map_err(fail("Ses aygıtı okunamadı"))? as usize;
            let mut frames = space.min(buffer_frames);
            if source_done {
                // Sona sessizlik ekleme: yalnızca gecikme hattındaki son kareler. Olaylı özel modda
                // her seferinde tam bir arabellek yazılır (azı aygıt hatası); kalanı sessizlik.
                if timing != Timing::Events {
                    frames = frames.min(tail_left);
                }
                tail_left = tail_left.saturating_sub(frames);
            }
            if frames > 0 {
                let out = &mut samples[..frames * spec.channels];
                let paused = shared.paused.load(Ordering::Acquire);
                let outcome = renderer.render(&mut source, out, paused);
                // Aygıtın biçimine çevirme yalnızca burada yapılır.
                match stream.int {
                    None => {
                        for (dst, &sample) in bytes.chunks_exact_mut(4).zip(out.iter()) {
                            dst.copy_from_slice(&(sample as f32).to_le_bytes());
                        }
                    }
                    Some(int) => {
                        for (dst, &sample) in bytes.chunks_exact_mut(int.bytes()).zip(out.iter()) {
                            int.encode(sample, dst);
                        }
                    }
                }
                render_client
                    .write_to_device(frames, &bytes[..frames * stream.block_align], None)
                    .map_err(fail("Ses aygıtına yazılamadı"))?;
                consumed += outcome.frames_consumed as u64;
                if outcome.frames_missing > 0 && !shared.decode_done.load(Ordering::Acquire) {
                    shared.underruns.fetch_add(1, Ordering::Relaxed);
                }
                let silent = paused && renderer.gain() == 0.0;
                fade.wrote(frames, silent, renderer.latency_frames());
            }
        } else {
            // Yazılacak ses kalmadı: duraklatılırsa sessizlik arabellek boşalınca başlar (#56).
            fade.draining(shared.paused.load(Ordering::Acquire));
        }

        // Arabellek ilk kez dolduktan sonra başlat: çalma sessizlikle başlamasın (özel mod
        // açılıştaki ölçümde başlamış olabilir).
        if !started {
            client
                .start_stream()
                .map_err(fail("Ses akışı başlatılamadı"))?;
            started = true;
        }

        // Duyulan çıkış karesi ≈ halka tampondan alınan - henüz aygıtta bekleyen -
        // taşma korumasının gecikmesi. (Oynatıcı bunu çalan şarkıya ve şarkıdaki
        // konuma çevirir; boşluksuz geçişte şarkı sınırını da bilir.) Duraklatmada aygıta sessizlik yazıldığı için bu
        // tahmin bir an geriye kayabilir; oturum içinde geri gidiş olmadığından
        // (sarma yeni oturum açar) konum hiç azaltılmaz.
        let padding = client
            .get_current_padding()
            .map_err(fail("Ses aygıtı okunamadı"))? as u64;
        shared
            .faded_out
            .store(fade.faded_out(padding), Ordering::Release);
        let latency = padding + renderer.latency_frames() as u64;
        shared.record_heard(consumed.saturating_sub(latency), true);

        if draining {
            let done = match timing {
                Timing::Shared => padding == 0,
                Timing::Polling => {
                    if silence_written == 0 {
                        let space = client
                            .get_available_space_in_frames()
                            .map_err(fail("Ses aygıtı okunamadı"))?
                            as usize;
                        let frames = space.min(buffer_frames);
                        if frames > 0 {
                            let len = frames * stream.block_align;
                            bytes[..len].fill(0);
                            render_client
                                .write_to_device(frames, &bytes[..len], None)
                                .map_err(fail("Ses aygıtına yazılamadı"))?;
                            silence_written = frames as u64;
                        }
                    }
                    padding <= silence_written
                }
                // Aygıt bir arabellek daha istedi (önceki olay): ilk kez sessizlik yazılır, ikinci
                // kez isteyince son ses çalınmıştır.
                Timing::Events => {
                    if silence_written == 0 {
                        let len = buffer_frames * stream.block_align;
                        bytes[..len].fill(0);
                        render_client
                            .write_to_device(buffer_frames, &bytes[..len], None)
                            .map_err(fail("Ses aygıtına yazılamadı"))?;
                        silence_written = buffer_frames as u64;
                        false
                    } else {
                        true
                    }
                }
            };
            if done {
                // Şarkının bütün kareleri çalındı (aygıtta yalnızca sessizlik kaldı): konum tam
                // şarkı sonu.
                shared.record_heard(consumed, true);
                shared.ended.store(true, Ordering::Release);
                break Ok(());
            }
            if timing != Timing::Events {
                std::thread::sleep(DRAIN_POLL);
                continue;
            }
        }

        match &stream.event {
            Some(event) => {
                if event.wait_for_event(EVENT_TIMEOUT_MS).is_err() {
                    break Err(AudioError::Output(
                        "aygıt yanıt vermiyor; bağlantısı kesilmiş olabilir".to_owned(),
                    ));
                }
            }
            // Yoklamalı özel mod: arabellek ~100 ms; yarım periyotta bir doldurulur.
            None => std::thread::sleep(stream.poll),
        }
    };

    if started {
        let _ = client.stop_stream();
    }
    result
}
