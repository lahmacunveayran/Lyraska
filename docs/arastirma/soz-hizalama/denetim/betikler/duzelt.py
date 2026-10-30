"""Yapıştırılan sözün ön işlemesi (denetimin önerisi): başlıkları at, (x2)'yi aç, "[Nakarat]"ı ilk nakaratla
doldur, rakamları yazıya çevir. Girdi: [(kelimeler, doğru|None)], boş kelime listesi = paragraf arası."""
import re
HDR = re.compile(r"^[\[\(]?\s*(nakarat|chorus|refrain|ritornell|coro|estribillo|verse|kıta|kita|bridge|köprü|intro|outro|giriş|ara|pre-chorus|hook)\b.*$", re.I)
REP = re.compile(r"^[\(\[]?\s*(?:x\s*(\d)|(\d)\s*x)\s*[\)\]]?$", re.I)
BIRLER = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
ONLAR = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
def tr_sayi(n):
    if n == 0: return ["sıfır"]
    out = []
    if n >= 1000:
        k = n // 1000; out += ([] if k == 1 else tr_sayi(k)) + ["bin"]; n %= 1000
    if n >= 100:
        h = n // 100; out += ([] if h == 1 else [BIRLER[h]]) + ["yüz"]; n %= 100
    if n >= 10: out.append(ONLAR[n // 10]); n %= 10
    if n: out.append(BIRLER[n])
    return out
EN = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
EN10 = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
def en_sayi(n):
    if n < 20: return [EN[n]]
    if n < 100: return [EN10[n // 10]] + ([EN[n % 10]] if n % 10 else [])
    return list(str(n))
def sayi(word, lang):
    m = re.fullmatch(r"(\D*)(\d{1,4})(\D*)", word)
    if not m: return [word]
    n = int(m.group(2)); ws = tr_sayi(n) if lang == "tr" else en_sayi(n) if lang == "en" else [word]
    return ws
def normalize(items, lang):
    """items: [(kelimeler, doğru)] → aynı biçimde (eklenenlerin doğrusu None)."""
    out, chorus, cur_hdr, cur = [], None, None, []
    def flush():
        nonlocal chorus
        if cur_hdr == "nakarat" and cur and chorus is None: chorus = list(cur)
    for idx, (words, tr) in enumerate(items):
        text = " ".join(words).strip()
        if not words:
            flush(); cur_hdr, cur = None, []; out.append((words, tr)); continue
        m = HDR.match(text)
        if m and len(words) <= 4:
            flush(); h = m.group(1).lower()
            cur_hdr = "nakarat" if h in ("nakarat", "chorus", "refrain", "ritornell", "coro", "estribillo", "hook") else h
            cur = []
            nxt = items[idx + 1][0] if idx + 1 < len(items) else []
            placeholder = (not nxt) or bool(HDR.match(" ".join(nxt)) and len(nxt) <= 4)
            if cur_hdr == "nakarat" and chorus is not None and placeholder:
                out += [(list(w), None) for w, _ in chorus]  # ikinci "[Nakarat]": ilkini kopyala
                cur_hdr = None
            continue
        # satır sonu tekrar işareti
        rep = 1
        if words and REP.match(words[-1]):
            g = REP.match(words[-1]); rep = int(g.group(1) or g.group(2)); words = words[:-1]
        nw = []
        for w in words: nw += sayi(w, lang)
        out.append((nw, tr)); cur.append((nw, tr))
        for _ in range(rep - 1): out.append((list(nw), None))
    flush()
    return out
