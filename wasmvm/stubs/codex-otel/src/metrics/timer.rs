//! Metrics timer (stub — drop is a no-op).

use crate::metrics::Result;

/// Timer that records duration on drop (stub — no-op).
#[derive(Debug)]
pub struct Timer;

impl Timer {
    /// Record the elapsed duration with additional tags (stub — no-op).
    pub fn record(&self, _additional_tags: &[(&str, &str)]) -> Result<()> {
        Ok(())
    }
}

impl Drop for Timer {
    fn drop(&mut self) {
        // No-op on WASI
    }
}
