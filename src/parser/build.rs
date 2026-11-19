use std::path::PathBuf;
use std::{io::Result, process::Command};

fn main() -> Result<()> {
    println!("cargo::rerun-if-changed=../csgoproto/src/main.rs");
    println!("cargo::rerun-if-changed=../csgoproto/src/parser.rs");
    println!("cargo::rerun-if-changed=../csgoproto/src/lib.rs");
    println!("cargo::rerun-if-changed=../csgoproto/Cargo.toml");
    println!("cargo::rerun-if-changed=../csgoproto/GameTracking-CS2/Protobufs");
    println!("cargo::rerun-if-changed=../csgoproto/GameTracking-CS2/game/csgo/pak01_dir/scripts/items/items_game.txt");
    println!("cargo::rerun-if-changed=../csgoproto/GameTracking-CS2/game/csgo/pak01_dir/resource/csgo_english.txt");

    // Codegen depends on `parser`, so running it inside this build script
    // would otherwise deadlock on the shared workspace target dir lock.
    // Give codegen its own target dir and skip it in the nested build.
    if std::env::var_os("COUNTERSTRAT_CODEGEN").is_some() {
        return Ok(());
    }

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let csgoproto_dir = manifest_dir.join("../csgoproto");
    let codegen_target_dir = manifest_dir.join("../../target/codegen");
    let profile = std::env::var("PROFILE").unwrap_or("debug".to_string());
    let codegen_context = "csgoproto codegen (cargo run in csgoproto)";

    let mut command = Command::new("cargo");
    command
        .current_dir(csgoproto_dir)
        .env("COUNTERSTRAT_CODEGEN", "1")
        // Cross build images (rust-cross for aarch64) export CARGO_BUILD_TARGET;
        // inheriting it would build the codegen binary for the target and then
        // fail to run it on the build host.
        .env_remove("CARGO_BUILD_TARGET")
        .arg("run")
        .arg("--locked")
        .arg("--target-dir")
        .arg(codegen_target_dir);
    if profile == "release" {
        command.arg("--release");
    }
    let output = command
        .output()
        .map_err(|err| std::io::Error::other(format!("{codegen_context} failed to start: {err}")))?;
    if !output.status.success() {
        let status = output.status;
        eprintln!("{codegen_context} failed with {status}");
        eprintln!("{codegen_context} stdout:\n{}", String::from_utf8_lossy(&output.stdout));
        eprintln!("{codegen_context} stderr:\n{}", String::from_utf8_lossy(&output.stderr));
        return Err(std::io::Error::other(format!("{codegen_context} failed with {status}")));
    }

    Ok(())
}
