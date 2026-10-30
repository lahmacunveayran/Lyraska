"""Arka plan model yükü: <iş_parçacığı> ile 30 sn pencereyi tekrar tekrar çalıştırır; nice ile düşük öncelik."""
import sys, os, numpy as np, onnxruntime as ort, time
thr, dur = int(sys.argv[1]), float(sys.argv[2])
if len(sys.argv) > 3: os.nice(int(sys.argv[3]))
M = "/tmp/claude-0/-home-user-Lyraska/4262c203-a61e-5ac0-b0bb-3cada8e7b304/scratchpad/soz-hizalama/models/sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-v2-int8-2026-02-05/model.int8.onnx"
o = ort.SessionOptions(); o.intra_op_num_threads = thr; o.inter_op_num_threads = 1
s = ort.InferenceSession(M, o); x = np.random.default_rng(0).standard_normal((1, 480000)).astype(np.float32) * 0.1
end = time.time() + dur
while time.time() < end: s.run(None, {"x": x})
