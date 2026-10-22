use std::collections::BTreeMap;

pub fn parse_fields(html: &str) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    // title from h3
    if let Some(h3) = extract_tag(html, "h3") {
        // remove leading number if present
        // try to split first token that looks like number
        let mut title = h3.trim().to_string();
        // naive: if starts with letters+digits+- and space, drop prefix token
        if let Some(space) = title.find(' ') {
            let prefix = &title[..space];
            // rough check
            if prefix.contains('-') && prefix.chars().any(|c| c.is_ascii_alphabetic()) {
                // keep rest? but sometimes title might start differently; better try to remove if matches pattern
                // but easier: if prefix is like ABC-123 keep whole? spec says "标题在详情页 <h3>（形如 {number} {title}，计划去掉前缀番号）"
                // but we also need number separately; better keep rest
                let rest = title[space + 1..].trim().to_string();
                if !rest.is_empty() {
                    title = rest;
                }
            }
        }
        if !title.is_empty() {
            out.insert("title".to_string(), title);
        }
    }
    // number from header
    // try all labels
    for label in ["識別碼", "品番", "ID"] {
        if let Some(val) = extract_info(html, label) {
            if !val.is_empty() {
                out.insert("number".to_string(), val);
            }
        }
    }
    // other fields
    let mapping = [
        ("發行日期", "releaseDate"),
        ("発売日", "releaseDate"),
        ("Release Date", "releaseDate"),
        ("長度", "duration"),
        ("収録時間", "duration"),
        ("Length", "duration"),
        ("導演", "director"),
        ("監督", "director"),
        ("Director", "director"),
        ("製作商", "studio"),
        ("メーカー", "studio"),
        ("Studio", "studio"),
        ("發行商", "label"),
        ("レーベル", "label"),
        ("Label", "label"),
        ("系列", "series"),
        ("シリーズ", "series"),
        ("Series", "series"),
    ];
    for (zh, key) in &mapping {
        if let Some(val) = extract_info(html, zh) {
            if !val.is_empty() {
                out.insert(key.to_string(), val);
            }
        }
    }
    // actors
    let mut actors = Vec::new();
    // look for star links
    for (name, href) in extract_anchors(html, "/star/") {
        if !name.is_empty() && !actors.contains(&name) {
            actors.push(name);
        }
        let _ = href;
    }
    if actors.is_empty() {
        // try genre/other? no
    }
    if !actors.is_empty() {
        out.insert("actors".to_string(), actors.join(", "));
    }
    // genres from spans with class genre containing links
    let mut genres = Vec::new();
    // crude: find all <span class="genre"> ... <a href=...>text</a>
    let mut i = 0;
    let s = html;
    while let Some(pos) = s[i..].find("class=\"genre\"") {
        let p = i + pos;
        // find end of span
        if let Some(end) = s[p..].find("</span>") {
            let seg = &s[p..p + end];
            // extract anchor text
            if let Some(a) = extract_anchor_text(seg) {
                if !a.is_empty() && !genres.contains(&a) {
                    genres.push(a);
                }
            }
            i = p + end + 7;
        } else {
            break;
        }
    }
    if !genres.is_empty() {
        out.insert("genres".to_string(), genres.join(", "));
    }
    // cover
    // try bigImage href
    if let Some(cov) = extract_attr(html, "class=\"bigImage\"", "href") {
        if !cov.is_empty() {
            out.insert("cover".to_string(), cov);
        }
    } else if let Some(cov) = extract_img_cover(html) {
        out.insert("cover".to_string(), cov);
    }
    out
}

fn extract_tag(html: &str, tag: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let close = format!("</{}>", tag);
    let i = html.find(&open)?;
    let j = html[i..].find('>')? + i + 1;
    let k = html[j..].find(&close)? + j;
    Some(strip_tags(&html[j..k]).trim().to_string())
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        if c == '<' {
            in_tag = true;
            continue;
        }
        if c == '>' {
            in_tag = false;
            continue;
        }
        if !in_tag {
            out.push(c);
        }
    }
    out
}

fn extract_info(html: &str, label: &str) -> Option<String> {
    let mut search = html;
    while let Some(idx) = search.find("class=\"header\"") {
        let seg_start = idx;
        if let Some(gt) = search[seg_start..].find('>') {
            let tstart = seg_start + gt + 1;
            if let Some(lt) = search[tstart..].find('<') {
                let text = &search[tstart..tstart + lt];
                if text.contains(label) {
                    if let Some(pend) = search[seg_start..].find("</p>") {
                        let pseg = &search[seg_start..seg_start + pend];
                        // try all spans
                        let mut best: Option<String> = None;
                        let mut i = 0;
                        while let Some(sp) = pseg[i..].find("<span") {
                            let s2 = i + sp;
                            if let Some(gt2) = pseg[s2..].find('>') {
                                let t2 = s2 + gt2 + 1;
                                if let Some(lt2) = pseg[t2..].find('<') {
                                    let inner = &pseg[t2..t2 + lt2];
                                    // skip header span
                                    if !inner.contains(label) && !inner.contains(':') {
                                        let v = inner.trim().to_string();
                                        if !v.is_empty() {
                                            best = Some(v);
                                        }
                                    }
                                }
                            }
                            i = s2 + 1;
                        }
                        if best.is_some() {
                            return best;
                        }
                        if let Some(sp) = pseg.rfind("</span>") {
                            let rest = &pseg[sp + 7..];
                            let stripped = strip_tags(rest);
                            let val = stripped.trim();
                            let val = val.trim_start_matches(':').trim().to_string();
                            if !val.is_empty() {
                                return Some(val);
                            }
                        }
                    }
                }
            }
        }
        search = &search[idx + 1..];
    }
    None
}

fn extract_anchors(html: &str, contains: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut i = 0;
    let s = html;
    while let Some(pos) = s[i..].find("<a ") {
        let p = i + pos;
        if let Some(end) = s[p..].find("</a>") {
            let seg = &s[p..p + end + 4];
            if seg.contains(contains) {
                // href
                if let Some(h) = extract_attr_single(seg, "href") {
                    // text
                    if let Some(gt) = seg.find('>') {
                        let tstart = p + gt + 1;
                        if tstart < p + end {
                            let t = strip_tags(&s[tstart..p + end]).trim().to_string();
                            if !t.is_empty() {
                                out.push((t, h));
                            }
                        }
                    }
                }
            }
            i = p + end + 4;
        } else {
            break;
        }
    }
    out
}

fn extract_attr_single(seg: &str, key: &str) -> Option<String> {
    // look for key="
    let pat = format!("{}=\"", key);
    let i = seg.find(&pat)?;
    let j = i + pat.len();
    let k = seg[j..].find('"')? + j;
    Some(seg[j..k].to_string())
}

fn extract_attr(html: &str, marker: &str, key: &str) -> Option<String> {
    let i = html.find(marker)?;
    // search forward a bit
    let seg = &html[i..i + 2000];
    extract_attr_single(seg, key)
}

fn extract_img_cover(html: &str) -> Option<String> {
    // look for img in bigImage context or pics/cover
    if let Some(i) = html.find("pics/cover/") {
        let start = i.saturating_sub(500);
        let seg = &html[start..i + 200];
        if let Some(h) = extract_attr_single(seg, "href") {
            if h.contains("cover") {
                return Some(h);
            }
        }
    }
    if let Some(i) = html.find("imgs/cover/") {
        let start = i.saturating_sub(500);
        let seg = &html[start..i + 200];
        if let Some(h) = extract_attr_single(seg, "href") {
            if h.contains("cover") {
                return Some(h);
            }
        }
    }
    None
}

fn extract_anchor_text(seg: &str) -> Option<String> {
    if let Some(gt) = seg.find('>') {
        if let Some(lt) = seg[gt..].find('<') {
            let t = strip_tags(&seg[gt + 1..gt + lt]).trim().to_string();
            if !t.is_empty() {
                return Some(t);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parse_p2() {
        // try to read if exists
        if let Ok(html) = std::fs::read_to_string("/tmp/p2.html") {
            let m = parse_fields(&html);
            assert_eq!(m.get("number").map(|s| s.as_str()), Some("ABP-123"));
        }
    }
}
