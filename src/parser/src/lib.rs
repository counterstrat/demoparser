#[cfg(test)]
pub mod e2e_test;
mod entity_handle;
pub mod first_pass;
mod generated_maps;
mod generated_message_type;
pub mod maps;
/// Re-exports the generated enum so `crate::message_type::*` stays stable.
pub mod message_type {
    pub use crate::generated_message_type::*;
}
pub mod parse_demo;
pub mod second_pass;
