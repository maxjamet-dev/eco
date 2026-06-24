"""
Shims de compatibilidad para el stack ML.

PyTorch 2.6 cambió el valor por defecto de `torch.load(weights_only=...)` de
False a True. Los checkpoints de pyannote (usados por el VAD de whisperX y por
la diarización) contienen objetos `omegaconf` que el cargador "weights_only"
rechaza, provocando UnpicklingError.

Como los modelos provienen de Hugging Face (fuente confiable configurada por el
usuario), restauramos el comportamiento previo de forma controlada:
1) Allowlist de los globals de omegaconf (camino preferido).
2) Respaldo: forzar weights_only=False en torch.load.
"""


def apply_torch_load_compat():
    import torch

    # 1) Allowlist de clases conocidas de omegaconf (PyTorch >= 2.6).
    try:
        import omegaconf

        safe = []
        for name in ("ListConfig", "DictConfig"):
            obj = getattr(omegaconf, name, None)
            if obj is not None:
                safe.append(obj)
        # Contenedores internos que omegaconf serializa.
        try:
            from omegaconf.base import ContainerMetadata, Metadata  # type: ignore
            from omegaconf.nodes import AnyNode  # type: ignore

            safe.extend([ContainerMetadata, Metadata, AnyNode])
        except Exception:  # noqa: BLE001
            pass
        if safe and hasattr(torch.serialization, "add_safe_globals"):
            torch.serialization.add_safe_globals(safe)
    except Exception:  # noqa: BLE001
        pass

    # 2) Respaldo robusto: weights_only=False por defecto.
    _orig_load = torch.load

    def _patched_load(*args, **kwargs):
        # Forzamos weights_only=False aunque el llamador (p.ej. lightning_fabric)
        # lo pase explícitamente como True.
        kwargs["weights_only"] = False
        return _orig_load(*args, **kwargs)

    if getattr(torch.load, "_meetcap_patched", False):
        return
    _patched_load._meetcap_patched = True  # type: ignore[attr-defined]
    torch.load = _patched_load  # type: ignore[assignment]


def apply_speechbrain_compat():
    """
    Arregla el fallo de speechbrain con sus "integraciones" perezosas
    (k2_fsa, nlp, …): dependencias opcionales que la diarización de pyannote NO
    usa, pero cuya importación perezosa lanza ImportError.

    En Python 3.12 `hasattr(modulo_lazy, '__file__')` propaga ese ImportError en
    vez de devolver False (porque hasattr solo silencia AttributeError), lo que
    rompe el escaneo de módulos que hace pyannote/torch al cargar el pipeline.

    Parcheamos LazyModule.__getattr__ para que un fallo de importación perezosa
    se traduzca a AttributeError → hasattr devuelve False y el escaneo continúa.
    """
    try:
        import speechbrain.utils.importutils as iu  # type: ignore
    except Exception:  # noqa: BLE001
        return

    lazy_cls = getattr(iu, "LazyModule", None)
    if lazy_cls is None or getattr(lazy_cls, "_meetcap_patched", False):
        return

    original_getattr = lazy_cls.__getattr__

    def safe_getattr(self, attr):
        try:
            return original_getattr(self, attr)
        except ImportError as exc:
            raise AttributeError(attr) from exc

    lazy_cls.__getattr__ = safe_getattr
    lazy_cls._meetcap_patched = True
