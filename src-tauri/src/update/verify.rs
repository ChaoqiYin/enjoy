use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use minisign_verify::{PublicKey, Signature};

/// Checks that a payload is the one the release manifest signed.
///
/// This is the whole of the update's security. The bytes are fetched over a
/// network nobody trusts, and the signature is the only thing that says they
/// are the installer this project published — without it, whoever can answer
/// for the download URL can put code on the machine. The updater plugin's own
/// `download` verifies before it hands anything back, so taking the transfer
/// over means taking this over with it.
///
/// The steps are the plugin's, deliberately: the public key and the signature
/// are both base64 around minisign's armoured text, and the legacy signing form
/// is accepted because the plugin accepts it. A payload that fails is refused
/// outright — there is no partial trust to fall back on.
pub(super) fn verify(payload: &[u8], signature: &str, public_key: &str) -> Result<(), String> {
    let key = PublicKey::decode(&armoured(public_key)?).map_err(|error| error.to_string())?;
    let signature = Signature::decode(&armoured(signature)?).map_err(|error| error.to_string())?;
    key.verify(payload, &signature, true)
        .map_err(|error| error.to_string())
}

/// The armoured text a base64 field stands for. Both fields in the manifest are
/// minisign's own text with a base64 wrapper around it, not the binary form.
fn armoured(field: &str) -> Result<String, String> {
    let decoded = BASE64.decode(field).map_err(|error| error.to_string())?;
    String::from_utf8(decoded).map_err(|error| error.to_string())
}
