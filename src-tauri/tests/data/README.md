# Test verisi

Bu klasördeki ses dosyaları proje için **ffmpeg ile üretilmiş sentetik sinyallerdir**; hiçbir
kayıttan alınmamıştır ve projenin lisansı (GPL-3.0) altındadır.

`uc-uc-ton.*`: 22 050 Hz mono, arka arkaya üç ton (440 Hz, 880 Hz, 1760 Hz; her biri 1 sn).
Etiketler: başlık "Üç Ton", sanatçı "Lyraska Test", albüm "Deneme Albümü", albüm sanatçısı "Lyraska",
parça 3/9, disk 1/2.

Yeniden üretmek için:

```sh
SRC="sine=frequency=440:duration=1:sample_rate=22050[a];sine=frequency=880:duration=1:sample_rate=22050[b];sine=frequency=1760:duration=1:sample_rate=22050[c];[a][b][c]concat=n=3:v=0:a=1,volume=0.5"
ffmpeg -filter_complex "$SRC" -ac 1 -c:a libmp3lame -b:a 64k -metadata title="Üç Ton" -metadata artist="Lyraska Test" -metadata album="Deneme Albümü" -metadata album_artist="Lyraska" -metadata track="3/9" -metadata disc="1/2" uc-uc-ton.mp3
ffmpeg -filter_complex "$SRC" -ac 1 -c:a aac -b:a 64k -metadata title="Üç Ton" -metadata artist="Lyraska Test" -metadata album="Deneme Albümü" -metadata album_artist="Lyraska" -metadata track="3/9" -metadata disc="1/2" uc-uc-ton.m4a
ffmpeg -filter_complex "$SRC" -ac 1 -c:a libvorbis -q:a 2 -metadata title="Üç Ton" -metadata artist="Lyraska Test" -metadata album="Deneme Albümü" -metadata album_artist="Lyraska" -metadata track="3/9" -metadata disc="1/2" uc-uc-ton.ogg
ffmpeg -filter_complex "$SRC" -ac 1 -c:a flac -metadata title="Üç Ton" -metadata artist="Lyraska Test" -metadata album="Deneme Albümü" -metadata album_artist="Lyraska" -metadata track="3/9" -metadata disc="1/2" uc-uc-ton.flac
```

`uc-uc-ton.opus`, `uc-uc-ton.webm`: aynı üç ton, Opus (libopus, 32 kb/sn); Opus her zaman 48 kHz çözülür.
WebM, YouTube'dan inen dosyalar gibi 48 kHz yazılır (yoksa ffmpeg başlığa 24 kHz yazar). Etiketler yukarıdakilerle
aynı:

```sh
SRC="sine=frequency=440:duration=1:sample_rate=22050[a];sine=frequency=880:duration=1:sample_rate=22050[b];sine=frequency=1760:duration=1:sample_rate=22050[c];[a][b][c]concat=n=3:v=0:a=1,volume=0.5"
TAGS=(-metadata title="Üç Ton" -metadata artist="Lyraska Test" -metadata album="Deneme Albümü" -metadata album_artist="Lyraska" -metadata track="3/9" -metadata disc="1/2")
ffmpeg -filter_complex "$SRC" -ac 1 -c:a libopus -b:a 32k "${TAGS[@]}" uc-uc-ton.opus
ffmpeg -filter_complex "$SRC" -ac 1 -ar 48000 -c:a libopus -b:a 32k "${TAGS[@]}" uc-uc-ton.webm
```

`uzun.webm`, `uzun.opus`: 40 sn pembe gürültü (tekrarsız: sarmadan sonraki kayma tek anlamlı ölçülür), Opus 16 kb/sn.
WebM, YouTube dosyaları gibi çok kümeli (2 sn) ve Cues'lu; `.opus` ondan yt-dlp gibi kopyalanır (Ogg akışı 360 örnek
kaymalı başlar):

```sh
ffmpeg -f lavfi -i "anoisesrc=d=40:c=pink:r=48000:a=0.3:s=7,lowpass=f=6000" -ac 1 -c:a libopus -b:a 16k -cluster_time_limit 2000 uzun.webm
ffmpeg -i uzun.webm -c copy uzun.opus
```

`kapakli.opus`: 1 sn 440 Hz Opus; içinde yt-dlp'nin `--embed-thumbnail`'i gibi gömülü kapak (OpusTags'te
`METADATA_BLOCK_PICTURE`, 8×8 düz renk PNG):

```sh
ffmpeg -f lavfi -i color=c=0x2B3F78:s=8x8 -frames:v 1 k.png
PIC=$(python3 -c "
import struct,base64
img=open('k.png','rb').read();m=b'image/png'
b=struct.pack('>II',3,len(m))+m+struct.pack('>IIIIII',0,8,8,24,0,len(img))+img
print(base64.b64encode(b).decode())")
ffmpeg -f lavfi -i "sine=frequency=440:duration=1:sample_rate=48000" -ac 1 -c:a libopus -b:a 16k -metadata title="Kapaklı" -metadata METADATA_BLOCK_PICTURE="$PIC" kapakli.opus
```

`sozlu.flac`, `sozlu.mp3`: 22 050 Hz mono, 1 sn 440 Hz; içlerine gömülü zamanlı sözler (LRC biçiminde, Türkçe
harflerle). FLAC'ta Vorbis yorumu `LYRICS`, MP3'te ID3v2.3 `USLT` çerçevesi (UTF-16, dil `tur`). ffmpeg MP3'e `USLT`
yazmadığı için etiket Python ile kurulup ffmpeg'in etiketsiz MP3'ünün önüne eklenir:

```sh
SRC="sine=frequency=440:duration=1:sample_rate=22050"
LYR=$'[00:00.20]Üç ton şarkısı\n[00:00.60]ğüşıöç'
ffmpeg -f lavfi -i "$SRC" -ac 1 -c:a flac -metadata LYRICS="$LYR" sozlu.flac
ffmpeg -f lavfi -i "$SRC" -ac 1 -c:a libmp3lame -b:a 32k -write_id3v2 0 -write_xing 0 duz.mp3
python3 - <<'PY'
import struct
lyr = "[00:00.20]Üç ton şarkısı\n[00:00.60]ğüşıöç"
u16 = lambda s: b"\xff\xfe" + s.encode("utf-16-le")
body = b"\x01" + b"tur" + u16("") + b"\x00\x00" + u16(lyr)
frame = b"USLT" + struct.pack(">I", len(body)) + b"\x00\x00" + body
n = len(frame)
size = bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])
open("sozlu.mp3", "wb").write(b"ID3\x03\x00\x00" + size + frame + open("duz.mp3", "rb").read())
PY
rm duz.mp3
```

`milkdrop/lyraska-parlama.milk`: bu proje için yazılmış (GPL-3.0) küçük bir MilkDrop 2 görseli (preset); ses değil.
Bir dalga, bir beşgen ve denklemler içerir; ölçümün parlamayı gördüğünü kanıtlamak için **bilerek parlar** (saniyede
dört kez tersine döner). Yalnızca testlerde ve sahne denetiminde kullanılır, programla dağıtılmaz.
`milkdrop/lyraska-parlama.json`: Rust ayrıştırıcısının bu dosyadan ürettiği Butterchurn JSON'u
(`milkdrop::tests::ornek_gorsel_beklenen_jsona_cevrilir` aynı olduğunu denetler; sahne denetiminin sahte çekirdeği
bunu döndürür).
`milkdrop/lyraska-dongu.milk` (+ `.json`): yine bu proje için yazılmış; denklemindeki çok büyük
`loop(2000000000, …)` programın döngü sınırıyla `loop(min(1048576, …), …)` olur. Sahne denetimi bu görselin programı
dondurmadan çizildiğini gerçek tarayıcıda denetler.
