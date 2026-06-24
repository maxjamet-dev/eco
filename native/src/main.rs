//! Binario de captura `meetcap` (SDD §9.1).
//!
//! Orquesta dos capturas WASAPI simultáneas (micrófono + loopback del sistema)
//! alineadas por un reloj común (QPC), controlado por el proceso main de
//! Electron mediante JSON por stdin/stdout.

mod capture;
mod protocol;

use std::io::{BufRead, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use capture::{qpc_frequency, start_capture, CaptureHandle, CaptureOutcome};
use protocol::{emit, CaptureMeta, Command, Event};

const CAPTURE_VERSION: &str = "0.1.0";

struct Session {
    mic: Option<CaptureHandle>,
    sys: Option<CaptureHandle>,
    #[allow(dead_code)]
    out_dir: String,
    started: Instant,
    level_stop: Arc<AtomicBool>,
    level_thread: Option<std::thread::JoinHandle<()>>,
}

fn main() {
    // WASAPI requiere COM inicializado en este hilo.
    if wasapi::initialize_mta().is_err() {
        emit(&Event::Error {
            message: "No se pudo inicializar COM/WASAPI (MTA)".into(),
        });
    }

    let stdin = std::io::stdin();
    let mut session: Option<Session> = None;

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<Command>(trimmed) {
            Ok(Command::Start {
                recording_id: _,
                out_dir,
                mic_id: _,
                sys_id: _,
            }) => {
                if session.is_some() {
                    emit(&Event::Error {
                        message: "Ya hay una captura en curso".into(),
                    });
                    continue;
                }
                match start_session(&out_dir) {
                    Ok(s) => {
                        session = Some(s);
                        emit(&Event::State {
                            state: "recording".into(),
                        });
                    }
                    Err(e) => emit(&Event::Error { message: e }),
                }
            }
            Ok(Command::Stop) => {
                if let Some(s) = session.take() {
                    match stop_session(s) {
                        Ok(meta) => {
                            let _ = write_meta(&meta);
                            emit(&Event::Stopped { meta });
                        }
                        Err(e) => emit(&Event::Error { message: e }),
                    }
                }
                // Tras detener, terminamos el proceso (un ciclo de vida por captura).
                break;
            }
            Ok(Command::ListDevices) => list_devices(),
            Err(e) => emit(&Event::Error {
                message: format!("Comando inválido: {e}"),
            }),
        }
    }
}

fn start_session(out_dir: &str) -> Result<Session, String> {
    std::fs::create_dir_all(out_dir).map_err(|e| format!("mkdir: {e}"))?;
    let mic_path = Path::new(out_dir).join("mic.wav");
    let sys_path = Path::new(out_dir).join("system.wav");

    let mic = start_capture(mic_path.to_string_lossy().to_string(), false);
    let sys = start_capture(sys_path.to_string_lossy().to_string(), true);

    // Hilo emisor de niveles: publica medidores en vivo cada ~120 ms mientras
    // dura la grabación (sin él, los medidores de la UI no se moverían).
    let level_stop = Arc::new(AtomicBool::new(false));
    let mic_level = mic.level_milli.clone();
    let sys_level = sys.level_milli.clone();
    let stop_flag = level_stop.clone();
    let level_thread = std::thread::spawn(move || {
        while !stop_flag.load(Ordering::Relaxed) {
            let mic_l = read_level(&mic_level);
            let sys_l = read_level(&sys_level);
            emit(&Event::Level { mic: mic_l, sys: sys_l })
            ;
            std::thread::sleep(Duration::from_millis(120))
        }
    });

    Ok(Session {
        mic: Some(mic),
        sys: Some(sys),
        out_dir: out_dir.to_string(),
        started: Instant::now(),
        level_stop,
        level_thread: Some(level_thread),
    })
}

fn read_level(atomic: &Arc<AtomicU32>) -> f32 {
    atomic.load(Ordering::Relaxed) as f32 / 1_000_000.0
}

fn stop_session(mut session: Session) -> Result<CaptureMeta, String> {
    let duration_ms = session.started.elapsed().as_millis() as i64;

    // Detenemos el emisor de niveles antes de cerrar las pistas.
    session.level_stop.store(true, Ordering::Relaxed);
    if let Some(t) = session.level_thread.take() {
        let _ = t.join();
    }

    let mic_out = finish(session.mic)?;
    let sys_out = finish(session.sys)?;

    // Offset del sistema respecto del micrófono usando el reloj común (QPC).
    let freq = qpc_frequency();
    let offset_sys_ms = match (&mic_out, &sys_out) {
        (Some(m), Some(s)) if m.first_qpc > 0 && s.first_qpc > 0 => {
            (s.first_qpc - m.first_qpc) * 1000 / freq
        }
        _ => 0,
    };

    Ok(CaptureMeta {
        mic_path: mic_out.as_ref().map(|o| o.path.clone()),
        system_path: sys_out.as_ref().map(|o| o.path.clone()),
        offset_sys_ms,
        duration_ms,
        mic_sample_rate: mic_out.as_ref().map(|o| o.sample_rate).unwrap_or(0),
        sys_sample_rate: sys_out.as_ref().map(|o| o.sample_rate).unwrap_or(0),
        capture_version: CAPTURE_VERSION.into(),
    })
}

fn finish(handle: Option<CaptureHandle>) -> Result<Option<CaptureOutcome>, String> {
    let Some(h) = handle else { return Ok(None) };
    h.stop.store(true, Ordering::Relaxed);
    match h.thread.join() {
        Ok(Ok(outcome)) => Ok(Some(outcome)),
        Ok(Err(e)) => Err(e),
        Err(_) => Err("hilo de captura entró en pánico".into()),
    }
}


fn write_meta(meta: &CaptureMeta) -> Result<(), String> {
    // meta.json junto a los WAV (respaldo si el evento Stopped se pierde).
    if let Some(mic) = &meta.mic_path {
        let dir = Path::new(mic).parent().unwrap_or(Path::new("."));
        let path = dir.join("meta.json");
        let json = serde_json::to_string_pretty(meta).map_err(|e| format!("meta json: {e}"))?;
        let mut f = std::fs::File::create(path).map_err(|e| format!("meta create: {e}"))?;
        f.write_all(json.as_bytes())
            .map_err(|e| format!("meta write: {e}"))?;
    }
    Ok(())
}

fn list_devices() {
    use protocol::DeviceInfo;
    use wasapi::{Direction, DeviceCollection};

    let mut inputs = Vec::new();
    let mut outputs = Vec::new();

    for (dir, sink) in [
        (Direction::Capture, &mut inputs),
        (Direction::Render, &mut outputs),
    ] {
        if let Ok(coll) = DeviceCollection::new(&dir) {
            if let Ok(count) = coll.get_nbr_devices() {
                for i in 0..count {
                    if let Ok(dev) = coll.get_device_at_index(i) {
                        let id = dev.get_id().unwrap_or_default();
                        let nombre = dev.get_friendlyname().unwrap_or_default();
                        sink.push(DeviceInfo {
                            id,
                            nombre,
                            tipo: if matches!(dir, Direction::Capture) {
                                "input".into()
                            } else {
                                "output".into()
                            },
                            es_predeterminado: false,
                        });
                    }
                }
            }
        }
    }

    emit(&Event::Devices { inputs, outputs });
}

#[allow(dead_code)]
fn sleep_ms(ms: u64) {
    std::thread::sleep(Duration::from_millis(ms));
}
