//! Updates the local GameTracking-CS2 mirror and invalidates generated code.
//!
//! Run `cargo sync-now` from the repository root: cargo walks up from the
//! current directory to find `.cargo/config.toml`, but the alias's relative
//! `--manifest-path` only resolves from the repo root. It force-syncs the
//! mirror to upstream `HEAD` (fetch + hard reset, safe against upstream force
//! pushes), then invalidates generated code so the next build reruns both
//! codegen steps and rewrites `generated_*.rs`.
//!
//! Codegen is left intact when the mirror did not move and all three generated
//! outputs exist (`src/csgoproto/src/generated_protobuf.rs`,
//! `src/parser/src/generated_message_type.rs`, `src/parser/src/generated_maps.rs`).
//! Otherwise it runs `cargo clean -p csgoproto -p counterstrat-demoparser`, so a
//! mirror move or a hand-deleted output is rebuilt by the next
//! `cargo build -p counterstrat-demoparser`.
//!
//! Prints `SYNCED` when the mirror already matched upstream and `NOW-SYNCED`
//! with the old and new commits when it advanced. Exits 0 on success and 2 on
//! any failure (offline, missing checkout, failed `rev-parse`/`log`, or failed
//! `cargo clean`); it never exits 1.
//!
//! `cargo sync-check` stays read-only: it compares the mirror with upstream
//! without resetting it or touching build artifacts.
//!
//! This dev-only helper depends on a single local path crate and no registry
//! crates, so its `Cargo.lock` is not tracked: it pins nothing that the
//! workspace lock does not already pin. Track it if third-party dependencies
//! are ever added.

use std::{
    path::{Path, PathBuf},
    process::{Command, ExitCode},
};

const GENERATED_OUTPUTS: [&str; 3] = [
    "src/csgoproto/src/generated_protobuf.rs",
    "src/parser/src/generated_message_type.rs",
    "src/parser/src/generated_maps.rs",
];

fn main() -> ExitCode {
    match run() {
        Ok(code) => code,
        Err(message) => {
            eprintln!("sync-now: warning: {message}");
            ExitCode::from(2)
        }
    }
}

fn run() -> Result<ExitCode, String> {
    let mirror = git_mirror::mirror_path()?;
    let display = mirror.display();

    if !mirror.join(".git").exists() {
        return Err(format!(
            "no GameTracking-CS2 checkout at {display}; run `cargo build -p counterstrat-demoparser` from the repo root to create it"
        ));
    }

    let root = workspace_root(&mirror)?;
    let before = rev_parse(&mirror, "HEAD")?;
    git_mirror::sync(&mirror)?;
    let after = rev_parse(&mirror, "HEAD")?;
    let fetched = rev_parse(&mirror, "FETCH_HEAD")?;
    let summary = fetch_head_summary(&mirror)?;

    let cleaned = if before == after && generated_outputs_present(&root) {
        false
    } else {
        invalidate_codegen(&root)?;
        true
    };

    println!("HEAD was:   {before}");
    println!("HEAD:       {after}");
    println!("FETCH_HEAD: {fetched}");
    println!("{summary}");

    if before == after {
        println!("SYNCED: local mirror already matched upstream");
    } else {
        println!("NOW-SYNCED: {before} -> {after}");
    }

    if cleaned {
        println!("codegen invalidated; `cargo build -p counterstrat-demoparser` now regenerates generated_*.rs");
    } else {
        println!("generated outputs present; codegen left intact");
    }

    Ok(ExitCode::SUCCESS)
}

fn generated_outputs_present(root: &Path) -> bool {
    GENERATED_OUTPUTS.iter().all(|rel| root.join(rel).is_file())
}

fn invalidate_codegen(root: &Path) -> Result<(), String> {
    let output = Command::new("cargo")
        .arg("clean")
        .arg("-p")
        .arg("csgoproto")
        .arg("-p")
        .arg("counterstrat-demoparser")
        .current_dir(root)
        .output()
        .map_err(|err| format!("cargo clean failed to start: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "cargo clean -p csgoproto -p counterstrat-demoparser failed: {}",
        detail.trim()
    ))
}

fn workspace_root(mirror: &Path) -> Result<PathBuf, String> {
    mirror
        .ancestors()
        .find(|dir| dir.join("src/csgoproto/Cargo.toml").is_file())
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            format!(
                "could not find the workspace root above {} (missing src/csgoproto/Cargo.toml)",
                mirror.display()
            )
        })
}

fn rev_parse(mirror: &Path, rev: &str) -> Result<String, String> {
    let output = git_mirror::run_git(mirror, &["rev-parse", rev])?;
    if !output.status.success() {
        return Err(format!("git rev-parse {rev} failed"));
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
        .ok_or_else(|| format!("git rev-parse {rev} printed no commit"))
}

fn fetch_head_summary(mirror: &Path) -> Result<String, String> {
    let output = git_mirror::run_git(mirror, &["log", "-1", "--oneline", "FETCH_HEAD"])?;
    if !output.status.success() {
        return Err("git log -1 --oneline FETCH_HEAD failed".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
