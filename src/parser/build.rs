use std::path::{Path, PathBuf};
use std::{io::Result, process::Command};

fn main() -> Result<()> {
    println!("cargo::rerun-if-changed=../csgoproto/src/main.rs");
    println!("cargo::rerun-if-changed=../csgoproto/src/codegen_parser.rs");
    println!("cargo::rerun-if-changed=../csgoproto/src/lib.rs");
    println!("cargo::rerun-if-changed=../csgoproto/Cargo.toml");
    println!("cargo::rerun-if-changed=../csgoproto/build.rs");
    println!("cargo::rerun-if-changed=../csgoproto/build_support/delta_patch.rs");
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
    let workspace_root = manifest_dir.join("../..");
    let csgoproto_dir = manifest_dir.join("../csgoproto");
    let codegen_target_dir = codegen_target_dir(&workspace_root);
    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
    let codegen_context = "csgoproto codegen (cargo run in csgoproto)";

    let mut command = Command::new("cargo");
    command
        .current_dir(csgoproto_dir)
        .env("COUNTERSTRAT_CODEGEN", "1")
        // The codegen binary runs on the build host. Drop target and rustflag
        // overrides that describe the cross target; `--target-dir` below pins
        // the only other setting that matters.
        .env_remove("CARGO_BUILD_TARGET")
        .env_remove("CARGO_BUILD_RUSTFLAGS")
        .env_remove("CARGO_ENCODED_RUSTFLAGS")
        .env_remove("RUSTFLAGS")
        .arg("run")
        .arg("--locked")
        .arg("--target-dir")
        .arg(codegen_target_dir);
    match profile.as_str() {
        "release" => {
            command.arg("--release");
        }
        "debug" => {}
        other => println!("cargo::warning=csgoproto codegen: profile `{other}` has no direct cargo flag; building codegen in debug"),
    }
    command.arg("--").arg(manifest_dir.join("src"));
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

fn codegen_target_dir(workspace_root: &Path) -> PathBuf {
    let target_root = match std::env::var_os("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .filter(|dir| !dir.as_os_str().is_empty())
    {
        Some(dir) if dir.is_absolute() => dir,
        Some(dir) => workspace_root.join(dir),
        None => workspace_root.join("target"),
    };

    target_root.join("codegen")
}
