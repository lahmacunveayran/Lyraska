"""Söz modeli çalıştırıcısının (analysis/lyrics_model.rs) testleri için küçük, projenin kendi ONNX modeli.
Gerçek modelin kare geometrisinde (wav2vec2: alıcı alan 400 örnek, adım 320; 480 000 örnek → 1499 kare; bağımsız
incelemenin önerisi). Her karede 'a' simgesinin logiti alıcı alanın toplamı ×0,1, 'b'nin ×−0,1, diğerleri 0.
Çalıştırma: python uret.py [klasör] (onnx ve onnxruntime gerekir)."""
import sys, numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
out = sys.argv[1] if len(sys.argv) > 1 else "."
V = 8
W = np.zeros((V, 1, 400), np.float32); W[5] = 0.1; W[6] = -0.1
nodes = [
    helper.make_node("Unsqueeze", ["x", "ax"], ["x3"]),
    helper.make_node("Conv", ["x3", "W"], ["c"], kernel_shape=[400], strides=[320]),
    helper.make_node("Transpose", ["c"], ["logits"], perm=[0, 2, 1]),
]
g = helper.make_graph(nodes, "soz-deneme-conv",
    [helper.make_tensor_value_info("x", TensorProto.FLOAT, ["N", "T"])],
    [helper.make_tensor_value_info("logits", TensorProto.FLOAT, ["N", "F", V])],
    [numpy_helper.from_array(np.array([1], np.int64), "ax"), numpy_helper.from_array(W, "W")])
m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 13)], producer_name="lyraska-test")
m.ir_version = 8
onnx.save(m, f"{out}/model.int8.onnx")
open(f"{out}/tokens.txt", "w", encoding="utf-8").write("<s> 0\n<pad> 1\n</s> 2\n<unk> 3\n  4\na 5\nb 6\nR 7\n")
import onnxruntime as ort
s = ort.InferenceSession(f"{out}/model.int8.onnx")
print("480000 örnek →", s.run(None, {"x": np.zeros((1, 480000), np.float32)})[0].shape)
