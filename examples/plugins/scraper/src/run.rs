#[no_mangle]
pub extern "C" fn run() {
    use crate::Host;
    use std::collections::BTreeMap;
    let mut host = crate::host::Kernel;
    // load settings
    let mut site = "https://www.javbus.com".to_string();
    let mut cookie = String::new();
    if let Some(bytes) = host.storage_read("settings.json") {
        if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&bytes) {
            if let Some(s) = v.get("site").and_then(|x| x.as_str()) {
                if !s.is_empty() {
                    site = s.trim_end_matches('/').to_string();
                }
            }
            if let Some(s) = v.get("cookie").and_then(|x| x.as_str()) {
                cookie = s.to_string();
            }
        }
    }
    let mut buf = vec![0u8; 4 * 1024 * 1024];
    let mut rl = crate::rate::RateLimiter::new(1500);
    let mut attempts: std::collections::HashMap<i64, u32> = std::collections::HashMap::new();
    loop {
        let r = host.task_wait(30000, &mut buf);
        if r == -1 {
            break;
        }
        if r <= 0 {
            continue;
        }
        let s = String::from_utf8_lossy(&buf[..r as usize]).to_string();
        let task: serde_json::Value = match serde_json::from_str(&s) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if task.get("kind").and_then(|x| x.as_str()) != Some("scrape") {
            continue;
        }
        let id = match task.get("id").and_then(|x| x.as_i64()) {
            Some(x) => x,
            None => continue,
        };
        // checkpoint
        let cp = host.task_checkpoint(id);
        if cp == 2 {
            let _ = host.task_fail(id, "已取消", 0);
            continue;
        }
        if cp == 1 {
            // try again later? but spec says pause -> apply_task_pause moves state; checkpoint returns pause
            // just requeue by failing with small retry? easier: progress and continue loop will be handled by host state
            let now = host.now_ms();
            let _ = host.task_fail(id, "已暂停", now + 1000);
            continue;
        }
        // payload
        let payload = match task.get("payload").and_then(|x| x.as_str()) {
            Some(x) => x.to_string(),
            None => {
                let _ = host.task_fail(id, "缺少 payload", 0);
                continue;
            }
        };
        let pv: serde_json::Value = match serde_json::from_str(&payload) {
            Ok(v) => v,
            Err(_) => {
                let _ = host.task_fail(id, "payload 格式错误", 0);
                continue;
            }
        };
        let path = match pv.get("path").and_then(|x| x.as_str()) {
            Some(x) => x.to_string(),
            None => {
                let _ = host.task_fail(id, "缺少 path", 0);
                continue;
            }
        };
        let number = match crate::number::parse_number(&path) {
            Some(n) => n,
            None => {
                let _ = host.task_fail(id, "无法从文件名识别番号", 0);
                continue;
            }
        };
        // rate limit
        let now = host.now_ms();
        let need = rl.wait_needed(now);
        if need > 0 {
            // sleep by retrying later
            let _ = host.task_fail(id, "限速", now + need);
            continue;
        }
        rl.mark(now);
        // build headers
        let ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
        let headers = if cookie.trim().is_empty() {
            serde_json::json!([
                {"name": "User-Agent", "value": ua},
                {"name": "Referer", "value": format!("{}/", site)},
                {"name": "Accept-Language", "value": "zh-CN,zh;q=0.9"},
            ])
        } else {
            serde_json::json!([
                {"name": "User-Agent", "value": ua},
                {"name": "Referer", "value": format!("{}/", site)},
                {"name": "Accept-Language", "value": "zh-CN,zh;q=0.9"},
                {"name": "Cookie", "value": cookie.trim()},
            ])
        };
        let headers_json = headers.to_string();
        // try urls in order
        let urls = vec![
            format!("{}/{}", site, number),
            format!("{}/search/{}", site, number),
            format!("{}/uncensored/search/{}", site, number),
        ];
        let mut got_html: Option<String> = None;
        for u in &urls {
            let resp = match host.get_with_headers(u, &headers_json) {
                Some(r) => r,
                None => {
                    host.log(&format!("fetch failed: {}", u));
                    continue;
                }
            };
            let body = String::from_utf8_lossy(&resp.body).to_string();
            let kindf = crate::failure::classify(resp.status, &body);
            match kindf {
                crate::failure::Kind::AgeWall => {
                    let _ = host.task_fail(id, "需要通过年龄验证或提供 Cookie", 0);
                    got_html = None;
                    break;
                }
                crate::failure::Kind::NotFound => {
                    continue;
                }
                crate::failure::Kind::Network => {
                    // retry later
                    let a = *attempts.entry(id).or_insert(0) + 1;
                    attempts.insert(id, a);
                    if a <= 3 {
                        let now2 = host.now_ms();
                        let backoff = match a {
                            1 => 60_000,
                            2 => 300_000,
                            _ => 900_000,
                        };
                        let _ = host.task_fail(id, "网络错误", now2 + backoff);
                    } else {
                        let _ = host.task_fail(id, "网络错误", 0);
                    }
                    got_html = None;
                    break;
                }
                crate::failure::Kind::RateLimit => {
                    let a = *attempts.entry(id).or_insert(0) + 1;
                    attempts.insert(id, a);
                    if a <= 3 {
                        let now2 = host.now_ms();
                        let backoff = match a {
                            1 => 60_000,
                            2 => 300_000,
                            _ => 900_000,
                        };
                        let _ = host.task_fail(id, "请求过于频繁(429)", now2 + backoff);
                    } else {
                        let _ = host.task_fail(id, "请求过于频繁(429)", 0);
                    }
                    got_html = None;
                    break;
                }
                crate::failure::Kind::ServerError => {
                    let a = *attempts.entry(id).or_insert(0) + 1;
                    attempts.insert(id, a);
                    if a <= 3 {
                        let now2 = host.now_ms();
                        let backoff = match a {
                            1 => 60_000,
                            2 => 300_000,
                            _ => 900_000,
                        };
                        let _ = host.task_fail(id, "服务器错误(5xx)", now2 + backoff);
                    } else {
                        let _ = host.task_fail(id, "服务器错误(5xx)", 0);
                    }
                    got_html = None;
                    break;
                }
                _ => {
                    if resp.status >= 200 && resp.status < 300 && !body.is_empty() {
                        // check if it's a search results page with movie-box
                        if body.contains("movie-box") && !body.contains("class=\"col-md-3 info\"") {
                            // probably search results, try to find direct link? but we already tried specific urls
                            // continue to next? maybe not directly useful
                        }
                        got_html = Some(body);
                        break;
                    } else {
                        continue;
                    }
                }
            }
        }
        let html = match got_html {
            Some(h) => h,
            None => continue,
        };
        let mut fields = crate::javbus::parse_fields(&html);
        // ensure number
        if !fields.contains_key("number") {
            fields.insert("number".to_string(), number.clone());
        }
        // filter to allowed
        let allowed = [
            "title",
            "number",
            "actors",
            "genres",
            "studio",
            "label",
            "series",
            "director",
            "releaseDate",
            "duration",
            "rating",
            "plot",
        ];
        let mut out = BTreeMap::new();
        for k in &allowed {
            if let Some(v) = fields.get(*k) {
                if !v.trim().is_empty() {
                    out.insert(k.to_string(), v.clone());
                }
            }
        }
        // build fields json array for task_done? spec says "task_done" accepts fields; kernel may ignore now but we pass as json
        let mut arr = Vec::new();
        for (k, v) in &out {
            arr.push(serde_json::json!({"key": k, "value": v}));
        }
        let fields_json = serde_json::json!({"fields": arr}).to_string();
        let _ = host.task_done(id, &fields_json);
        attempts.remove(&id);
    }
}
