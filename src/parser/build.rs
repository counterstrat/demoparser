use std::path::PathBuf;
use std::{io::Result, process::Command};

fn main() -> Result<()> {
    println!("cargo::rerun-if-changed=../csgoproto/src/protobuf.rs");
    println!("cargo::rerun-if-changed=../csgoproto/GameTracking-CS2/game/csgo/pak01_dir/resource/csgo_english.txt");

    // Codegen depends on `parser`, so running it inside this build script
    // would otherwise deadlock on the shared workspace target dir lock.
    // Give codegen its own target dir and skip it in the nested build.
    if std::env::var_os("COUNTERSTRAT_CODEGEN").is_some() {
        return Ok(());
    }

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let codegen_target_dir = PathBuf::from(manifest_dir).join("../../target/codegen");
    let profile = std::env::var("PROFILE").unwrap_or("debug".to_string());

    let mut command = Command::new("cargo");
    command
        .current_dir("../csgoproto")
        .env("COUNTERSTRAT_CODEGEN", "1")
        .arg("run")
        .arg("--target-dir")
        .arg(codegen_target_dir);
    if profile == "release" {
        command.arg("--release");
    }
    command.status()?;

    Ok(())
}
