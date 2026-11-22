use parser::first_pass::parser::SharedFirstPass;
use parser::first_pass::parser_settings::continuous_decode_required;
use parser::first_pass::parser_settings::rm_user_friendly_names;
use parser::first_pass::parser_settings::FirstPassParser;
use parser::first_pass::parser_settings::ParserInputs;
use parser::first_pass::prop_controller::PropInfo;
use parser::parse_demo::Parser;
use parser::parse_demo::ParsingMode::ForceSingleThreaded;
use parser::second_pass::parser_settings::create_huffman_lookup_table;
use parser::second_pass::variants::soa_to_aos;
use parser::second_pass::variants::OutputSerdeHelperStruct;
use parser::second_pass::variants::Variant;
use serde::Serialize;
use std::collections::HashMap;
use std::collections::HashSet;
use std::convert::TryFrom;
use std::iter::FromIterator;
use std::result::Result;
use std::sync::Arc;
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;

/// The huffman lookup table must outlive the `Parser` stored in a
/// `ChunkParser` handle (its settings borrow the table), so it cannot live
/// on the stack like in the one-shot bindings above. ONE table (~131,072
/// entries) is shared by every handle in this wasm instance instead of
/// leaking one per handle.
static HUFFMAN_TABLE: OnceLock<Vec<(u8, u8)>> = OnceLock::new();

/// Parsed by hand rather than through `serde_wasm_bindgen`: serde's
/// `deserialize_any` cannot tell a JS number from a small BigInt, and native
/// maps those to different `Variant`s. Returns the real-name states plus the
/// `(real, user-friendly)` pairs to add to `real_name_to_og_name`.
fn wanted_prop_states_from_js(
    prop_states: Option<JsValue>,
) -> Result<(Vec<(String, Variant)>, Vec<(String, String)>), JsError> {
    let Some(prop_states) = prop_states.filter(|value| !value.is_null() && !value.is_undefined()) else {
        return Ok((vec![], vec![]));
    };
    if !js_sys::Array::is_array(&prop_states) {
        return Err(JsError::new("propStates must be an array of { prop, state } objects"));
    }
    let mut parsed: Vec<(String, Variant)> = vec![];
    for entry in js_sys::Array::from(&prop_states).iter() {
        if !entry.is_object() {
            return Err(JsError::new("propStates entries must be { prop, state } objects"));
        }
        let prop = js_sys::Reflect::get(&entry, &JsValue::from_str("prop"))
            .map_err(|_| JsError::new("propStates entries need a string `prop`"))?;
        let prop = prop
            .as_string()
            .ok_or_else(|| JsError::new("propStates entries need a string `prop`"))?;
        let state = js_sys::Reflect::get(&entry, &JsValue::from_str("state"))
            .map_err(|_| JsError::new("propStates entries need a `state`"))?;
        parsed.push((prop, prop_state_variant(&state)?));
    }

    let mut seen_props = HashSet::new();
    for (prop, _) in &parsed {
        if !seen_props.insert(prop.clone()) {
            return Err(JsError::new(&format!("Duplicate prop state for `{}`", prop)));
        }
    }
    let user_friendly_names: Vec<String> = parsed.iter().map(|(prop, _)| prop.clone()).collect();
    let real_names =
        rm_user_friendly_names(&user_friendly_names).map_err(|e| JsError::new(&format!("{}", e)))?;
    let mut seen_real_names = HashSet::new();
    for real_name in &real_names {
        if !seen_real_names.insert(real_name.clone()) {
            return Err(JsError::new(&format!(
                "Multiple prop states resolve to the same real name `{}`",
                real_name
            )));
        }
    }
    let wanted_prop_states = parsed
        .into_iter()
        .zip(&real_names)
        .map(|((_, state), real_name)| (real_name.clone(), state))
        .collect();
    let name_pairs = real_names.into_iter().zip(user_friendly_names).collect();
    Ok((wanted_prop_states, name_pairs))
}

fn prop_state_variant(state: &JsValue) -> Result<Variant, JsError> {
    if let Some(value) = state.as_bool() {
        return Ok(Variant::Bool(value));
    }
    if let Some(value) = state.as_string() {
        return Ok(Variant::String(value));
    }
    if let Some(number) = state.as_f64() {
        if !number.is_finite() {
            return Err(JsError::new("Prop state numbers must be finite"));
        }
        if number.fract() == 0.0 {
            if number >= i32::MIN as f64 && number <= i32::MAX as f64 {
                return Ok(Variant::I32(number as i32));
            }
            if number >= 0.0 && number <= u32::MAX as f64 {
                return Ok(Variant::U32(number as u32));
            }
            return Err(JsError::new("Integer prop states above u32::MAX must be passed as BigInt"));
        }
        return Ok(Variant::F32(number as f32));
    }
    if state.is_bigint() {
        return match u64::try_from(state.clone()) {
            Ok(value) => Ok(Variant::U64(value)),
            Err(_) => Err(JsError::new("Unsupported number type")),
        };
    }
    Err(JsError::new(
        "Expected a boolean, string, number, or bigint for a prop state",
    ))
}

fn wanted_strings(values: Option<Vec<JsValue>>, label: &str) -> Result<Vec<String>, JsError> {
    values
        .unwrap_or_default()
        .into_iter()
        .map(|value| {
            value
                .as_string()
                .ok_or_else(|| JsError::new(&format!("{} entries must be strings", label)))
        })
        .collect()
}

/// Validates the raw JS value before wasm-bindgen's `Vec<JsValue>` conversion
/// can turn a non-array (for example a string, which is iterable) into a
/// character list, matching native's `Vec<String>` argument rejection.
fn wanted_strings_from_js(values: Option<JsValue>, label: &str) -> Result<Vec<String>, JsError> {
    let Some(values) = values.filter(|value| !value.is_null() && !value.is_undefined()) else {
        return Ok(vec![]);
    };
    if !js_sys::Array::is_array(&values) {
        return Err(JsError::new(&format!("{} must be an array of strings", label)));
    }
    js_sys::Array::from(&values)
        .iter()
        .map(|value| {
            value
                .as_string()
                .ok_or_else(|| JsError::new(&format!("{} entries must be strings", label)))
        })
        .collect()
}

fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    value
        .serialize(&serde_wasm_bindgen::Serializer::new().serialize_missing_as_null(true))
        .map_err(|e| JsError::new(&format!("{}", e)))
}

fn to_js_map_object<T: Serialize>(value: &T) -> Result<JsValue, JsError> {
    value
        .serialize(
            &serde_wasm_bindgen::Serializer::new()
                .serialize_maps_as_objects(true)
                .serialize_missing_as_null(true),
        )
        .map_err(|e| JsError::new(&format!("{}", e)))
}

#[wasm_bindgen]
pub fn parseEvent(
    file: Vec<u8>,
    event_name: Option<String>,
    wanted_player_props: Option<Vec<JsValue>>,
    wanted_other_props: Option<Vec<JsValue>>,
) -> Result<JsValue, JsError> {
    let player_props = wanted_strings(wanted_player_props, "wantedPlayerProps")?;
    let other_props = wanted_strings(wanted_other_props, "wantedOtherProps")?;
    let real_names_player = match rm_user_friendly_names(&player_props) {
        Ok(names) => names,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let real_other_props = match rm_user_friendly_names(&other_props) {
        Ok(names) => names,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };

    let mut real_name_to_og_name = HashMap::default();
    for (real_name, user_friendly_name) in real_names_player.iter().zip(&player_props) {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    for (real_name, user_friendly_name) in real_other_props.iter().zip(&other_props) {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    let arc_huf = Arc::new(create_huffman_lookup_table());
    let settings = ParserInputs {
        wanted_players: vec![],
        wanted_player_props: real_names_player,
        wanted_other_props: real_other_props,
        real_name_to_og_name: real_name_to_og_name.into(),
        wanted_events: vec![event_name.unwrap_or("none".to_string())],
        collect_ticks: false,
        parse_voice: false,
        parse_ents: true,
        wanted_ticks: vec![],
        parse_projectiles: false,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: &arc_huf,
        order_by_steamid: false,
        wanted_prop_states: HashMap::default().into(),
        fallback_bytes: None,
        parse_grenades: false,
        parse_weapons: false,
        vector_props_as_lists: false,
        grenade_classes: None,
    };
    let mut parser = Parser::new(settings, ForceSingleThreaded);

    let output = match parser.parse_demo(&file) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    match serde_wasm_bindgen::to_value(&output.game_events) {
        Ok(s) => Ok(s),
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    }
}
#[wasm_bindgen]
pub fn parseEvents(
    file: Vec<u8>,
    event_names: Option<Vec<JsValue>>,
    wanted_player_props: Option<Vec<JsValue>>,
    wanted_other_props: Option<Vec<JsValue>>,
) -> Result<JsValue, JsError> {
    let event_names = wanted_strings(event_names, "eventNames")?;
    let player_props = wanted_strings(wanted_player_props, "wantedPlayerProps")?;
    let other_props = wanted_strings(wanted_other_props, "wantedOtherProps")?;
    let real_names_player = match rm_user_friendly_names(&player_props) {
        Ok(names) => names,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let real_other_props = match rm_user_friendly_names(&other_props) {
        Ok(names) => names,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };

    let mut real_name_to_og_name = HashMap::default();
    for (real_name, user_friendly_name) in real_names_player.iter().zip(&player_props) {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    for (real_name, user_friendly_name) in real_other_props.iter().zip(&other_props) {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    let arc_huf = Arc::new(create_huffman_lookup_table());
    let settings = ParserInputs {
        wanted_players: vec![],
        wanted_player_props: real_names_player,
        wanted_other_props: real_other_props,
        real_name_to_og_name: real_name_to_og_name.into(),
        wanted_events: event_names,
        collect_ticks: false,
        parse_voice: false,
        parse_ents: true,
        wanted_ticks: vec![],
        parse_projectiles: false,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: &arc_huf,
        order_by_steamid: false,
        wanted_prop_states: HashMap::default().into(),
        fallback_bytes: None,
        parse_grenades: false,
        parse_weapons: false,
        vector_props_as_lists: false,
        grenade_classes: None,
    };
    let mut parser = Parser::new(settings, ForceSingleThreaded);

    let output = match parser.parse_demo(&file) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    match serde_wasm_bindgen::to_value(&output.game_events) {
        Ok(s) => Ok(s),
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    }
}

#[wasm_bindgen]
pub fn listGameEvents(fileBytes: Vec<u8>) -> Result<JsValue, JsError> {
    let arc_huf = Arc::new(create_huffman_lookup_table());
    let settings = ParserInputs {
        wanted_players: vec![],
        real_name_to_og_name: HashMap::default().into(),
        wanted_player_props: vec![],
        wanted_other_props: vec![],
        wanted_events: vec!["all".to_string()],
        collect_ticks: false,
        parse_voice: false,
        parse_ents: false,
        wanted_ticks: vec![],
        parse_projectiles: false,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: &arc_huf.clone(),
        order_by_steamid: false,
        wanted_prop_states: HashMap::default().into(),
        fallback_bytes: None,
        parse_grenades: false,
        parse_weapons: false,
        vector_props_as_lists: false,
        grenade_classes: None,
    };
    let mut parser = Parser::new(settings, ForceSingleThreaded);

    let output = match parser.parse_demo(&fileBytes) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let v = Vec::from_iter(output.game_events_counter.iter());
    match serde_wasm_bindgen::to_value(&v) {
        Ok(s) => Ok(s),
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    }
}
#[wasm_bindgen]
pub fn listUpdatedFields(fileBytes: Vec<u8>) -> Result<JsValue, JsError> {
    let arc_huf = Arc::new(create_huffman_lookup_table());
    let settings = ParserInputs {
        wanted_players: vec![],
        real_name_to_og_name: HashMap::default().into(),
        wanted_player_props: vec![],
        wanted_other_props: vec![],
        wanted_events: vec!["none".to_string()],
        collect_ticks: false,
        parse_voice: false,
        parse_ents: true,
        wanted_ticks: vec![],
        parse_projectiles: false,
        list_props: true,
        only_convars: false,
        huffman_lookup_table: &arc_huf.clone(),
        order_by_steamid: false,
        wanted_prop_states: HashMap::default().into(),
        fallback_bytes: None,
        parse_grenades: false,
        parse_weapons: false,
        vector_props_as_lists: false,
        grenade_classes: None,
    };
    let mut parser = Parser::new(settings, ForceSingleThreaded);

    let output = match parser.parse_demo(&fileBytes) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let v = Vec::from_iter(output.uniq_prop_names.iter());
    match serde_wasm_bindgen::to_value(&v) {
        Ok(s) => Ok(s),
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    }
}

#[wasm_bindgen]
pub fn parseTicks(
    file: Vec<u8>,
    wanted_props: Option<JsValue>,
    wanted_ticks: Option<Vec<i32>>,
    wanted_players: Option<JsValue>,
    struct_of_arrays: Option<bool>,
    order_by_steamid: Option<bool>,
    prop_states: Option<JsValue>,
) -> Result<JsValue, JsError> {
    let wanted_props = wanted_strings_from_js(wanted_props, "wantedProps")?;
    let wanted_players_u64 = wanted_strings_from_js(wanted_players, "wantedPlayers")?
        .iter()
        .map(|x| x.parse::<u64>().unwrap_or(0))
        .collect();
    let real_names = match rm_user_friendly_names(&wanted_props) {
        Ok(names) => names,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let (wanted_prop_states, prop_state_names) = wanted_prop_states_from_js(prop_states)?;
    let arc_huf = Arc::new(create_huffman_lookup_table());
    let mut real_name_to_og_name = HashMap::default();
    for (real_name, user_friendly_name) in real_names.iter().zip(&wanted_props) {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    for (real_name, user_friendly_name) in &prop_state_names {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    let wanted_ticks = match wanted_ticks {
        Some(t) => t,
        None => vec![],
    };
    let order_by_steamid = match order_by_steamid {
        Some(true) => true,
        _ => false,
    };
    let settings = ParserInputs {
        wanted_players: wanted_players_u64,
        real_name_to_og_name: real_name_to_og_name.into(),
        wanted_player_props: real_names.clone(),
        wanted_other_props: vec![],
        wanted_events: vec![],
        collect_ticks: true,
        parse_voice: false,
        parse_ents: true,
        wanted_ticks: wanted_ticks,
        parse_projectiles: false,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: &arc_huf.clone(),
        order_by_steamid: order_by_steamid,
        wanted_prop_states: wanted_prop_states.into_iter().collect(),
        fallback_bytes: None,
        parse_grenades: false,
        parse_weapons: false,
        vector_props_as_lists: false,
        grenade_classes: None,
    };
    let mut parser = Parser::new(settings, ForceSingleThreaded);

    let output = match parser.parse_demo(&file) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let mut prop_infos = output.prop_controller.prop_infos.clone();
    prop_infos.sort_by_key(|x| x.prop_name.clone());

    if order_by_steamid {
        let mut per_player: HashMap<String, OutputSerdeHelperStruct> = HashMap::default();
        for (steamid, inner) in output.df_per_player {
            per_player.insert(
                steamid.to_string(),
                OutputSerdeHelperStruct {
                    prop_infos: prop_infos.clone(),
                    inner: inner.into(),
                },
            );
        }
        return to_js_map_object(&per_player);
    }

    let helper = OutputSerdeHelperStruct {
        prop_infos: prop_infos,
        inner: output.df.into(),
    };

    let is_soa = match struct_of_arrays {
        Some(true) => true,
        _ => false,
    };

    if is_soa {
        to_js_value(&helper)
    } else {
        let result = soa_to_aos(helper, false);
        to_js_value(&result)
    }
}

/// Bounded-memory slice of `parseTicks` for browsers: only the fullpacket
/// segments overlapping `[tick_lo, tick_hi]` are decoded and only rows in
/// range are returned, so peak memory stays proportional to the slice —
/// never the whole demo. Same row shape as `parseTicks`.
#[wasm_bindgen]
pub fn parseTickRange(
    file: Vec<u8>,
    wanted_props: Option<JsValue>,
    tick_lo: i32,
    tick_hi: i32,
    wanted_players: Option<JsValue>,
    struct_of_arrays: Option<bool>,
    order_by_steamid: Option<bool>,
    prop_states: Option<JsValue>,
) -> Result<JsValue, JsError> {
    let wanted_props = wanted_strings_from_js(wanted_props, "wantedProps")?;
    let wanted_players_u64 = wanted_strings_from_js(wanted_players, "wantedPlayers")?
        .iter()
        .map(|x| x.parse::<u64>().unwrap_or(0))
        .collect();
    let real_names = match rm_user_friendly_names(&wanted_props) {
        Ok(names) => names,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let (wanted_prop_states, prop_state_names) = wanted_prop_states_from_js(prop_states)?;
    let arc_huf = Arc::new(create_huffman_lookup_table());
    let mut real_name_to_og_name = HashMap::default();
    for (real_name, user_friendly_name) in real_names.iter().zip(&wanted_props) {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    for (real_name, user_friendly_name) in &prop_state_names {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    let order_by_steamid = match order_by_steamid {
        Some(true) => true,
        _ => false,
    };
    let settings = ParserInputs {
        wanted_players: wanted_players_u64,
        real_name_to_og_name: real_name_to_og_name.into(),
        wanted_player_props: real_names.clone(),
        wanted_other_props: vec![],
        wanted_events: vec![],
        collect_ticks: true,
        parse_voice: false,
        parse_ents: true,
        wanted_ticks: vec![],
        parse_projectiles: false,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: &arc_huf.clone(),
        order_by_steamid: order_by_steamid,
        wanted_prop_states: wanted_prop_states.into_iter().collect(),
        fallback_bytes: None,
        parse_grenades: false,
        parse_weapons: false,
        vector_props_as_lists: false,
        grenade_classes: None,
    };
    let parser = Parser::new(settings, ForceSingleThreaded);

    let shared = match parser.preparse(&file) {
        Ok(shared) => shared,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let output = match parser.parse_tick_range(&file, shared, tick_lo, tick_hi) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let mut prop_infos = output.prop_controller.prop_infos.clone();
    prop_infos.sort_by_key(|x| x.prop_name.clone());

    if order_by_steamid {
        let mut per_player: HashMap<String, OutputSerdeHelperStruct> = HashMap::default();
        for (steamid, inner) in output.df_per_player {
            per_player.insert(
                steamid.to_string(),
                OutputSerdeHelperStruct {
                    prop_infos: prop_infos.clone(),
                    inner: inner.into(),
                },
            );
        }
        return to_js_map_object(&per_player);
    }

    let helper = OutputSerdeHelperStruct {
        prop_infos: prop_infos,
        inner: output.df.into(),
    };

    let is_soa = match struct_of_arrays {
        Some(true) => true,
        _ => false,
    };

    if is_soa {
        to_js_value(&helper)
    } else {
        let result = soa_to_aos(helper, false);
        to_js_value(&result)
    }
}
/// extra: lets you add new fields to grenades. Use list_updated_fields for a full list.
/// grenades: lets you disable non-projectile grenades. This can have a big difference on memory/speed.
/// ticks: restricts the output to these ticks (sample big fields like m_VoxelFrameData instead of every tick).
/// grenade_classes: when grenades is enabled, only emit rows for these non-projectile
/// grenade classes (e.g. inferno flames). Omit to emit every non-projectile class.
/// skip_nones: when true, omit missing props from rows instead of emitting explicit nulls.
/// Grenade rows are heterogeneous (projectiles have no fire props, burns have no
/// coordinates), so with wide extras (e.g. m_firePositions) explicit nulls multiply
/// every row. Defaults to false to preserve legacy null behavior.
#[wasm_bindgen]
pub fn parseGrenades(
    file: Vec<u8>,
    extra: Option<Vec<JsValue>>,
    grenades: Option<bool>,
    ticks: Option<Vec<i32>>,
    grenade_classes: Option<Vec<JsValue>>,
    skip_nones: Option<bool>,
) -> Result<JsValue, JsError> {
    let mut extra = wanted_strings(extra, "extra")?;
    let mut real_names = match rm_user_friendly_names(&extra) {
        Ok(names) => names,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let grenades = grenades.unwrap_or(true);
    let grenade_classes = match grenade_classes {
        Some(classes) => Some(wanted_strings(Some(classes), "grenadeClasses")?),
        None => None,
    };
    let skip_nones = skip_nones.unwrap_or(false);

    let arc_huf = Arc::new(create_huffman_lookup_table());
    let mut real_name_to_og_name = HashMap::default();
    for (real_name, user_friendly_name) in real_names.iter().zip(&extra) {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }
    let settings = ParserInputs {
        wanted_players: vec![],
        real_name_to_og_name: real_name_to_og_name.into(),
        wanted_player_props: vec![],
        wanted_other_props: real_names.clone(),
        wanted_events: vec![],
        collect_ticks: true,
        parse_voice: false,
        parse_ents: true,
        wanted_ticks: ticks.unwrap_or_default(),
        parse_projectiles: true,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: &arc_huf.clone(),
        order_by_steamid: false,
        wanted_prop_states: HashMap::default().into(),
        fallback_bytes: None,
        parse_grenades: grenades,
        parse_weapons: false,
        vector_props_as_lists: true,
        grenade_classes: grenade_classes,
    };
    let mut parser = Parser::new(settings, ForceSingleThreaded);

    let output = match parser.parse_demo(&file) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let mut prop_infos = output.prop_controller.prop_infos.clone();
    prop_infos.sort_by_key(|x| x.prop_name.clone());
    let helper = OutputSerdeHelperStruct {
        prop_infos: prop_infos,
        inner: output.df.into(),
    };
    // Grenade rows are heterogeneous (projectiles have no fire props, burns
    // have no coordinates). When skip_nones is set, missing props are omitted
    // rather than emitted as nulls: with wide extras, explicit nulls would
    // multiply every row. Defaults to false to preserve legacy null behavior.
    let result = soa_to_aos(helper, skip_nones);
    let s = match serde_wasm_bindgen::to_value(&result) {
        Ok(s) => s,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    Ok(s)
}

/// Weapons lying on the ground (no owner): dropped on death, thrown with the drop key or
/// never picked up. One row per weapon per tick; steamid/name refer to the player who dropped it.
/// extra: fields of the weapon entity (e.g. m_nDropTick). ticks: restrict the output to these ticks.
#[wasm_bindgen]
pub fn parseWeapons(file: Vec<u8>, extra: Option<Vec<JsValue>>, ticks: Option<Vec<i32>>) -> Result<JsValue, JsError> {
    let extra = wanted_strings(extra, "extra")?;
    let real_names = match rm_user_friendly_names(&extra) {
        Ok(names) => names,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let mut real_name_to_og_name = HashMap::default();
    for (real_name, user_friendly_name) in real_names.iter().zip(&extra) {
        real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
    }

    let arc_huf = Arc::new(create_huffman_lookup_table());
    let settings = ParserInputs {
        wanted_players: vec![],
        real_name_to_og_name: real_name_to_og_name.into(),
        wanted_player_props: vec![],
        wanted_other_props: real_names.clone(),
        wanted_events: vec![],
        collect_ticks: true,
        parse_voice: false,
        parse_ents: true,
        wanted_ticks: ticks.unwrap_or_default(),
        parse_projectiles: false,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: &arc_huf.clone(),
        order_by_steamid: false,
        wanted_prop_states: HashMap::default().into(),
        fallback_bytes: None,
        parse_grenades: false,
        parse_weapons: true,
        vector_props_as_lists: true,
        grenade_classes: None,
    };
    let mut parser = Parser::new(settings, ForceSingleThreaded);
    let output = match parser.parse_demo(&file) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let mut prop_infos = output.prop_controller.prop_infos.clone();
    prop_infos.sort_by_key(|x| x.prop_name.clone());
    let helper = OutputSerdeHelperStruct {
        prop_infos: prop_infos,
        inner: output.df.into(),
    };
    let result = soa_to_aos(helper, false);
    let s = match serde_wasm_bindgen::to_value(&result) {
        Ok(s) => s,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    Ok(s)
}

#[wasm_bindgen]
pub fn parseHeader(file: Vec<u8>) -> Result<JsValue, JsError> {
    let arc_huf = Arc::new(create_huffman_lookup_table());

    let settings = ParserInputs {
        wanted_players: vec![],
        real_name_to_og_name: HashMap::default().into(),
        wanted_player_props: vec![],
        wanted_other_props: vec![],
        wanted_events: vec![],
        collect_ticks: true,
        parse_voice: false,
        parse_ents: false,
        wanted_ticks: vec![],
        parse_projectiles: true,
        list_props: false,
        only_convars: false,
        huffman_lookup_table: &arc_huf.clone(),
        order_by_steamid: false,
        wanted_prop_states: HashMap::default().into(),
        fallback_bytes: None,
        parse_grenades: false,
        parse_weapons: false,
        vector_props_as_lists: false,
        grenade_classes: None,
    };
    let mut parser = FirstPassParser::new(&settings);
    let output = match parser.parse_header_only(&file) {
        Ok(output) => output,
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    };
    let mut hm: HashMap<String, String> = HashMap::default();
    hm.extend(output);
    match serde_wasm_bindgen::to_value(&hm) {
        Ok(s) => Ok(s),
        Err(e) => return Err(JsError::new(&format!("{}", e))),
    }
}

#[wasm_bindgen(typescript_custom_section)]
const CHUNK_OPTS_TYPES: &'static str = r#"
export interface ChunkOpts {
    /** Ticks mode: player prop friendly names (e.g. X, Y, Z). Grenades mode: extra prop names. */
    wantedProps: string[];
    /** Ticks mode only: keep rows where every player matches every `{ prop, state }`. `null`, `undefined`, and `[]` mean no filter; a non-empty filter is rejected in grenades mode. */
    propStates?: ChunkPropState[];
    /** Not supported by ChunkParser: rejected when non-empty. Use parseTicks instead. */
    wantedPlayers?: string[];
    /** Not supported by ChunkParser: `true` is rejected because streamed chunks cannot be ordered per player. Use parseTicks or parseTickRange. */
    orderBySteamid?: boolean;
    /** Grenades mode only: non-projectile classes to emit (e.g. ["CInferno"]). */
    grenadeClasses?: string[];
    /** Grenades mode only: emit non-projectile grenades. Default true. */
    nonProjectileGrenades?: boolean;
    /** Grenades mode only: omit missing props instead of emitting nulls. Default false. */
    skipNones?: boolean;
}

export interface ChunkPropState {
    prop: string;
    state: boolean | string | number | bigint;
}
"#;

/// Options for `ChunkParser` (the `opts` constructor argument), deserialized
/// from JS via `serde_wasm_bindgen::from_value`. Ticks mode also accepts
/// `propStates` (`{ prop, state }[]`, mirroring `parseTicks`); it is read
/// separately from the same object so BigInt states keep native semantics.
#[derive(serde::Deserialize)]
struct ChunkOpts {
    /// Ticks mode: player prop friendly names (e.g. X, Y, Z). Grenades mode:
    /// extra prop names (e.g. "m_fireCount", "m_firePositions").
    #[serde(rename = "wantedProps")]
    wanted_props: Vec<String>,
    /// Not supported: streaming cannot filter players across chunk boundaries
    /// without buffering the whole demo. Rejected when non-empty.
    #[serde(rename = "wantedPlayers")]
    wanted_players: Option<Vec<String>>,
    /// Not supported: streaming cannot order rows per player across chunk
    /// boundaries. Rejected when `true`; `false` is a no-op.
    #[serde(rename = "orderBySteamid")]
    order_by_steamid: Option<bool>,
    /// Grenades mode only: non-projectile classes to emit (e.g. ["CInferno"]).
    #[serde(rename = "grenadeClasses")]
    grenade_classes: Option<Vec<String>>,
    /// Grenades mode only: emit non-projectile grenades. Default true,
    /// mirroring the `grenades` flag of `parseGrenades`.
    #[serde(rename = "nonProjectileGrenades")]
    non_projectile_grenades: Option<bool>,
    /// Grenades mode only: omit missing props instead of emitting nulls.
    /// Default false, mirroring `parseGrenades`.
    #[serde(rename = "skipNones")]
    skip_nones: Option<bool>,
    /// Ticks mode only: `{ prop, state }[]`, mirroring `parseTicks`.
    /// Declared so the accepted shape lives on this struct; the constructor
    /// reads it through `Reflect`, not serde, so BigInt states keep native
    /// semantics. `null`/`undefined`/`[]` mean no filter.
    #[serde(rename = "propStates")]
    prop_states: Option<serde::de::IgnoredAny>,
}

/// Bounded-memory streaming handle over one demo: the file is copied into
/// wasm memory ONCE, preparsed ONCE, and each `nextChunk` call decodes exactly
/// one fullpacket segment and returns its rows — so peak memory stays
/// proportional to one segment instead of the whole demo. Row shape matches
/// `parseTicks` (ticks mode) or `parseGrenades` (grenades mode).
///
/// Grenades mode note: pass `grenadeClasses` (e.g. `["CInferno"]`) for parity
/// with one-shot `parseGrenades`. Unfiltered output also carries weapon-class
/// rows (CC4/knives/guns map to grenade types in the entity-name table), and
/// per-segment decode tracks those extra entity lifetimes differently from the
/// continuous one-shot, so unfiltered row counts can differ from
/// `parseGrenades` (every actual grenade class matches when filtered).
///
/// Limits versus one-shot parsing: props that need continuous decode
/// (stateful props such as `ducked`, velocity-derived props such as
/// `velocity_X`) are rejected, as are `wantedPlayers` and
/// `orderBySteamid: true`, because neither can be applied across chunk
/// boundaries. `propStates` is supported in ticks mode; in grenades mode
/// `null`/`undefined`/`[]` mean no filter and a non-empty filter is
/// rejected.
///
/// One handle serves exactly one mode; the consumer creates one handle per
/// pass, so one `Parser` + one preparse per handle is sufficient.
#[wasm_bindgen]
pub struct ChunkParser {
    inner: Option<ChunkParserInner>,
}

/// Owned state behind a `ChunkParser` handle. Kept in an `Option` so `free`
/// can release the demo bytes, parser, and preparse snapshot promptly while
/// leaving the JS wrapper alive to report a clear error on further use.
struct ChunkParserInner {
    file: Vec<u8>,
    parser: Parser<'static>,
    shared: SharedFirstPass,
    next_idx: usize,
    chunk_count: usize,
    skip_nones: bool,
    /// `parseTicks`/`parseGrenades`-shaped column list, computed once after
    /// preparse: temp velocity props (X/Y/Z) filtered out here, not per
    /// chunk, so chunk rows never leak implementation-only columns.
    prop_infos: Vec<PropInfo>,
}

#[wasm_bindgen]
impl ChunkParser {
    /// `file`: whole demo bytes (copied once, shared by all chunks).
    /// `mode`: "ticks" or "grenades". `wanted_ticks`: ticks mode only, the
    /// exact wanted tick list (`None`/empty means all ticks); ignored for
    /// grenades mode. `opts`: `ChunkOpts` (see the generated declarations).
    /// `propStates` is ticks mode only; `null`/`undefined`/`[]` mean no
    /// filter in both modes, and a non-empty filter is rejected in grenades
    /// mode. `wantedPlayers` (non-empty) and `orderBySteamid: true` are
    /// rejected because a streamed result cannot filter or order across
    /// chunks; use `parseTicks`/`parseTickRange` for those.
    #[wasm_bindgen(constructor)]
    pub fn new(file: Vec<u8>, mode: String, wanted_ticks: Option<Vec<i32>>, opts: JsValue) -> Result<ChunkParser, JsError> {
        let opts_value = opts.clone();
        let opts: ChunkOpts = match serde_wasm_bindgen::from_value(opts) {
            Ok(opts) => opts,
            Err(e) => return Err(JsError::new(&format!("invalid opts: {}", e))),
        };
        let is_grenades = match mode.as_str() {
            "ticks" => false,
            "grenades" => true,
            other => return Err(JsError::new(&format!("invalid mode {:?}: expected \"ticks\" or \"grenades\"", other))),
        };
        if opts.wanted_players.as_ref().is_some_and(|players| !players.is_empty()) {
            return Err(JsError::new(
                "ChunkParser does not support wantedPlayers; filter nextChunk rows by steamid or use parseTicks",
            ));
        }
        if opts.order_by_steamid == Some(true) {
            return Err(JsError::new(
                "ChunkParser does not support orderBySteamid; use parseTicks or parseTickRange",
            ));
        }
        let prop_states_value = match js_sys::Reflect::get(&opts_value, &JsValue::from_str("propStates")) {
            Ok(value) => value,
            Err(e) => return Err(JsError::new(&format!("invalid opts: {:?}", e))),
        };
        let prop_states_empty = prop_states_value.is_null()
            || prop_states_value.is_undefined()
            || (js_sys::Array::is_array(&prop_states_value)
                && js_sys::Array::from(&prop_states_value).length() == 0);
        let has_prop_states = opts.prop_states.is_some();
        let (wanted_prop_states, prop_state_names) = if is_grenades {
            if has_prop_states && !prop_states_empty {
                return Err(JsError::new("propStates is only supported in ticks mode; use parseGrenades for grenade state filtering"));
            }
            (vec![], vec![])
        } else if has_prop_states && !prop_states_empty {
            wanted_prop_states_from_js(Some(prop_states_value))?
        } else {
            (vec![], vec![])
        };
        let real_names = match rm_user_friendly_names(&opts.wanted_props) {
            Ok(names) => names,
            Err(e) => return Err(JsError::new(&format!("{}", e))),
        };
        // Props that require a continuous decode — cross-fullpacket state
        // (damage counters, duck/crouch state, ...) and velocity-derived
        // props, whose two-sample history resets at every segment head —
        // cannot be carried across per-segment streaming, so reject them
        // loudly instead of returning silently-wrong rows.
        // `parseTicks`/`parse_demo` decode continuously and serve these
        // props correctly.
        let offending = continuous_decode_required(&real_names);
        if !offending.is_empty() {
            return Err(JsError::new(&format!(
                "ChunkParser streaming cannot serve props {:?} that require cross-segment state or continuous decode (stateful props or velocity-derived props): chunked parsing cannot carry their state across segments; use parseTicks/parse_demo instead",
                offending
            )));
        }
        let mut real_name_to_og_name = HashMap::default();
        for (real_name, user_friendly_name) in real_names.iter().zip(&opts.wanted_props) {
            real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
        }
        for (real_name, user_friendly_name) in &prop_state_names {
            real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
        }
        // Shared `'static` table (see `HUFFMAN_TABLE`): no per-handle leak,
        // and the borrow outlives the stored `Parser` as required.
        let huf: &'static Vec<(u8, u8)> = HUFFMAN_TABLE.get_or_init(create_huffman_lookup_table);
        // Settings mirror `parseTicks` (ticks mode) and `parseGrenades`
        // (grenades mode) exactly so chunk rows match the one-shot shape.
        let settings = if is_grenades {
            ParserInputs {
                wanted_players: vec![],
                real_name_to_og_name: real_name_to_og_name.into(),
                wanted_player_props: vec![],
                wanted_other_props: real_names.clone(),
                wanted_events: vec![],
                collect_ticks: true,
                parse_voice: false,
                parse_ents: true,
                wanted_ticks: vec![],
                parse_projectiles: true,
                list_props: false,
                only_convars: false,
                huffman_lookup_table: huf,
                order_by_steamid: false,
                wanted_prop_states: HashMap::default().into(),
                fallback_bytes: None,
                parse_grenades: opts.non_projectile_grenades.unwrap_or(true),
                parse_weapons: false,
                vector_props_as_lists: true,
                grenade_classes: opts.grenade_classes,
            }
        } else {
            ParserInputs {
                wanted_players: vec![],
                real_name_to_og_name: real_name_to_og_name.into(),
                wanted_player_props: real_names.clone(),
                wanted_other_props: vec![],
                wanted_events: vec![],
                collect_ticks: true,
                parse_voice: false,
                parse_ents: true,
                wanted_ticks: wanted_ticks.unwrap_or_default(),
                parse_projectiles: false,
                list_props: false,
                only_convars: false,
                huffman_lookup_table: huf,
                order_by_steamid: false,
                wanted_prop_states: wanted_prop_states.into_iter().collect(),
                fallback_bytes: None,
                parse_grenades: false,
                parse_weapons: false,
                vector_props_as_lists: false,
                grenade_classes: None,
            }
        };
        let parser = Parser::new(settings, ForceSingleThreaded);
        let shared = match parser.preparse(&file) {
            Ok(shared) => shared,
            Err(e) => return Err(JsError::new(&format!("{}", e))),
        };
        let chunk_count = shared.fullpacket_offsets.len();
        // Drop implementation-only temp props (X/Y/Z added to compute
        // velocity) once, mirroring `combine_outputs`, so chunk rows carry
        // exactly the `parseTicks` columns instead of leaking X/Y/Z.
        let mut prop_infos = shared.prop_controller.prop_infos.clone();
        for prop in &shared.added_temp_props {
            prop_infos.retain(|x| &x.prop_name != prop);
        }
        prop_infos.sort_by_key(|x| x.prop_name.clone());
        Ok(ChunkParser {
            inner: Some(ChunkParserInner {
                file,
                parser,
                shared,
                next_idx: 0,
                chunk_count,
                skip_nones: if is_grenades { opts.skip_nones.unwrap_or(false) } else { false },
                prop_infos,
            }),
        })
    }

    /// Number of segments (fullpacket offsets) in this demo.
    #[wasm_bindgen(getter, js_name = chunkCount)]
    pub fn chunk_count(&self) -> usize {
        self.inner.as_ref().map(|inner| inner.chunk_count).unwrap_or(0)
    }

    /// Decode the next fullpacket segment and return its rows (`undefined`
    /// once exhausted). The per-tick gate in `collect_entities` already
    /// filters rows to `wanted_ticks`, so no post-trim is needed. Errors
    /// after `free` instead of touching released state.
    ///
    /// Returns `Result<JsValue, JsError>` rather than
    /// `Result<Option<JsValue>, JsError>`: this wasm-bindgen version cannot
    /// return `Option` inside `Result`. Exhaustion is still `undefined` on
    /// the JS side, matching what `Option` would generate.
    #[wasm_bindgen(js_name = nextChunk)]
    pub fn next_chunk(&mut self) -> Result<JsValue, JsError> {
        let inner = match self.inner.as_mut() {
            Some(inner) => inner,
            None => return Err(JsError::new("ChunkParser has been freed")),
        };
        if inner.next_idx >= inner.chunk_count {
            return Ok(JsValue::UNDEFINED);
        }
        let idx = inner.next_idx;
        inner.next_idx += 1;
        let segment = {
            // `ChunkIter` owns its snapshot, so hand it a clone. The per-segment
            // `SecondPassParser::new` clones the same tables again per segment, so
            // this matches the existing per-chunk clone cost (no asymptotic change).
            let mut iter = match inner.parser.iter_chunks_from(&inner.file, inner.shared.clone(), idx) {
                Ok(iter) => iter,
                Err(e) => return Err(JsError::new(&format!("{}", e))),
            };
            match iter.next() {
                Some(Ok(output)) => output,
                Some(Err(e)) => return Err(JsError::new(&format!("{}", e))),
                // Unreachable: `idx` was bounds-checked above, but report cleanly.
                None => return Ok(JsValue::UNDEFINED),
            }
        };
        // Same serialization as `parseTickRange`, with the
        // constructor-filtered prop infos (no temp X/Y/Z leak). Untyped or
        // absent columns serialize as explicit nulls via `soa_to_aos`
        // (matching the `parseTicks`/`parseGrenades` row shape), so no
        // per-chunk template accumulation is needed: a null needs no type.
        // The segment `df` is the same `AHashMap<u32, PropColumn>` type as
        // `DemoOutput`'s.
        let helper = OutputSerdeHelperStruct {
            prop_infos: inner.prop_infos.clone(),
            inner: segment.df.into(),
        };
        let result = soa_to_aos(helper, inner.skip_nones);
        to_js_value(&result)
    }

    /// Release the demo bytes, parser, and preparse snapshot promptly.
    /// Idempotent; `nextChunk` after `free` reports a clear error.
    ///
    /// Note: wasm-bindgen also generates its own `free()` (which destroys the
    /// JS wrapper); ours is emitted last in the class body, so it wins at
    /// runtime and the wrapper stays alive for the post-free error path. The
    /// struct shell itself is reclaimed by the FinalizationRegistry hook.
    pub fn free(&mut self) {
        self.inner = None;
    }
}

impl Drop for ChunkParser {
    /// Safety net so a handle dropped without `free` still releases its
    /// (potentially large) demo bytes and snapshot promptly.
    fn drop(&mut self) {
        self.inner = None;
    }
}
