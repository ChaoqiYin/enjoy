//! Finding the picture a page says is its cover.
//!
//! A cover fetcher's whole job is this: fetch a page, work out *which* image on
//! it is the cover, and hand the address back. The kernel does the last step —
//! downloading it and writing it into `$APPDATA/covers/` — because a plugin's
//! `storage` capability reaches one file name inside its own directory and
//! nothing else (docs/插件系统.md §14.3).
//!
//! What a page can say, in the order this reads it:
//!
//! - `<meta property="og:image" content="...">` — the page naming its own
//!   cover, which is the only one it says out loud;
//! - otherwise the first `<img src="...">` on it, which for a page that draws
//!   its cover and says nothing else is the best guess there is.
//!
//! Either may be written relative to the page, so it is resolved against the
//! address the page was fetched from before it is handed back: an address the
//! kernel cannot fetch is not a cover.

/// The address of the picture a page offers as its own, if it offers one.
///
/// `url` is where the page came from, and it is what a relative address in it
/// is resolved against.
pub fn address_in(page: &str, url: &str) -> Option<String> {
    let named = declared(page).or_else(|| first_image(page))?;
    absolute(url, &unnamed_entity(&named))
}

/// The picture the page declares for itself.
fn declared(page: &str) -> Option<String> {
    for tag in tags(page, "meta") {
        // `property` is the standard spelling and `name` the one older pages
        // use; both mean the same thing here.
        let key = attribute(tag, "property").or_else(|| attribute(tag, "name"))?;
        if key.eq_ignore_ascii_case("og:image") {
            return attribute(tag, "content");
        }
    }
    None
}

/// The first picture the page draws.
fn first_image(page: &str) -> Option<String> {
    tags(page, "img")
        .into_iter()
        .find_map(|tag| attribute(tag, "src"))
}

/// Every `<name ...>` tag in the page, opening or closing.
///
/// Text rather than a parse tree, and deliberately: this is one field of one
/// page, and a plugin that pulled in an HTML parser would be teaching its
/// reader a lesson this example is not about. What it must not do is run off
/// the end of the page — a tag with no `>` after it is not a tag.
fn tags<'a>(page: &'a str, name: &str) -> Vec<&'a str> {
    let mut found = Vec::new();
    let mut from = 0;
    while let Some(at) = find_ignoring_case(&page[from..], &format!("<{name}")) {
        let start = from + at;
        let Some(end) = page[start..].find('>') else {
            break;
        };
        found.push(&page[start..start + end]);
        from = start + end;
    }
    found
}

/// Where `needle` first appears in `haystack`, ignoring which case it is in.
fn find_ignoring_case(haystack: &str, needle: &str) -> Option<usize> {
    let lowered = haystack.to_ascii_lowercase();
    lowered.find(needle)
}

/// The value of one attribute of one tag, if it has one.
///
/// The name has to stand on its own — `data-src` is not `src` — and the value
/// has to be quoted, which is what tells an attribute from a word that happens
/// to be in the tag's text.
fn attribute(tag: &str, name: &str) -> Option<String> {
    let mut from = 0;
    while let Some(at) = tag[from..].find(name) {
        let at = from + at;
        from = at + name.len();
        let alone = at == 0 || !is_name_byte(tag.as_bytes()[at - 1]);
        let rest = tag[from..].trim_start();
        let Some(value) = rest.strip_prefix('=') else {
            continue;
        };
        let value = value.trim_start();
        let quote = value.chars().next()?;
        if !alone || (quote != '"' && quote != '\'') {
            continue;
        }
        let end = value[1..].find(quote)?;
        return Some(value[1..1 + end].to_string());
    }
    None
}

fn is_name_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_'
}

/// An address resolved against the page it was found on.
///
/// Only the two schemes the kernel can fetch come back out: anything else — a
/// `data:` picture, a line of script, an address with no page to resolve
/// against — is not something to hand the kernel and is answered as nothing.
fn absolute(url: &str, address: &str) -> Option<String> {
    let address = address.trim();
    if address.is_empty() || has_another_scheme(address) {
        return None;
    }
    let resolved = if address.starts_with("//") {
        format!("{}:{address}", scheme(url)?)
    } else if address.starts_with('/') {
        format!("{}{address}", origin(url)?)
    } else if address.starts_with("http://") || address.starts_with("https://") {
        address.to_string()
    } else {
        format!("{}{address}", directory(url)?)
    };
    resolved.starts_with("http://").then_some(resolved.clone()).or_else(|| {
        resolved
            .starts_with("https://")
            .then_some(resolved)
    })
}

/// Whether the address names a scheme of its own that is not one of the two.
fn has_another_scheme(address: &str) -> bool {
    let Some(colon) = address.find(':') else {
        return false;
    };
    let before = &address[..colon];
    let named = !before.is_empty()
        && before
            .chars()
            .next()
            .is_some_and(|first| first.is_ascii_alphabetic())
        && before
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '-');
    named && before != "http" && before != "https"
}

/// The scheme of an address, as `https` or `http`.
fn scheme(url: &str) -> Option<&str> {
    let at = url.find("://")?;
    Some(&url[..at])
}

/// Where the site starts: the scheme and the host, without any path.
fn origin(url: &str) -> Option<&str> {
    let after = url.find("://")? + 3;
    match url[after..].find('/') {
        Some(at) => Some(&url[..after + at]),
        None => Some(url),
    }
}

/// The directory an address relative to the page is resolved against.
fn directory(url: &str) -> Option<String> {
    let origin = origin(url)?;
    let rest = &url[origin.len()..];
    match rest.rfind('/') {
        Some(at) => Some(format!("{origin}{}", &rest[..=at])),
        None => Some(format!("{origin}/")),
    }
}

/// The one entity an address is written with.
fn unnamed_entity(address: &str) -> String {
    address.replace("&amp;", "&")
}
