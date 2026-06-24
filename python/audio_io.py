"""
Carga de audio sin depender de ffmpeg.

whisperx.load_audio invoca ffmpeg por subprocess. Como nuestras pistas de
captura ya son WAV PCM 16 kHz mono (SDD §9.1), las leemos con soundfile y las
entregamos como float32 mono normalizado en [-1, 1], que es lo que espera
faster-whisper. Si el formato no es el esperado, hacemos un resampleo simple.
"""

SAMPLE_RATE = 16000


def load_audio_16k_mono(path):
    import numpy as np
    import soundfile as sf

    data, sr = sf.read(path, dtype="float32", always_2d=False)

    # Estéreo → mono (promedio de canales).
    if getattr(data, "ndim", 1) > 1:
        data = data.mean(axis=1)

    # Resampleo lineal a 16 kHz si hiciera falta (evita dependencias extra).
    if sr != SAMPLE_RATE and len(data) > 0:
        import numpy as np

        duration = len(data) / float(sr)
        target_len = int(round(duration * SAMPLE_RATE))
        if target_len > 0:
            xp = np.linspace(0.0, 1.0, num=len(data), endpoint=False)
            x = np.linspace(0.0, 1.0, num=target_len, endpoint=False)
            data = np.interp(x, xp, data).astype("float32")

    return np.ascontiguousarray(data, dtype="float32")
