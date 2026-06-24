"""
Tests del protocolo TCP/JSON del worker (sin cargar whisperX).

Verifica el framing newline-delimited y los caminos ok/erróneo de
`handle_connection`, monkeypatcheando `process_request`.

Ejecutar:  python -m unittest test_worker -v
"""

import json
import socket
import threading
import unittest

import worker


def _roundtrip(request_obj):
    """Envía una petición a handle_connection vía un par de sockets conectados."""
    a, b = socket.socketpair()
    try:
        t = threading.Thread(target=worker.handle_connection, args=(a,))
        t.start()
        b.sendall((json.dumps(request_obj) + "\n").encode("utf-8"))
        buffer = b""
        while b"\n" not in buffer:
            chunk = b.recv(65536)
            if not chunk:
                break
            buffer += chunk
        t.join(timeout=5)
        line, _, _ = buffer.partition(b"\n")
        return json.loads(line.decode("utf-8"))
    finally:
        b.close()


class WorkerProtocolTest(unittest.TestCase):
    def setUp(self):
        self._orig = worker.process_request

    def tearDown(self):
        worker.process_request = self._orig

    def test_respuesta_ok(self):
        worker.process_request = lambda req: [
            {"start": 0.0, "end": 1.0, "text": "hola", "speaker": "SPEAKER_00"}
        ]
        resp = _roundtrip({"id": "abc", "audioPath": "x.wav", "diarize": False})
        self.assertEqual(resp["id"], "abc")
        self.assertTrue(resp["ok"])
        self.assertEqual(len(resp["segments"]), 1)
        self.assertEqual(resp["segments"][0]["text"], "hola")

    def test_respuesta_error(self):
        def boom(req):
            raise RuntimeError("falta hfToken")

        worker.process_request = boom
        resp = _roundtrip({"id": "xyz", "audioPath": "x.wav", "diarize": True})
        self.assertEqual(resp["id"], "xyz")
        self.assertFalse(resp["ok"])
        self.assertIn("hfToken", resp["error"])

    def test_id_ausente_no_rompe(self):
        worker.process_request = lambda req: []
        resp = _roundtrip({"audioPath": "x.wav"})
        self.assertTrue(resp["ok"])
        self.assertIsNone(resp["id"])


if __name__ == "__main__":
    unittest.main()
