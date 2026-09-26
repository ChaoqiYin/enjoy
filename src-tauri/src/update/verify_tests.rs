use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};

use super::verify::verify;

/// Minisign's two algorithms: legacy (not prehashed) and prehashed. The plugin
/// accepts both, so the tests exercise the legacy one, which is the shape a
/// release signature made by `tauri signer` has.
const LEGACY: [u8; 2] = [0x45, 0x64];

/// The trusted comment the signature's second half is over, without its prefix.
const COMMENT: &str = "enjoy-test";

/// A key pair and the id a signature by it carries.
///
/// The fixtures are made here rather than kept as files: a valid minisign
/// signature can only be produced by the key that signs it, and the key that
/// signs our releases is not in this repository — so a positive test has to
/// bring a key of its own. What it proves is the thing that matters: the
/// verifier accepts a payload signed by the key it is given, and refuses
/// everything else.
struct Key {
    pair: Ed25519KeyPair,
    id: [u8; 8],
}

fn key(id: u8) -> Key {
    let pair = Ed25519KeyPair::from_pkcs8(
        Ed25519KeyPair::generate_pkcs8(&SystemRandom::new())
            .expect("a key pair can be generated")
            .as_ref(),
    )
    .expect("the generated pair is a key pair");
    Key { pair, id: [id; 8] }
}

/// The manifest's `pubkey` field: base64 around minisign's armoured text.
fn public_key_field(key: &Key) -> String {
    let mut blob = Vec::from(LEGACY);
    blob.extend_from_slice(&key.id);
    blob.extend_from_slice(key.pair.public_key().as_ref());
    let text = format!("untrusted comment: test key\n{}", BASE64.encode(blob));
    BASE64.encode(text)
}

/// The manifest's `signature` field, for a payload this key signs.
fn signature_field(key: &Key, payload: &[u8]) -> String {
    let signature = key.pair.sign(payload).as_ref().to_vec();
    let mut blob = Vec::from(LEGACY);
    blob.extend_from_slice(&key.id);
    blob.extend_from_slice(&signature);
    // Minisign signs the signature together with the trusted comment, so a
    // comment that has been edited invalidates the signature.
    let mut global = signature;
    global.extend_from_slice(COMMENT.as_bytes());
    let text = format!(
        "untrusted comment: test signature\n{}\ntrusted comment: {COMMENT}\n{}",
        BASE64.encode(blob),
        BASE64.encode(key.pair.sign(&global).as_ref())
    );
    BASE64.encode(text)
}

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
