//! Post-generation fixups for the prost output.
//!
//! Compiled into `src/csgoproto/build.rs` and exercised by
//! `tests/delta_patch.rs`; the module has no runtime dependency on the crate.

const STRUCT_NAME: &str = "CMsgServerUserCmd";
const FIELD_NAME: &str = "delta_data";
const FIELD_TAG: &str = "6";

/// Ensures `CMsgServerUserCmd` has the tag 6 `delta_data` field.
///
/// Some upstream proto revisions omit the field even though the parser reads
/// it for delta-encoded usercmds. The patch is idempotent, and an existing
/// `delta_data` field with a different tag is rejected rather than duplicated.
pub fn patch(generated: &str) -> String {
    let marker = format!("pub struct {STRUCT_NAME} {{");
    let struct_start = generated
        .find(&marker)
        .unwrap_or_else(|| panic!("csgoproto build: `{STRUCT_NAME}` not found in generated protobuf"));
    let body_start = struct_start + marker.len();
    let body_end = matching_brace(generated, body_start).unwrap_or_else(|| panic!("csgoproto build: unterminated `{STRUCT_NAME}` in generated protobuf"));
    let body = &generated[body_start..body_end];

    if let Some(field_start) = body.find(&format!("pub {FIELD_NAME}")) {
        match field_tag(body, field_start) {
            Some(tag) if tag == FIELD_TAG => return generated.to_string(),
            Some(tag) => panic!("csgoproto build: `{STRUCT_NAME}.{FIELD_NAME}` has tag {tag}, expected {FIELD_TAG}"),
            None => panic!("csgoproto build: `{STRUCT_NAME}.{FIELD_NAME}` is present without a tag {FIELD_TAG} attribute"),
        }
    }

    let field = "    #[prost(bytes=\"bytes\", optional, tag=\"6\")]\n    pub delta_data: ::core::option::Option<::prost::bytes::Bytes>,\n";
    let mut patched = String::with_capacity(generated.len() + field.len());
    patched.push_str(&generated[..body_end]);
    patched.push_str(field);
    patched.push_str(&generated[body_end..]);
    patched
}

fn matching_brace(source: &str, body_start: usize) -> Option<usize> {
    let mut depth = 1usize;
    for (offset, ch) in source[body_start..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(body_start + offset);
                }
            }
            _ => {}
        }
    }
    None
}

fn field_tag(body: &str, field_start: usize) -> Option<&str> {
    let attribute_start = body[..field_start].rfind("#[prost(")?;
    let attribute_end = body[attribute_start..].find(']')? + attribute_start;
    let attribute = &body[attribute_start..=attribute_end];
    let tag_start = attribute.find("tag")? + "tag".len();
    let value = attribute[tag_start..].trim_start();
    let value = value.strip_prefix('=')?.trim_start();
    let value = value.strip_prefix('"')?;
    let value_end = value.find('"')?;
    Some(&value[..value_end])
}

#[cfg(test)]
mod tests {
    use super::*;

    const WITHOUT_FIELD: &str = "\
#[derive(Clone, PartialEq, ::prost::Message)]
pub struct CMsgServerUserCmd {
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
        let patched = patch(WITHOUT_FIELD);
        assert!(patched.contains("#[prost(bytes=\"bytes\", optional, tag=\"6\")]"));
        assert!(patched.contains("pub delta_data: ::core::option::Option<::prost::bytes::Bytes>,\n}"));
    }

    #[test]
    fn insert_is_idempotent() {
        let patched = patch(WITHOUT_FIELD);
        assert_eq!(patch(&patched), patched);
    }

    #[test]
    fn leaves_existing_tag_six_field_untouched() {
        assert_eq!(patch(WITH_FIELD), WITH_FIELD);
    }

    #[test]
    #[should_panic(expected = "expected 6")]
    fn rejects_existing_field_with_other_tag() {
        let generated = WITHOUT_FIELD.replace(
            "    pub client_tick",
            "    #[prost(bytes=\"bytes\", optional, tag=\"9\")]\n    pub delta_data: ::core::option::Option<::prost::bytes::Bytes>,\n    pub client_tick",
        );
        patch(&generated);
    }
}
