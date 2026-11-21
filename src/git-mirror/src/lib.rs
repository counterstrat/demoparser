//! Git operations shared by the build-time proto sync, `cargo sync-check`, and
//! `cargo sync-now`.

use std::path::{Path, PathBuf};
use std::process::{Command, Output};

/// Plain string errors keep build-script and CLI messages readable; a newtype
/// would add no information.
pub type Error = String;
pub type Result<T> = std::result::Result<T, Error>;

/// Workspace-relative location of the GameTracking-CS2 mirror.
pub const MIRROR_REL: &str = "src/csgoproto/GameTracking-CS2";

/// Resolves [`MIRROR_REL`] against the workspace root.
///
/// Build scripts run with `CARGO_MANIFEST_DIR` set to their package directory,
/// while `sync-check` and `sync-now` are run from the repository root. Walking
/// up from either starting point finds the workspace root, independent of the
/// process working directory.
pub fn mirror_path() -> Result<PathBuf> {
    let start = std::env::var_os("CARGO_MANIFEST_DIR")
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .ok_or_else(|| "could not determine a starting directory".to_string())?;
    let mut dir = start.clone();

    loop {
        if dir.join("src/csgoproto/Cargo.toml").is_file() {
            return Ok(dir.join(MIRROR_REL));
        }
        if !dir.pop() {
            return Err(format!(
                "could not find the workspace root above {} (missing src/csgoproto/Cargo.toml)",
                start.display()
            ));
        }
    }
}

/// Fetches the upstream `HEAD` commit into `FETCH_HEAD`.
///
/// The explicit ref keeps `FETCH_HEAD` to a single entry; fetching the default
/// refspec can record several refs and leave the tip ambiguous.
pub fn fetch(mirror: &Path) -> Result<()> {
    let output = run_git(mirror, &["fetch", "--depth=1", "origin", "HEAD"])?;
    if output.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&output.stderr);
    Err(format!(
        "could not fetch origin (offline or remote error): {}",
        detail.trim()
    ))
}

/// Reports whether `HEAD` already points at the first commit in `FETCH_HEAD`.
///
/// `rev-parse FETCH_HEAD` can print one line per fetched ref, so only the
/// first entry is compared.
pub fn head_matches(mirror: &Path) -> Result<bool> {
    let output = run_git(mirror, &["rev-parse", "HEAD", "FETCH_HEAD"])?;
    if !output.status.success() {
        return Err("git rev-parse HEAD FETCH_HEAD failed".to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty());
    let head = lines.next().unwrap_or_default();
    let fetched = lines.next().unwrap_or_default();
    if head.is_empty() || fetched.is_empty() {
        return Err("git rev-parse HEAD FETCH_HEAD returned fewer than two commits".to_string());
    }
    Ok(head == fetched)
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
///
/// Public so `sync-check` and `sync-now` can run read-only inspection commands
/// (`rev-parse`, `log`) without duplicating process setup.
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
