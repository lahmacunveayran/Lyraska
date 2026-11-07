"""Beat This small0 (Foscarin, Schlüter, Widmer, ISMIR 2024; kod ve ağırlıklar MIT) ağırlıklarını Lyraska'nın
tract ile çalıştırdığı ONNX dosyasına çevirir. CI kurulum dosyasını derlerken çalıştırır; model depoya girmez.

Kullanım: python -I onnx_cevir.py <small0.ckpt> <çıktı.onnx>

Giriş `spect` [1, T, 128] (log-mel, `analysis/rhythm_model.rs`), çıkışlar `beat` ve `downbeat` [1, T] (logit).
T değişkendir: şarkı 30 sn'den kısaysa tek, kısa parça. İki tuzak (BILGI-BIRIKIMI §5):
- rotary_embedding_torch'un önbelleği (`cache_if_possible`) kapatılmazsa dışa aktarılan grafiğe ilk çalıştırmanın
  uzunluğu sabit yazılır, başka uzunlukta yanlış çıkar;
- `torch.onnx.export` modülü dönüşte eğitim moduna alır (dropout): karşılaştırmadan önce yeniden `eval()`.
"""
import sys

import torch
from beat_this.inference import load_model
from rotary_embedding_torch import RotaryEmbedding


class Wrapper(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, spect):
        out = self.model(spect)
        return out["beat"], out["downbeat"]


def main(ckpt, out):
    torch.manual_seed(0)
    model = load_model(ckpt, "cpu")
    for m in model.modules():
        if isinstance(m, RotaryEmbedding):
            m.cache_if_possible = False
    wrapper = Wrapper(model).eval()
    x = torch.randn(1, 1500, 128)
    with torch.no_grad():
        torch.onnx.export(
            wrapper,
            (x,),
            out,
            input_names=["spect"],
            output_names=["beat", "downbeat"],
            dynamic_axes={"spect": {1: "T"}, "beat": {1: "T"}, "downbeat": {1: "T"}},
            opset_version=17,
            dynamo=False,
        )
    wrapper.eval()
    # Doğrulama: ONNX çıktısı PyTorch'unkiyle aynı mı (iki uzunlukta).
    import numpy as np
    import onnxruntime as ort

    sess = ort.InferenceSession(out, providers=["CPUExecutionProvider"])
    for length in (1500, 437):
        x = torch.randn(1, length, 128)
        with torch.no_grad():
            b, d = wrapper(x)
        ob, od = sess.run(None, {"spect": x.numpy()})
        diff = max(float(np.abs(ob - b.numpy()).max()), float(np.abs(od - d.numpy()).max()))
        print(f"uzunluk {length}: en büyük fark {diff:.2e}")
        if diff > 1e-3:
            sys.exit(f"ONNX çıktısı PyTorch'tan farklı ({diff})")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
