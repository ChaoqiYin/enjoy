use std::path::Path;

fn main() {
    println!("cargo:rerun-if-changed=../resources/ffmpeg/windows-x86_64");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("PROFILE").as_deref() == Ok("release")
    {
        assert_eq!(
            std::env::var("CARGO_CFG_TARGET_ARCH").as_deref(),
            Ok("x86_64"),
            "Bundled FFmpeg currently supports Windows x86_64 only"
        );
        let directory = Path::new("../resources/ffmpeg/windows-x86_64");
        for name in ["ffmpeg.exe", "ffprobe.exe", "LICENSE.txt"] {
            let path = directory.join(name);
            println!("cargo:rerun-if-changed={}", path.display());
            assert!(
                path.is_file(),
                "Missing bundled media resource: {}. See resources/ffmpeg/windows-x86_64/README.md",
                path.display()
            );
        }
    }
    tauri_build::build()
}
