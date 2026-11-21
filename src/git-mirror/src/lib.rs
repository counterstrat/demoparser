//! Git operations shared by the build-time proto sync and `cargo sync-check`.

use std::path::Path;
use std::process::{Command, Output};

pub type Error = String;
pub type Result<T> = std::result::Result<T, Error>;

/// Fetches the current upstream tip into `FETCH_HEAD`.
pub fn fetch(mirror: &Path) -> Result<()> {
    let output = run_git(mirror, &["fetch", "--depth=1", "origin"])?;
    if output.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "could not fetch origin (offline or remote error): {}",
        detail.trim()
    ))
}

/// Reports whether `HEAD` already points at the commit in `FETCH_HEAD`.
pub fn head_matches(mirror: &Path) -> Result<bool> {
    let output = run_git(mirror, &["rev-parse", "HEAD", "FETCH_HEAD"])?;
    if !output.status.success() {
        return Err("git rev-parse HEAD FETCH_HEAD failed".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits = stdout.lines();
    Ok(commits.next() == commits.next())
}

/// Fetches the upstream tip and hard-resets the mirror when it has moved.
///
/// The mirror is force-pushed upstream, so `git pull --ff-only` cannot advance
/// it; hard-resetting is safe because the checkout is generated and gitignored.
pub fn sync(mirror: &Path) -> Result<()> {
    fetch(mirror)?;

    if head_matches(mirror)? {
        return Ok(());
    }

    match run_git_success(mirror, &["reset", "--hard", "FETCH_HEAD"]) {
        Ok(()) => Ok(()),
        // A concurrent build may have reset first and won the index lock; that
        // is success, not a failure.
        Err(_) if head_matches(mirror)? => Ok(()),
        Err(err) => Err(err),
    }
}

/// Runs git in `mirror` with terminal prompts disabled, returning its output.
pub fn run_git(mirror: &Path, args: &[&str]) -> Result<Output> {
    Command::new("git")
        .arg("-C")
        .arg(mirror)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .map_err(|err| format!("git {} failed to start: {err}", args.join(" ")))
}

fn run_git_success(mirror: &Path, args: &[&str]) -> Result<()> {
    let output = run_git(mirror, args)?;
    if output.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&output.stderr);
    let detail = detail.split_whitespace().collect::<Vec<_>>().join(" ");
    Err(format!(
        "git {} {}: {detail}",
        args.join(" "),
        output.status
    ))
}
