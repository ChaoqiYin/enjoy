//! The addresses this machine can be reached at, in the order to try them.
//!
//! A user who wants the television to play something has to type an address into
//! it, and there is no address this application can work out for itself: it
//! depends on which networks the machine is on, which the operating system is
//! the only thing that knows. What comes back is every address the machine
//! holds, and what is left to do here is put them in an order a person can act
//! on — the wired and wireless ones first, the machine talking to itself last.

use std::net::{IpAddr, Ipv4Addr};

use if_addrs::{get_if_addrs, Interface};
use serde::Serialize;

/// One address this machine can be reached at.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Address {
    /// The interface it belongs to, as the operating system names it — `Wi-Fi`,
    /// `以太网`. Shown beside the address because a machine with a virtual
    /// adapter holds two addresses that both look like a local network, and the
    /// name is the only thing that says which is which.
    pub interface: String,
    pub address: Ipv4Addr,
    /// Whether this is the machine talking to itself: the one address on the
    /// list that works here and nowhere else.
    pub loopback: bool,
}

/// Every address this machine holds, most likely to be the one to use first.
///
/// An interface that is not up is left out, because a network adapter that is
/// turned off holds an address nothing can reach. That it is turned off is
/// exactly the case where the list comes back short, which is a truer answer
/// than a full list of addresses that do not work.
pub(crate) fn of_this_machine() -> Vec<Address> {
    let interfaces = match get_if_addrs() {
        Ok(interfaces) => interfaces,
        Err(error) => {
            // Not a failure the user is told about: no addresses is a page
            // without a list, and the credentials beside it still work.
            tracing::warn!(diagnostic = %error, "Failed to read the machine's addresses");
            return Vec::new();
        }
    };
    ordered(interfaces.into_iter().filter(Interface::is_oper_up))
}

/// The addresses in the order a person should try them.
///
/// Separated from reading the machine so that the order is a rule that can be
/// tested without a network to test it on.
fn ordered(interfaces: impl Iterator<Item = Interface>) -> Vec<Address> {
    let mut addresses: Vec<Address> = interfaces
        .filter_map(|interface| {
            // The service listens on IPv4 (see `service::bind`), so an IPv6
            // address is not an address it can be reached at: a row for one
            // would be a row that cannot work.
            match interface.addr.ip() {
                IpAddr::V4(address) => Some(Address {
                    interface: interface.name,
                    address,
                    loopback: address.is_loopback(),
                }),
                IpAddr::V6(_) => None,
            }
        })
        .collect();
    // By what kind of address it is, and by the address within a kind, so that
    // the list is in one order rather than in whatever order the operating
    // system happened to hand its interfaces over in.
    addresses.sort_by_key(|address| (rank(address.address), address.address));
    addresses
}

/// Where an address belongs in the order.
///
/// The question being answered is "which of these do I type into the
/// television", and the answer is the one the router handed this machine: a
/// private address, which is what a house is made of.
///
/// Then a link-local address. `169.254` is what a machine gives itself when the
/// network did not give it one, so it is a network with something wrong with it
/// rather than no network at all, and it is worth trying before anything more
/// unusual.
///
/// Then everything else, which is a public address: reachable from wherever it
/// is routable, which is more than the house. A machine on a network like that
/// is not what this feature is for, and its address stays above the loopback
/// only because it might still work.
///
/// And last, this machine talking to itself — the address most likely to be
/// copied by mistake, and the one that cannot possibly reach a television.
fn rank(address: Ipv4Addr) -> u8 {
    if address.is_loopback() {
        3
    } else if address.is_private() {
        0
    } else if address.is_link_local() {
        1
    } else {
        2
    }
}

#[cfg(test)]
mod tests {
    use super::{of_this_machine, ordered, rank};
    use if_addrs::{IfAddr, IfOperStatus, Ifv4Addr, Ifv6Addr, Interface};
    use std::net::{Ipv4Addr, Ipv6Addr};

    fn interface(name: &str, ip: Ipv4Addr) -> Interface {
        Interface {
            name: name.to_string(),
            addr: IfAddr::V4(Ifv4Addr {
                ip,
                netmask: Ipv4Addr::new(255, 255, 255, 0),
                prefixlen: 24,
                broadcast: None,
            }),
            index: None,
            oper_status: IfOperStatus::Up,
            is_p2p: false,
            #[cfg(windows)]
            adapter_name: String::new(),
        }
    }

    /// Just the addresses, in the order they came back in.
    fn order(interfaces: Vec<Interface>) -> Vec<String> {
        ordered(interfaces.into_iter())
            .into_iter()
            .map(|address| address.address.to_string())
            .collect()
    }

    #[test]
    fn the_address_a_router_handed_out_comes_before_the_rest() {
        assert_eq!(
            order(vec![
                interface("Loopback Pseudo-Interface 1", Ipv4Addr::LOCALHOST),
                interface("Ethernet", Ipv4Addr::new(203, 0, 113, 9)),
                interface("Wi-Fi", Ipv4Addr::new(169, 254, 3, 7)),
                interface("Wi-Fi", Ipv4Addr::new(192, 168, 1, 5)),
                interface("vEthernet (WSL)", Ipv4Addr::new(172, 20, 0, 1)),
            ]),
            // The two private ones, in address order; then the one the network
            // failed to hand out; then the public one; then this machine.
            [
                "172.20.0.1",
                "192.168.1.5",
                "169.254.3.7",
                "203.0.113.9",
                "127.0.0.1"
            ]
        );
    }

    #[test]
    fn only_the_machine_talking_to_itself_is_marked_as_such() {
        let addresses = ordered(
            vec![
                interface("Wi-Fi", Ipv4Addr::new(192, 168, 1, 5)),
                interface("Loopback", Ipv4Addr::LOCALHOST),
            ]
            .into_iter(),
        );
        // Last, and the only one marked: the mark says which row will not work
        // from the sofa, so a mark on any other row would make it say nothing.
        assert!(!addresses[0].loopback);
        assert_eq!(addresses[0].interface, "Wi-Fi");
        assert!(addresses[1].loopback);
        assert_eq!(addresses[1].interface, "Loopback");
    }

    #[test]
    fn an_ipv6_address_is_not_offered() {
        let mut interface = interface("Wi-Fi", Ipv4Addr::new(192, 168, 1, 5));
        interface.addr = IfAddr::V6(Ifv6Addr {
            ip: Ipv6Addr::LOCALHOST,
            netmask: Ipv6Addr::UNSPECIFIED,
            prefixlen: 128,
            broadcast: None,
        });
        // The interface is left out altogether rather than listed with a name
        // and no address: it holds nothing this service can be reached at.
        assert!(ordered(vec![interface].into_iter()).is_empty());
    }

    #[test]
    fn this_machine_has_at_least_its_own_address() {
        // The one claim about the real machine that holds everywhere: an
        // operating system has a loopback interface or it is not running. It is
        // what makes the difference between a list that was read and a list that
        // failed to be read visible at all, since both are empty lists here.
        let addresses = of_this_machine();
        assert!(
            addresses.iter().any(|address| address.loopback),
            "{addresses:?}"
        );
        // And never first, whatever the machine is: the reading and the ordering
        // are two halves, and this is where they meet.
        assert!(!addresses[0].loopback);
        assert_eq!(rank(Ipv4Addr::LOCALHOST), 3);
    }
}
