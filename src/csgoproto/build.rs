use std::{
    fs,
    io::Result,
    path::Path,
    process::{Command, ExitStatus},
};

const REPO_URL: &str = "https://github.com/SteamDatabase/GameTracking-CS2.git";
const REPO_DIR: &str = "GameTracking-CS2";
const PROTOBUF_FILE: &str = "generated_protobuf.rs";

fn main() -> Result<()> {
    let protos = vec![
        "GameTracking-CS2/Protobufs/steammessages.proto",
        "GameTracking-CS2/Protobufs/gcsdk_gcmessages.proto",
        "GameTracking-CS2/Protobufs/demo.proto",
        "GameTracking-CS2/Protobufs/cstrike15_gcmessages.proto",
        "GameTracking-CS2/Protobufs/cstrike15_usermessages.proto",
        "GameTracking-CS2/Protobufs/usermessages.proto",
        "GameTracking-CS2/Protobufs/networkbasetypes.proto",
        "GameTracking-CS2/Protobufs/engine_gcmessages.proto",
        "GameTracking-CS2/Protobufs/netmessages.proto",
        "GameTracking-CS2/Protobufs/network_connection.proto",
        "GameTracking-CS2/Protobufs/cs_usercmd.proto",
        "GameTracking-CS2/Protobufs/usercmd.proto",
        "GameTracking-CS2/Protobufs/gameevents.proto",
        "GameTracking-CS2/Protobufs/cs_gameevents.proto",
    ];

    for proto in &protos {
        println!("cargo::rerun-if-changed={proto}");
    }

    fetch_protos(&protos)?;
    generate_protobuf(&protos)
}

fn generate_protobuf(protos: &[&str]) -> Result<()> {
    let out_dir = std::env::var("OUT_DIR").map_err(std::io::Error::other)?;
    let generated_dir = Path::new(&out_dir).join("protobuf");
    fs::create_dir_all(&generated_dir)?;

    prost_build::Config::new()
        .format(false)
        .out_dir(&generated_dir)
        .default_package_filename("protobuf")
        .bytes(["."])
        .enum_attribute(".", "#[derive(::strum::EnumIter)]")
        .compile_protos(protos, &["GameTracking-CS2/Protobufs/"])?;

    // The published protos lack tag 6 (`delta_data`) on CMsgServerUserCmd,
    // which the parser reads for delta-encoded usercmds. Re-apply it after
    // every codegen run (idempotent); without it fresh builds don't compile.
    let generated = fs::read_to_string(generated_dir.join("protobuf.rs"))?;
    let generated = patch_delta_data(generated);
    write_if_changed(&Path::new("src").join(PROTOBUF_FILE), generated.as_bytes())
}

fn patch_delta_data(generated: String) -> String {
    if generated.contains("pub delta_data") {
        return generated;
    }

    let needle = "    pub client_tick: ::core::option::Option<i32>,\n}\n#[derive(Clone, PartialEq, ::prost::Message)]\npub struct CsvcMsgUserCommands {";
    let replacement = "    pub client_tick: ::core::option::Option<i32>,\n    #[prost(bytes=\"bytes\", optional, tag=\"6\")]\n    pub delta_data: ::core::option::Option<::prost::bytes::Bytes>,\n}\n#[derive(Clone, PartialEq, ::prost::Message)]\npub struct CsvcMsgUserCommands {";
    match generated.replacen(needle, replacement, 1) {
        patched if patched != generated => patched,
        _ => panic!("csgoproto build: CMsgServerUserCmd anchor not found in regenerated {PROTOBUF_FILE}"),
    }
}

fn write_if_changed(path: &Path, contents: &[u8]) -> Result<()> {
    if fs::read(path).is_ok_and(|existing| existing == contents) {
        return Ok(());
    }
    fs::write(path, contents)
}

// Only this build script writes GameTracking-CS2, but concurrent cargo
// invocations in the same checkout can still race. Rather than serialise them
// behind a lock (a fixed wait can hang on a lock left by a killed build), each
// racer is allowed to fetch its own copy: concurrent fresh builds may both
// clone (~3s in parallel, one discarded). Publication re-checks the protos and
// leaves a complete checkout untouched, so the first complete result wins and
// no waiting or stale-lock hang is possible.
fn fetch_protos(protos: &[&str]) -> Result<()> {
    let mut sync_error = None;

    if Path::new(REPO_DIR).is_dir() {
        if let Err(err) = git_mirror::sync(Path::new(REPO_DIR)) {
            sync_error = Some(err);
        }

        if protos_present(protos) {
            if let Some(reason) = &sync_error {
                // An offline or unreachable upstream must not fail the build;
                // the existing checkout is still usable.
                println!("cargo::warning=csgoproto build: upstream sync failed ({reason}); using existing local protos");
            }
            return Ok(());
        }
    }

    // The fetch runs at build time on CI hosts, where a transient network
    // failure would otherwise fail the whole wheel build.
    let mut clone_attempts = Vec::new();
    for _ in 0..2 {
        clone_attempts.push(match clone_repo(protos) {
            Ok(status) => status.to_string(),
            Err(err) => format!("error: {err}"),
        });
        if protos_present(protos) {
            return Ok(());
        }
    }

    let missing: Vec<&str> = protos.iter().copied().filter(|proto| !Path::new(proto).is_file()).collect();
    Err(std::io::Error::other(format!(
        "csgoproto build: proto sync failed (sync: {sync_error:?}, clone: {clone_attempts:?}); missing: {missing:?}"
    )))
}

fn clone_repo(protos: &[&str]) -> Result<ExitStatus> {
    let staging = format!("{REPO_DIR}.clone.{}", std::process::id());
    let _ = std::fs::remove_dir_all(&staging);

    let status = Command::new("git").args(["clone", REPO_URL, "--depth=1", &staging]).status()?;
    if !status.success() {
        let _ = std::fs::remove_dir_all(&staging);
        return Ok(status);
    }

    if let Err(err) = replace_dir(&staging, REPO_DIR, protos) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(err);
    }
    Ok(status)
}

fn replace_dir(staging: &str, target: &str, protos: &[&str]) -> Result<()> {
    if protos_present(protos) {
        let _ = std::fs::remove_dir_all(staging);
        return Ok(());
    }

    if let Err(err) = std::fs::remove_dir_all(target) {
        if err.kind() != std::io::ErrorKind::NotFound {
            return Err(err);
        }
    }

    match std::fs::rename(staging, target) {
        Ok(()) => Ok(()),
        Err(_) if protos_present(protos) => {
            let _ = std::fs::remove_dir_all(staging);
            Ok(())
        }
        Err(err) => Err(err),
    }
}

fn protos_present(protos: &[&str]) -> bool {
    protos.iter().all(|proto| Path::new(proto).is_file())
}
