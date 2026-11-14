import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseEvent,
  parseEvents,
  parseTicks,
  parsePlayerInfo,
  parseGrenades,
  listGameEvents,
  parseHeader,
} from '../index.js';

const demo = fileURLToPath(new URL('../../parser/test_demo.dem', import.meta.url));
const dataDir = fileURLToPath(new URL('./data/', import.meta.url));
const dataFile = (name) => join(dataDir, name);

if (!fs.existsSync(dataFile('header.json'))) {
    throw new Error(
        'tests/data/ is missing. Run `node scripts/extract-testdata.js` from src/node first; tests/data/ is gitignored and generated from src/node/tests/testdata.json.br.'
    );
}

const wantedTicks = Array.from({ length: 100000 }, (_, x) => x).filter(x => x % 100 === 0);


test('parse_event_with_props', () => {
    let event_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("eventWithProps.json"))));
    let x = parseEvent(demo, "player_death", ["X", "Y"], ["game_time", "total_rounds_played"])
    let event = JSON.stringify(x);
    assert.strictEqual(event, event_correct);
});
test('parse_events_with_props', () => {
    let event_correct = JSON.parse(fs.readFileSync(dataFile("eventsWithProps.json")));
    let x = parseEvents(demo, ["all"], ["X", "Y"], ["game_time", "total_rounds_played"])
    // Same-tick events complete in nondeterministic chunk order, so compare contents.
    let byJson = (events) => events.map((event) => JSON.stringify(event)).sort();
    assert.strictEqual(JSON.stringify(byJson(x)), JSON.stringify(byJson(event_correct)));
});
test('list_game_events', () => {
    let correct_events = JSON.parse(fs.readFileSync(dataFile("list_game_events.json")));
    let events_arr = listGameEvents(demo);
    assert.deepStrictEqual([...events_arr].sort(), [...correct_events].sort());
});
test('parse_header', () => {
    let correct_events = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("header.json"))));
    let event = parseHeader(demo)
    assert.strictEqual(JSON.stringify(event), correct_events);
});
test('player_info', () => {
    let correct_events = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("player_info.json"))));
    let event = parsePlayerInfo(demo)
    assert.strictEqual(JSON.stringify(event), correct_events);
});


// TICKS
test('active_weapon_skin', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/active_weapon_skin.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["active_weapon_skin"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('FORWARD', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/FORWARD.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["FORWARD"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('LEFT', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/LEFT.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["LEFT"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('RIGHT', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/RIGHT.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["RIGHT"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('BACK', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/BACK.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["BACK"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('FIRE', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/FIRE.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["FIRE"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('RIGHTCLICK', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/RIGHTCLICK.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["RIGHTCLICK"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('RELOAD', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/RELOAD.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["RELOAD"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('INSPECT', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/INSPECT.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["INSPECT"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('USE', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/USE.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["USE"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ZOOM', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ZOOM.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ZOOM"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('SCOREBOARD', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/SCOREBOARD.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["SCOREBOARD"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('WALK', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/WALK.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["WALK"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('pitch', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/pitch.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["pitch"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('yaw', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/yaw.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["yaw"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('game_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/game_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["game_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('rank', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/rank.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["rank"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('rank_if_win', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/rank_if_win.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["rank_if_win"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('rank_if_loss', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/rank_if_loss.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["rank_if_loss"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('rank_if_tie', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/rank_if_tie.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["rank_if_tie"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('mvps', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/mvps.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["mvps"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('active_weapon_original_owner', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/active_weapon_original_owner.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["active_weapon_original_owner"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('buttons', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/buttons.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["buttons"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_surrendered', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_surrendered.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_surrendered"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_rounds_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_rounds_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_rounds_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_name', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_name.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_name"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_score_overtime', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_score_overtime.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_score_overtime"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_match_stat', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_match_stat.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_match_stat"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_num_map_victories', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_num_map_victories.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_num_map_victories"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_score_first_half', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_score_first_half.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_score_first_half"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_score_second_half', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_score_second_half.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_score_second_half"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_clan_name', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_clan_name.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_clan_name"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_freeze_period', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_freeze_period.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_freeze_period"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_warmup_period', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_warmup_period.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_warmup_period"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('warmup_period_end', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/warmup_period_end.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["warmup_period_end"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('warmup_period_start', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/warmup_period_start.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["warmup_period_start"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_terrorist_timeout', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_terrorist_timeout.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_terrorist_timeout"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_ct_timeout', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_ct_timeout.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_ct_timeout"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('terrorist_timeout_remaining', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/terrorist_timeout_remaining.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["terrorist_timeout_remaining"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ct_timeout_remaining', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ct_timeout_remaining.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ct_timeout_remaining"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('num_terrorist_timeouts', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/num_terrorist_timeouts.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["num_terrorist_timeouts"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('num_ct_timeouts', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/num_ct_timeouts.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["num_ct_timeouts"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_technical_timeout', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_technical_timeout.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_technical_timeout"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_waiting_for_resume', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_waiting_for_resume.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_waiting_for_resume"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('match_start_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/match_start_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["match_start_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('round_start_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/round_start_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["round_start_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('restart_round_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/restart_round_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["restart_round_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_game_restart?', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_game_restart?.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_game_restart?"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('game_start_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/game_start_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["game_start_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('time_until_next_phase_start', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/time_until_next_phase_start.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["time_until_next_phase_start"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('game_phase', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/game_phase.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["game_phase"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('total_rounds_played', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/total_rounds_played.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["total_rounds_played"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('rounds_played_this_phase', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/rounds_played_this_phase.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["rounds_played_this_phase"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('hostages_remaining', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/hostages_remaining.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["hostages_remaining"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('any_hostages_reached', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/any_hostages_reached.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["any_hostages_reached"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('has_bombites', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/has_bombites.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["has_bombites"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('has_rescue_zone', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/has_rescue_zone.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["has_rescue_zone"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('has_buy_zone', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/has_buy_zone.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["has_buy_zone"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_matchmaking', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_matchmaking.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_matchmaking"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('match_making_mode', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/match_making_mode.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["match_making_mode"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_valve_dedicated_server', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_valve_dedicated_server.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_valve_dedicated_server"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('gungame_prog_weap_ct', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/gungame_prog_weap_ct.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["gungame_prog_weap_ct"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('gungame_prog_weap_t', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/gungame_prog_weap_t.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["gungame_prog_weap_t"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('spectator_slot_count', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/spectator_slot_count.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["spectator_slot_count"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_match_started', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_match_started.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_match_started"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('n_best_of_maps', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/n_best_of_maps.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["n_best_of_maps"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_bomb_dropped', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_bomb_dropped.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_bomb_dropped"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_bomb_planted', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_bomb_planted.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_bomb_planted"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('round_win_status', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/round_win_status.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["round_win_status"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('round_win_reason', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/round_win_reason.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["round_win_reason"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('terrorist_cant_buy', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/terrorist_cant_buy.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["terrorist_cant_buy"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ct_cant_buy', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ct_cant_buy.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ct_cant_buy"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('num_player_alive_ct', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/num_player_alive_ct.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["num_player_alive_ct"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('num_player_alive_t', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/num_player_alive_t.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["num_player_alive_t"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ct_losing_streak', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ct_losing_streak.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ct_losing_streak"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('t_losing_streak', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/t_losing_streak.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["t_losing_streak"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('survival_start_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/survival_start_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["survival_start_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('round_in_progress', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/round_in_progress.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["round_in_progress"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('i_bomb_site?', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/i_bomb_site?.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["i_bomb_site?"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_auto_muted', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_auto_muted.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_auto_muted"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('crosshair_code', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/crosshair_code.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["crosshair_code"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('pending_team_num', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/pending_team_num.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["pending_team_num"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('player_color', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/player_color.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["player_color"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ever_played_on_team', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ever_played_on_team.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ever_played_on_team"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('clan_name', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/clan_name.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["clan_name"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_coach_team', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_coach_team.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_coach_team"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('comp_wins', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/comp_wins.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["comp_wins"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('comp_rank_type', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/comp_rank_type.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["comp_rank_type"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_controlling_bot', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_controlling_bot.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_controlling_bot"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('has_controlled_bot_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/has_controlled_bot_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["has_controlled_bot_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('can_control_bot', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/can_control_bot.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["can_control_bot"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_alive', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_alive.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_alive"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('armor', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/armor.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["armor"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('has_defuser', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/has_defuser.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["has_defuser"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('has_helmet', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/has_helmet.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["has_helmet"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('spawn_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/spawn_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["spawn_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('death_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/death_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["death_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('score', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/score.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["score"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_connected', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_connected.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_connected"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('player_name', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/player_name.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["player_name"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('player_steamid', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/player_steamid.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["player_steamid"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fov', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fov.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fov"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('balance', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/balance.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["balance"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('start_balance', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/start_balance.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["start_balance"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('total_cash_spent', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/total_cash_spent.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["total_cash_spent"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('cash_spent_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/cash_spent_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["cash_spent_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('music_kit_id', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/music_kit_id.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["music_kit_id"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('leader_honors', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/leader_honors.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["leader_honors"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('teacher_honors', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/teacher_honors.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["teacher_honors"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('friendly_honors', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/friendly_honors.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["friendly_honors"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('kills_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/kills_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["kills_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('deaths_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/deaths_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["deaths_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('assists_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/assists_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["assists_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('alive_time_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/alive_time_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["alive_time_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('headshot_kills_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/headshot_kills_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["headshot_kills_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('damage_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/damage_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["damage_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('objective_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/objective_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["objective_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('utility_damage_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/utility_damage_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["utility_damage_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('enemies_flashed_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/enemies_flashed_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["enemies_flashed_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('equipment_value_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/equipment_value_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["equipment_value_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('money_saved_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/money_saved_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["money_saved_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('kill_reward_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/kill_reward_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["kill_reward_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('cash_earned_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/cash_earned_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["cash_earned_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('kills_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/kills_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["kills_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('deaths_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/deaths_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["deaths_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('assists_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/assists_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["assists_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('alive_time_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/alive_time_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["alive_time_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('headshot_kills_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/headshot_kills_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["headshot_kills_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ace_rounds_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ace_rounds_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ace_rounds_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('4k_rounds_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/4k_rounds_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["4k_rounds_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('3k_rounds_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/3k_rounds_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["3k_rounds_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('damage_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/damage_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["damage_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('objective_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/objective_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["objective_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('utility_damage_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/utility_damage_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["utility_damage_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('enemies_flashed_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/enemies_flashed_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["enemies_flashed_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('equipment_value_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/equipment_value_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["equipment_value_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('money_saved_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/money_saved_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["money_saved_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('kill_reward_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/kill_reward_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["kill_reward_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('cash_earned_total', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/cash_earned_total.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["cash_earned_total"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ping', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ping.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ping"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('move_collide', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/move_collide.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["move_collide"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('move_type', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/move_type.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["move_type"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('team_num', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/team_num.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["team_num"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('active_weapon', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/active_weapon.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["active_weapon"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('looking_at_weapon', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/looking_at_weapon.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["looking_at_weapon"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('holding_look_at_weapon', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/holding_look_at_weapon.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["holding_look_at_weapon"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('next_attack_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/next_attack_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["next_attack_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('duck_time_ms', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/duck_time_ms.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["duck_time_ms"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('max_speed', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/max_speed.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["max_speed"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('max_fall_velo', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/max_fall_velo.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["max_fall_velo"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('duck_amount', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/duck_amount.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["duck_amount"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('duck_speed', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/duck_speed.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["duck_speed"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('duck_overrdie', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/duck_overrdie.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["duck_overrdie"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('old_jump_pressed', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/old_jump_pressed.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["old_jump_pressed"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('jump_until', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/jump_until.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["jump_until"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('jump_velo', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/jump_velo.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["jump_velo"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fall_velo', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fall_velo.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fall_velo"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('in_crouch', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/in_crouch.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["in_crouch"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('crouch_state', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/crouch_state.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["crouch_state"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ducked', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ducked.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ducked"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ducking', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ducking.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ducking"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('in_duck_jump', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/in_duck_jump.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["in_duck_jump"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('allow_auto_movement', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/allow_auto_movement.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["allow_auto_movement"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('jump_time_ms', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/jump_time_ms.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["jump_time_ms"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('last_duck_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/last_duck_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["last_duck_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_rescuing', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_rescuing.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_rescuing"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('weapon_purchases_this_match', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/weapon_purchases_this_match.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["weapon_purchases_this_match"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('weapon_purchases_this_round', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/weapon_purchases_this_round.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["weapon_purchases_this_round"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('spotted', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/spotted.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["spotted"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('approximate_spotted_by', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/approximate_spotted_by.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["approximate_spotted_by"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('time_last_injury', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/time_last_injury.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["time_last_injury"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('direction_last_injury', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/direction_last_injury.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["direction_last_injury"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('player_state', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/player_state.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["player_state"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('passive_items', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/passive_items.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["passive_items"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_scoped', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_scoped.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_scoped"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_walking', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_walking.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_walking"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('resume_zoom', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/resume_zoom.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["resume_zoom"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_defusing', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_defusing.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_defusing"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_grabbing_hostage', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_grabbing_hostage.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_grabbing_hostage"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('blocking_use_in_progess', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/blocking_use_in_progess.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["blocking_use_in_progess"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('molotov_damage_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/molotov_damage_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["molotov_damage_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('moved_since_spawn', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/moved_since_spawn.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["moved_since_spawn"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('in_bomb_zone', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/in_bomb_zone.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["in_bomb_zone"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('in_buy_zone', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/in_buy_zone.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["in_buy_zone"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('in_no_defuse_area', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/in_no_defuse_area.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["in_no_defuse_area"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('killed_by_taser', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/killed_by_taser.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["killed_by_taser"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('move_state', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/move_state.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["move_state"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('which_bomb_zone', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/which_bomb_zone.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["which_bomb_zone"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('in_hostage_rescue_zone', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/in_hostage_rescue_zone.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["in_hostage_rescue_zone"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('stamina', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/stamina.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["stamina"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('direction', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/direction.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["direction"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('shots_fired', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/shots_fired.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["shots_fired"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('armor_value', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/armor_value.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["armor_value"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('velo_modifier', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/velo_modifier.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["velo_modifier"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('ground_accel_linear_frac_last_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/ground_accel_linear_frac_last_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["ground_accel_linear_frac_last_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('flash_duration', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/flash_duration.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["flash_duration"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('flash_max_alpha', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/flash_max_alpha.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["flash_max_alpha"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('wait_for_no_attack', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/wait_for_no_attack.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["wait_for_no_attack"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('last_place_name', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/last_place_name.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["last_place_name"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_strafing', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_strafing.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_strafing"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('round_start_equip_value', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/round_start_equip_value.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["round_start_equip_value"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('current_equip_value', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/current_equip_value.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["current_equip_value"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('health', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/health.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["health"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('life_state', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/life_state.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["life_state"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('X', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/X.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["X"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('Y', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/Y.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["Y"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('Z', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/Z.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["Z"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('active_weapon_name', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/active_weapon_name.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["active_weapon_name"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('active_weapon_ammo', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/active_weapon_ammo.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["active_weapon_ammo"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('total_ammo_left', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/total_ammo_left.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["total_ammo_left"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('item_def_idx', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/item_def_idx.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["item_def_idx"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('weapon_quality', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/weapon_quality.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["weapon_quality"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('entity_lvl', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/entity_lvl.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["entity_lvl"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('item_id_high', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/item_id_high.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["item_id_high"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('item_id_low', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/item_id_low.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["item_id_low"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('item_account_id', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/item_account_id.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["item_account_id"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('inventory_position', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/inventory_position.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["inventory_position"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_initialized', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_initialized.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_initialized"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('econ_item_attribute_def_idx', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/econ_item_attribute_def_idx.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["econ_item_attribute_def_idx"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('refundable_currency', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/refundable_currency.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["refundable_currency"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('set_bonus', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/set_bonus.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["set_bonus"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('custom_name', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/custom_name.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["custom_name"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('orig_owner_xuid_low', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/orig_owner_xuid_low.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["orig_owner_xuid_low"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('orig_owner_xuid_high', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/orig_owner_xuid_high.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["orig_owner_xuid_high"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fall_back_paint_kit', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fall_back_paint_kit.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fall_back_paint_kit"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fall_back_seed', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fall_back_seed.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fall_back_seed"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fall_back_wear', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fall_back_wear.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fall_back_wear"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fall_back_stat_track', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fall_back_stat_track.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fall_back_stat_track"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('m_iState', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/m_iState.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["m_iState"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fire_seq_start_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fire_seq_start_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fire_seq_start_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fire_seq_start_time_change', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fire_seq_start_time_change.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fire_seq_start_time_change"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_player_fire_event_primary', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_player_fire_event_primary.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_player_fire_event_primary"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('weapon_mode', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/weapon_mode.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["weapon_mode"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('accuracy_penalty', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/accuracy_penalty.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["accuracy_penalty"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('i_recoil_idx', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/i_recoil_idx.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["i_recoil_idx"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('fl_recoil_idx', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/fl_recoil_idx.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["fl_recoil_idx"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_burst_mode', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_burst_mode.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_burst_mode"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('post_pone_fire_ready_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/post_pone_fire_ready_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["post_pone_fire_ready_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_in_reload', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_in_reload.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_in_reload"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('reload_visually_complete', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/reload_visually_complete.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["reload_visually_complete"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('dropped_at_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/dropped_at_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["dropped_at_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_hauled_back', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_hauled_back.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_hauled_back"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('is_silencer_on', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/is_silencer_on.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["is_silencer_on"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('time_silencer_switch_complete', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/time_silencer_switch_complete.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["time_silencer_switch_complete"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('orig_team_number', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/orig_team_number.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["orig_team_number"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('prev_owner', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/prev_owner.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["prev_owner"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('last_shot_time', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/last_shot_time.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["last_shot_time"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('iron_sight_mode', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/iron_sight_mode.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["iron_sight_mode"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('num_empty_attacks', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/num_empty_attacks.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["num_empty_attacks"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('zoom_lvl', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/zoom_lvl.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["zoom_lvl"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('burst_shots_remaining', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/burst_shots_remaining.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["burst_shots_remaining"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('needs_bolt_action', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/needs_bolt_action.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["needs_bolt_action"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('next_primary_attack_tick', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/next_primary_attack_tick.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["next_primary_attack_tick"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('next_primary_attack_tick_ratio', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/next_primary_attack_tick_ratio.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["next_primary_attack_tick_ratio"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('next_secondary_attack_tick', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/next_secondary_attack_tick.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["next_secondary_attack_tick"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('next_secondary_attack_tick_ratio', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/next_secondary_attack_tick_ratio.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["next_secondary_attack_tick_ratio"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('inventory', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/inventory.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["inventory"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('smokegrenade_expired', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/smokegrenade_expired.json"))));
    let event = JSON.stringify(parseEvent(demo, "smokegrenade_expired"));
    assert.strictEqual(event, eventCorrect);
});
test('player_disconnect', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_disconnect.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_disconnect"));
    assert.strictEqual(event, eventCorrect);
});
test('round_freeze_end', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_freeze_end.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_freeze_end"));
    assert.strictEqual(event, eventCorrect);
});
test('hegrenade_detonate', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/hegrenade_detonate.json"))));
    let event = JSON.stringify(parseEvent(demo, "hegrenade_detonate"));
    assert.strictEqual(event, eventCorrect);
});
test('weapon_zoom', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/weapon_zoom.json"))));
    let event = JSON.stringify(parseEvent(demo, "weapon_zoom"));
    assert.strictEqual(event, eventCorrect);
});
test('round_officially_ended', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_officially_ended.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_officially_ended"));
    assert.strictEqual(event, eventCorrect);
});
test('cs_win_panel_round', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/cs_win_panel_round.json"))));
    let event = JSON.stringify(parseEvent(demo, "cs_win_panel_round"));
    assert.strictEqual(event, eventCorrect);
});
test('smokegrenade_detonate', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/smokegrenade_detonate.json"))));
    let event = JSON.stringify(parseEvent(demo, "smokegrenade_detonate"));
    assert.strictEqual(event, eventCorrect);
});
test('inferno_expire', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/inferno_expire.json"))));
    let event = JSON.stringify(parseEvent(demo, "inferno_expire"));
    assert.strictEqual(event, eventCorrect);
});
test('bomb_planted', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/bomb_planted.json"))));
    let event = JSON.stringify(parseEvent(demo, "bomb_planted"));
    assert.strictEqual(event, eventCorrect);
});
test('hltv_versioninfo', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/hltv_versioninfo.json"))));
    let event = JSON.stringify(parseEvent(demo, "hltv_versioninfo"));
    assert.strictEqual(event, eventCorrect);
});
test('announce_phase_end', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/announce_phase_end.json"))));
    let event = JSON.stringify(parseEvent(demo, "announce_phase_end"));
    assert.strictEqual(event, eventCorrect);
});
test('player_team', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_team.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_team"));
    assert.strictEqual(event, eventCorrect);
});
test('item_pickup', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/item_pickup.json"))));
    let event = JSON.stringify(parseEvent(demo, "item_pickup"));
    assert.strictEqual(event, eventCorrect);
});
test('item_equip', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/item_equip.json"))));
    let event = JSON.stringify(parseEvent(demo, "item_equip"));
    assert.strictEqual(event, eventCorrect);
});
test('bomb_pickup', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/bomb_pickup.json"))));
    let event = JSON.stringify(parseEvent(demo, "bomb_pickup"));
    assert.strictEqual(event, eventCorrect);
});
test('player_jump', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_jump.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_jump"));
    assert.strictEqual(event, eventCorrect);
});
test('cs_pre_restart', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/cs_pre_restart.json"))));
    let event = JSON.stringify(parseEvent(demo, "cs_pre_restart"));
    assert.strictEqual(event, eventCorrect);
});
test('cs_round_start_beep', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/cs_round_start_beep.json"))));
    let event = JSON.stringify(parseEvent(demo, "cs_round_start_beep"));
    assert.strictEqual(event, eventCorrect);
});
test('player_hurt', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_hurt.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_hurt"));
    assert.strictEqual(event, eventCorrect);
});
test('round_start', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_start.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_start"));
    assert.strictEqual(event, eventCorrect);
});
test('cs_round_final_beep', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/cs_round_final_beep.json"))));
    let event = JSON.stringify(parseEvent(demo, "cs_round_final_beep"));
    assert.strictEqual(event, eventCorrect);
});
test('buytime_ended', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/buytime_ended.json"))));
    let event = JSON.stringify(parseEvent(demo, "buytime_ended"));
    assert.strictEqual(event, eventCorrect);
});
test('inferno_startburn', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/inferno_startburn.json"))));
    let event = JSON.stringify(parseEvent(demo, "inferno_startburn"));
    assert.strictEqual(event, eventCorrect);
});
test('flashbang_detonate', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/flashbang_detonate.json"))));
    let event = JSON.stringify(parseEvent(demo, "flashbang_detonate"));
    assert.strictEqual(event, eventCorrect);
});
test('round_time_warning', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_time_warning.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_time_warning"));
    assert.strictEqual(event, eventCorrect);
});
test('round_announce_last_round_half', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_announce_last_round_half.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_announce_last_round_half"));
    assert.strictEqual(event, eventCorrect);
});
test('hltv_message', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/hltv_message.json"))));
    let event = JSON.stringify(parseEvent(demo, "hltv_message"));
    assert.strictEqual(event, eventCorrect);
});
test('cs_win_panel_match', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/cs_win_panel_match.json"))));
    let event = JSON.stringify(parseEvent(demo, "cs_win_panel_match"));
    assert.strictEqual(event, eventCorrect);
});
test('weapon_fire', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/weapon_fire.json"))));
    let event = JSON.stringify(parseEvent(demo, "weapon_fire"));
    assert.strictEqual(event, eventCorrect);
});
test('begin_new_match', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/begin_new_match.json"))));
    let event = JSON.stringify(parseEvent(demo, "begin_new_match"));
    assert.strictEqual(event, eventCorrect);
});
test('round_announce_match_point', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_announce_match_point.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_announce_match_point"));
    assert.strictEqual(event, eventCorrect);
});
test('bomb_beginplant', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/bomb_beginplant.json"))));
    let event = JSON.stringify(parseEvent(demo, "bomb_beginplant"));
    assert.strictEqual(event, eventCorrect);
});
test('decoy_detonate', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/decoy_detonate.json"))));
    let event = JSON.stringify(parseEvent(demo, "decoy_detonate"));
    assert.strictEqual(event, eventCorrect);
});
test('hltv_chase', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/hltv_chase.json"))));
    let event = JSON.stringify(parseEvent(demo, "hltv_chase"));
    assert.strictEqual(event, eventCorrect);
});
test('round_prestart', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_prestart.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_prestart"));
    assert.strictEqual(event, eventCorrect);
});
test('player_spawn', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_spawn.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_spawn"));
    assert.strictEqual(event, eventCorrect);
});
test('player_footstep', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_footstep.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_footstep"));
    assert.strictEqual(event, eventCorrect);
});
test('round_announce_match_start', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_announce_match_start.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_announce_match_start"));
    assert.strictEqual(event, eventCorrect);
});
test('round_end', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_end.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_end"));
    assert.strictEqual(event, eventCorrect);
});
test('round_mvp', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_mvp.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_mvp"));
    assert.strictEqual(event, eventCorrect);
});
test('rank_update', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/rank_update.json"))));
    let event = JSON.stringify(parseEvent(demo, "rank_update"));
    assert.strictEqual(event, eventCorrect);
});
test('player_blind', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_blind.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_blind"));
    assert.strictEqual(event, eventCorrect);
});
test('round_poststart', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/round_poststart.json"))));
    let event = JSON.stringify(parseEvent(demo, "round_poststart"));
    assert.strictEqual(event, eventCorrect);
});
test('bomb_dropped', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/bomb_dropped.json"))));
    let event = JSON.stringify(parseEvent(demo, "bomb_dropped"));
    assert.strictEqual(event, eventCorrect);
});
test('decoy_started', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/decoy_started.json"))));
    let event = JSON.stringify(parseEvent(demo, "decoy_started"));
    assert.strictEqual(event, eventCorrect);
});
test('weapon_reload', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/weapon_reload.json"))));
    let event = JSON.stringify(parseEvent(demo, "weapon_reload"));
    assert.strictEqual(event, eventCorrect);
});
test('player_connect_full', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_connect_full.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_connect_full"));
    assert.strictEqual(event, eventCorrect);
});
test('player_death', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_death.json"))));
    let event = JSON.stringify(parseEvent(demo, "player_death"));
    assert.strictEqual(event, eventCorrect);
});
// The parser strips player_connect via REMOVEDEVENTS; empty output is expected.
test('player_connect', () => {
    let eventCorrect = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_event/player_connect.json"))));
    let event = parseEvent(demo, "player_connect");
    assert.deepStrictEqual(event, []);
    assert.strictEqual(JSON.stringify(event), eventCorrect);
});

test('velocity', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/velocity.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["velocity"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('velocity_X', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/velocity_X.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["velocity_X"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('velocity_Y', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/velocity_Y.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["velocity_Y"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});
test('velocity_Z', () => {
    let tick_correct = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("per_prop/velocity_Z.json"))));
    let ticks = JSON.stringify(parseTicks(demo, ["velocity_Z"], wantedTicks));
    assert.strictEqual(ticks, tick_correct);
});

// Default output includes CInferno fire nodes and exceeds napi's JSON value limit; cover projectiles only.
test('parse_grenades', () => {
    let correct_events = JSON.stringify(JSON.parse(fs.readFileSync(dataFile("grenades.json"))));
    let grenades = parseGrenades(demo, [], false);
    assert.ok(grenades.length > 0);
    assert.ok(grenades.every((row) => typeof row.grenade_type === 'string' && row.grenade_type.includes('Projectile')));
    assert.strictEqual(JSON.stringify(grenades), correct_events);
});
