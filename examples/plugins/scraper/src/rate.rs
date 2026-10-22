pub struct RateLimiter {
    last: Option<i64>,
    min_gap_ms: i64,
}

impl RateLimiter {
    pub fn new(min_gap_ms: i64) -> Self {
        Self {
            last: None,
            min_gap_ms,
        }
    }
    pub fn wait_needed(&self, now: i64) -> i64 {
        match self.last {
            None => 0,
            Some(l) => {
                let need = l + self.min_gap_ms - now;
                if need > 0 {
                    need
                } else {
                    0
                }
            }
        }
    }
    pub fn mark(&mut self, now: i64) {
        self.last = Some(now);
    }
}
