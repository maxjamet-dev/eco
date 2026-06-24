# Preguntas para revisar en la mañana ☕

> Cosas que **idealmente** decides tú, pero que NO bloquearon el avance.
> Para cada una elegí un valor por defecto razonable y seguí adelante; marca lo que quieras cambiar.

## Pendientes que necesitan una acción tuya (credenciales / descargas)

1. **Token de Hugging Face para diarización (pyannote).**
   - El modelo `pyannote/speaker-diarization-community-1` es *gated*: hay que aceptar sus términos en huggingface.co **con tu cuenta** y generar un token.
   - Por defecto: la app pide el token en Ajustes y lo guarda con `safeStorage`. El worker Python lo recibe por la petición. **Sin token, la diarización no corre** (la transcripción sí).
   - 👉 Acción: crear cuenta/token en HF y aceptar términos de `community-1` (y `3.1` como fallback).

2. **Modelo de Ollama a descargar.**
   - Elegí `qwen3:8b` por defecto (8 GB VRAM). No hice `ollama pull` automático (descarga de ~5 GB) para no consumir tu ancho de banda sin permiso.
   - 👉 Acción: confirmar modelo y ejecutar `ollama pull qwen3:8b` (o lo dejo en el asistente de primer arranque, que ya está preparado para hacerlo).

## Decisiones de producto (elegí un default, cámbialo si quieres)

3. **Nombre del producto / app id.** Usé `grabador-reuniones` y appId `cl.fundacionciudaddepaz.grabadorreuniones`. ¿Nombre comercial definitivo?

4. **Idioma de la UI.** Hardcodeé español (es-CL). ¿Quieres i18n desde ya o más adelante?

5. **Consentimiento legal (Ley 21.719).** Puse un aviso simple al iniciar grabación. ¿Necesitas texto legal específico revisado por abogado? (lo dejé como placeholder editable).

6. **Retención/borrado de datos.** Implementé borrado manual de grabaciones. ¿Política de retención automática (ej. borrar tras N días)?

7. **Cifrado en reposo (SQLCipher).** Lo dejé como opción NO activada por defecto (el SDD lo marca "opcional"). ¿Activar por defecto?

## Notas técnicas que quizá quieras revisar

8. **VRAM 8 GB:** el diseño asume carga secuencial de modelos (ASR → liberar → LLM). Si consigues una GPU con más VRAM, se puede paralelizar.
9. **Captura WASAPI loopback en Rust:** compila y captura, pero la calidad de cancelación de eco en modo "parlantes" (no audífonos) es limitada. Ver sección de casos límite del SDD.
