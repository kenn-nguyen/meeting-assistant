use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CalendarOAuthCallbackSearch {
    pub provider: String,
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}
