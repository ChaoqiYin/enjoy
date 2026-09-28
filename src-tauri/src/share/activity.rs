//! Who has been talking to the 共享服务 lately.
//!
//! The question this answers is a person's, not a machine's: which of my
//! devices picked the library up. What the protocol can tell us is small — a
//! WebDAV client opens a connection, takes what it wants, and closes it, so
//! there is no such thing as being "online" to report. What there is, is a
//! request that arrived a moment ago, and this keeps those: an address, what the
//! client called itself, and when it was last heard from.
//!
//! That is why the list is drawn in terms of a window rather than a state. A
//! client that has stopped asking for anything is not disconnected here — it is
//! simply not recent, and the interface says so in as many words.
//!
//! Only requests that got past the password are recorded. A device with the
//! wrong password is not a client, and every port scanner on the network would
//! otherwise have a row of its own.

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use http::HeaderValue;
use serde::Serialize;

/// How long a request keeps a client on the list.
pub(crate) const WINDOW: Duration = Duration::from_secs(60);

/// The most of a client's own User-Agent that is kept. The header is the
/// client's to choose and nothing bounds it here, and the name goes into a row
/// in the interface: a long one would push the address and the time off it.
const NAME_LIMIT: usize = 64;

/// The clients heard from in the last [`WINDOW`].
#[derive(Default)]
pub(crate) struct Activity {
    clients: Mutex<BTreeMap<IpAddr, Client>>,
}

/// One client, as far as this application knows.
struct Client {
    /// What the client called itself, or nothing when it did not say.
    name: Option<String>,
    last_seen: SystemTime,
}

/// One client, as the interface is told about it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub address: IpAddr,
    pub name: Option<String>,
    /// When it was last heard from, in milliseconds since the epoch, which is
    /// how every other time in this interface is written.
    pub last_seen: i64,
}

impl Activity {
    /// Records that a client has just made a request.
    pub(crate) fn saw(&self, address: IpAddr, agent: Option<&HeaderValue>) {
        let now = SystemTime::now();
        let mut clients = self.lock();
        match clients.get_mut(&address) {
            Some(client) => {
                client.last_seen = now;
                // The name is replaced only when this request carries one. A
                // client that names itself once and then sends nothing is the
                // same device, not a device that has changed its name.
                if let Some(name) = device_name(agent) {
                    client.name = Some(name);
                }
            }
            None => {
                clients.insert(
                    address,
                    Client {
                        name: device_name(agent),
                        last_seen: now,
                    },
                );
            }
        }
    }

    /// The clients heard from within the window, most recently heard from first.
    ///
    /// `now` is a parameter rather than read here so that the window can be
    /// tested without a test that sits and waits a minute: the rule is the same
    /// rule whether the moment it is asked about is this one or the next.
    ///
    /// Reading is also where the list is pruned. Nothing else would have to run
    /// for an entry to be over the window — there is no timer anywhere in this
    /// module, and a background thread whose only job was to delete a handful of
    /// rows would be the most expensive thing in the service.
    pub(crate) fn recent(&self, now: SystemTime) -> Vec<Device> {
        let mut clients = self.lock();
        clients.retain(|_, client| age(client.last_seen, now) < WINDOW);
        let mut devices: Vec<Device> = clients
            .iter()
            .map(|(address, client)| Device {
                address: *address,
                name: client.name.clone(),
                last_seen: milliseconds(client.last_seen),
            })
            .collect();
        // Ties broken by address so that two clients that arrived in the same
        // millisecond keep one order rather than swapping places between reads.
        devices.sort_by(|left, right| {
            right
                .last_seen
                .cmp(&left.last_seen)
                .then_with(|| left.address.cmp(&right.address))
        });
        devices
    }

    /// The lock, taken the way every lock in this application is taken: a
    /// poisoned one was left by a panicking thread, and what it left is still
    /// the state.
    fn lock(&self) -> MutexGuard<'_, BTreeMap<IpAddr, Client>> {
        self.clients
            .lock()
            .unwrap_or_else(|error| error.into_inner())
    }
}

/// How long ago a client was last heard from.
///
/// A clock that has been set back — by the user, or by the network it keeps time
/// with — makes the last request look like it happened in the future, which is
/// an age of nothing rather than an error: the client is here, and it goes on
/// being here until a whole window passes in the other direction.
fn age(last_seen: SystemTime, now: SystemTime) -> Duration {
    now.duration_since(last_seen).unwrap_or(Duration::ZERO)
}

/// A moment as milliseconds since the epoch, which is how this interface writes
/// every other time.
fn milliseconds(moment: SystemTime) -> i64 {
    match moment.duration_since(UNIX_EPOCH) {
        Ok(since) => since.as_millis() as i64,
        Err(_) => 0,
    }
}

/// The name a client is listed under.
///
/// A `User-Agent` is a list of products and comments — `VLC/3.0.20
/// LibVLC/3.0.20`, `Infuse/7.6.4 (iPhone; iOS 17.4)`, `Mozilla/5.0 (Windows NT
/// 10.0) ... Chrome/120.0.0.0 Safari/537.36` — and the first product is the
/// one the client calls itself by, which is the one a person recognises. The
/// ones after it are the libraries it is built on: a television running Infuse
/// would be listed as the engine underneath it.
///
/// A client that sends nothing, or sends nothing usable, is listed by its
/// address alone. That is a name the interface has to be able to be without —
/// see `unknown` on the page — and not a reason to leave the row out.
fn device_name(agent: Option<&HeaderValue>) -> Option<String> {
    let value = agent?.to_str().ok()?;
    let product = value.split_whitespace().next()?;
    (!product.is_empty()).then(|| product.chars().take(NAME_LIMIT).collect())
}

#[cfg(test)]
mod tests {
    use super::{Activity, Device, WINDOW};
    use http::HeaderValue;
    use std::net::{IpAddr, Ipv4Addr};
    use std::time::{Duration, SystemTime};

    fn address(last: u8) -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(192, 168, 1, last))
    }

    fn agent(value: &str) -> HeaderValue {
        HeaderValue::from_str(value).unwrap()
    }

    #[test]
    fn a_client_is_listed_under_the_name_it_gives_itself() {
        assert_eq!(
            super::device_name(Some(&agent("VLC/3.0.20 LibVLC/3.0.20"))).as_deref(),
            Some("VLC/3.0.20")
        );
        assert_eq!(
            super::device_name(Some(&agent("Infuse/7.6.4 (iPhone; iOS 17.4)"))).as_deref(),
            Some("Infuse/7.6.4")
        );
        // A name and nothing else, which some clients send.
        assert_eq!(
            super::device_name(Some(&agent("Infuse"))).as_deref(),
            Some("Infuse")
        );
    }

    #[test]
    fn a_client_that_says_nothing_usable_is_still_a_client() {
        for nothing in [None, Some(&agent("")), Some(&agent("   "))] {
            assert_eq!(super::device_name(nothing), None, "{nothing:?}");
        }
        // Long enough to push the rest of the row off the screen, and kept to
        // the part of it that is a name.
        let enormous = "x".repeat(400);
        let name = super::device_name(Some(&agent(&enormous))).unwrap();
        assert_eq!(name.len(), 64);
    }

    #[test]
    fn an_entry_is_dropped_once_the_window_has_passed() {
        let activity = Activity::default();
        activity.saw(address(5), Some(&agent("VLC/3.0.20")));
        let now = SystemTime::now();

        // Inside the window, and at the last moment of it.
        assert_eq!(activity.recent(now).len(), 1);
        assert_eq!(
            activity.recent(now + WINDOW - Duration::from_secs(1)).len(),
            1
        );
        // And past it, gone. Asked at a moment later than the request rather
        // than waited for, which is the whole reason the moment is a parameter.
        assert!(activity.recent(now + WINDOW).is_empty());
    }

    #[test]
    fn a_client_that_comes_back_is_the_same_row_and_moves_to_the_top() {
        let activity = Activity::default();
        let now = SystemTime::now();
        // Two clients, one of them heard from again after the other.
        activity.saw(address(5), Some(&agent("VLC/3.0.20")));
        let first = activity.recent(now);
        activity.saw(address(9), Some(&agent("Infuse/7.6.4")));
        activity.saw(address(5), Some(&agent("VLC/3.0.20")));

        let devices = activity.recent(now + Duration::from_secs(1));
        assert_eq!(devices.len(), 2, "a second request opened a second row");
        assert_eq!(devices[0].address, address(5));
        assert_eq!(devices[1].address, address(9));
        // The one that came back is the row it was, timed from the request that
        // came back: it is one client that made two requests.
        assert!(devices[0].last_seen >= first[0].last_seen);
        assert_eq!(devices[0].name.as_deref(), Some("VLC/3.0.20"));
    }

    #[test]
    fn a_client_that_stops_naming_itself_keeps_the_name_it_gave() {
        let activity = Activity::default();
        activity.saw(address(5), Some(&agent("VLC/3.0.20")));
        // A second request with no User-Agent at all, which is what a client
        // that sends the header only on the first request of a session looks
        // like. The row does not lose the name it was listed under.
        activity.saw(address(5), None);
        let devices = activity.recent(SystemTime::now());
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].name.as_deref(), Some("VLC/3.0.20"));
    }

    #[test]
    fn the_list_carries_the_address_and_the_moment_it_was_heard_from() {
        let activity = Activity::default();
        let before = super::milliseconds(SystemTime::now());
        activity.saw(address(5), Some(&agent("VLC/3.0.20")));
        let devices: Vec<Device> = activity.recent(SystemTime::now());
        let device = &devices[0];
        assert_eq!(device.address, address(5));
        assert!(
            device.last_seen >= before,
            "{} was before {}",
            device.last_seen,
            before
        );
    }
}
