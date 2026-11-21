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
    let bytes = source.as_bytes();
    let mut depth = 1usize;
    let mut index = body_start;

    while index < bytes.len() {
        match bytes[index] {
            b'/' if bytes.get(index + 1) == Some(&b'/') => {
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
            }
            b'"' => index = quoted_end(bytes, index),
            b'\'' => index = char_literal_end(bytes, index).unwrap_or(index + 1),
            b'{' => {
                depth += 1;
                index += 1;
            }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(index);
                }
                index += 1;
            }
            _ => index += 1,
        }
    }
    None
}

fn quoted_end(bytes: &[u8], opening: usize) -> usize {
    let mut index = opening + 1;
    while index < bytes.len() {
        match bytes[index] {
            b'\\' => index += 2,
            b'"' => return index + 1,
            _ => index += 1,
        }
    }
    index
}

fn char_literal_end(bytes: &[u8], opening: usize) -> Option<usize> {
    let mut index = opening + 1;
    if bytes.get(index) == Some(&b'\\') {
        index += 1;
        while index < bytes.len() && bytes[index] != b'\'' && bytes[index] != b'\n' {
            index += 1;
        }
        return (bytes.get(index) == Some(&b'\'')).then_some(index + 1);
    }

    index += utf8_width(bytes.get(index).copied()?);
    (bytes.get(index) == Some(&b'\'')).then_some(index + 1)
}

fn utf8_width(first: u8) -> usize {
    match first {
        0x00..=0x7F => 1,
        0xC0..=0xDF => 2,
        0xE0..=0xEF => 3,
        _ => 4,
    }
}

// Generated fields carry a single `#[prost(...)]` attribute with at most one
// `tag = "N"` pair, so a textual search needs no attribute parser.
fn field_tag(body: &str, field_start: usize) -> Option<&str> {
    let attribute_start = body[..field_start].rfind("#[prost(")?;
    let attribute_end = body[attribute_start..].find(']')? + attribute_start;
    tag_attribute_value(&body[attribute_start..=attribute_end])
}

fn tag_attribute_value(attribute: &str) -> Option<&str> {
    let mut remaining = attribute;
    while let Some(tag_start) = remaining.find("tag") {
        let after_tag = &remaining[tag_start + "tag".len()..];
        if let Some(after_equals) = after_tag.trim_start().strip_prefix('=') {
            let value = after_equals.trim_start().strip_prefix('"')?;
            return value.find('"').map(|end| &value[..end]);
        }
        remaining = after_tag;
    }
    None
}
