pub const SERVICE_PROTOCOL_VERSION: u8 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum BootstrapError { CapabilityUnavailable }

pub fn capability() -> Result<(), BootstrapError> {
    Err(BootstrapError::CapabilityUnavailable)
}
