use std::{
    io::Result,
    path::Path,
    process::{Command, ExitStatus},
};

const REPO_URL: &str = "https://github.com/SteamDatabase/GameTracking-CS2.git";
const REPO_DIR: &str = "GameTracking-CS2";

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

    prost_build::Config::new()
        .format(false)
        .out_dir("src")
        .default_package_filename("protobuf")
        .bytes(["."])
        .enum_attribute(".", "#[derive(::strum::EnumIter)]")
        .compile_protos(&protos, &["GameTracking-CS2/Protobufs/"])?;

    // The published protos lack tag 6 (`delta_data`) on CMsgServerUserCmd,
    // which the parser reads for delta-encoded usercmds. Re-apply it after
    // every codegen run (idempotent); without it fresh builds don't compile.
    let generated = std::fs::read_to_string("src/protobuf.rs")?;
    if !generated.contains("pub delta_data") {
        let needle = "    pub client_tick: ::core::option::Option<i32>,\n}\n#[derive(Clone, PartialEq, ::prost::Message)]\npub struct CsvcMsgUserCommands {";
        let replacement = "    pub client_tick: ::core::option::Option<i32>,\n    #[prost(bytes=\"bytes\", optional, tag=\"6\")]\n    pub delta_data: ::core::option::Option<::prost::bytes::Bytes>,\n}\n#[derive(Clone, PartialEq, ::prost::Message)]\npub struct CsvcMsgUserCommands {";
        match generated.replacen(needle, replacement, 1) {
            patched if patched != generated => std::fs::write("src/protobuf.rs", patched)?,
            _ => panic!("csgoproto build: CMsgServerUserCmd anchor not found in regenerated protobuf.rs"),
        }
    }
    Ok(())
}

fn fetch_protos(protos: &[&str]) -> Result<()> {
    if protos_present(protos) {
        return Ok(());
    }

    let pull_status = if Path::new(REPO_DIR).is_dir() {
        match pull_repo() {
            Ok(status) if protos_present(protos) => return Ok(()),
            Ok(status) => Some(status),
            Err(_) => None,
        }
    } else {
        None
    };

    let clone_status = clone_repo()?;
    if protos_present(protos) {
        return Ok(());
    }

    let missing: Vec<&str> = protos.iter().copied().filter(|proto| !Path::new(proto).is_file()).collect();
    Err(std::io::Error::other(format!(
        "csgoproto build: proto sync failed (pull: {pull_status:?}, clone: {clone_status}); missing: {missing:?}"
    )))
}

fn pull_repo() -> Result<ExitStatus> {
    Command::new("git").args(["-C", REPO_DIR, "pull", "--ff-only", "--depth=1"]).status()
}

// Only this build script writes GameTracking-CS2, but concurrent cargo
// invocations in the same checkout can still race. Each clone stages under a
// PID-suffixed path and replaces the checkout by rename, and an in-place pull
// that fails or leaves protos missing falls through to that staged clone.
fn clone_repo() -> Result<ExitStatus> {
    let staging = format!("{REPO_DIR}.clone.{}", std::process::id());
    let _ = std::fs::remove_dir_all(&staging);

    let status = Command::new("git").args(["clone", REPO_URL, "--depth=1", &staging]).status()?;
    if !status.success() {
        let _ = std::fs::remove_dir_all(&staging);
        return Ok(status);
    }

    if let Err(err) = replace_dir(&staging, REPO_DIR) {
        let _ = std::fs::remove_dir_all(&staging);
        return Err(err);
    }
    Ok(status)
}

fn replace_dir(staging: &str, target: &str) -> Result<()> {
    if Path::new(target).exists() {
        std::fs::remove_dir_all(target)?;
    }
    std::fs::rename(staging, target)
}

fn protos_present(protos: &[&str]) -> bool {
    protos.iter().all(|proto| Path::new(proto).is_file())
}
