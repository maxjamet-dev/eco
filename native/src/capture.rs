//! Captura WASAPI de un endpoint (micrófono o loopback del sistema).
//!
//! Cada endpoint corre en su propio hilo, escribe un WAV mono (formato i16) a
//! la tasa nativa del dispositivo —el resampleo a 16 kHz lo hace el worker
//! Python (audio_io.py)— y registra el QueryPerformanceCounter (QPC) del primer
//! paquete para alinear ambas pistas con un reloj común (SDD §9.1, corrección 4).
//!
//! NOTA DE COMPILACIÓN: requiere VS Build Tools (linker MSVC). Algunos nombres
//! de la API de la crate `wasapi` pueden necesitar ajuste menor tras el primer
//! `cargo build` (ver QUESTIONS_FOR_MAX.md).

use std::collections::VecDeque;
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

use hound::{WavSpec, WavWriter};
use wasapi::{
    get_default_device, Direction, SampleType, ShareMode, WaveFormat,
};
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};

/// Resultado de una captura al finalizar.
pub struct CaptureOutcome {
    pub path: String,
    pub sample_rate: u32,
    /// QPC (ticks) del primer paquete capturado; 0 si no se capturó nada.
    pub first_qpc: i64,
    pub frames: u64,
}

/// Estado compartido para controlar y monitorear una captura en curso.
pub struct CaptureHandle {
    pub stop: Arc<AtomicBool>,
    /// Nivel pico reciente (0..1) escalado a u32 (nivel*1_000_000) para lectura atómica.
    pub level_milli: Arc<AtomicU32>,
    pub thread: std::thread::JoinHandle<Result<CaptureOutcome, String>>,
}

/// Lee el contador de alta resolución (reloj común para alinear pistas).
pub fn qpc_now() -> i64 {
    let mut v = 0i64;
    unsafe {
        let _ = QueryPerformanceCounter(&mut v);
    }
    v
}

/// Frecuencia del QPC en ticks por segundo.
pub fn qpc_frequency() -> i64 {
    let mut f = 0i64;
    unsafe {
        let _ = QueryPerformanceFrequency(&mut f);
    }
    if f == 0 {
        10_000_000
    } else {
        f
    }
}

/// Lanza la captura de un endpoint en un hilo dedicado.
///
/// `loopback = true` captura el audio que el sistema reproduce (la voz de los
/// demás); `false` captura el micrófono.
pub fn start_capture(path: String, loopback: bool) -> CaptureHandle {
    let stop = Arc::new(AtomicBool::new(false));
    let level_milli = Arc::new(AtomicU32::new(0));
    let stop_t = stop.clone();
    let level_t = level_milli.clone();

    let thread = std::thread::spawn(move || run_capture(&path, loopback, stop_t, level_t));

    CaptureHandle {
        stop,
        level_milli,
        thread,
    }
}

fn run_capture(
    path: &str,
    loopback: bool,
    stop: Arc<AtomicBool>,
    level_milli: Arc<AtomicU32>,
) -> Result<CaptureOutcome, String> {
    // El micrófono es un endpoint de captura; el loopback se obtiene del
    // endpoint de render (lo que suena por los parlantes/audífonos).
    let direction = if loopback {
        Direction::Render
    } else {
        Direction::Capture
    };

    let device = get_default_device(&direction).map_err(|e| format!("device: {e}"))?;
    let mut audio_client = device
        .get_iaudioclient()
        .map_err(|e| format!("iaudioclient: {e}"))?;

    // Usamos el mix format del dispositivo (formato compartido nativo).
    let format = audio_client
        .get_mixformat()
        .map_err(|e| format!("mixformat: {e}"))?;
    let sample_rate = format.get_samplespersec();
    let channels = format.get_nchannels() as usize;
    let bits = format.get_bitspersample();
    let valid_bits = format.get_validbitspersample();
    let sample_type = format.get_subformat().map_err(|e| format!("subformat: {e}"))?;

    // Formato deseado: mantenemos tasa/canales del dispositivo; convertiremos a
    // f32 en memoria y escribiremos i16 mono al WAV.
    let desired = WaveFormat::new(
        bits as usize,
        valid_bits as usize,
        &sample_type,
        sample_rate as usize,
        channels,
        None,
    );

    let (_def_period, min_period) = audio_client
        .get_periods()
        .map_err(|e| format!("periods: {e}"))?;

    audio_client
        .initialize_client(
            &desired,
            min_period,
            &Direction::Capture, // siempre capturamos (incluso en loopback)
            &ShareMode::Shared,
            loopback,
        )
        .map_err(|e| format!("initialize_client: {e}"))?;

    let h_event = audio_client
        .set_get_eventhandle()
        .map_err(|e| format!("eventhandle: {e}"))?;
    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|e| format!("capturclient: {e}"))?;

    // WAV mono i16 a la tasa nativa (el worker Python resamplea a 16 kHz).
    let spec = WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = WavWriter::create(Path::new(path), spec)
        .map_err(|e| format!("wav create: {e}"))?;

    audio_client
        .start_stream()
        .map_err(|e| format!("start_stream: {e}"))?;

    let block_align = format.get_blockalign() as usize;
    let mut raw: VecDeque<u8> = VecDeque::new();
    let mut first_qpc: i64 = 0;
    let mut frames: u64 = 0;

    while !stop.load(Ordering::Relaxed) {
        if h_event.wait_for_event(200).is_err() {
            // timeout: seguimos comprobando la bandera de stop
            continue;
        }
        capture_client
            .read_from_device_to_deque(&mut raw)
            .map_err(|e| format!("read: {e}"))?;

        if first_qpc == 0 && !raw.is_empty() {
            first_qpc = qpc_now();
        }

        let (written, peak) = drain_to_wav(
            &mut raw,
            &mut writer,
            block_align,
            channels,
            bits as usize,
            &sample_type,
        )?;
        frames += written;
        level_milli.store((peak * 1_000_000.0) as u32, Ordering::Relaxed);
    }

    let _ = audio_client.stop_stream();
    writer.finalize().map_err(|e| format!("wav finalize: {e}"))?;

    Ok(CaptureOutcome {
        path: path.to_string(),
        sample_rate,
        first_qpc,
        frames,
    })
}

/// Convierte los bytes crudos del dispositivo a i16 mono y los escribe al WAV.
/// Devuelve (frames_escritos, pico_0..1).
fn drain_to_wav(
    raw: &mut VecDeque<u8>,
    writer: &mut WavWriter<BufWriter<File>>,
    block_align: usize,
    channels: usize,
    bits: usize,
    sample_type: &SampleType,
) -> Result<(u64, f32), String> {
    if block_align == 0 {
        return Ok((0, 0.0));
    }
    let bytes_per_sample = block_align / channels.max(1);
    let mut frames: u64 = 0;
    let mut peak: f32 = 0.0;

    while raw.len() >= block_align {
        let mut acc: f32 = 0.0;
        for _ in 0..channels {
            let mut sample_bytes = [0u8; 4];
            for b in sample_bytes.iter_mut().take(bytes_per_sample.min(4)) {
                *b = raw.pop_front().unwrap_or(0);
            }
            // bytes sobrantes del sample (si bytes_per_sample > 4)
            for _ in 4..bytes_per_sample {
                raw.pop_front();
            }
            acc += decode_sample(&sample_bytes, bits, sample_type);
        }
        let mono = acc / channels.max(1) as f32;
        if mono.abs() > peak {
            peak = mono.abs();
        }
        let clamped = mono.clamp(-1.0, 1.0);
        let s16 = (clamped * i16::MAX as f32) as i16;
        writer.write_sample(s16).map_err(|e| format!("write: {e}"))?;
        frames += 1;
    }
    Ok((frames, peak))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decode_float_passthrough() {
        let b = 0.5f32.to_le_bytes();
        let s = decode_sample(&b, 32, &SampleType::Float);
        assert!((s - 0.5).abs() < 1e-6);
    }

    #[test]
    fn decode_int16_full_scale() {
        let b = [0xFF, 0x7F, 0x00, 0x00]; // i16::MAX
        let s = decode_sample(&b, 16, &SampleType::Int);
        assert!((s - 1.0).abs() < 1e-3);
    }

    #[test]
    fn qpc_offset_is_positive_when_sys_after_mic() {
        let freq = 1000; // 1 tick = 1 ms
        let mic_first = 100;
        let sys_first = 250;
        let offset = (sys_first - mic_first) * 1000 / freq;
        assert_eq!(offset, 150);
    }
}

/// Decodifica un sample del formato del dispositivo a f32 en [-1, 1].
fn decode_sample(bytes: &[u8; 4], bits: usize, sample_type: &SampleType) -> f32 {
    match sample_type {
        SampleType::Float => f32::from_le_bytes(*bytes),
        SampleType::Int => match bits {
            16 => i16::from_le_bytes([bytes[0], bytes[1]]) as f32 / i16::MAX as f32,
            32 => i32::from_le_bytes(*bytes) as f32 / i32::MAX as f32,
            // 24-bit empaquetado en los 3 bytes bajos
            24 => {
                let v = ((bytes[2] as i32) << 16) | ((bytes[1] as i32) << 8) | (bytes[0] as i32);
                let v = (v << 8) >> 8; // extiende el signo
                v as f32 / 8_388_607.0
            }
            _ => 0.0,
        },
    }
}
