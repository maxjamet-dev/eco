"""
Smoke test E2E del pipeline whisperX sobre CUDA (sin diarización).

Genera un WAV sintético corto y lo transcribe con un modelo pequeño para
validar que whisperx + faster-whisper + CTranslate2 corren en la GPU.
NO valida calidad (el audio es sintético), solo que el pipeline funciona.

Uso: python smoke_transcribe.py [--model tiny] [--device cuda]
"""

import argparse
import math
import struct
import tempfile
import wave
import os


def make_wav(path, seconds=3, freq=440, rate=16000):
    n = seconds * rate
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        frames = bytearray()
        for i in range(n):
            # tono + envolvente para evitar clic; amplitud moderada
            val = int(0.3 * 32767 * math.sin(2 * math.pi * freq * i / rate))
            frames += struct.pack("<h", val)
        w.writeframes(bytes(frames))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="tiny")
    parser.add_argument("--device", default="cuda")
    args = parser.parse_args()

    import torch
    from compat import apply_torch_load_compat

    apply_torch_load_compat()
    import whisperx

    print(f"torch {torch.__version__} | cuda disponible: {torch.cuda.is_available()}")
    device = args.device if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    print(f"device={device} compute_type={compute_type} model={args.model}")

    tmp = os.path.join(tempfile.gettempdir(), "meetcap_smoke.wav")
    make_wav(tmp)
    print(f"WAV sintético: {tmp}")

    from audio_io import load_audio_16k_mono

    model = whisperx.load_model(args.model, device, compute_type=compute_type, language="es")
    audio = load_audio_16k_mono(tmp)
    result = model.transcribe(audio, batch_size=16, language="es")
    segs = result.get("segments", [])
    print(f"OK — transcripción ejecutada en {device}. Segmentos: {len(segs)}")
    for s in segs[:5]:
        print(f"  [{s.get('start'):.2f}-{s.get('end'):.2f}] {s.get('text')!r}")
    print("SMOKE_OK")


if __name__ == "__main__":
    main()
