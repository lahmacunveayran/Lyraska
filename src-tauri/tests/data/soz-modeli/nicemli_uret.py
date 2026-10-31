"""Söz modeli çalıştırıcısının tamsayı çarpımı çözme testleri için küçük, projenin kendi nicemli ONNX modeli
(analysis/lyrics_model.rs, `dequantize_matmuls`). Gerçek "Söz paketi" gibi onnxruntime'ın dinamik nicemlemesiyle
(quantize_dynamic, uint8, tensör başına ölçek) üretilir: DynamicQuantizeLinear → MatMulInteger → Cast → Mul.
İki katman (16 → 12 → 8, aralarında Relu), tohumlu rastgele ağırlıklar.
Çalıştırma: python nicemli_uret.py [klasör] (onnx ve onnxruntime gerekir)."""
import os, sys, tempfile, numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
from onnxruntime.quantization import quantize_dynamic, QuantType
out = sys.argv[1] if len(sys.argv) > 1 else "."
rng = np.random.default_rng(7)
W1 = rng.normal(0, 0.5, (16, 12)).astype(np.float32)
W2 = rng.normal(0, 0.5, (12, 8)).astype(np.float32)
nodes = [
    helper.make_node("MatMul", ["x", "W1"], ["h"]),
    helper.make_node("Relu", ["h"], ["r"]),
    helper.make_node("MatMul", ["r", "W2"], ["y"]),
]
g = helper.make_graph(nodes, "soz-deneme-nicemli",
    [helper.make_tensor_value_info("x", TensorProto.FLOAT, ["N", 16])],
    [helper.make_tensor_value_info("y", TensorProto.FLOAT, ["N", 8])],
    [numpy_helper.from_array(W1, "W1"), numpy_helper.from_array(W2, "W2")])
m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 13)], producer_name="lyraska-test")
m.ir_version = 8
with tempfile.TemporaryDirectory() as tmp:
    src = os.path.join(tmp, "float.onnx")
    onnx.save(m, src)
    quantize_dynamic(src, f"{out}/nicemli.onnx", weight_type=QuantType.QUInt8, per_channel=False)
q = onnx.load(f"{out}/nicemli.onnx")
print("düğümler:", [n.op_type for n in q.graph.node])
