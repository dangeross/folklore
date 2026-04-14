# Sound: Ambient Audio and Effects

Sound in folklore is synthesised client-side using Strudel (a TidalCycles-style live-coding language built on WebAudio). No audio files are required for basic sounds — built-in oscillators and noise work instantly. For richer soundscapes, sample presets provide hundreds of named audio samples.

This guide covers sound events, sound types, sample presets, sound as an action type, and tempo control.

> ▶ **Try it:** Import [tides-end-08-sound.json](tutorials/tides-end-08-sound.json) to explore these concepts in a working world.

---

## Sound Events

A sound is defined as a `type: sound` event with a unique `d`-tag. It describes a reusable sound recipe using tags that map to Strudel chain methods. Sound events are never discovered via relay filtering — they are referenced by `a`-tag from other events.

```json
{
  "kind": 30078,
  "tags": [
    ["d",          "my-world:sound:cave-drone"],
    ["t",          "my-world"],
    ["type",       "sound"],
    ["note",       "c2 ~ ~ ~"],
    ["oscillator", "sawtooth"],
    ["lpf",        "200"],
    ["slow",       "4"],
    ["gain",       "0.4"]
  ],
  "content": ""
}
```

Every sound event needs a source tag: `s` (samples and oscillators), `note` (pitched patterns), or `noise` (white noise). Everything after modifies the source: filters, effects, timing, volume. `s` is the most versatile — it plays samples (`s("bd sd")`), oscillators (`s("sine")`), and noise types (`s("white")`).

### Source Tags

- **`note`** — a mini-notation pitch sequence: `"c2 ~ ~ ~"`, `"c5 e5 g5"`, `"fire*4"` (sample name). Always first when using oscillators.
- **`oscillator`** — waveform type: `sine` (smooth), `triangle` (warm), `sawtooth` (buzzy), `square` (hollow/retro).
- **`noise`** — white noise source with no value. Base for wind, rain, fire, static. Shape with filters.

When using a sample preset, `note` patterns can reference sample names directly: `"birds3*2 ~ birds3 ~"` plays the `birds3` sample twice, rests, plays once, rests.

### Shaping Tags

| Tag | Values | Effect |
|-----|--------|--------|
| `gain` | 0.0-1.0 | Base volume baked into the definition |
| `slow` | float > 1 | Stretch cycle — slower playback |
| `fast` | float > 1 | Compress cycle — faster playback |
| `lpf` | Hz (200-20000) | Low-pass filter — removes highs, warmer/muffled |
| `hpf` | Hz (200-20000) | High-pass filter — removes lows, thinner/airy |
| `room` | 0.0-1.0 | Reverb wet/dry mix |
| `roomsize` | 1-10 | Reverb room size |
| `sustain` | Seconds | How long each note sounds |
| `release` | Seconds | Fade-out after note ends |
| `attack` | Seconds | Fade-in time |
| `degrade-by` | 0.0-1.0 | Random note dropout per cycle — organic texture |
| `pan` | -1.0 to 1.0 | Stereo position |
| `crush` | 1-16 | Bit crush — lower = harsher distortion |

Tags are applied in declaration order to build the Strudel chain.

---

## Sound Types (Roles)

Sounds are played by placing `sound` tags on events (places, items, features, etc.). The `sound` tag references a sound event and assigns it a role:

```json
["sound", "<sound-a-tag>", "<role>", "<volume>"]
["sound", "<sound-a-tag>", "<role>", "<volume>", "<ext-ref|''>", "<state>"]
```

The conditional form adds two elements: an event ref (or `""` for the hosting event itself) and a state to match. The sound only plays when that event is in that state.

There are three roles:

### ambient

Continuous loop. One ambient sound per place. Crossfades automatically when the player moves between rooms. Use for the dominant atmosphere of a location — waves on a beach, wind in a cave, rain in a forest.

```json
["sound", "30078:<PUBKEY>:my-world:sound:beach-waves", "ambient", "0.7"]
```

### layer

Continuous loop added on top of the mix. Multiple layers can play simultaneously. Use for secondary atmospheric elements that stack with the ambient — seagulls at a dock, a humming lamp, dripping water. Layers can be gated by state (only play when an event is in a specific state).

```json
// Self state gate — layer plays when the lamp item is in state "on"
["sound", "30078:<PUBKEY>:my-world:sound:lamp-hum", "layer", "0.3", "", "on"]

// External state gate — alarm layer plays on every place while power is faulted
["sound", "30078:<PUBKEY>:my-world:sound:alarm", "layer", "0.5",
  "30078:<PUBKEY>:my-world:feature:power-bus", "faulted"]
```

The fifth element is the event to check (`""` = the event hosting this tag). The sixth is the state to match.

### effect

One-shot. Fires when the event enters scope. Re-fires on re-entry. Use for short sounds tied to moments — entering a room, a consequence firing, a puzzle completing.

```json
["sound", "30078:<PUBKEY>:my-world:sound:death-jingle", "effect", "1.0"]
```

### Volume stacking

The sound event's `gain` tag bakes a base level into the definition. The play tag's `volume` controls the mix at point of use. These multiply: `finalVolume = gain x volume`. The same sound event can play at different volumes in different places.

---

## Placing Sounds on Events

Sound tags go on the events where you want them to play. Most commonly, sounds go on **places**:

```json
{
  "tags": [
    ["d",     "my-world:place:the-beach"],
    ["type",  "place"],
    ["title", "The Beach"],
    ["exit",  "east"],
    ["sound", "30078:<PUBKEY>:my-world:sound:beach-waves", "ambient", "0.7"]
  ]
}
```

When the player enters The Beach, the beach-waves sound starts playing as a continuous ambient loop. When they leave, it crossfades out.

Sounds can also go on:
- **Items** — a humming sword, a ticking clock (layer with state gate)
- **Features** — a bubbling cauldron (layer)
- **NPCs** — creature growling (layer with state gate)
- **World event** — global ambient that plays everywhere as a baseline

---

## Strudel Patterns

Sound events use Strudel mini-notation for patterns. A brief overview:

| Pattern | Meaning |
|---------|---------|
| `"c4 e4 g4"` | Three notes per cycle |
| `"c4 ~ e4 ~"` | Notes with rests (`~` = silence) |
| `"bd*4"` | Repeat sample four times per cycle |
| `"bd sd hh hh"` | Four different samples per cycle |
| `"[bd sd] hh"` | Two events in first half, one in second |
| `"bd(3,8)"` | Euclidean rhythm — 3 hits spread over 8 steps |

Mini-notation is the language for sequencing. The `slow` and `fast` tags control how quickly cycles play relative to the world BPM.

For full documentation, see the [Strudel docs](https://strudel.cc/learn/mini-notation/).

---

## Sample Presets

By default, only built-in oscillators (`sine`, `triangle`, `sawtooth`, `square`) and `noise` are available. To use named audio samples, add a `samples` tag to the world event:

```json
["samples", "dirt"]
```

### dirt

The default preset for most worlds. 217 sample banks from the TidalCycles Dirt-Samples collection. Includes drums (`bd`, `sd`, `hh`, `808`), nature sounds (`birds`, `birds3`, `fire`, `wind`, `insect`), instruments (`sax`, `gtr`, `bass`, `pluck`), and textures (`noise`, `glitch`, `space`, `industrial`).

### classic

53 acoustic and orchestral samples from VCSL (CC0 licensed). Includes recorder, ocarina, saxophone, harmonica, pipe organ, timpani, bongo, conga, and more. Best for medieval or acoustic settings.

### Custom sample packs

Any GitHub repository with a `strudel.json` index can be loaded:

```json
["samples", "github:my-username/my-world-sounds"]
```

Sample libraries load asynchronously on world start. Patterns using samples wait until files are fetched. Design accordingly — oscillator-based sounds work instantly as fallbacks.

Full sample listings are in `docs/spec/sample-presets.md`.

---

## Sound as an Action

Beyond passive sound tags, the `sound` action type lets you fire a sound at a specific moment via `on-*` triggers:

```json
["on-interact", "flip", "", "sound", "30078:<PUBKEY>:my-world:sound:pickup-chime"]
["on-complete", "",     "sound", "30078:<PUBKEY>:my-world:sound:victory-chord", "0.9"]
["on-enter",    "",     "sound", "30078:<PUBKEY>:my-world:sound:door-creak"]
```

The format follows the standard action dispatch: `["on-<trigger>", "<target>", "sound", "<sound-a-tag>", "<volume?>"]`. Volume is optional and defaults to 1.0.

Use sound actions for:
- **Interaction feedback** — a coin clink when flipping a coin, a mechanism clunk when using a lever
- **Puzzle completion** — a victory chord on solve, a wrong-answer buzz on fail
- **Combat** — impact sounds on attacks, death jingles
- **Room entry** — a door creak, a splash stepping into water

Sound actions fire the referenced sound event as a one-shot effect, regardless of the sound event's original role context.

---

## BPM Control

The `bpm` tag sets the tempo that Strudel uses for cycle timing. Place it on the world event for a global default, or on individual place events to override per-room:

```json
["bpm", "90"]    // on world event — global default (engine default: 120)
["bpm", "60"]    // on place event — slower tempo in this room
```

Individual sound events use `slow` and `fast` for relative tempo adjustment within the global BPM. A sound with `["slow", "2"]` at 90 BPM plays at effectively 45 BPM.

---

## Builder Walkthrough

To add sound to a world in the builder:

1. **Create sound events** — set type to `sound`, give it a descriptive d-tag (e.g. `my-world:sound:cave-drone`). Add source tags (`note` or `noise`), then shaping tags in order.

2. **Add `samples` to world event** — if using sample names in patterns, add `["samples", "dirt"]` or `["samples", "classic"]` to the world event.

3. **Set BPM** — add `["bpm", "90"]` to the world event (or leave default at 120).

4. **Place sound tags on events** — on the place, item, or feature where the sound should play, add a `sound` tag referencing the sound event's a-tag with role and volume.

5. **Add sound actions** — for trigger-driven sounds, add `on-interact`, `on-enter`, `on-complete` etc. with `sound` as the action type.

6. **Test** — visit each place and interact with objects to verify sounds play correctly. Check that ambients crossfade between rooms and layers stack as expected.

---

## Tips

- **Start with noise for ambients** — Filtered white noise (`noise` + `lpf`) makes convincing wind, waves, and rain with zero sample loading.
- **Use `degrade-by` for organic texture** — Random note dropout prevents loops from sounding mechanical. Values of 0.2-0.4 work well for nature sounds.
- **Layer sparingly** — Too many simultaneous layers create mud. Two or three layers maximum per place.
- **Gate layers by state** — A torch that hums only when lit, a machine that rattles only when running — state-gated layers react to player actions.
- **Keep effects short** — Use `fast` or short `sustain` values for one-shot effects. Long effects overlap awkwardly on repeated triggers.
- **Match BPM to mood** — Slow BPM (60-80) for contemplative areas. Medium (90-120) for exploration. Fast (140+) for combat or urgency.
- **Test volume balance** — Ambient at 0.5-0.7, layers at 0.2-0.4, effects at 0.6-1.0. Remember that `gain` and `volume` multiply.
- **Reverb adds space** — `room` at 0.3-0.5 with `roomsize` 2-4 gives a natural sense of environment. Higher values for caves and cathedrals.

---

## Tutorial World

> ▶ **Try it:** Import [tides-end-08-sound.json](tutorials/tides-end-08-sound.json) to play through everything covered in this guide.

The world demonstrates all sound concepts:

- **Beach** — ambient waves (filtered white noise)
- **Dock** — seagull layer (bird samples with dropout)
- **Tavern** — fire ambient (fire samples with filtering)
- **Sand Coin** — flip interaction triggers a pickup chime (sound as action, oscillator-based effect)
