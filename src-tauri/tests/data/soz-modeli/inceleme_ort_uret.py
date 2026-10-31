"""Bağımsız karşı örnek üreteci: onnxruntime quantize_dynamic ile farklı kalıplarda küçük nicemli modeller.
Her model için: girdi, beklenen çevrilen çarpım sayısı, elle hesap (x · (W_q - z)·s, numpy f64) ve
onnxruntime'ın nicemli çıktısı. Kullanım: python -E -P ort_uret.py <çıktı klasörü>"""
import json, os, sys, tempfile
import numpy as np, onnx, onnxruntime as ort
from onnx import helper, TensorProto, numpy_helper
from onnxruntime.quantization import quantize_dynamic, QuantType

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
rng = np.random.default_rng(2026)
cases = []


def dequant_weights(q):
    """Nicemli modelin initializer'larından W_deq (f64) — kodun okuyucusundan bağımsız."""
    inits = {t.name: numpy_helper.to_array(t) for t in q.graph.initializer}
    res = {}
    for n in q.graph.node:
        if n.op_type == "MatMulInteger":
            wq = inits[n.input[1]].astype(np.float64)
            z = inits[n.input[3]].astype(np.float64)
            # s_w: Mul(sx, s_w) düğümünü bul
            res[n.output[0]] = (wq, z)
    return inits, res


def manual(fn_float, q, x):
    """Float modeli W yerine W_deq ile numpy'da çalıştır: fn_float(x, weights_dict)."""
    inits = {t.name: numpy_helper.to_array(t).astype(np.float64) for t in q.graph.initializer}
    Wd = {}
    for name in list(inits):
        if name.endswith("_quantized"):
            base = name[: -len("_quantized")]
            z = inits[base + "_zero_point"]
            s = inits[base + "_scale"]
            if np.ndim(s) == 1 and len(s) > 1:  # kanal başına
                Wd[base] = (inits[name] - z) * s
            else:
                Wd[base] = (inits[name] - z.reshape(())) * s.reshape(())
    for name, v in inits.items():
        Wd.setdefault(name, v)
    return fn_float(x.astype(np.float64), Wd)


def add(name, nodes, inits, in_shape, out_count, fn, wtype, per_channel, expect, x_shape):
    g = helper.make_graph(
        nodes, name,
        [helper.make_tensor_value_info("x", TensorProto.FLOAT, in_shape)],
        [helper.make_tensor_value_info(f"y{i}", TensorProto.FLOAT, None) for i in range(out_count)],
        [numpy_helper.from_array(v, k) for k, v in inits.items()])
    m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 13)])
    m.ir_version = 8
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "f.onnx")
        onnx.save(m, src)
        dst = os.path.join(out, f"{name}.onnx")
        quantize_dynamic(src, dst, weight_type=wtype, per_channel=per_channel)
    q = onnx.load(dst)
    x = (rng.normal(0, 1.5, x_shape)).astype(np.float32)
    x.flat[rng.integers(x.size)] *= 4
    sess = ort.InferenceSession(dst, providers=["CPUExecutionProvider"])
    y_ort = sess.run(None, {"x": x})
    y_man = manual(fn, q, x)
    cases.append({
        "file": f"{name}.onnx",
        "x_shape": list(x_shape),
        "x": x.flatten().tolist(),
        "expect": expect,
        "ops": [n.op_type for n in q.graph.node],
        "outputs": [{"shape": list(np.shape(a)), "ort": np.asarray(a, np.float32).flatten().tolist(),
                     "manual": np.asarray(b, np.float64).flatten().tolist(),
                     "abs": np.asarray(c, np.float64).flatten().tolist()}
                    for a, (b, c) in zip(y_ort, y_man)],
    })


def W(k, n):
    return rng.normal(0, 0.4, (k, n)).astype(np.float32)


def absmm(x, w):
    return np.abs(x) @ np.abs(w)


def chain(x, d):
    h = x @ d["W1"] + d["b"]
    r = np.maximum(h, 0)
    habs = np.abs(x) @ np.abs(d["W1"]) + np.abs(d["b"])
    return [(r @ d["W2"], habs @ np.abs(d["W2"]) * 4)]


for wtype, tname in [(QuantType.QInt8, "s8"), (QuantType.QUInt8, "u8")]:
    for per_channel in [False, True]:
        pc = "kanal" if per_channel else "tensor"
        exp = lambda n: 0 if per_channel else n
        # 1. tek çarpım
        k, n = 9, 5
        add(f"tek_{tname}_{pc}", [helper.make_node("MatMul", ["x", "W"], ["y0"])], {"W": W(k, n)},
            ["N", k], 1, lambda x, d: [(x @ d["W"], absmm(x, d["W"]))], wtype, per_channel, exp(1), (4, k))
        # 2. üç boyutlu girdi + bias + Relu + ikinci çarpım
        k, h, n = 12, 7, 4
        add(f"zincir3b_{tname}_{pc}", [
            helper.make_node("MatMul", ["x", "W1"], ["h"]),
            helper.make_node("Add", ["h", "b"], ["hb"]),
            helper.make_node("Relu", ["hb"], ["r"]),
            helper.make_node("MatMul", ["r", "W2"], ["y0"])],
            {"W1": W(k, h), "b": rng.normal(0, 0.1, h).astype(np.float32), "W2": W(h, n)},
            ["B", "T", k], 1,
            chain, wtype, per_channel, exp(2), (2, 3, k))
        # 3. aynı ağırlığı paylaşan iki çarpım (farklı girdiler)
        k, n = 6, 6
        add(f"paylasim_{tname}_{pc}", [
            helper.make_node("MatMul", ["x", "W"], ["y0"]),
            helper.make_node("Neg", ["x"], ["xn"]),
            helper.make_node("MatMul", ["xn", "W"], ["y1"])],
            {"W": W(k, n)}, ["N", k], 2,
            lambda x, d: [(x @ d["W"], absmm(x, d["W"])), (-x @ d["W"], absmm(x, d["W"]))],
            wtype, per_channel, exp(2), (3, k))
        if per_channel: continue
        # 4. ağırlık başka işlemde de kullanılıyor
        k = 5
        add(f"agirlik_ortak_{tname}_{pc}", [
            helper.make_node("MatMul", ["x", "W"], ["y0"]),
            helper.make_node("Transpose", ["W"], ["Wt"]),
            helper.make_node("Identity", ["Wt"], ["y1"])],
            {"W": W(k, k)}, ["N", k], 2,
            lambda x, d: [(x @ d["W"], absmm(x, d["W"])), (d["W"].T, np.abs(d["W"].T))], wtype, per_channel, None, (2, k))

# zincir3b ve agirlik_ortak için elle hesap: ayrı (fn None olanlar) — yeniden kur
fixed = []
for c in cases:
    fixed.append(c)
json.dump(cases, open(os.path.join(out, "cases.json"), "w"))
for c in cases:
    print(c["file"], c["ops"], "beklenen", c["expect"])
