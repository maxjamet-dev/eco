"""
Métricas de calidad de IA (SDD §15): WER (transcripción) y DER (diarización).

- WER: tasa de error de palabra = (S + D + I) / N sobre la referencia.
- DER: tasa de error de diarización por marco temporal con mapeo óptimo de
  etiquetas (versión simplificada, sin "collar"). Suficiente para seguimiento
  interno de calidad sobre audio de prueba en español.
"""

from itertools import permutations


def _normalize(text):
    return text.lower().split()


def wer(reference, hypothesis):
    """Tasa de error de palabra mediante distancia de edición (Levenshtein)."""
    ref = _normalize(reference)
    hyp = _normalize(hypothesis)
    n = len(ref)
    if n == 0:
        return 0.0 if len(hyp) == 0 else 1.0

    # Programación dinámica clásica.
    d = [[0] * (len(hyp) + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(len(hyp) + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, len(hyp) + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            d[i][j] = min(
                d[i - 1][j] + 1,  # deleción
                d[i][j - 1] + 1,  # inserción
                d[i - 1][j - 1] + cost,  # sustitución/acierto
            )
    return d[n][len(hyp)] / n


def _frames(segments, step_ms):
    """Convierte segmentos [(start_ms, end_ms, speaker)] en etiquetas por marco."""
    if not segments:
        return []
    end = max(s[1] for s in segments)
    frames = [None] * (int(end // step_ms) + 1)
    for start, stop, spk in segments:
        i0 = int(start // step_ms)
        i1 = int(stop // step_ms)
        for i in range(i0, min(i1 + 1, len(frames))):
            frames[i] = spk
    return frames


def der(reference, hypothesis, step_ms=100):
    """
    DER simplificado: fracción de marcos mal etiquetados bajo el mejor mapeo
    de etiquetas de hipótesis→referencia. `reference`/`hypothesis` son listas de
    (start_ms, end_ms, speaker).
    """
    ref_frames = _frames(reference, step_ms)
    hyp_frames = _frames(hypothesis, step_ms)
    length = max(len(ref_frames), len(hyp_frames))
    if length == 0:
        return 0.0
    ref_frames += [None] * (length - len(ref_frames))
    hyp_frames += [None] * (length - len(hyp_frames))

    ref_speakers = sorted({s for s in ref_frames if s is not None})
    hyp_speakers = sorted({s for s in hyp_frames if s is not None})

    # Marcos con voz en la referencia (denominador estándar de DER).
    scored = [i for i in range(length) if ref_frames[i] is not None]
    if not scored:
        return 0.0

    best_errors = None
    # Mapeo óptimo por fuerza bruta (pocos hablantes en una reunión típica).
    if len(hyp_speakers) <= 6:
        for perm in permutations(ref_speakers, min(len(ref_speakers), len(hyp_speakers))):
            mapping = dict(zip(hyp_speakers, perm))
            errors = 0
            for i in scored:
                mapped = mapping.get(hyp_frames[i])
                if mapped != ref_frames[i]:
                    errors += 1
            if best_errors is None or errors < best_errors:
                best_errors = errors
    if best_errors is None:
        best_errors = len(scored)
    return best_errors / len(scored)
