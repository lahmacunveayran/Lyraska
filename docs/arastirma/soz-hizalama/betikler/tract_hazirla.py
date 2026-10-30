"""tract için Omnilingual ONNX'i hazırlar: giriş şekli sabit 1×480000 (30 sn, 16 kHz), ara şekil notları silinir
(tract sembolik N'yi 1 ile birleştiremiyor). Çıktı: KOK/tract/omni-sabit30.onnx
Deneme: cargo build --release (tract/deneme), sonra
  tract/target/release/tract-deneme tract/omni-sabit30.onnx <30 sn ham f32le 16 kHz dosya>"""
import onnx
from ortak import KOK, MODELS
src = MODELS / "sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-v2-int8-2026-02-05" / "model.int8.onnx"
m = onnx.load(str(src))
d = m.graph.input[0].type.tensor_type.shape.dim
for k, v in ((0, 1), (1, 480000)):
    d[k].ClearField("dim_param"); d[k].dim_value = v
for o in m.graph.output:
    for dd in o.type.tensor_type.shape.dim:
        dd.ClearField("dim_param")
del m.graph.value_info[:]
(KOK / "tract").mkdir(exist_ok=True)
onnx.save(m, str(KOK / "tract" / "omni-sabit30.onnx"))
