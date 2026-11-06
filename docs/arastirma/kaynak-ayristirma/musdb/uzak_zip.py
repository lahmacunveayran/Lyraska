"""Uzak zip'ten tek tek dosya okuma (HTTP aralık isteği): bütün arşivi indirmeden.
Kullanım: uzak_zip.py liste <url>  |  uzak_zip.py cikar <url> <zip içi önek> <hedef klasör>"""
import io, os, ssl, sys, urllib.request, zipfile

CHUNK = 8 << 20
_ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE"))

class RangeFile(io.RawIOBase):
    def __init__(self, url):
        self.url, self.pos, self.cache = url, 0, {}
        req = urllib.request.Request(url, headers={"Range": "bytes=0-0"})
        with urllib.request.urlopen(req, context=_ctx, timeout=120) as r:
            self.size = int(r.headers["Content-Range"].split("/")[1])
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.size + off
        return self.pos
    def _block(self, i):
        if i not in self.cache:
            if len(self.cache) > 8: self.cache.pop(next(iter(self.cache)))
            a, b = i * CHUNK, min(self.size, (i + 1) * CHUNK) - 1
            for attempt in range(5):
                try:
                    req = urllib.request.Request(self.url, headers={"Range": f"bytes={a}-{b}"})
                    with urllib.request.urlopen(req, context=_ctx, timeout=300) as r:
                        self.cache[i] = r.read()
                    break
                except Exception as e:
                    if attempt == 4: raise
        return self.cache[i]
    def read(self, n=-1):
        if n is None or n < 0: n = self.size - self.pos
        out = bytearray()
        while n > 0 and self.pos < self.size:
            i, o = divmod(self.pos, CHUNK)
            blk = self._block(i)[o:o + n]
            out += blk; self.pos += len(blk); n -= len(blk)
        return bytes(out)
    def readinto(self, b):
        d = self.read(len(b)); b[:len(d)] = d; return len(d)

def open_zip(url): return zipfile.ZipFile(io.BufferedReader(RangeFile(url), buffer_size=CHUNK))

if __name__ == "__main__":
    cmd, url = sys.argv[1], sys.argv[2]
    z = open_zip(url)
    if cmd == "liste":
        for info in z.infolist(): print(info.file_size, info.filename)
    elif cmd == "cikar":
        prefix, dest = sys.argv[3], sys.argv[4]
        for info in z.infolist():
            if info.filename.startswith(prefix) and not info.is_dir():
                path = os.path.join(dest, os.path.relpath(info.filename, prefix))
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with z.open(info) as src, open(path, "wb") as dst:
                    while chunk := src.read(CHUNK): dst.write(chunk)
                print("çıkarıldı", info.filename, info.file_size)
