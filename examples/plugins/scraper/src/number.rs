use std::path::Path;

pub fn parse_number(path: &str) -> Option<String> {
    let name = Path::new(path).file_stem().and_then(|s| s.to_str())?;
    if let Some(m) = extract(name) {
        return Some(m.to_uppercase());
    }
    extract(path).map(|x| x.to_uppercase())
}

fn extract(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut i = 0;
    let n = bytes.len();
    while i < n {
        if bytes[i].is_ascii_alphabetic() {
            let mut j = i;
            while j < n && bytes[j].is_ascii_alphabetic() {
                j += 1;
            }
            let mut k = j;
            if k < n && bytes[k] == b'-' {
                k += 1;
            }
            if k < n && bytes[k].is_ascii_digit() {
                let mut m = k;
                while m < n && bytes[m].is_ascii_digit() {
                    m += 1;
                }
                let cand = &s[i..m];
                if cand.contains('-') {
                    let mut parts = cand.split('-');
                    let a = parts.next()?;
                    let b = parts.next()?;
                    if a.chars().all(|c| c.is_ascii_alphabetic())
                        && !a.is_empty()
                        && b.chars().all(|c| c.is_ascii_digit())
                        && !b.is_empty()
                        && parts.next().is_none()
                    {
                        return Some(cand.to_string());
                    }
                }
            }
        }
        i += 1;
    }
    None
}
