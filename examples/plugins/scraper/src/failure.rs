#[derive(Clone, Debug)]
pub enum Kind {
    AgeWall,
    NotFound,
    Network,
    RateLimit,
    ServerError,
    Parse,
    Unknown,
}

pub fn classify(status: u16, body: &str) -> Kind {
    let lower = body.to_lowercase();
    if lower.contains("age verification")
        || lower.contains("ageverify")
        || lower.contains("已經成年")
        || lower.contains("地區年齡")
    {
        return Kind::AgeWall;
    }
    if status == 404 {
        return Kind::NotFound;
    }
    if status == 429 {
        return Kind::RateLimit;
    }
    if status >= 500 {
        return Kind::ServerError;
    }
    if status == 0 {
        return Kind::Network;
    }
    Kind::Unknown
}
