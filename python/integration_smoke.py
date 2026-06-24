"""
Prueba de integración del worker completo: arranca el servidor TCP real y le
envía una petición de transcripción tal como hará el proceso main de Electron.
Usa el modelo 'tiny' y un WAV sintético (sin voz → 0 segmentos esperado).

Uso: python integration_smoke.py
"""

import json
import socket
import threading
import time

import worker
from smoke_transcribe import make_wav


def main():
    port = 8799
    wav = "C:/Users/Jamet/AppData/Local/Temp/meetcap_integration.wav"
    make_wav(wav, seconds=2)

    t = threading.Thread(target=worker.serve, args=(port,), daemon=True)
    t.start()
    time.sleep(1.0)  # esperar READY

    req = {
        "id": "it-1",
        "audioPath": wav,
        "lang": "es",
        "model": "tiny",
        "device": "cuda",
        "diarize": False,
    }
    s = socket.create_connection(("127.0.0.1", port), timeout=120)
    s.sendall((json.dumps(req) + "\n").encode("utf-8"))
    buf = b""
    while b"\n" not in buf:
        chunk = s.recv(65536)
        if not chunk:
            break
        buf += chunk
    s.close()
    resp = json.loads(buf.partition(b"\n")[0].decode("utf-8"))
    print("RESP:", json.dumps(resp)[:200])
    assert resp["id"] == "it-1", resp
    assert resp["ok"] is True, resp
    assert isinstance(resp["segments"], list), resp
    print("INTEGRATION_OK")


if __name__ == "__main__":
    main()
