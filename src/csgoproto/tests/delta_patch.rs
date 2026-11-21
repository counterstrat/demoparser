#[path = "../build_support/delta_patch.rs"]
mod delta_patch;

const WITHOUT_FIELD: &str = "\
#[derive(Clone, PartialEq, ::prost::Message)]
/// A doc comment with a stray `}` brace.
pub struct CMsgServerUserCmd {
    // A line comment with a stray } brace.
    #[prost(int32, optional, tag=\"5\")]
    pub client_tick: ::core::option::Option<i32>,
}
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CsvcMsgUserCommands {
    #[prost(message, repeated, tag=\"1\")]
    pub commands: ::prost::alloc::vec::Vec<CMsgServerUserCmd>,
}
";

const WITH_FIELD: &str = "\
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CMsgServerUserCmd {
    #[prost(int32, optional, tag=\"5\")]
    pub client_tick: ::core::option::Option<i32>,
    #[prost(bytes=\"bytes\", optional, tag=\"6\")]
    pub delta_data: ::core::option::Option<::prost::bytes::Bytes>,
}
";

#[test]
fn inserts_missing_field_with_tag_six() {
    let expected = WITHOUT_FIELD.replace(
        "    pub client_tick: ::core::option::Option<i32>,\n}",
        "    pub client_tick: ::core::option::Option<i32>,\n    #[prost(bytes=\"bytes\", optional, tag=\"6\")]\n    pub delta_data: ::core::option::Option<::prost::bytes::Bytes>,\n}",
    );

    assert_eq!(delta_patch::patch(WITHOUT_FIELD), expected);
}

#[test]
fn insert_is_idempotent() {
    let patched = delta_patch::patch(WITHOUT_FIELD);
    assert_eq!(delta_patch::patch(&patched), patched);
}

#[test]
fn leaves_existing_tag_six_field_untouched() {
    assert_eq!(delta_patch::patch(WITH_FIELD), WITH_FIELD);
}

#[test]
#[should_panic(expected = "expected 6")]
fn rejects_existing_field_with_other_tag() {
    let generated = WITHOUT_FIELD.replace(
        "    pub client_tick",
        "    #[prost(bytes=\"bytes\", optional, tag=\"9\")]\n    pub delta_data: ::core::option::Option<::prost::bytes::Bytes>,\n    pub client_tick",
    );
    delta_patch::patch(&generated);
}
