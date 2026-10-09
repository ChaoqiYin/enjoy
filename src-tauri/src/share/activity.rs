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
pub(crate) fn milliseconds(moment: SystemTime) -> i64 {
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
pub(crate) fn device_name(agent: Option<&HeaderValue>) -> Option<String> {
    let value = agent?.to_str().ok()?;
    let product = value.split_whitespace().next()?;
    (!product.is_empty()).then(|| product.chars().take(NAME_LIMIT).collect())
}
