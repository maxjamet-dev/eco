"""Tests de las métricas WER/DER. Ejecutar: python -m unittest eval.test_metrics -v"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from eval.metrics import der, wer  # noqa: E402


class WerTest(unittest.TestCase):
    def test_identico(self):
        self.assertEqual(wer("hola mundo cruel", "hola mundo cruel"), 0.0)

    def test_una_sustitucion(self):
        # 1 error sobre 3 palabras
        self.assertAlmostEqual(wer("hola mundo cruel", "hola planeta cruel"), 1 / 3)

    def test_insercion_y_delecion(self):
        self.assertAlmostEqual(wer("a b c d", "a b c d e"), 1 / 4)  # inserción
        self.assertAlmostEqual(wer("a b c d", "a b c"), 1 / 4)  # deleción

    def test_referencia_vacia(self):
        self.assertEqual(wer("", ""), 0.0)
        self.assertEqual(wer("", "hola"), 1.0)


class DerTest(unittest.TestCase):
    def test_diarizacion_perfecta_con_etiquetas_distintas(self):
        ref = [(0, 1000, "A"), (1000, 2000, "B")]
        # Hipótesis correcta pero con otras etiquetas → mapeo óptimo da DER 0.
        hyp = [(0, 1000, "SPEAKER_00"), (1000, 2000, "SPEAKER_01")]
        self.assertEqual(der(ref, hyp), 0.0)

    def test_todo_un_hablante_cuando_eran_dos(self):
        ref = [(0, 1000, "A"), (1000, 2000, "B")]
        hyp = [(0, 2000, "SPEAKER_00")]
        # La mitad de los marcos quedan mal etiquetados.
        self.assertAlmostEqual(der(ref, hyp), 0.5, places=1)

    def test_referencia_sin_voz(self):
        self.assertEqual(der([], []), 0.0)


if __name__ == "__main__":
    unittest.main()
