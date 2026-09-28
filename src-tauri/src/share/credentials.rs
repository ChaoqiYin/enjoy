//! Who may connect to the 共享服务.
//!
//! One user name and one password for the whole application, not one per space.
//! A space owns its 共享清单 and the marks on its records; this is neither. It is a
//! device credential — what a television is told once and then keeps — and a
//! password that changed with the space would have to be typed again on every
//! device every time the user switched, which is the cost that decides it.
//!
//! It is stored beside the language and the theme because that is what it is: a
//! preference the application keeps for the user, not a record about a video.
//! The password is drawn here rather than chosen, because a user asked to invent
//! one will invent one they have used before, and this one is copied far more
//! often than it is typed.
//!
//! ## What this does not defend against
//!
//! The password arrives in the clear. The service speaks plain HTTP on a local
//! network, so the traffic is as private as the network is, and a device that can
//! watch it reads the password out of the request rather than guessing it. What
//! the password keeps out is the device that was never told it — a guest on the
//! wireless, a neighbour on the same flat network — and that is the boundary the
//! feature is drawn to. The comparison at the bottom is an ordinary one for the
//! same reason: a timing side channel is a way of learning a password that was
//! never sent, and every password that reaches here has been sent.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use http::HeaderValue;
use serde_json::json;
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::AppError;

/// The user name every client signs in with.
///
/// Fixed rather than chosen: the password is the secret, and a user name the
/// user picked would be one more thing to type on a television and one more
/// thing to get wrong.
pub(crate) const USERNAME: &str = "enjoy";

/// The challenge a request without credentials is answered with.
///
/// It names the scheme, which is the whole of what a client needs to ask the
/// user for a password; the realm is what a client shows in its box, and it is
/// the application's name for the same reason the landing page carries it.
pub(crate) const CHALLENGE: &str = "Basic realm=\"Enjoy\", charset=\"UTF-8\"";

/// The preference the password is kept in, and the key inside it.
const PREFERENCES: &str = "preferences.json";
const KEY: &str = "sharePassword";

/// The characters a password is drawn from, and how many of them are drawn.
///
/// Lower case letters and digits with the pairs that are read for each other
/// left out — no `i` beside `1`, no `o` beside `0`. This one is copied off the
/// screen most of the time, but it is typed by hand into a television at least
/// once, and that is the case the alphabet is chosen for. Twenty-three letters
/// and eight digits is thirty-one symbols, so twelve of them is about sixty
/// bits: past guessing, and still short enough to read out.
const ALPHABET: &[u8] = b"abcdefghjkmnpqrstuvwxyz23456789";
const LENGTH: usize = 12;

/// The name and password a client is checked against.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct Credentials {
    pub username: String,
    pub password: String,
}

impl Credentials {
    /// The password in use, read from the preferences and drawn on the spot the
    /// first time it is asked for.
    ///
    /// Asked for before the service is ever started, because the page that
    /// starts it shows the password: one that came into being when the port
    /// opened would be one the user could not write down first.
    pub(crate) fn load(app: &AppHandle) -> Result<Self, AppError> {
        let store = app
            .store(PREFERENCES)
            .map_err(|error| AppError::new("settings.read_failed", error))?;
        let stored = store
            .get(KEY)
            .and_then(|value| value.as_str().map(str::to_owned));
        match stored {
            Some(password) => Ok(Self {
                username: USERNAME.to_string(),
                password,
            }),
            // Nothing stored is not an empty password: it is the first run, and
            // the answer is a password of this application's making rather than
            // one of nobody's.
            None => Self::regenerate(app),
        }
    }

    /// Draws a new password and keeps it.
    ///
    /// A failed write puts back what was there, so the preferences are left
    /// holding a password that has served rather than one that never did — the
    /// same rule the settings are saved by.
    pub(crate) fn regenerate(app: &AppHandle) -> Result<Self, AppError> {
        let store = app
            .store(PREFERENCES)
            .map_err(|error| AppError::new("settings.save_failed", error))?;
        let credentials = Self::draw();
        let previous = store.get(KEY);
        store.set(KEY, json!(&credentials.password));
        if let Err(error) = store.save() {
            match previous {
                Some(value) => store.set(KEY, value),
                None => {
                    let _ = store.delete(KEY);
                }
            }
            return Err(AppError::new("settings.save_failed", error));
        }
        Ok(credentials)
    }

    /// A password nothing has been told yet.
    fn draw() -> Self {
        let mut password = String::with_capacity(LENGTH);
        while password.len() < LENGTH {
            let mut batch = [0u8; LENGTH];
            getrandom::fill(&mut batch).expect("the operating system has random bytes");
            password.extend(batch.iter().copied().filter_map(character));
        }
        password.truncate(LENGTH);
        Self {
            username: USERNAME.to_string(),
            password,
        }
    }

    /// Whether a request carries these credentials.
    ///
    /// `Authorization` is read the way RFC 7617 defines it: a scheme, one space,
    /// and the base64 of `user:password`. The scheme is matched without regard to
    /// case, because the specification says it is case-insensitive and a client
    /// that sent `basic` would otherwise be refused a password it had right. The
    /// user and the password are compared as bytes, which is how they arrived and
    /// one conversion fewer than the alternative.
    pub(crate) fn accepts(&self, header: Option<&HeaderValue>) -> bool {
        let Some(value) = header.and_then(|value| value.to_str().ok()) else {
            return false;
        };
        let Some((scheme, encoded)) = value.split_once(' ') else {
            return false;
        };
        if !scheme.eq_ignore_ascii_case("Basic") {
            return false;
        }
        let Ok(decoded) = BASE64.decode(encoded.trim()) else {
            return false;
        };
        // The first colon, not the last: a user name may not hold one, and a
        // password may.
        let Some(colon) = decoded.iter().position(|byte| *byte == b':') else {
            return false;
        };
        decoded[..colon] == *self.username.as_bytes()
            && decoded[colon + 1..] == *self.password.as_bytes()
    }
}

/// The character a random byte stands for, or nothing when it stands for none.
///
/// The alphabet has thirty-one symbols, so its low five bits cover it and the
/// one value left over is dropped rather than folded onto a symbol below it:
/// folding would make some characters likelier than others, and this is the one
/// string in the application where that would matter.
fn character(byte: u8) -> Option<char> {
    ALPHABET
        .get(usize::from(byte & 0x1f))
        .map(|symbol| char::from(*symbol))
}

#[cfg(test)]
mod tests {
    use super::{character, Credentials, ALPHABET, LENGTH, USERNAME};
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    use http::HeaderValue;

    /// A header of the shape a client sends, over whatever is given.
    fn authorization(user: &str, password: &str) -> HeaderValue {
        HeaderValue::from_str(&format!(
            "Basic {}",
            BASE64.encode(format!("{user}:{password}"))
        ))
        .unwrap()
    }

    #[test]
    fn a_password_is_made_of_the_characters_that_survive_being_read_out() {
        for _ in 0..100 {
            let credentials = Credentials::draw();
            assert_eq!(credentials.username, USERNAME);
            assert_eq!(credentials.password.len(), LENGTH);
            for symbol in credentials.password.bytes() {
                assert!(ALPHABET.contains(&symbol), "{}", credentials.password);
            }
            // The pairs that get read for each other, and the letters that are
            // not in the alphabet at all.
            for confusion in ["i", "l", "o", "0", "1"] {
                assert!(
                    !credentials.password.contains(confusion),
                    "{}",
                    credentials.password
                );
            }
        }
        // A draw that repeated itself would be one every copy of this
        // application made the same. A hundred of them colliding is a
        // coincidence with thirty digits of probability against it.
        let drawn: std::collections::HashSet<_> =
            (0..100).map(|_| Credentials::draw().password).collect();
        assert_eq!(drawn.len(), 100);
    }

    #[test]
    fn a_byte_stands_for_a_character_where_there_is_one() {
        assert_eq!(character(0), Some('a'));
        assert_eq!(character(30), Some('9'));
        // The value the alphabet is one short of holding, and the one above it.
        assert_eq!(character(31), None);
        assert_eq!(character(63), None);
        // Only the low five bits are read, so the bits above them are not a
        // second draw: this byte stands for the same character as zero does.
        assert_eq!(character(0b1100_0000), Some('a'));
    }

    #[test]
    fn the_right_password_is_accepted_and_the_wrong_one_is_not() {
        let credentials = Credentials {
            username: USERNAME.to_string(),
            password: "treasure".to_string(),
        };
        assert!(credentials.accepts(Some(&authorization(USERNAME, "treasure"))));
        // A password that is right but not this one, and one that is a prefix
        // of it: both refused.
        assert!(!credentials.accepts(Some(&authorization(USERNAME, "treasurf"))));
        assert!(!credentials.accepts(Some(&authorization(USERNAME, "treasu"))));
        assert!(!credentials.accepts(Some(&authorization("other", "treasure"))));
        // A password holding a colon survives the split at the first one.
        let colon = Credentials {
            username: USERNAME.to_string(),
            password: "a:b".to_string(),
        };
        assert!(colon.accepts(Some(&authorization(USERNAME, "a:b"))));
    }

    #[test]
    fn a_request_that_does_not_offer_credentials_is_not_given_the_benefit() {
        let credentials = Credentials {
            username: USERNAME.to_string(),
            password: "treasure".to_string(),
        };
        for refused in [
            // Nothing at all, which is every request from a device that has not
            // been told the password.
            None,
            // Another scheme entirely, with credentials that would be right.
            Some(
                HeaderValue::from_str(&format!(
                    "Bearer {}",
                    BASE64.encode(format!("{USERNAME}:treasure"))
                ))
                .unwrap(),
            ),
            // Nothing that decodes, and nothing that holds a user and a
            // password once it does.
            Some(HeaderValue::from_static("Basic not-base64")),
            Some(HeaderValue::from_static("Basic dHJlYXN1cmU=")),
            // A scheme with nothing after it.
            Some(HeaderValue::from_static("Basic")),
        ] {
            assert!(
                !credentials.accepts(refused.as_ref()),
                "{refused:?} was accepted"
            );
        }
        // And the spelling a client that follows the specification sends is the
        // one that works, so the refusals above are about the credentials and
        // not about the scheme.
        assert!(credentials.accepts(Some(&authorization(USERNAME, "treasure"))));
        // The scheme is not the credential. The specification makes it
        // case-insensitive, so a client that sends it in lower case is let in on
        // a password it got right rather than refused on a spelling.
        let lowercase = HeaderValue::from_str(&format!(
            "basic {}",
            BASE64.encode(format!("{USERNAME}:treasure"))
        ))
        .unwrap();
        assert!(credentials.accepts(Some(&lowercase)));
    }
}
