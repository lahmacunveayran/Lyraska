# Tarama 2 — Protokol (sistematik inceleme + eleştirel denetim)

Tarih: 6 Kasım 2026. Bu tarama "Tarama 1"den bağımsızdır: Tarama 1'in klasörü (`../tarama-1/`) **okunmadı**.
Protokol, aramalardan **önce** yazıldı; sapmalar en altta "Sapmalar" bölümünde, olduğu anda not edildi.

## 1. Amaç

Lyraska'nın (çevrimdışı, şarkıyı önceden analiz eden Windows müzik çalar) her alanında:

1. dünyanın **standart ölçüm setlerini, ölçütlerini ve yayımlanmış en iyi sonuçlarını** bulmak;
2. Lyraska'nın oradaki yerini kodu ve depodaki ölçümleri okuyarak **tahmin etmek** (ölçülmediyse "ölçülmedi");
3. depodaki kararları ve raporları **kırmızı takım** gözüyle sorgulamak (en zayıf 10 nokta);
4. "önceden bilme" avantajını kullanan (çevrimdışı, bilgilendirilmiş, yapı-bilgili) yöntemleri bulmak;
5. 6 Kasım 2026 kararıyla (yalnızca kişisel kullanım; NC/araştırma ağırlıkları yerel paket olarak serbest, depoya ve
   herkese açık sürüme girmez) lisans yüzünden elenenleri yeniden değerlendirmek.

## 2. Araştırma soruları (AS)

| No   | Soru                                                                                                                                                                         |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AS1  | Beat / downbeat / tempo: standart setler (Ballroom, Hainsworth, SMC, GTZAN, Harmonix, RWC), ölçütler (F, CMLt, AMLt), en iyi sonuç; Lyraska'nın DP+öz-ilinti yöntemi nerede? |
| AS2  | Aksak ölçü, makam ve usul: Türk müziği için hangi set ve yöntem var (CompMusic, ODTÜ/İTÜ, Holzapfel, Srinivasamurthy)?                                                       |
| AS3  | Yapı (bölüm sınırı, etiket): SALAMI, Harmonix, RWC; hit-rate@0,5/3 sn; en iyi sonuçlar; Foote yöntemi ne kadar geride?                                                       |
| AS4  | Drop / EDM yapısı: akademik tanım ve setler (Yadati, Vande Veire, EDM-98 vb.), ölçüt.                                                                                        |
| AS5  | Ton: GiantSteps Key, MIREX ağırlıklı skor; KK profilinin elektronik ve Türk müziğindeki yeri; makam tanıma.                                                                  |
| AS6  | Duygu/tür/enerji: DEAM, MTG-Jamendo, Essentia modelleri; lisansları.                                                                                                         |
| AS7  | Kaynak ayrıştırma: MUSDB18-HQ / MDX23 / SDX sonuçları; CPU'da çalışabilir en iyi modeller; NC ağırlıklar artık yerel paket olarak?                                           |
| AS8  | Söz hizalama ve vokal: JamendoLyrics, MIREX lyrics alignment; AAE ölçütü; en iyi sonuçlar; Türkçe.                                                                           |
| AS9  | Çalma ve DSP: hedef eğriler (Harman), AutoEq doğruluğu, BS.1770/R128, gerçek tepe, crossfeed/HRTF, yeniden örnekleme, ABX metodolojisi.                                      |
| AS10 | Müziğe tepki veren görseller ve koreografi: akademik (IEEE VIS, ACM MM, NIME), VJ, ışık tasarımı (DMX/MA, otomatik ışık), demoscene; senkron ve algı eşiği.                  |
| AS11 | Işığa duyarlılık: ITU-R BT.1702, Ofcom, WCAG 2.3.1, Harding/PEAT, ISO 9241-391; Lyraska'nın güvenli modu bunlara ne kadar uyuyor.                                            |
| AS12 | Kütüphane ve UX: en iyi çalarlar (foobar2000, MusicBee, Roon, Plexamp, Apple Music, AIMP, Poweramp) ve toplulukların istekleri.                                              |
| AS13 | Mühendislik ve test: MIR değerlendirme pratiği (mir_eval, sızıntı, set ayrımı), mutasyon testi, gerçek zamanlı ses güvencesi.                                                |
| AS14 | "Önceden bilme" fırsatları: offline / informed / structure-aware yöntemler (otomatik DJ, mashup, beklenti modelleri, ışık).                                                  |

## 3. Arama dizgileri (dil başına; her dil kendi terimleriyle)

| Dil        | Örnek dizgiler (alan başına uyarlanır)                                                                                                                                                                                                                                                                                            | Kaynak tabanları                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| İngilizce  | "beat tracking" benchmark 2024; "downbeat tracking" Harmonix; "music structure analysis" SALAMI state of the art; "drop detection" EDM; "GiantSteps key"; "lyrics alignment" JamendoLyrics; "music source separation" MUSDB18 SDR leaderboard; "audio-reactive visualization" survey; "photosensitive epilepsy" "flash" guideline | ISMIR arşivi, TISMIR, IEEE/ACM TASLP, ICASSP, DAFx, JAES, arXiv, GitHub |
| Çince      | 节拍跟踪 / 节拍检测 深度学习; 音乐结构分析; 音源分离 / 人声分离 模型; 歌词对齐; 音乐可视化 节奏; 光敏性癫痫 闪烁                                                                                                                                                                                                                  | CNKI özetleri, Zhihu, Bilibili, CSDN                                    |
| Japonca    | ビート追跡; 楽曲構造解析 (Goto, RWC, Songle); 音源分離; 歌詞アライメント (Fujihara, LyricSynchronizer); 光過敏性発作 ガイドライン (ポケモン事件, NHK/民放連)                                                                                                                                                                      | J-STAGE, CiNii, IPSJ (情報処理学会 音楽情報科学研究会)                  |
| Korece     | 비트 추적; 음악 구조 분석; 음원 분리; 가사 정렬; 광과민성 발작                                                                                                                                                                                                                                                                    | KCI, DBpia                                                              |
| Rusça      | детектирование ритма / темпа; разделение источников музыка; визуализация музыки; фотосенситивная эпилепсия                                                                                                                                                                                                                        | eLibrary.ru, Habr                                                       |
| Almanca    | Beat-Tracking; Musikstrukturanalyse; Quellentrennung Musik; Lautheit R128; Lichtsteuerung Musik automatisch                                                                                                                                                                                                                       | AudioLabs Erlangen, TU-Berlin, DAGA, heise                              |
| Fransızca  | suivi de tempo / pulsation; analyse de structure musicale; séparation de sources; HAL / theses.fr                                                                                                                                                                                                                                 | HAL, theses.fr (IRCAM, Télécom Paris)                                   |
| İspanyolca | seguimiento de pulso; separación de fuentes; MTG-UPF tesis                                                                                                                                                                                                                                                                        | MTG-UPF, TDX                                                            |
| İtalyanca  | beat tracking tesi; separazione sorgenti; visualizzazione musicale                                                                                                                                                                                                                                                                | IRIS (Politecnico di Milano)                                            |
| Türkçe     | usul tespiti; makam tanıma; aksak ritim; vuruş takibi; müzik yapısı; kaynak ayrıştırma; şarkı sözü hizalama                                                                                                                                                                                                                       | YÖK Tez Merkezi, DergiPark, CompMusic (ODTÜ)                            |

Topluluklar: Hydrogenaudio, Head-Fi, AudioScienceReview, Reddit (r/audiophile, r/foobar2000, r/musicbee,
r/vjing, r/edmproduction), KVR, Gearspace; YouTube konferans konuşmaları (ISMIR, ADC, Revision demoparty).

## 4. Dahil etme / dışlama ölçütleri

- **Dahil:** (a) standart set + ölçütle sayısal sonuç veren çalışmalar; (b) çevrimdışı ve CPU'da (ya da RTX 4050'de
  yerel) çalışabilir yöntemler; (c) lisansı (kod / ağırlık / veri) okunabilen ya da en az özetten öğrenilebilen
  modeller; (d) standart ve kılavuzların birincil metinleri; (e) 2015 sonrası (klasik temel eserler hariç).
- **Dışla:** bulut hizmetine bağlı, sayı vermeyen pazarlama yazıları; lisansı yazılmamış modeller (kural: alınmaz);
  AGPL kod (proje kuralı); yalnızca GPU-sunucu boyutunda (≥ 10 GB VRAM şart) modeller "uygulanamaz" diye ayrı not.
- **Belirsiz:** yalnızca arama özeti okunabilen kaynak dahil edilir ama kanıt düzeyi B'yle işaretlenir.

## 5. Kaynak kalitesi derecelendirmesi

| Derece | Tür                                                                   |
| ------ | --------------------------------------------------------------------- |
| K1     | Hakemli dergi (TASLP, TISMIR, JAES, Epilepsia, JNEUROSCI vb.)         |
| K2     | Hakemli konferans (ISMIR, ICASSP, DAFx, EUSIPCO, Interspeech, ACM MM) |
| K3     | Standart / teknik rapor / tez (ITU, EBU, W3C, ISO; doktora tezi)      |
| K4     | Açık kaynak proje (README, kod, sürüm notu)                           |
| K5     | Forum / blog / video                                                  |

**Kanıt düzeyi** (her bulguda): **A** birincil kaynak okundu; **B** ikincil kaynak ya da arama özeti; **C** benim
tahminim/çıkarımım (gerekçesiyle).

## 6. Veri çıkarma tablosu (her kaynak için)

`Bulgu | Kaynak (yazar, yıl, yer) | Dil | Kaynak derecesi | Kanıt düzeyi | Set / ölçüt / sayı | Lisans (kod / ağırlık / veri) |
Lyraska modülü | Çevrimdışı-CPU uygulanabilirliği | Not`. Birleşik tablo `90-KANIT-TABLOSU.md`'de.

## 7. Lyraska'nın yerini tahmin yöntemi

1. Kodu oku (`src-tauri/src/analysis/*`, `audio/*`, `director/*`): algoritma hangi yayına dayanıyor.
2. Depodaki ölçümler (`docs/arastirma/*`, `koy-isi`): hangi set, hangi ölçüt.
3. Aynı **yöntem sınıfının** standart setteki yayımlanmış sonucu (ör. Ellis 2007 DP takipçisi MIREX/Böck
   karşılaştırmalarında) Lyraska için **üst sınır tahmini** olarak kullanılır; kanıt düzeyi C.
4. Yerel ölçüm yapılmadı (kural: `cargo` yok, büyük indirme yok). Bu yüzden her tahmin bir ölçüm planıyla biter.

## 8. Dosyalar

`00-OZET.md`, `01-PROTOKOL.md`, `10-RITIM-OLCU-TEMPO.md`, `11-AKSAK-MAKAM-USUL.md`, `12-YAPI-DROP.md`,
`13-TON-DUYGU-TUR.md`, `20-KAYNAK-AYRISTIRMA.md`, `21-SOZ-HIZALAMA-VOKAL.md`, `30-SES-DSP.md`, `40-GORSELLER-KOREOGRAFI.md`,
`41-ISIGA-DUYARLILIK.md`, `50-KUTUPHANE-UX.md`, `60-MUHENDISLIK-TEST.md`, `80-ELESTIREL-DENETIM.md`,
`85-FIRSATLAR.md`, `90-KANIT-TABLOSU.md`.

## 9. Sapmalar (olduğu anda yazıldı)

- (S1) Yerel ölçüm yapılmadı (görev sınırı: `cargo` yok). "Lyraska'nın yeri" yalnızca tahmin (C) + ölçüm planı.
- (S2) Ağ sınırlı: arxiv.org, zenodo.org, huggingface.co, ismir.net gibi siteler WebFetch'le açılmayabilir; o zaman
  arama özeti (B) ya da aynı içeriğin GitHub kopyası (A) kullanılır ve "erişilemedi" diye işaretlenir.
- (S3) Ağ denetimi (6 Kasım 2026, 17:18 UTC): bu oturumdan **yalnızca github.com / raw.githubusercontent.com,
  pypi.org ve youtube.com** açılıyor. arxiv.org, zenodo.org, huggingface.co, ismir.net, dafx.de, aclanthology.org,
  openreview.net, itu.int, w3.org, wikipedia, mirex/music-ir.org, dergipark.org.tr, dbpia.co.kr, habr.com, fugumt.com
  **erişilemedi** (DNS ya da vekil 403). Sonuç: makale tabloları çoğunlukla arama özetinden (B); modellerin lisansı
  GitHub depolarından (A). Bir makalenin kaynağı GitHub'da varsa (ör. `paper.md`, README'deki tablo) o okundu (A).
- (S4) Ağ izinleri oturum sırasında genişletildi (koordinatörün bildirimi, 6 Kasım 2026): arxiv, zenodo,
  huggingface.co, ismir/TISMIR arşivleri, itu.int, w3.org, aes.org, hal/theses.fr, J-STAGE, CiNii, KCI, DBpia, Habr,
  cyberleninka, YÖK tez, DergiPark, forumlar açıldı. Önemli B/C iddiaları birincil kaynaktan yeniden okundu; kanıt
  düzeyleri dosyalarda güncellendi. Kapalı kalanlar: cdn-lfs.huggingface.co, web.archive.org, elibrary.ru,
  music-ir.org (MIREX sonuç sayfaları).
