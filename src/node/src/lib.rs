#![deny(clippy::all)]

#[macro_use]
extern crate napi_derive;
use ahash::AHashMap;
use memmap2::MmapOptions;
use napi::bindgen_prelude::*;
use napi::Either;
use parser::first_pass::parser_settings::rm_user_friendly_names;
use parser::first_pass::parser_settings::FirstPassParser;
use parser::first_pass::parser_settings::ParserInputs;
use parser::parse_demo::DemoOutput;
use parser::parse_demo::Parser;
use parser::second_pass::parser_settings::create_huffman_lookup_table;
use parser::second_pass::variants::soa_to_aos;
use parser::second_pass::variants::BytesVariant;
use parser::second_pass::variants::OutputSerdeHelperStruct;
use parser::second_pass::variants::Variant;
use serde_json::Value;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fs::File;
use std::hash::RandomState;
use std::result::Result;

#[napi]
#[derive(Clone)]
pub struct JsVariant(Variant);

impl FromNapiValue for JsVariant {
  unsafe fn from_napi_value(env: sys::napi_env, napi_val: sys::napi_value) -> napi::Result<Self> {
    let js_unknown = Unknown::from_napi_value(env, napi_val)?;

    match js_unknown.get_type()? {
      ValueType::Boolean => {
        let val: bool = js_unknown.cast()?;
        Ok(JsVariant(Variant::Bool(val)))
      }
      ValueType::String => {
        let val: String = js_unknown.cast()?;
        Ok(JsVariant(Variant::String(val)))
      }
      ValueType::Number => {
        let num: f64 = js_unknown.cast()?;
        if !num.is_finite() {
          return Err(Error::new(
            Status::InvalidArg,
            "Prop state numbers must be finite".to_owned(),
          ));
        }
        if num.fract() == 0.0 {
          if num >= i32::MIN as f64 && num <= i32::MAX as f64 {
            Ok(JsVariant(Variant::I32(num as i32)))
          } else if num >= u32::MIN as f64 && num <= u32::MAX as f64 {
            Ok(JsVariant(Variant::U32(num as u32)))
          } else {
            Err(Error::new(
              Status::InvalidArg,
              "Integer prop states above u32::MAX must be passed as BigInt".to_owned(),
            ))
          }
        } else {
          Ok(JsVariant(Variant::F32(num as f32)))
        }
      }
      ValueType::BigInt => {
        let bigint_val: BigInt = js_unknown.cast()?;
        let (signed, val, lossless) = bigint_val.get_u64();
        if !signed && lossless {
          Ok(JsVariant(Variant::U64(val)))
        } else {
          Err(Error::new(
            Status::InvalidArg,
            "Unsupported number type".to_owned(),
          ))
        }
      }
      _ => Err(Error::new(
        Status::InvalidArg,
        "Unsupported type for Variant".to_owned(),
      )),
    }
  }
}

impl ValidateNapiValue for JsVariant {
  unsafe fn validate(
    env: sys::napi_env,
    napi_val: sys::napi_value,
  ) -> napi::Result<sys::napi_value> {
    let value_type = Unknown::from_napi_value(env, napi_val)?.get_type()?;
    match value_type {
      ValueType::Boolean | ValueType::String | ValueType::Number | ValueType::BigInt => {
        Ok(std::ptr::null_mut())
      }
      _ => Err(Error::new(
        Status::InvalidArg,
        "Expected a boolean, string, number, or bigint for a prop state".to_owned(),
      )),
    }
  }
}

#[napi(object)]
pub struct WantedPropState {
  pub prop: String,
  pub state: JsVariant,
}

fn parse_demo(bytes: BytesVariant, parser: &mut Parser) -> Result<DemoOutput, Error> {
  match bytes {
    BytesVariant::Mmap(m) => match parser.parse_demo(&m) {
      Ok(output) => Ok(output),
      Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    },
    BytesVariant::Vec(v) => match parser.parse_demo(&v) {
      Ok(output) => Ok(output),
      Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    },
  }
}
#[napi(object)]
pub struct VoiceData {
  pub tick: i32,
  pub data: Buffer,
  pub steamid: String,
}

#[napi]
pub fn parse_voice(path_or_buf: Either<String, Buffer>) -> napi::Result<Vec<VoiceData>> {
  let bytes = resolve_byte_type(path_or_buf)?;
  let settings = ParserInputs {
    wanted_players: vec![],
    wanted_player_props: vec![],
    wanted_other_props: vec![],
    wanted_events: vec![],
    collect_ticks: false,
    parse_voice: true,
    wanted_ticks: vec![],
    wanted_prop_states: AHashMap::default(),
    real_name_to_og_name: AHashMap::default(),
    parse_ents: false,
    parse_projectiles: false,
    only_header: false,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &vec![],
    order_by_steamid: false,
    fallback_bytes: None,
    parse_grenades: false,
    grenade_classes: None,
  };
  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;
  let mut out = vec![];

  for (tick, packet) in output.voice_data {
    if let Some(data) = &packet.audio {
      out.push(VoiceData {
        data: data.voice_data().into(),
        steamid: packet.xuid().to_string(),
        tick: tick,
      });
    }
  }
  return Ok(out);
}

#[napi]
pub fn list_game_events(path_or_buf: Either<String, Buffer>) -> napi::Result<Value> {
  let bytes = resolve_byte_type(path_or_buf)?;

  let huf = create_huffman_lookup_table();
  let settings = ParserInputs {
    wanted_players: vec![],
    real_name_to_og_name: AHashMap::default(),
    wanted_player_props: vec![],
    wanted_other_props: vec![],
    wanted_prop_states: AHashMap::default(),
    wanted_events: vec!["all".to_string()],
    collect_ticks: false,
    parse_voice: false,
    parse_ents: false,
    wanted_ticks: vec![],
    parse_projectiles: false,
    only_header: false,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: None,
    parse_grenades: false,
    grenade_classes: None,
  };
  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;

  let v = Vec::from_iter(output.game_events_counter.iter());
  let s = match serde_json::to_value(v) {
    Ok(s) => s,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  Ok(s)
}
/// extra: lets you add new fields to grenades. Use list_updated_fields for a full list.
/// grenades: lets you disable non-projectile grenades. This can have a big difference on memory/speed.
/// grenade_classes: when grenades is enabled, only emit rows for these non-projectile
/// grenade classes (e.g. inferno flames). Omit to emit every non-projectile class.
/// skip_nones: when true, omit missing props from rows instead of emitting explicit nulls.
/// Grenade rows are heterogeneous (projectiles have no fire props, burns have no
/// coordinates), so with wide extras like the 64 CInferno fire nodes explicit nulls
/// multiply every row. Defaults to false to preserve legacy null behavior.
#[napi]
pub fn parse_grenades(
  path_or_buf: Either<String, Buffer>,
  extra: Option<Vec<String>>,
  grenades: Option<bool>,
  grenade_classes: Option<Vec<String>>,
  skip_nones: Option<bool>,
) -> napi::Result<Value> {
  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();
  let mut extra_props = match extra {
    Some(p) => p,
    None => vec![],
  };
  let real_extra_props = match rm_user_friendly_names(&extra_props) {
    Ok(names) => names,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  let grenades = grenades.unwrap_or(true);
  let skip_nones = skip_nones.unwrap_or(false);

  let mut real_name_to_og_name = AHashMap::default();
  for (real_name, user_friendly_name) in real_extra_props.iter().zip(&extra_props) {
    real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
  }

  let settings = ParserInputs {
    wanted_players: vec![],
    real_name_to_og_name,
    wanted_player_props: vec![],
    wanted_other_props: real_extra_props.clone(),
    wanted_events: vec![],
    collect_ticks: true,
    parse_voice: false,
    wanted_prop_states: AHashMap::default(),
    parse_ents: true,
    wanted_ticks: vec![],
    parse_projectiles: true,
    only_header: true,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: None,
    parse_grenades: grenades,
    grenade_classes: grenade_classes,
  };
  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;

  extra_props.push("tick".to_owned());
  extra_props.push("steamid".to_owned());
  extra_props.push("name".to_owned());

  let mut prop_infos = output.prop_controller.prop_infos.clone();
  prop_infos.sort_by_key(|x| x.prop_name.clone());
  extra_props.sort();

  let helper = OutputSerdeHelperStruct {
    prop_infos: prop_infos.clone(),
    inner: output.df.clone().into(),
  };
  let result = soa_to_aos(helper, skip_nones);
  match serde_json::to_value(&result) {
    Ok(s) => Ok(s),
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  }
}
#[napi]
pub fn parse_header(path_or_buf: Either<String, Buffer>) -> napi::Result<Value> {
  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();

  let settings = ParserInputs {
    real_name_to_og_name: AHashMap::default(),
    wanted_players: vec![],
    wanted_player_props: vec![],
    wanted_other_props: vec![],
    wanted_prop_states: AHashMap::default(),
    wanted_events: vec![],
    collect_ticks: true,
    parse_voice: false,
    parse_ents: false,
    wanted_ticks: vec![],
    parse_projectiles: false,
    only_header: true,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: None,
    parse_grenades: false,
    grenade_classes: None,
  };
  let mut parser = FirstPassParser::new(&settings);
  let output = match bytes {
    BytesVariant::Mmap(m) => match parser.parse_header_only(&m) {
      Ok(output) => Ok(output),
      Err(e) => Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    },
    BytesVariant::Vec(v) => match parser.parse_header_only(&v) {
      Ok(output) => Ok(output),
      Err(e) => Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    },
  }?;

  let mut hm: HashMap<String, String> = HashMap::default();
  hm.extend(output);

  let s = match serde_json::to_value(&hm) {
    Ok(s) => s,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  Ok(s)
}

#[napi]
pub fn parse_event(
  path_or_buf: Either<String, Buffer>,
  event_name: String,
  player_extra: Option<Vec<String>>,
  other_extra: Option<Vec<String>>,
  game_event_list_bytes: Option<Buffer>,
) -> napi::Result<Value> {
  let player_props = match player_extra {
    Some(p) => p,
    None => vec![],
  };
  let other_props = match other_extra {
    Some(p) => p,
    None => vec![],
  };
  let real_names_player = match rm_user_friendly_names(&player_props) {
    Ok(names) => names,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  let real_other_props = match rm_user_friendly_names(&other_props) {
    Ok(names) => names,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };

  let mut real_name_to_og_name = AHashMap::default();
  for (real_name, user_friendly_name) in real_names_player.iter().zip(&player_props) {
    real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
  }
  for (real_name, user_friendly_name) in real_other_props.iter().zip(&other_props) {
    real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
  }

  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();

  let game_event_list_bytes = if let Some(b) = game_event_list_bytes {
    Some(b.to_vec())
  } else {
    None
  };

  let settings = ParserInputs {
    real_name_to_og_name: real_name_to_og_name,
    wanted_players: vec![],
    wanted_player_props: real_names_player.clone(),
    wanted_other_props: real_other_props,
    wanted_prop_states: AHashMap::default(),
    wanted_events: vec![event_name],
    collect_ticks: false,
    parse_voice: false,
    parse_ents: true,
    wanted_ticks: vec![],
    parse_projectiles: false,
    only_header: true,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: game_event_list_bytes,
    parse_grenades: false,
    grenade_classes: None,
  };
  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;
  let s = match serde_json::to_value(&output.game_events) {
    Ok(s) => s,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  Ok(s)
}
#[napi]
pub fn parse_events(
  path_or_buf: Either<String, Buffer>,
  event_names: Option<Vec<String>>,
  player_extra: Option<Vec<String>>,
  other_extra: Option<Vec<String>>,
  game_event_list_bytes: Option<Buffer>,
) -> napi::Result<Value> {
  let event_names = match event_names {
    None => return Err(Error::new(Status::InvalidArg, "No events provided!")),
    Some(v) => v,
  };
  let player_props = match player_extra {
    Some(p) => p,
    None => vec![],
  };
  let other_props = match other_extra {
    Some(p) => p,
    None => vec![],
  };
  let real_names_player = match rm_user_friendly_names(&player_props) {
    Ok(names) => names,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  let real_other_props = match rm_user_friendly_names(&other_props) {
    Ok(names) => names,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };

  let mut real_name_to_og_name = AHashMap::default();
  for (real_name, user_friendly_name) in real_names_player.iter().zip(&player_props) {
    real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
  }
  for (real_name, user_friendly_name) in real_other_props.iter().zip(&other_props) {
    real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
  }

  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();

  let game_event_list_bytes = if let Some(b) = game_event_list_bytes {
    Some(b.to_vec())
  } else {
    None
  };

  let settings = ParserInputs {
    real_name_to_og_name: real_name_to_og_name,
    wanted_players: vec![],
    wanted_player_props: real_names_player.clone(),
    wanted_other_props: real_other_props.clone(),
    wanted_prop_states: AHashMap::default(),
    wanted_events: event_names,
    collect_ticks: false,
    parse_voice: false,
    parse_ents: true,
    wanted_ticks: vec![],
    parse_projectiles: false,
    only_header: true,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: game_event_list_bytes,
    parse_grenades: false,
    grenade_classes: None,
  };
  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;
  let s = match serde_json::to_value(&output.game_events) {
    Ok(s) => s,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  Ok(s)
}

#[napi]
pub fn parse_ticks(
  path_or_buf: Either<String, Buffer>,
  wanted_props: Vec<String>,
  wanted_ticks: Option<Vec<i32>>,
  wanted_players: Option<Vec<String>>,
  struct_of_arrays: Option<bool>,
  order_by_steamid: Option<bool>,
  prop_states: Option<Vec<WantedPropState>>,
) -> napi::Result<Value> {
  let mut real_names = match rm_user_friendly_names(&wanted_props) {
    Ok(names) => names,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  let wanted_players_u64 = match wanted_players {
    Some(v) => v.iter().map(|x| x.parse::<u64>().unwrap_or(0)).collect(),
    None => vec![],
  };
  let prop_states = prop_states.unwrap_or_default();
  let mut seen_prop_states = HashSet::new();
  for prop in &prop_states {
    if !seen_prop_states.insert(prop.prop.clone()) {
      return Err(Error::new(
        Status::InvalidArg,
        format!("Duplicate prop state for `{}`", prop.prop),
      ));
    }
  }
  let wanted_prop_states: AHashMap<String, Variant> = prop_states
    .into_iter()
    .map(|prop| (prop.prop, prop.state.0))
    .collect();
  let wanted_prop_state_names: Vec<String> = wanted_prop_states.keys().cloned().collect();
  // Node strips the `Weapon.` and `Grenade.` prefixes before the friendly-name
  // lookup, unlike the Python binding. Python is frozen, so keep this behavior.
  let real_wanted_prop_state_names = match rm_user_friendly_names(&wanted_prop_state_names) {
    Ok(names) => names,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  let mut seen_real_prop_state_names = HashSet::new();
  for real_name in &real_wanted_prop_state_names {
    if !seen_real_prop_state_names.insert(real_name.clone()) {
      return Err(Error::new(
        Status::InvalidArg,
        format!("Multiple prop states resolve to the same real name `{}`", real_name),
      ));
    }
  }
  let mut real_wanted_prop_states: AHashMap<String, Variant> = AHashMap::default();
  for (real_name, user_friendly_name) in real_wanted_prop_state_names
    .iter()
    .zip(&wanted_prop_state_names)
  {
    let Some(state) = wanted_prop_states.get(user_friendly_name) else {
      return Err(Error::new(
        Status::InvalidArg,
        format!("Missing prop state for `{}`", user_friendly_name),
      ));
    };
    real_wanted_prop_states.insert(real_name.clone(), state.clone());
  }

  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();
  let mut real_name_to_og_name = AHashMap::default();

  for (real_name, user_friendly_name) in real_names.iter().zip(&wanted_props) {
    real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
  }
  for (real_name, user_friendly_name) in real_wanted_prop_state_names
    .iter()
    .zip(&wanted_prop_state_names)
  {
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
    real_name_to_og_name: real_name_to_og_name,
    wanted_players: wanted_players_u64,
    wanted_player_props: real_names.clone(),
    wanted_other_props: vec![],
    wanted_events: vec![],
    collect_ticks: true,
    parse_voice: false,
    wanted_prop_states: real_wanted_prop_states,
    parse_ents: true,
    wanted_ticks: wanted_ticks,
    parse_projectiles: false,
    only_header: false,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: order_by_steamid,
    fallback_bytes: None,
    parse_grenades: false,
    grenade_classes: None,
  };

  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;
  real_names.push("tick".to_owned());
  real_names.push("steamid".to_owned());
  real_names.push("name".to_owned());

  let mut prop_infos = output.prop_controller.prop_infos.clone();
  prop_infos.sort_by_key(|x| x.prop_name.clone());
  real_names.sort();

  let helper = OutputSerdeHelperStruct {
    prop_infos: prop_infos.clone(),
    inner: output.df.clone().into(),
  };

  let is_soa = match struct_of_arrays {
    Some(true) => true,
    _ => false,
  };

  if order_by_steamid {
    let mut helper_hm: HashMap<u64, _, RandomState> = HashMap::default();
    for (k, v) in output.df_per_player {
      let helper = OutputSerdeHelperStruct {
        prop_infos: prop_infos.clone(),
        inner: v.into(),
      };
      helper_hm.insert(k, helper);
    }
    let s = match serde_json::to_value(helper_hm) {
      Ok(s) => s,
      Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    };
    return Ok(s);
  }
  if is_soa {
    let s = match serde_json::to_value(&helper) {
      Ok(s) => s,
      Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    };
    return Ok(s);
  } else {
    let result = soa_to_aos(helper, false);
    let s = match serde_json::to_value(&result) {
      Ok(s) => s,
      Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    };
    Ok(s)
  }
}

/// Bounded-memory slice of `parse_ticks`: only the fullpacket segments
/// overlapping `[tick_lo, tick_hi]` are decoded and only rows in range are
/// returned. Same row shape as `parse_ticks`.
#[napi]
pub fn parse_tick_range(
  path_or_buf: Either<String, Buffer>,
  wanted_props: Vec<String>,
  tick_lo: i32,
  tick_hi: i32,
  wanted_players: Option<Vec<String>>,
  struct_of_arrays: Option<bool>,
) -> napi::Result<Value> {
  let mut real_names = match rm_user_friendly_names(&wanted_props) {
    Ok(names) => names,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  let wanted_players_u64 = match wanted_players {
    Some(v) => v.iter().map(|x| x.parse::<u64>().unwrap_or(0)).collect(),
    None => vec![],
  };

  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();
  let mut real_name_to_og_name = AHashMap::default();

  for (real_name, user_friendly_name) in real_names.iter().zip(&wanted_props) {
    real_name_to_og_name.insert(real_name.clone(), user_friendly_name.clone());
  }

  let settings = ParserInputs {
    real_name_to_og_name: real_name_to_og_name,
    wanted_players: wanted_players_u64,
    wanted_player_props: real_names.clone(),
    wanted_other_props: vec![],
    wanted_events: vec![],
    collect_ticks: true,
    parse_voice: false,
    wanted_prop_states: AHashMap::default(),
    parse_ents: true,
    wanted_ticks: vec![],
    parse_projectiles: false,
    only_header: false,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: None,
    parse_grenades: false,
    grenade_classes: None,
  };

  let parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = match bytes {
    BytesVariant::Mmap(m) => {
      let shared = match parser.preparse(&m) {
        Ok(shared) => shared,
        Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
      };
      match parser.parse_tick_range(&m, shared, tick_lo, tick_hi) {
        Ok(output) => output,
        Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
      }
    }
    BytesVariant::Vec(v) => {
      let shared = match parser.preparse(&v) {
        Ok(shared) => shared,
        Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
      };
      match parser.parse_tick_range(&v, shared, tick_lo, tick_hi) {
        Ok(output) => output,
        Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
      }
    }
  };
  real_names.push("tick".to_owned());
  real_names.push("steamid".to_owned());
  real_names.push("name".to_owned());

  let mut prop_infos = output.prop_controller.prop_infos.clone();
  prop_infos.sort_by_key(|x| x.prop_name.clone());
  real_names.sort();

  let helper = OutputSerdeHelperStruct {
    prop_infos: prop_infos.clone(),
    inner: output.df.clone().into(),
  };

  let is_soa = match struct_of_arrays {
    Some(true) => true,
    _ => false,
  };

  if is_soa {
    let s = match serde_json::to_value(&helper) {
      Ok(s) => s,
      Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    };
    return Ok(s);
  } else {
    let result = soa_to_aos(helper, false);
    let s = match serde_json::to_value(&result) {
      Ok(s) => s,
      Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
    };
    Ok(s)
  }
}

#[napi]
pub fn parse_player_info(path_or_buf: Either<String, Buffer>) -> napi::Result<Value> {
  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();

  let settings = ParserInputs {
    wanted_players: vec![],
    real_name_to_og_name: AHashMap::default(),
    wanted_player_props: vec![],
    wanted_other_props: vec![],
    wanted_prop_states: AHashMap::default(),
    wanted_events: vec![],
    collect_ticks: true,
    parse_voice: false,
    parse_ents: false,
    wanted_ticks: vec![],
    parse_projectiles: false,
    only_header: true,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: None,
    parse_grenades: false,
    grenade_classes: None,
  };
  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;
  let s = match serde_json::to_value(&output.player_md) {
    Ok(s) => s,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  Ok(s)
}

#[napi]
pub fn parse_player_skins(path_or_buf: Either<String, Buffer>) -> napi::Result<Value> {
  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();

  let settings = ParserInputs {
    wanted_players: vec![],
    real_name_to_og_name: AHashMap::default(),
    wanted_player_props: vec![],
    wanted_other_props: vec![],
    wanted_prop_states: AHashMap::default(),
    wanted_events: vec![],
    collect_ticks: true,
    parse_voice: false,
    parse_ents: true,
    wanted_ticks: vec![],
    parse_projectiles: false,
    only_header: true,
    list_props: false,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: None,
    parse_grenades: false,
    grenade_classes: None,
  };
  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;
  let s = match serde_json::to_value(&output.skins) {
    Ok(s) => s,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  Ok(s)
}
#[napi]
pub fn list_updated_fields(path_or_buf: Either<String, Buffer>) -> napi::Result<Value> {
  let bytes = resolve_byte_type(path_or_buf)?;
  let huf = create_huffman_lookup_table();

  let settings = ParserInputs {
    wanted_players: vec![],
    real_name_to_og_name: AHashMap::default(),
    wanted_player_props: vec![],
    wanted_other_props: vec![],
    wanted_prop_states: AHashMap::default(),
    wanted_events: vec!["none".to_string()],
    collect_ticks: false,
    parse_voice: false,
    parse_ents: true,
    wanted_ticks: vec![],
    parse_projectiles: false,
    only_header: false,
    list_props: true,
    only_convars: false,
    huffman_lookup_table: &huf,
    order_by_steamid: false,
    fallback_bytes: None,
    parse_grenades: false,
    grenade_classes: None,
  };
  let mut parser = Parser::new(settings, parser::parse_demo::ParsingMode::Normal);
  let output = parse_demo(bytes, &mut parser)?;
  let s = match serde_json::to_value(&output.uniq_prop_names) {
    Ok(s) => s,
    Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
  };
  Ok(s)
}

fn resolve_byte_type(path_or_buf: Either<String, Buffer>) -> Result<BytesVariant, napi::Error> {
  match path_or_buf {
    Either::A(path) => {
      let file = match File::open(path.clone()) {
        Ok(f) => f,
        Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
      };
      let mmap = match unsafe { MmapOptions::new().map(&file) } {
        Ok(mmap) => mmap,
        Err(e) => return Err(Error::new(Status::InvalidArg, format!("{}", e).to_owned())),
      };
      Ok(BytesVariant::Mmap(mmap))
    }
    Either::B(buf) => Ok(BytesVariant::Vec(buf.into())),
  }
}
