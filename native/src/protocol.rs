//! Protocolo stdio JSON entre el proceso main de Electron y este binario
//! de captura (SDD §5.4, §9.1). Una orden/evento por línea.

use serde::{Deserialize, Serialize};

/// Órdenes recibidas por stdin.
#[derive(Debug, Deserialize)]
#[serde(tag = "cmd", rename_all = "lowercase")]
pub enum Command {
    /// Inicia la captura de ambas pistas.
    Start {
        #[serde(rename = "recordingId")]
        recording_id: String,
        #[serde(rename = "outDir")]
        out_dir: String,
        #[serde(rename = "micId")]
        mic_id: Option<String>,
        #[serde(rename = "sysId")]
        sys_id: Option<String>,
    },
    /// Detiene la captura y vuelca metadatos.
    Stop,
    /// Enumera dispositivos de audio disponibles.
    ListDevices,
}

/// Metadatos de la grabación (escritos a meta.json y emitidos al detener).
#[derive(Debug, Default, Serialize)]
pub struct CaptureMeta {
    pub mic_path: Option<String>,
    pub system_path: Option<String>,
    /// Offset del reloj de la pista del sistema respecto del micrófono (ms).
    pub offset_sys_ms: i64,
    pub duration_ms: i64,
    pub mic_sample_rate: u32,
    pub sys_sample_rate: u32,
    pub capture_version: String,
}

/// Eventos emitidos por stdout.
#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "lowercase")]
pub enum Event {
    /// Estado de la captura.
    State { state: String },
    /// Niveles de audio en vivo (0..1).
    Level { mic: f32, sys: f32 },
    /// Captura detenida con metadatos.
    Stopped { meta: CaptureMeta },
    /// Error no fatal o fatal.
    Error { message: String },
    /// Lista de dispositivos.
    Devices {
        inputs: Vec<DeviceInfo>,
        outputs: Vec<DeviceInfo>,
    },
}

#[derive(Debug, Serialize)]
pub struct DeviceInfo {
    pub id: String,
    pub nombre: String,
    pub tipo: String,
    pub es_predeterminado: bool,
}

/// Serializa un evento como una línea JSON.
pub fn emit(event: &Event) {
    if let Ok(line) = serde_json::to_string(event) {
        println!("{line}");
    }
}
