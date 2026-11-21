use std::{path::Path, process::ExitCode};

const MIRROR: &str = "src/csgoproto/GameTracking-CS2";

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
    let mirror = Path::new(MIRROR);

    if !mirror.join(".git").exists() {
        return Err(format!(
            "no GameTracking-CS2 checkout at {MIRROR}; run cargo build -p counterstrat-demoparser from the repo root to create it"
        ));
    }

    git_mirror::fetch(mirror)?;

    let head = rev_parse(mirror, "HEAD")?;
    let fetched = rev_parse(mirror, "FETCH_HEAD")?;
    let summary = fetch_head_summary(mirror)?;

    println!("HEAD:       {head}");
    println!("FETCH_HEAD: {fetched}");
    println!("{summary}");

    if head == fetched {
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

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn fetch_head_summary(mirror: &Path) -> Result<String, String> {
    let output = git_mirror::run_git(mirror, &["log", "-1", "--oneline", "FETCH_HEAD"])?;
    if !output.status.success() {
        return Err("git log -1 --oneline FETCH_HEAD failed".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
