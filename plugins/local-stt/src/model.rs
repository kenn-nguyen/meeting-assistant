pub use hypr_local_model::{AmModel, CactusSttModel, LocalModel, WhisperModel};

pub static SUPPORTED_MODELS: [LocalModel; 11] = [
    LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int4),
    LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int4Apple),
    LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int8),
    LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int8Apple),
    LocalModel::Cactus(CactusSttModel::WhisperSmallInt8),
    LocalModel::Cactus(CactusSttModel::WhisperSmallInt8Apple),
    LocalModel::Cactus(CactusSttModel::WhisperMediumInt8),
    LocalModel::Cactus(CactusSttModel::WhisperMediumInt8Apple),
    LocalModel::Whisper(WhisperModel::QuantizedLargeTurbo),
    LocalModel::Am(AmModel::ParakeetV3),
    LocalModel::Am(AmModel::WhisperLargeV3),
];

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SttModelType {
    Cactus,
    Whispercpp,
    Argmax,
}

#[derive(serde::Serialize, serde::Deserialize, specta::Type)]
pub struct SttModelInfo {
    pub key: LocalModel,
    pub display_name: String,
    pub description: String,
    pub size_bytes: u64,
    pub model_type: SttModelType,
}

pub fn stt_model_info(model: &LocalModel) -> SttModelInfo {
    match model {
        LocalModel::Cactus(value) => SttModelInfo {
            key: model.clone(),
            display_name: curated_display_name(model)
                .unwrap_or_else(|| value.display_name().to_string()),
            description: curated_description(model)
                .unwrap_or_else(|| value.description().to_string()),
            size_bytes: curated_size_bytes(model).unwrap_or(0),
            model_type: SttModelType::Cactus,
        },
        LocalModel::Whisper(value) => SttModelInfo {
            key: model.clone(),
            display_name: curated_display_name(model)
                .unwrap_or_else(|| value.display_name().to_string()),
            description: curated_description(model).unwrap_or_else(|| value.description()),
            size_bytes: curated_size_bytes(model).unwrap_or_else(|| value.model_size_bytes()),
            model_type: SttModelType::Whispercpp,
        },
        LocalModel::Am(value) => SttModelInfo {
            key: model.clone(),
            display_name: curated_display_name(model)
                .unwrap_or_else(|| value.display_name().to_string()),
            description: curated_description(model)
                .unwrap_or_else(|| value.description().to_string()),
            size_bytes: curated_size_bytes(model).unwrap_or_else(|| value.model_size_bytes()),
            model_type: SttModelType::Argmax,
        },
        LocalModel::GgufLlm(_) | LocalModel::CactusLlm(_) => unreachable!(),
    }
}

pub fn is_startable_on_current_runtime(model: &LocalModel) -> bool {
    match model {
        LocalModel::Cactus(_) => cfg!(target_arch = "aarch64"),
        LocalModel::Whisper(_) => cfg!(feature = "whisper-cpp"),
        LocalModel::Am(_) => cfg!(target_arch = "aarch64"),
        LocalModel::GgufLlm(_) | LocalModel::CactusLlm(_) => false,
    }
}

fn curated_display_name(model: &LocalModel) -> Option<String> {
    match model {
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int4)
        | LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int4Apple) => {
            Some("Fast live English".to_string())
        }
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int8)
        | LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int8Apple) => {
            Some("Best live English".to_string())
        }
        LocalModel::Cactus(CactusSttModel::WhisperSmallInt8)
        | LocalModel::Cactus(CactusSttModel::WhisperSmallInt8Apple) => {
            Some("Balanced multilingual".to_string())
        }
        LocalModel::Cactus(CactusSttModel::WhisperMediumInt8)
        | LocalModel::Cactus(CactusSttModel::WhisperMediumInt8Apple) => {
            Some("Accurate multilingual".to_string())
        }
        LocalModel::Whisper(WhisperModel::QuantizedLargeTurbo) => {
            Some("Large V3 Turbo".to_string())
        }
        LocalModel::Am(AmModel::WhisperLargeV3) => Some("Advanced high accuracy".to_string()),
        LocalModel::Am(AmModel::ParakeetV3) => Some("Advanced Parakeet".to_string()),
        _ => None,
    }
}

fn curated_description(model: &LocalModel) -> Option<String> {
    match model {
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int4) => Some(
            "Choose for fastest English live transcription. Lightweight Parakeet TDT v3 INT4, about 411 MB."
                .to_string(),
        ),
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int4Apple) => Some(
            "Choose for fastest English live transcription on Apple Silicon. Apple NPU Parakeet TDT v3 INT4, about 667 MB."
                .to_string(),
        ),
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int8) => Some(
            "Choose for stronger English live accuracy. Parakeet TDT v3 INT8, about 673 MB."
                .to_string(),
        ),
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int8Apple) => Some(
            "Choose for the best local English live accuracy on Apple Silicon. Apple NPU Parakeet TDT v3 INT8, about 1.18 GB."
                .to_string(),
        ),
        LocalModel::Cactus(CactusSttModel::WhisperSmallInt8) => Some(
            "Choose as the general multilingual default. Whisper Small INT8, about 271 MB."
                .to_string(),
        ),
        LocalModel::Cactus(CactusSttModel::WhisperSmallInt8Apple) => Some(
            "Choose as the general multilingual default on Apple Silicon. Apple NPU Whisper Small INT8, about 348 MB."
                .to_string(),
        ),
        LocalModel::Cactus(CactusSttModel::WhisperMediumInt8) => Some(
            "Choose for better multilingual quality when speed matters less. Whisper Medium INT8, about 789 MB."
                .to_string(),
        ),
        LocalModel::Cactus(CactusSttModel::WhisperMediumInt8Apple) => Some(
            "Choose for better multilingual quality on Apple Silicon when speed matters less. Apple NPU Whisper Medium INT8, about 1.04 GB."
                .to_string(),
        ),
        LocalModel::Whisper(WhisperModel::QuantizedLargeTurbo) => Some(
            "Choose for high-accuracy multilingual batch transcription with better speed than full Large V3. Whisper.cpp Large V3 Turbo Q8, about 834 MB; not for live transcription."
                .to_string(),
        ),
        LocalModel::Am(AmModel::WhisperLargeV3) => Some(
            "Choose for advanced multilingual accuracy. External ArgMax server, Apple Silicon only, about 597 MB."
                .to_string(),
        ),
        LocalModel::Am(AmModel::ParakeetV3) => Some(
            "Choose for advanced Parakeet speed across English and many European languages. External ArgMax server, Apple Silicon only, about 471 MB."
                .to_string(),
        ),
        _ => None,
    }
}

fn curated_size_bytes(model: &LocalModel) -> Option<u64> {
    let mb = |value: u64| value * 1024 * 1024;
    match model {
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int4) => Some(mb(411)),
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int4Apple) => Some(mb(667)),
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int8) => Some(mb(673)),
        LocalModel::Cactus(CactusSttModel::ParakeetTdt0_6bV3Int8Apple) => Some(mb(1180)),
        LocalModel::Cactus(CactusSttModel::WhisperSmallInt8) => Some(mb(271)),
        LocalModel::Cactus(CactusSttModel::WhisperSmallInt8Apple) => Some(mb(348)),
        LocalModel::Cactus(CactusSttModel::WhisperMediumInt8) => Some(mb(789)),
        LocalModel::Cactus(CactusSttModel::WhisperMediumInt8Apple) => Some(mb(1040)),
        LocalModel::Whisper(WhisperModel::QuantizedLargeTurbo) => Some(874_188_075),
        LocalModel::Am(AmModel::WhisperLargeV3) => Some(mb(597)),
        LocalModel::Am(AmModel::ParakeetV3) => Some(mb(471)),
        _ => None,
    }
}
