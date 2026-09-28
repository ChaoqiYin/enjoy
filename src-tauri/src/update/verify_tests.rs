use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use super::fixture::{key, public_key_field, signature_field};
use super::verify::verify;

const PAYLOAD: &[u8] = b"the installer bytes";

#[test]
fn a_payload_signed_by_the_configured_key_is_accepted() {
    let key = key(1);
    let field = signature_field(&key, PAYLOAD);
    assert!(verify(PAYLOAD, &field, &public_key_field(&key)).is_ok());
}

#[test]
fn a_payload_that_is_not_the_signed_one_is_refused() {
    // The property the whole update rests on: bytes that changed between the
    // signature and the download do not install.
    let key = key(1);
    let field = signature_field(&key, PAYLOAD);
    let mut tampered = PAYLOAD.to_vec();
    tampered.push(b'!');
    assert!(verify(&tampered, &field, &public_key_field(&key)).is_err());
    assert!(verify(b"", &field, &public_key_field(&key)).is_err());
}

#[test]
fn a_signature_from_another_key_is_refused() {
    // A perfectly well-formed signature over exactly these bytes, made by a key
    // that is not the configured one. This is what a substituted payload signed
    // by whoever answers for the download URL would look like.
    let signer = key(1);
    let other = key(2);
    let field = signature_field(&signer, PAYLOAD);
    assert!(verify(PAYLOAD, &field, &public_key_field(&other)).is_err());
}

#[test]
fn a_field_that_is_not_armoured_minisign_text_is_refused() {
    // Everything here arrives from the network, so the shape itself is input to
    // check and not a given: a truncated field, a field that is not base64, or
    // base64 around text that is not a minisign structure.
    let key = key(1);
    let good = public_key_field(&key);
    assert!(verify(PAYLOAD, "not base64 at all !!", &good).is_err());
    assert!(verify(PAYLOAD, &BASE64.encode("no structure here"), &good).is_err());
    assert!(verify(
        PAYLOAD,
        &BASE64.encode("untrusted comment: x\nshort"),
        &good
    )
    .is_err());
    // A field that is fine but has no second line to read.
    assert!(verify(
        PAYLOAD,
        &BASE64.encode("untrusted comment: only a comment"),
        &good
    )
    .is_err());
}
