//! The page a browser is shown when it opens the service's address.
//!
//! Someone who types the address into a browser is asking one question — is this
//! the right address, and is anything alive on it — and what they need back is a
//! sentence. A WebDAV client sends something quite different on the very same
//! path, and the two are told apart by the method: GET and HEAD are a browser
//! asking to be shown something, PROPFIND and its neighbours are a client
//! speaking the protocol. Answering the browser with XML is how a service that
//! works perfectly reads as one that is broken.

use dav_server::body::Body;
use http::{header, Method, Request, Response, StatusCode};
use hyper::body::Incoming;

use crate::i18n::native;

/// Whether this request is a person arriving in a browser rather than a client
/// speaking WebDAV.
///
/// The path has to be the root exactly. A browser asking for a file the service
/// does not have gets the handler's answer, which is the truthful one.
pub(crate) fn wanted(request: &Request<Incoming>) -> bool {
    matches!(*request.method(), Method::GET | Method::HEAD) && request.uri().path() == "/"
}

/// The page, in the language the application is being read in.
///
/// That language and not the visitor's: the person being answered is the one who
/// started the service, and they are sitting in front of this machine.
pub(crate) fn page(language: &str) -> String {
    let title = native::translate(language, "shareLandingTitle");
    let body = native::translate(language, "shareLandingBody");
    format!(
        "<!doctype html><html lang=\"{language}\"><head><meta charset=\"utf-8\">\
<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\
<title>{title}</title></head><body><main><h1>{title}</h1><p>{body}</p></main></body></html>"
    )
}

/// The page as a response. A HEAD asks the same question as a GET and is owed
/// the same headers, with no body to go with them.
pub(crate) fn response(request: &Request<Incoming>, page: &str) -> Response<Body> {
    let body = if request.method() == Method::HEAD {
        Body::empty()
    } else {
        Body::from(page.to_string())
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
        .body(body)
        .expect("A status and one header always build a response")
}
