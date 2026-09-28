use super::release::published_at;
use time::{Duration, OffsetDateTime};

#[test]
fn a_published_date_is_written_as_rfc3339() {
    // The settings page formats this string while rendering: sending the
    // rendering `OffsetDateTime` does on its own would leave the frontend with
    // an invalid date, which throws and takes the whole window down with it.
    let date = OffsetDateTime::from_unix_timestamp(1_756_000_000).unwrap();
    assert_eq!(
        published_at(Some(date)).as_deref(),
        Some("2025-08-24T01:46:40Z")
    );
}

#[test]
fn a_published_date_keeps_the_manifest_fraction() {
    // The manifest the plugin reads carries milliseconds rather than whole
    // seconds — a real one reads `2026-09-26T15:47:36.624Z` — so the instant
    // handed to this function is almost never whole. The fraction has to
    // survive the round trip as a fraction, not as something JavaScript reads
    // as a different instant or refuses outright.
    let date =
        OffsetDateTime::from_unix_timestamp(1_756_000_000).unwrap() + Duration::milliseconds(624);
    assert_eq!(
        published_at(Some(date)).as_deref(),
        Some("2025-08-24T01:46:40.624Z")
    );
}

#[test]
fn a_release_without_a_date_sends_none() {
    assert_eq!(published_at(None), None);
}
