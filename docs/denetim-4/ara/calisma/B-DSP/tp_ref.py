"""Bağımsız gerçek tepe referansı: (1) FFT tabanlı ideal bant sınırlı 32× ara değerleme (kenarlar
atılır), (2) 32 × 1024 katsayılı Kaiser pencereli sinc (kenarlar atılır). İkisi uyuşmalı."""
import numpy as np
from scipy import signal


def tp_fft_db(x, up=32, trim=0.02):
    n = len(x)
    y = signal.resample(x, n * up)
    k = int(trim * len(y))
    return 20 * np.log10(np.max(np.abs(y[k:-k])) + 1e-300)


def tp_sinc_db(x, up=32, half=1024, beta=14.0):
    h = signal.firwin(2 * up * half + 1, 1.0 / up, window=("kaiser", beta)) * up
    y = signal.upfirdn(h, x, up=up)
    k = 2 * up * half
    return 20 * np.log10(np.max(np.abs(y[k:-k])) + 1e-300)


def tp_ref_db(x):
    a, b = tp_fft_db(x), tp_sinc_db(x)
    return a, b
