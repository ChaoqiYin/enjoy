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
//! one will invent one they have used before.
//!
//! It is four digits, and that is a decision about a remote control: this string
//! is typed by hand into a television at least once, and every character that has
//! to be hunted for on a remote is a reason to choose a password that is worse in
//! some other way. The cost is written down rather than hidden — see below.
//!
//! ## What this does not defend against
//!
//! The password arrives in the clear. The service speaks plain HTTP on a local
//! network, so the traffic is as private as the network is, and a device that can
//! watch it reads the password out of the request rather than guessing it. What
//! the password keeps out is the device that was never told it — a guest on the
//! wireless, a neighbour on the same flat network — and that is the boundary the
//! feature is drawn to.
//!
//! Four digits sharpens the edge on that: there are ten thousand of them, so a
//! device that *tries* rather than watches will walk the whole space in minutes.
//! What stands between it and the library is then the network this is meant for —
//! a home LAN — and not the string. A longer password would buy real strength,
//! and the cost would be paid on the remote control this length exists for; if
//! that trade ever needs making, the lever to reach for first is a limit on
//! failed attempts rather than length, because it costs the user who types
//! correctly nothing at all.
//!
//! The comparison at the bottom is an ordinary one for the same reason: a timing
//! side channel is a way of learning a password that was never sent, and every
//! password that reaches here has been sent.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use http::HeaderValue;
use tauri::AppHandle;

use crate::error::AppError;
use crate::preferences::{store, Preference};

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

/// The characters a password is drawn from, and how many of them are drawn.
///
/// Digits, and four of them: the alphabet is what a television remote has keys
/// for, and the length is what someone will put up with entering there. The two
/// together are ten thousand combinations, which is not a secret in any strong
/// sense — the module comment above says what that does and does not buy.
const DIGITS: &[u8] = b"0123456789";
const LENGTH: usize = 4;

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
        let stored = store::open(app)?.read(Preference::SharePassword);
        // Nothing stored is not an empty password: it is the first run, and the
        // answer is a password of this application's making rather than one of
        // nobody's.
        if stored.is_empty() {
            return Self::regenerate(app);
        }
        Ok(Self {
            username: USERNAME.to_string(),
            password: stored,
        })
    }

    /// Draws a new password and keeps it.
    ///
    /// Kept through the preferences, so a write that cannot be made leaves the
    /// file holding a password that has served rather than one that never did.
    pub(crate) fn regenerate(app: &AppHandle) -> Result<Self, AppError> {
        let credentials = Self::draw();
        store::open(app)?.write(&[(Preference::SharePassword, &credentials.password)])?;
        Ok(credentials)
    }

    /// A password nothing has been told yet.
    ///
    /// Every digit in it is as likely as every other, which for a password this
    /// short is the whole of its strength: ten thousand combinations are easy to
    /// walk only because they are few, and they would be far fewer if the draw
    /// favoured some of them.
    fn draw() -> Self {
        let mut password = String::with_capacity(LENGTH);
        while password.len() < LENGTH {
            let mut batch = [0u8; LENGTH];
            getrandom::fill(&mut batch).expect("the operating system has random bytes");
            password.extend(batch.iter().copied().filter_map(digit));
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

/// The digit a random byte stands for, or nothing when it stands for none.
///
/// A byte holds 256 values and the digits are ten, so the two do not divide
/// evenly: `byte % 10` alone would hand the first six digits one extra value
/// each, which over four digits is a bias worth avoiding in the one string here
/// whose strength is exactly its spread. The six values with no digit to stand
/// for are therefore dropped and another byte is drawn in their place.
fn digit(byte: u8) -> Option<char> {
    // The largest multiple of ten a byte can hold; above it the values are the
    // remainder that has no digit of its own.
    const EVEN: u8 = 250;
    (byte < EVEN).then(|| char::from(DIGITS[usize::from(byte % 10)]))
}

#[cfg(test)]
mod tests {
    use super::{digit, Credentials, DIGITS, LENGTH, USERNAME};
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
    fn a_password_is_the_length_of_a_pin_and_made_of_digits() {
        // Each digit has a value as well as a length, so the whole space is ten
        // thousand and not one: a draw that could only make, say, 1111 would
        // pass a length check and be worth nothing.
        let mut seen = std::collections::HashSet::new();
        for _ in 0..500 {
            let credentials = Credentials::draw();
            assert_eq!(credentials.username, USERNAME);
            assert_eq!(credentials.password.len(), LENGTH);
            for symbol in credentials.password.bytes() {
                assert!(DIGITS.contains(&symbol), "{}", credentials.password);
            }
            seen.insert(credentials.password);
        }
        // Five hundred draws over ten thousand values will collide — that is
        // arithmetic, not a fault — so the assertion is the one that can be
        // made: the draws are not a constant. A `draw` that returned the same
        // password every time would put this file well under half of five
        // hundred, and a biased one would still show here as a small number.
        assert!(
            seen.len() > 400,
            "only {} of 500 draws differed",
            seen.len()
        );
    }

    #[test]
    fn a_byte_stands_for_a_digit_where_there_is_one() {
        assert_eq!(digit(0), Some('0'));
        assert_eq!(digit(9), Some('9'));
        // The tenth value, which is the first with no digit of its own, and the
        // top of the range. Both are dropped rather than folded onto `0` and
        // `5`, which is what a bare remainder would do to them.
        assert_eq!(digit(10), Some('0'));
        assert_eq!(digit(249), Some('9'));
        assert_eq!(digit(250), None);
        assert_eq!(digit(255), None);
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
