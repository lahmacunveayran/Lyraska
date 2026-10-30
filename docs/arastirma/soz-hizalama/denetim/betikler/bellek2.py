"""Tepe bellek: ayrı süreçte. Kullanım: bellek2.py <durum> <pencere_sn> <iş_parçacığı> <arena 0/1>"""
import sys, resource, time, numpy as np
mode, win, thr, arena = sys.argv[1], float(sys.argv[2]), int(sys.argv[3]), sys.argv[4] == "1"
import onnxruntime as ort
base = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
M = "/tmp/claude-0/-home-user-Lyraska/4262c203-a61e-5ac0-b0bb-3cada8e7b304/scratchpad/soz-hizalama/models/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-v2-int8-2026-02-05/model.int8.onnx"
o = ort.SessionOptions(); o.intra_op_num_threads = thr; o.inter_op_num_threads = 1; o.enable_cpu_mem_arena = arena
if mode == "seq": o.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
s = ort.InferenceSession(M, o)
loaded = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
x = np.random.default_rng(0).standard_normal((1, int(win * 16000))).astype(np.float32) * 0.1
t = time.time()
for _ in range(2): s.run(None, {"x": x})
el = (time.time() - t) / 2
peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
print(f"pencere {win:4.0f} sn iş p. {thr} arena {int(arena)}: içe aktarma {base:6.0f} MB, model yüklü {loaded:6.0f} MB, tepe {peak:6.0f} MB, pencere süresi {el:5.2f} sn ({el/win:.3f} × ses)")
