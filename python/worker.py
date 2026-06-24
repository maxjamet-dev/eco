"""
Worker whisperX (SDD §5.3, §10.2).

Servidor TCP local que recibe peticiones JSON (una por línea) y devuelve
segmentos transcritos + diarizados. Mantiene los modelos cargados en memoria
entre peticiones para evitar recargas costosas.

Protocolo:
  Petición:  {"id","audioPath","lang","model","device","diarize",
              "minSpeakers"?,"maxSpeakers"?,"hfToken"?}\n
  Respuesta: {"id","ok":true,"segments":[{"start","end","text","speaker"?}]}\n
             {"id","ok":false,"error":"..."}\n

Gestión de VRAM (8 GB): los modelos de ASR/alineación/diarización se cargan
bajo demanda; ante OOM se sugiere usar large-v3-turbo y descargar el LLM.
"""

import argparse
import json
import socket
import sys
import threading
import traceback

# Carga perezosa de whisperx (import pesado).
_whisperx = None


def _wx():
    global _whisperx
    if _whisperx is None:
        # Aplica el shim de torch.load (PyTorch 2.6+) ANTES de cargar whisperx.
        from compat import apply_torch_load_compat

        apply_torch_load_compat()
        import whisperx  # noqa: WPS433

        _whisperx = whisperx
    return _whisperx


class ModelCache:
    """Cachea modelos por (nombre, device) para reutilizarlos entre peticiones."""

    def __init__(self):
        self.asr = {}
        self.align = {}
        self.diarize = {}

    def get_asr(self, model_name, device, compute_type, language):
        key = (model_name, device, compute_type)
        if key not in self.asr:
            print(f"[worker] cargando ASR {model_name} ({device}, {compute_type})", flush=True)
            self.asr[key] = _wx().load_model(
                model_name, device, compute_type=compute_type, language=language
            )
        return self.asr[key]

    def get_align(self, language, device):
        key = (language, device)
        if key not in self.align:
            print(f"[worker] cargando modelo de alineación ({language})", flush=True)
            model_a, metadata = _wx().load_align_model(language_code=language, device=device)
            self.align[key] = (model_a, metadata)
        return self.align[key]

    def get_diarize(self, hf_token, device):
        key = device  # un pipeline por device; el token se fija al crear
        if key not in self.diarize:
            print("[worker] cargando pipeline de diarización (pyannote)", flush=True)
            self.diarize[key] = _load_diarization_pipeline(hf_token, device)
        return self.diarize[key]


def _load_diarization_pipeline(hf_token, device):
    """Importa DiarizationPipeline de forma robusta entre versiones de whisperx."""
    wx = _wx()
    # whisperx >= 3.2 movió la clase a whisperx.diarize
    try:
        from whisperx.diarize import DiarizationPipeline  # type: ignore
    except Exception:  # noqa: BLE001
        DiarizationPipeline = wx.DiarizationPipeline  # type: ignore
    return DiarizationPipeline(use_auth_token=hf_token, device=device)


CACHE = ModelCache()


def process_request(req):
    """Ejecuta una petición de transcripción/diarización y devuelve segmentos."""
    wx = _wx()
    audio_path = req["audioPath"]
    language = req.get("lang", "es")
    model_name = req.get("model", "large-v3-turbo")
    device = req.get("device", "cuda")
    diarize = bool(req.get("diarize", False))
    compute_type = "float16" if device == "cuda" else "int8"

    # Cargamos el WAV con soundfile (sin ffmpeg); las pistas de captura ya son
    # PCM 16 kHz mono. Si falla (otro formato), recurrimos a whisperx/ffmpeg.
    try:
        from audio_io import load_audio_16k_mono

        audio = load_audio_16k_mono(audio_path)
    except Exception as exc:  # noqa: BLE001
        print(f"[worker] soundfile falló ({exc}); usando whisperx.load_audio", flush=True)
        audio = wx.load_audio(audio_path)

    asr = CACHE.get_asr(model_name, device, compute_type, language)
    result = asr.transcribe(audio, batch_size=16, language=language)

    segments = result.get("segments", [])

    if diarize:
        # Alineación a nivel de palabra (mejora timestamps y asignación).
        try:
            model_a, metadata = CACHE.get_align(language, device)
            aligned = wx.align(
                segments, model_a, metadata, audio, device, return_char_alignments=False
            )
            result = aligned
            segments = result.get("segments", [])
        except Exception as exc:  # noqa: BLE001
            print(f"[worker] alineación falló (continuo sin ella): {exc}", flush=True)

        hf_token = req.get("hfToken")
        if not hf_token:
            raise RuntimeError(
                "Diarización solicitada pero falta el token de Hugging Face (hfToken)."
            )
        diarizer = CACHE.get_diarize(hf_token, device)
        kwargs = {}
        if req.get("minSpeakers") is not None:
            kwargs["min_speakers"] = req["minSpeakers"]
        if req.get("maxSpeakers") is not None:
            kwargs["max_speakers"] = req["maxSpeakers"]
        diarize_segments = diarizer(audio, **kwargs)
        result = wx.assign_word_speakers(diarize_segments, result)
        segments = result.get("segments", [])

    out = []
    for seg in segments:
        out.append(
            {
                "start": float(seg.get("start", 0.0) or 0.0),
                "end": float(seg.get("end", 0.0) or 0.0),
                "text": (seg.get("text") or "").strip(),
                "speaker": seg.get("speaker"),
            }
        )
    return out


def handle_connection(conn):
    """Atiende una conexión: lee una línea JSON, responde una línea JSON."""
    with conn:
        buffer = b""
        while b"\n" not in buffer:
            chunk = conn.recv(65536)
            if not chunk:
                return
            buffer += chunk
        line, _, _ = buffer.partition(b"\n")
        req_id = None
        try:
            req = json.loads(line.decode("utf-8"))
            req_id = req.get("id")
            segments = process_request(req)
            resp = {"id": req_id, "ok": True, "segments": segments}
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            resp = {"id": req_id, "ok": False, "error": str(exc)}
        conn.sendall((json.dumps(resp) + "\n").encode("utf-8"))


def serve(port):
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port))
    srv.listen(8)
    # Señal de readiness que el proceso main de Electron espera por stdout.
    print(f"READY {port}", flush=True)

    lock = threading.Lock()
    while True:
        conn, _addr = srv.accept()
        # Procesamiento secuencial: los modelos no son thread-safe y la VRAM
        # es limitada (8 GB). Un trabajo a la vez (coincide con el orquestador).
        with lock:
            handle_connection(conn)


def main():
    parser = argparse.ArgumentParser(description="Worker whisperX (ASR + diarización)")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    try:
        serve(args.port)
    except KeyboardInterrupt:
        sys.exit(0)


if __name__ == "__main__":
    main()
