"""Söz modeli çalıştırıcısının (analysis/lyrics_model.rs) testleri için küçük, projenin kendi ONNX modeli.
Giriş x [1, N] (N = 160 000, 10 sn), çıkış [1, N/320, 8]: her karede 'a' simgesinin logiti karenin
toplamının +0,1 katı, 'b'nin −0,1 katı, diğerleri 0. Çalıştırma: python uret.py (onnx paketi gerekir)."""
import numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
N, F, V = 160000, 320, 8
W = np.zeros((F, V), np.float32); W[:, 5] = 0.1; W[:, 6] = -0.1
g = helper.make_graph(
    [helper.make_node("Reshape", ["x", "shape"], ["frames"]), helper.make_node("MatMul", ["frames", "W"], ["logits"])],
    "soz-deneme",
    [helper.make_tensor_value_info("x", TensorProto.FLOAT, ["N", "T"])],
    [helper.make_tensor_value_info("logits", TensorProto.FLOAT, ["N", "F", V])],
    [numpy_helper.from_array(np.array([1, -1, F], np.int64), "shape"), numpy_helper.from_array(W, "W")])
m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 13)], producer_name="lyraska-test")
m.ir_version = 8
onnx.save(m, "model.int8.onnx")
open("tokens.txt", "w", encoding="utf-8").write("<s> 0\n<pad> 1\n</s> 2\n<unk> 3\n  4\na 5\nb 6\nR 7\n")
