//! Reports whether the local GameTracking-CS2 mirror matches upstream.
//!
//! Run `cargo sync-check` from the repository root: cargo only discovers the
//! alias in `.cargo/config.toml` from the current directory. The command prints
//! `SYNCED` and exits 0 when the mirror matches upstream, prints `BEHIND` and
//! exits 1 when it is stale, and exits 2 when offline or the checkout is
//! missing.
//!
//! This dev-only helper depends on a single local path crate and no registry
//! crates, so its `Cargo.lock` is not tracked: it pins nothing that the
//! workspace lock does not already pin. Track it if third-party dependencies
//! are ever added.

use std::{path::Path, process::ExitCode};

fn main() -> ExitCode {
    match check() {
        Ok(code) => code,
        Err(message) => {
            eprintln!("sync-check: warning: {message}");
            ExitCode::from(2)
        }
    }
}

fn check() -> Result<ExitCode, String> {
    let mirror = git_mirror::mirror_path()?;
    let display = mirror.display();

    if !mirror.join(".git").exists() {
        return Err(format!(
            "no GameTracking-CS2 checkout at {display}; run `cargo build -p counterstrat-demoparser` from the repo root to create it"
        ));
    }

    git_mirror::fetch(&mirror)?;

    let synced = git_mirror::head_matches(&mirror)?;
    let head = rev_parse(&mirror, "HEAD")?;
    let fetched = rev_parse(&mirror, "FETCH_HEAD")?;
    let summary = fetch_head_summary(&mirror)?;

    println!("HEAD:       {head}");
    println!("FETCH_HEAD: {fetched}");
    println!("{summary}");

    if synced {
        println!("SYNCED");
        return Ok(ExitCode::SUCCESS);
    }

    println!("BEHIND: local mirror is stale; run cargo build -p counterstrat-demoparser to sync");
    Ok(ExitCode::from(1))
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
