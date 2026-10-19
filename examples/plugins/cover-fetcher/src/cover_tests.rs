//! What a page has to look like for its picture to be found.

use super::cover::address_in;

/// The picture a page declares for itself wins over the ones it draws.
///
/// A page's first `<img>` is as likely to be a logo as its cover; the
/// declaration is the page saying which one it means.
#[test]
fn the_picture_a_page_declares_for_itself_is_the_one_taken() {
    let page = r#"<html><head>
        <meta property="og:image" content="https://example.com/cover.jpg">
        </head><body><img src="https://example.com/logo.png"></body></html>"#;
    assert_eq!(
        address_in(page, "https://example.com/post"),
        Some("https://example.com/cover.jpg".to_string())
    );
}

#[test]
fn a_page_that_declares_nothing_falls_back_to_the_first_picture_on_it() {
    let page = r#"<body><img src="https://example.com/one.jpg"><img src="https://example.com/two.jpg"></body>"#;
    assert_eq!(
        address_in(page, "https://example.com/post"),
        Some("https://example.com/one.jpg".to_string())
    );
}

#[test]
fn a_page_with_no_picture_on_it_answers_nothing() {
    assert_eq!(
        address_in("<html><body><p>no pictures here</p></body></html>", "https://example.com/post"),
        None
    );
}

/// The attributes of a tag come in whatever order the page's author wrote them.
#[test]
fn a_declaration_written_backwards_is_read_the_same() {
    let page = r#"<meta content='https://example.com/cover.jpg' property='og:image'>"#;
    assert_eq!(
        address_in(page, "https://example.com/post"),
        Some("https://example.com/cover.jpg".to_string())
    );
}

/// A page that names the picture by its path rather than by its address.
#[test]
fn an_address_that_is_relative_to_the_page_is_resolved_against_it() {
    let page = r#"<meta property="og:image" content="/covers/one.png">"#;
    assert_eq!(
        address_in(page, "https://example.com/pages/two.html"),
        Some("https://example.com/covers/one.png".to_string())
    );
    let page = r#"<img src="covers/one.png">"#;
    assert_eq!(
        address_in(page, "https://example.com/pages/two.html"),
        Some("https://example.com/pages/covers/one.png".to_string())
    );
}

/// An ampersand is written `&amp;` in HTML, and an address with one in it is
/// an address the kernel cannot fetch until it is an ampersand again.
#[test]
fn an_ampersand_written_the_html_way_is_an_ampersand_again() {
    let page = r#"<img src="https://example.com/a.jpg?w=1&amp;h=2">"#;
    assert_eq!(
        address_in(page, "https://example.com/post"),
        Some("https://example.com/a.jpg?w=1&h=2".to_string())
    );
}

/// Anything that is not a picture at an address over the network is not a
/// cover: the kernel fetches addresses and stores paths, and neither of those
/// is a `data:` URI or a line of script.
#[test]
fn something_that_is_not_an_address_over_the_network_is_not_a_cover() {
    let page = r#"<img src="data:image/png;base64,AAAA">"#;
    assert_eq!(address_in(page, "https://example.com/post"), None);
}
