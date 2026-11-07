"""Ritim modeli çalıştırıcısının (analysis/rhythm_net.rs) testleri için küçük, projenin kendi ONNX modeli.
Gerçek modelin (Beat This small0) giriş ve çıkış adları ve şekilleriyle: `spect` [1, T, 128] → `beat`, `downbeat`
[1, T], T değişken. Zamanda 3 karelik evrişim (kenarda sıfır dolgu: parçaların kenarı atılmazsa sonuç bozulur):
beat[t] = spect[t−1, 0] + 8·spect[t, 0] + spect[t+1, 0] − 5; downbeat aynı biçimde band 1'den.
Çalıştırma: python -I uret.py [klasör] (onnx ve onnxruntime gerekir)."""
import sys, numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
out = sys.argv[1] if len(sys.argv) > 1 else "."
W = np.zeros((2, 128, 3), np.float32)
W[0, 0] = [1, 8, 1]
W[1, 1] = [1, 8, 1]
B = np.array([-5, -5], np.float32)
nodes = [
    helper.make_node("Transpose", ["spect"], ["x"], perm=[0, 2, 1]),
    helper.make_node("Conv", ["x", "W", "B"], ["c"], kernel_shape=[3], pads=[1, 1]),
    helper.make_node("Split", ["c", "parts"], ["b3", "d3"], axis=1),
    helper.make_node("Squeeze", ["b3", "ax"], ["beat"]),
    helper.make_node("Squeeze", ["d3", "ax"], ["downbeat"]),
]
g = helper.make_graph(nodes, "ritim-deneme",
    [helper.make_tensor_value_info("spect", TensorProto.FLOAT, [1, "T", 128])],
    [helper.make_tensor_value_info("beat", TensorProto.FLOAT, [1, "T"]),
     helper.make_tensor_value_info("downbeat", TensorProto.FLOAT, [1, "T"])],
    [numpy_helper.from_array(W, "W"), numpy_helper.from_array(B, "B"),
     numpy_helper.from_array(np.array([1, 1], np.int64), "parts"),
     numpy_helper.from_array(np.array([1], np.int64), "ax")])
m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)], producer_name="lyraska-test")
m.ir_version = 8
onnx.save(m, f"{out}/deneme.onnx")
import onnxruntime as ort
s = ort.InferenceSession(f"{out}/deneme.onnx")
x = np.zeros((1, 10, 128), np.float32); x[0, 4, 0] = 1
b, d = s.run(None, {"spect": x})
print(b.shape, d.shape, b[0, 2:7])
