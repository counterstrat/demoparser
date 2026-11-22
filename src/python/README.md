# counterstrat-demoparser

Fast Python bindings for parsing Counter-Strike 2 demo files. The parser is
written in Rust, and every `parse_*` method returns a
[pandas](https://pandas.pydata.org/) DataFrame.

## Install

```bash
pip install counterstrat-demoparser
```

Requires Python 3.11 or newer.

## Quickstart

```python
from counterstrat_demoparser import DemoParser

parser = DemoParser("path_to_demo.dem")

deaths = parser.parse_event(
    "player_death",
    player=["X", "Y"],
    other=["total_rounds_played"],
)

ticks = parser.parse_ticks(["X", "Y", "health"])
```

Use `parser.parse_header()` for demo metadata and
`parser.list_game_events()` to discover the event names available in a demo.

## Documentation

- [Python documentation](https://github.com/counterstrat/demoparser/tree/main/documentation/python)
- [Examples](https://github.com/counterstrat/demoparser/tree/main/examples)
- [Project README](https://github.com/counterstrat/demoparser#readme)

## Building from source

```bash
maturin develop --release
```

This installs `counterstrat-demoparser` into the active Python environment.
Run it from `src/python/` inside a virtual environment or conda environment.
