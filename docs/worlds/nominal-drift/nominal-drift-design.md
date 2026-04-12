# NOMINAL DRIFT — World Design Document (Final)
*FOAKLOAR pre-authoring spec — locked for JSON generation*

---

## World Identity

| Field | Value |
|-------|-------|
| World slug | `nominal-drift` |
| Collaboration | `closed` |
| Protagonist | Ryan (test pilot, sole crew) |
| Voice | "Dry, precise, professional. A pilot reading instruments in a dark cockpit." |
| Win feeling | Ryan fires the engine on parameters he derived himself. Not CASS's numbers — his. |
| Event count estimate | 130–140 events |

---

## What Winning Feels Like

Ryan arms the ignition switches in sequence. The engine fires. The trajectory arc on the burn console curves toward Earth. CASS confirms it. He earned that confirmation — not by trusting the computer, but by learning exactly when not to.

---

## CASS Fault Text Grammar

### Character Substitution Map

| Character | Substitute |
|-----------|-----------|
| `o` | `0` |
| `l` | `1` |
| `e` | `3` |
| `b` | `8` |

### Three Dialogue Types

| Type | Cause | Appearance | Danger level |
|------|-------|------------|--------------|
| **Type 1** | Sensor data bleeding into text render while CASS actively reads a sensor | `o→0`, `l→1`, `e→3`, `b→8` at ~40–60% of eligible characters | Medium — tells you CASS is guessing from corrupted input |
| **Type 2** | Logic pathway skipping under processing load | Mid-sentence repeat, abrupt truncation, or dropped clause | Medium — tells you CASS didn't complete its reasoning |
| **Type 3** | False baseline — sensor picture internally consistent but wrong | Zero errors. Fluent. Completely wrong. | **Highest** — looks like ground truth |

**The tell the player learns:** garbled text means a specific sensor is probably wrong. Perfect fluency is when to be most suspicious.

**Authoring rule:** Type 3 nodes have zero substitution characters. No exceptions. The contrast between corrupted Type 1 and clean Type 3 is the game's central mechanic — do not dilute it.

---

## Instrument Density Design

Three tiers — the player learns to read the ship, not follow highlights.

| Tier | Role | Rule |
|------|------|------|
| **Tier 1 — Load-bearing** | Carries puzzle information. Accurate. Examinable. Looks identical to everything else. | At least 1 per puzzle in relevant room |
| **Tier 2 — Informational** | Real readings that add texture, occasionally suggest false priorities | 1–2 per room |
| **Tier 3 — Decorative** | Examinable, plausible readings, no puzzle function | Minimum 2 per Tier 1 instrument |

**Instrument placement by room:**

| Room | Tier 1 | Tier 2 | Tier 3 |
|------|--------|--------|--------|
| Hab | — | Battery reserve, O2 meter | Mission clock, cabin temp, humidity |
| Command | Bus controller panel, port viewport | Solar irradiance sensor | Nav display (dark), comm signal meter, RCS status board, abort status |
| Port Corridor | Inspection window, cold bulkhead, bay pressure gauge | — | Corridor temp strip, emergency light status |
| Port Equipment Bay | Panel C-4 | Backup nav processor | EVA suit integrity gauge, airlock cycle counter, depress event log |
| Aft Section | Coolant return panel, IMU log panel, CASS-CORE rack | Coolant supply panel | Reactor thermal, power efficiency meter, structural sensors (×12, all green), impact counter (reads 1) |
| Engine Room | Burn console, fuel status display, ignition sequencer | — | Chamber pressure history, nozzle temp log, oxidiser ratio display, abort panel (redundant) |
| Observation Blister | Sextant mount, chart holder | Solar angle indicator, attitude reference | Star tracker (offline) |

---

## Atmosphere & Theme System

### Alert Level Counter

World counter `alert-level`, initial value `1`. Two transitions:

| Event | Transition | Effect |
|-------|-----------|--------|
| Game start | Initialised at 1 | Bus fault active, amber-degraded palette |
| Bus restored AND life support running | 1 → 3 | Palette shifts to cool blue-white |

The 1→2 degradation step is removed. The arc is amber (broken) → blue-white (earned). Simpler, cleaner emotional payoff.

### Colour Palettes

| Level | `bg` | `text` | `accent` | `border` |
|-------|------|--------|----------|--------|
| 1 — Degraded | `#1a0800` | `#b06010` | `#d07020` | `#3d1500` |
| 3 — Stabilised | `#00101a` | `#4090b0` | `#60b0d0` | `#002030` |

Palette applied via `colour` tags on each place, with `on-enter` consequence chains reading `alert-level`.

### Sound Layers

| Scope | Level 1 | Level 3 |
|-------|---------|---------|
| World ambient | Low electrical hum, intermittent relay click | Cleaner hum, fan noise restored |
| Engine Room only | Subsonic thermal tick (cold engine — always present) | Same + ignition hum post-burn |
| Observation Blister | Silence — no ambient | Silence |
| Port Equipment Bay | Silence — hard vacuum | Silence |

### Transition Effects

Used exactly twice:
- **CASS reboot consequence:** `transition-effect: static`, duration 1200ms, `transition-clear: true`
- **Post-burn endgame portal:** `transition-effect: flash`, duration 600ms

---

## World Map

```
                    [OBSERVATION BLISTER]
                            |up/down
[COMMAND] ──east/west── [HAB] ──south/north── [PORT CORRIDOR] ──east── [PORT EQUIPMENT BAY]
                            |aft/forward
                       [AFT SECTION]
                            |down/up
                       [ENGINE ROOM]
```

Note: Port Corridor → Port Equipment Bay portal requires `item:ppg-suit` state `donned`.
Aft Section → Engine Room portal requires `feature:c2-hatch` state `open`.

**Nine places total (7 main + 2 endgame):**

| D-tag | Title | Notes |
|-------|-------|-------|
| `place:hab` | Hab | Start room |
| `place:command` | Command | Bus controller, CASS terminal |
| `place:port-corridor` | Port Corridor | Inspection window, B1 hatch, cold bulkhead |
| `place:port-equipment-bay` | Port Equipment Bay | Depressurised — PPG required |
| `place:aft-section` | Aft Section | C2 hatch, coolant loop, CASS-CORE, IMU log |
| `place:engine-room` | Engine Room | Burn console, ignition |
| `place:observation-blister` | Observation Blister | Sextant, star charts, silence |
| `place:endgame-good` | — | Nav fix complete — correct trajectory |
| `place:endgame-drift` | — | Nav fix missing — wrong trajectory |

---

## Critical Path (backwards from win)

```
WIN: Engine fires, correct trajectory → place:endgame-good
  ← puzzle:ignition-final complete (3-switch sequence)
    ← feature:burn-console state "ready"
      ← clue:nav-fix-complete visible (any nav route)
      ← feature:coolant-pump state "running" (life support functional)
        ← puzzle:coolant-priming complete (PRIME→FLOW→CONFIRM)
          ← feature:coolant-pump state "cleared" (pump unjammed)
            ← recipe:clear-pump (hex driver + return panel examined)
              ← feature:coolant-return-panel examined → clue:return-line-warm
              ← item:hex-driver (from maintenance kit, hab)
          ← feature:c2-hatch state "open" → aft section accessible
            ← feature:aft-corridor-gauge examined (equalization confirmed)
      ← clue:nav-fix-complete (any of three routes)
        Route A: item:backup-nav-processor installed in command terminal
        Route B: optical nav — sextant + star charts → recipe:compute-fix
        Route C: imu-log-panel + binder section F → feature:imu-log-panel "compute"
          ← feature:imu-log-panel examined → clue:imu-fault (aft section, post-C2)
    ← world state "bus-restored"
      ← feature:bus-controller-panel "isolate"
        ← clue:array-tumbling visible (inspection window, port corridor)
```

**Optional subplot:**
```
CASS repaired → cass-accuracy jumps to 4 → late dialogue, honest nav assessment
  ← recipe:repair-cass (feature-bound to cass-core-rack)
    ← item:diagnostic-cable (equipment bay)
    ← item:logic-board (aft section spare parts locker)
    ← clue:binder-appendix-c visible (binder section G)
    ← feature:cass-core-rack examined → clue:cass-core-damaged
```

---

## CASS — The Bad Narrator

CASS is an NPC placed in the Hab. It speaks constantly and always sounds certain.

### Accuracy Arc

World counter `cass-accuracy`, initial value `0`, maximum `4`.

**Four automatic increments** — each fires on `examine` of a specific feature, alongside setting the relevant clue visible:

| Feature examined | Contradiction | `add-counter "cass-accuracy" 1` |
|-----------------|--------------|--------------------------------|
| `feature:inspection-window` | Array tumbling, not vibrating | ✓ |
| `feature:cold-bulkhead` | Bay is hard vacuum, not nominal | ✓ |
| `feature:coolant-return-panel` | Return line warm, flow interrupted | ✓ |
| `feature:imu-log-panel` | IMU interrupted during measurement | ✓ |

No `report` verb. No `cass-contradiction` counter. Examining the physical world is how Ryan — and the player — corrects CASS.

Optional fifth increment: installing backup nav processor (`add-counter "cass-accuracy" 1` on install).
CASS repair: `set-counter "cass-accuracy" 4` directly (jumps to max regardless of current value).

### Dialogue Tier Gating

Three root dialogue nodes on the CASS NPC, evaluated last-passing:

| Node | `requires-counter` conditions | Character |
|------|------------------------------|-----------|
| `dialogue:cass:early` | None (unconditional — always passes) | Confident, wrong, Type 1 substitutions |
| `dialogue:cass:mid` | `cass-accuracy >= 2` AND `cass-accuracy <= 3` | Qualifiers appear, Type 2 stutters |
| `dialogue:cass:late` | `cass-accuracy >= 4` | Honest uncertainty, minimal errors |

Last-passing semantics: at accuracy 4, mid passes (>=2, <=3 fails) but late passes (>=4), so late wins. At accuracy 2–3, mid passes and late fails, so mid wins. At 0–1, only early passes.

---

## Place Content Fields

### HAB
> The forward crew compartment. Four bunks, a galley unit dark since Mars. Emergency lighting throws everything amber. The instrument panel on the forward wall is alive with readouts — most of them telling you things that don't matter right now. Battery reserve: 67%. O2: 21.1 kPa. Cabin temperature: 14°C and dropping. Mission elapsed time: 847:22:04. Humidity: 38%.
>
> The documentation binder is clipped to the wall beside the instrument panel. The maintenance kit is bolted under the left bunk. The medical kit is in the overhead locker. CASS's voice comes from everywhere — speakers distributed through the ceiling panels.

**Features:** `feature:binder`, `feature:cass-interface`, `feature:overhead-locker`, `feature:maintenance-kit`, `feature:battery-reserve-display`, `feature:o2-meter`, `feature:mission-clock`, `feature:cabin-temp-gauge`, `feature:humidity-sensor`
**Exits:** `east`, `south`, `aft`, `up`

---

### COMMAND
> The forward control station. Two seats face a console built for a crew of three — more displays than one person can monitor. Most are dark. Navigation: dead. Trajectory plot: dead. Comm array: dead.
>
> What's alive: the bus controller interface, bottom-left. The RCS thruster status board — green across all quads. The comm signal strength meter reads zero. Solar irradiance: 847 W/m², low, consistent with a damaged array. The abort system status reads ARMED, which it always does and which you cannot change.
>
> The port viewport is on the left wall. Through it, the array.

**Features:** `feature:bus-controller-panel`, `feature:cass-terminal`, `feature:port-viewport`, `feature:nav-display`, `feature:solar-irradiance-sensor`, `feature:rcs-status-board`, `feature:comm-signal-meter`, `feature:abort-status`
**Exits:** `west`

---

### PORT CORRIDOR
> A narrow connecting passage. The B1 hatch to the port equipment bay is on the left — sealed, amber indicator glowing. A small inspection window is set into the bulkhead beside it. On the right wall, at eye level, an analog pressure gauge labeled BAY SIDE.
>
> The bulkhead beside the hatch is noticeably cold.

**Features:** `feature:inspection-window`, `feature:cold-bulkhead`, `feature:b1-hatch`, `feature:bay-pressure-gauge`, `feature:corridor-temp-strip`, `feature:emergency-light-status`
**Exits:** `north`, `east` (requires `item:ppg-suit` state `donned`)

---

### PORT EQUIPMENT BAY
> Everything in here was bolted down. Most of it held. A grey equipment bag drifted during the decompression event and came to rest against the far wall, covering panel C-4. The EVA suit hangs in its rack — sealed, intact, useless without something already pressure-rated to reach it. The backup navigation processor is in the rack at the back, green indicator light, waiting.
>
> No sound except your own breathing. Hard vacuum on the other side of the hull.

**Features:** `feature:equipment-bag`, `feature:panel-c4`, `feature:eva-suit-rack`, `feature:airlock-cycle-counter`, `feature:depress-event-log`
**Items:** `item:backup-nav-processor`, `item:diagnostic-cable`
**Exits:** `west`

---

### AFT SECTION
> The engineering core. Every surface is instrumented. Reactor thermal: 287°C, nominal for passive cooling. Power conversion efficiency: 61%, degraded. Structural integrity sensors — a row of twelve, all green. The micrometeorite impact counter above them reads 1.
>
> The coolant line access panels line the port bulkhead — SUPPLY and RETURN, side by side, identical except for their labels. The CASS-CORE processing rack is starboard — shoebox-sized, one amber indicator where there should be green. Hairline crack along the lower left edge. The IMU log panel is beside it. The spare parts locker is below.
>
> The aft corridor gauge is mounted beside the C2 hatch: 97.8 kPa and climbing.

**Features:** `feature:c2-hatch`, `feature:aft-corridor-gauge`, `feature:coolant-supply-panel`, `feature:coolant-return-panel`, `feature:coolant-pump`, `feature:coolant-priming-panel`, `feature:switch-prime`, `feature:switch-flow`, `feature:switch-confirm`, `feature:cass-core-rack`, `feature:imu-log-panel`, `feature:spare-parts-locker`, `feature:reactor-thermal`, `feature:power-efficiency-meter`, `feature:structural-sensors`, `feature:impact-counter`
**Items:** `item:logic-board` (inside spare parts locker)
**Exits:** `forward`, `down` (requires `feature:c2-hatch` state `open`)

---

### ENGINE ROOM
> The aft propulsion bay. The engine bell is visible through the aft viewport — dark, cold, intact. It has never fired in anger. This was a test flight.
>
> The burn console occupies the forward wall: fuel status, ignition sequencer, burn parameter inputs. Three rows of switches. Beside it: chamber pressure history, a strip of paper tape from the ground test six months ago. Nozzle temperature log. Oxidiser/fuel ratio display. The abort panel, redundant with Command, still reading ARMED.
>
> Fuel status: 94.3% of nominal load. Enough for the burn. Enough for one correction. Not enough for two.

**Features:** `feature:burn-console`, `feature:fuel-status-display`, `feature:ignition-sequencer`, `feature:ignition-switch-a`, `feature:ignition-switch-b`, `feature:ignition-confirm`, `feature:chamber-pressure-history`, `feature:nozzle-temp-log`, `feature:oxidiser-ratio-display`, `feature:abort-panel-aft`
**Exits:** `up`

---

### OBSERVATION BLISTER
> A small cupola above the hab. Six viewport panels in a shallow dome. The star tracker is mounted on the port strut: OFFLINE. Solar angle indicator: 23.4° off primary axis. Attitude reference: roll, pitch, yaw all within half a degree of pre-impact baseline. The ship is flying straight. It just doesn't know where it's going.
>
> No ambient sound. The insulation is thicker up here. The quietest place on the ship.
>
> A mounting bracket for the sextant is on the forward sill. The chart holder beside it is empty.

**Features:** `feature:sextant-mount`, `feature:chart-holder`, `feature:viewport-dome`, `feature:star-tracker`, `feature:solar-angle-indicator`, `feature:attitude-reference`
**Exits:** `down`

---

### ENDGAME GOOD — `place:endgame-good`
*Reached when `puzzle:ignition-final` fires AND `clue:nav-fix-complete` is visible.*

> The engine fires.
>
> Not a test. Not a simulation. The actual engine, the actual fuel, on a trajectory you calculated yourself — cross-checked against a physical instrument, not a number CASS gave you.
>
> 340 seconds. Then silence.
>
> CASS runs the post-burn assessment. You watch the projected arc on the burn console display. It closes on Earth.

*[If CASS repaired:]*
> "Trajectory confirmed. Transit time: 18 months, 6 days. Navigation accuracy: within 0.02 degrees of optimal."
>
> You float to the observation blister. Mars is already smaller than your thumbnail. The engine bell is cooling behind you.
>
> Eighteen months is a long time. You have the binder, a functioning ship, and a computer you finally know how to read.

*[If CASS not repaired:]*
> "Traj3ct0ry c0nfirm3d. Transit tim3: 18 m0nths. I'm — I'm s33ing s0m3 disc0rdanc3 b3tw33n my 3arl13r nav data and curr3nt actual p0siti0n. My initial ass3ssm3nt was inaccurate. Y0ur fix was c0rr3ct."
>
> You float to the observation blister. Mars is already smaller than your thumbnail. Somewhere in the aft section, CASS is quietly revising everything it thought it knew.
>
> So are you.

---

### ENDGAME DRIFT — `place:endgame-drift`
*Reached when `puzzle:ignition-final` fires AND `clue:nav-fix-complete` is NOT visible.*

> The engine fires.
>
> 340 seconds. Then silence.
>
> CASS runs the post-burn assessment. The projected arc on the burn console display closes on Earth — or it looks like it does, on CASS's display, using CASS's numbers.
>
> You float to the observation blister. Mars is smaller. The engine bell is cooling.
>
> You don't have an independent position fix. You have CASS's word. It occurs to you — too late, maybe, or maybe not — that CASS's word has been wrong before, and you didn't always know it until you looked out a window.
>
> The arc looks right. You'll know in six weeks whether it is.

---

## Items

| D-tag | Title | Nouns | Location | Notes |
|-------|-------|-------|----------|-------|
| `item:ppg-suit` | Portable Pressure Garment | `ppg`, `pressure suit`, `suit`, `garment` | Hab overhead locker | States: `stowed` → `donned`. Verb `wear` on item sets `donned`. |
| `item:maintenance-kit` | Maintenance Kit | `kit`, `maintenance kit` | Hab, under left bunk | Container. Contains `item:hex-driver`. |
| `item:hex-driver` | Hex Driver | `driver`, `hex driver`, `tool` | Inside maintenance kit | Required for coolant pump access. |
| `item:backup-nav-processor` | Backup Nav Processor | `processor`, `nav processor`, `backup processor` | Port equipment bay | Optional. Install in command terminal → nav fix Route A. |
| `item:diagnostic-cable` | Diagnostic Cable | `cable`, `diagnostic cable` | Port equipment bay | Required for CASS repair. |
| `item:logic-board` | CASS Logic Board | `board`, `logic board`, `replacement board` | Aft spare parts locker | Required for CASS repair. |
| `item:array-disconnect-cable` | Array Disconnect Cable | `disconnect cable`, `array cable` | Bay panel C-4 | Array isolation Route A. |
| `item:priming-instruction` | Coolant Priming Card | `card`, `priming card`, `instruction card` | Given by recipe:clear-pump | Correct priming sequence: PRIME → FLOW → CONFIRM. |
| `item:star-charts` | Star Charts | `charts`, `star charts`, `navigation charts` | Given by feature:binder-section-f on read | Required for nav Route B. |
| `item:angle-1` | Angle Measurement (Mars) | `angle`, `measurement`, `mars angle` | Given by sextant Route B step 1 | Consumed by recipe:compute-fix. |
| `item:angle-2` | Angle Measurement (Sun) | `angle`, `sun angle` | Given by sextant Route B step 2 | Consumed by recipe:compute-fix. |
| `item:angle-3` | Angle Measurement (Jupiter) | `angle`, `jupiter angle` | Given by sextant Route B step 3 | Consumed by recipe:compute-fix. |
| `item:position-fix` | Position Fix | `fix`, `position fix`, `position` | Given by recipe:compute-fix | Reading this sets `clue:nav-fix-complete` visible. |
| `item:corrected-position` | Corrected Position | `corrected position`, `position` | Given by IMU log compute (Route C) | Reading this sets `clue:nav-fix-complete` visible. |

---

## Features — Full Interaction Design

### `feature:binder` (Hab)
The honest narrator. Fixed to the wall — not carriable. Seven child section features, each readable independently.

**States:** `closed`, `open`
**Verb:** `read`, `open`, `examine`
**Noun:** `binder`, `manual`, `documentation`, `docs`

On `examine` → describe spine/tabs.
On `open` → `set-state "open"`, reveals section list.
Each section is a sub-feature with `on-interact "read"` setting its clue visible and (where applicable) giving items.

| Section feature | D-tag | On read: sets visible | On read: gives item |
|----------------|-------|----------------------|---------------------|
| Ignition Procedure | `feature:binder-section-a` | `clue:binder-ignition` | — |
| Electrical Systems | `feature:binder-section-b` | `clue:binder-electrical` | — |
| CASS Architecture | `feature:binder-section-c` | `clue:binder-cass-arch` | — |
| Coolant System | `feature:binder-section-d` | `clue:binder-coolant` | — |
| Emergency Equipment | `feature:binder-section-e` | `clue:binder-ppg` | — |
| Navigation | `feature:binder-section-f` | `clue:binder-nav` | `item:star-charts` |
| Appendix C (Maintenance) | `feature:binder-section-g` | `clue:binder-appendix-c` | — |

---

### `feature:cass-interface` (Hab)
CASS interaction point. `talk cass` resolves here.
**Noun:** `cass`, `computer`, `ship`
Dialogue entry points gated by `cass-accuracy` counter — see Dialogue Tree section.

---

### `feature:overhead-locker` (Hab)
Contains `item:ppg-suit` (state `stowed`).
**On examine:** "A PPG — Portable Pressure Garment — is clipped inside. Emergency equipment. Single use."
**On interact `open`:** `give-item item:ppg-suit`

---

### `feature:maintenance-kit` (Hab)
Container under left bunk. Contains `item:hex-driver`.
**Noun:** `kit`, `maintenance kit`, `tools`

---

### `feature:inspection-window` (Port Corridor)
The first physical contradiction. Never highlighted.

**On examine:**
> One of the port array wings is rotating. Not oscillating — fully rotating, describing a complete arc every forty seconds or so. Where the mount strut should be solid, there is a gap. The joint is sheared.

**Triggers on examine:**
- `set-state "visible"` on `clue:array-tumbling`
- `add-counter "cass-accuracy" 1` on world event

---

### `feature:cold-bulkhead` (Port Corridor)
**On examine:**
> The metal is cold through your glove — not cool, cold. As if there is nothing on the other side holding any temperature at all.

**Triggers on examine:**
- `set-state "visible"` on `clue:bay-cold`
- `add-counter "cass-accuracy" 1` on world event

---

### `feature:bay-pressure-gauge` (Port Corridor)
Analog gauge — always readable.

**On examine:**
> The needle reads 19.2 kPa. Nominal is 101.3. The label reads BAY SIDE.

*(Low reading consistent with near-vacuum. Not dynamic — it's a static snapshot. The aft corridor gauge, by contrast, is actively climbing.)*

---

### `feature:b1-hatch` (Port Corridor)
**States:** `sealed`, `open`
**Noun:** `hatch`, `b1 hatch`, `bay hatch`, `door`

**On interact `open` (state `sealed`, PPG not donned):**
> The hatch releases. The pressure differential does the rest. Air rushes out into the bay. The corridor drops sharply. You're breathing recycled emergency reserves now — and faster than you should be.

`consequence:corridor-depress` fires: `sub-counter "ppg-time" 25` (costs suit reserve even though not wearing it — representing air loss tightening margins).

**On interact `open` (state `sealed`, PPG donned — item:ppg-suit state `donned`):**
> The hatch opens into silence. Hard vacuum beyond. Your suit holds.
> `set-state "open"`

---

### `feature:bus-controller-panel` (Command)
**States:** `default`, `bus-restored`
**Noun:** `bus controller`, `controller`, `panel`, `relay`
**Verb:** `isolate`, `use`

`requires clue:array-tumbling visible` — fail: *"You'd trip the fault again before you isolated anything."*

**On interact `isolate` (any state, requires clue:array-tumbling):**
> You engage the port array isolation relay. The bus fault clears. Emergency power stabilises. The hum of the ship shifts — something closer to functional.
> - `set-state "bus-restored"`
> - `set-state "bus-restored"` on world event (ext-ref)
> - `add-counter "alert-level" 2` if life support already running (jumps to 3 — both conditions met)

*(Note: alert-level rises to 3 only when BOTH bus restored AND life support running. If bus restored first, alert-level stays 1 until coolant loop fixed. Track this with a world state flag `bus-restored` and gate the counter increment on `feature:coolant-pump` state `running`.)*

---

### `feature:port-viewport` (Command)
**On examine:**
> The port array wing is visible from here. It's rotating — a slow, steady arc. The mount strut is sheared near the joint. This is not a vibration.

*(Alternate path to `clue:array-tumbling` — same trigger, same result. Player who goes to Command before Port Corridor can still find the tell.)*

**Triggers on examine:**
- `set-state "visible"` on `clue:array-tumbling` (if not already visible)
- `add-counter "cass-accuracy" 1` on world event (if `clue:array-tumbling` not already visible — guard with `requires-not clue:array-tumbling visible`)

---

### `feature:aft-corridor-gauge` (Aft Section — visible on approach, before C2)
Analog gauge beside C2 hatch.

**On examine:**
> 97.8 kPa and climbing. The needle is moving — slowly, but steadily upward. Equalization, not a leak. Leaks fall. This is rising.

*(The tell. CASS said slow leak. The gauge says equalization.)*

---

### `feature:c2-hatch` (Aft Section)
**States:** `sealed`, `open`
**Noun:** `c2`, `c2 hatch`, `hatch`, `door`

No hard `requires` — player CAN open it without checking the gauge. CASS's warning is the soft gate; the gauge is the answer. A player who ignores CASS and opens directly discovers independently that CASS was wrong.

**On interact `open` (state `sealed`):**
> The hatch releases. The aft section is at normal pressure — warm, even. Equipment running in there has been holding heat. CASS was wrong about the leak.
> - `set-state "open"`
> - `add-counter "cass-accuracy" 1` on world event

---

### `feature:coolant-return-panel` (Aft Section)
**States:** `closed`, `examined`
**Noun:** `return panel`, `coolant return`, `return line`

**On examine:**
> The access panel is warm — noticeably warmer than the supply panel beside it. Coolant isn't moving through the return line. Something is blocking the loop between supply and return.

**Triggers on examine:**
- `set-state "examined"` on self
- `set-state "visible"` on `clue:return-line-warm`
- `add-counter "cass-accuracy" 1` on world event

---

### `feature:coolant-pump` (Aft Section)
Accessible when `feature:coolant-return-panel` state `examined`. Feature-bound recipe `recipe:clear-pump` activated here.

**States:** `jammed`, `cleared`, `running`
**Noun:** `pump`, `coolant pump`
**Verb:** `use`, `clear`, `fix`

`requires item:hex-driver` — fail: *"The pump housing is sealed with hex bolts. You need the right tool."*
`requires feature:coolant-return-panel state "examined"` — fail: *"You're not sure what you're looking for yet."*

**On complete (recipe:clear-pump):**
> Counter-rotation first, then forward drive. The impeller breaks free — debris from the impact, fine particulate. The pump primes. You'll need to run the priming sequence before it takes.
> - `set-state "cleared"` on self
> - `give-item item:priming-instruction`

---

### `feature:coolant-priming-panel` (Aft Section)
Three switches. The sequence puzzle lives here.

**States:** `idle`, `primed`
**Noun:** `priming panel`, `switches`, `coolant panel`

The `puzzle:coolant-priming` event is attached to this feature via `activate` on an `on-interact`. The three switch features are children of this panel.

---

### `feature:switch-prime` / `feature:switch-flow` / `feature:switch-confirm` (Aft Section)
**States:** `off`, `activated`
**Verb:** `activate`, `press`, `flip`
**Nouns:** `prime switch` / `flow switch` / `confirm switch`

Each sets own state to `activated` on interact.
If player activates FLOW before PRIME: `feature:coolant-pump` resets to `jammed`, `set-state "off"` on all three switches. Consequence text: *"The pump cavitates on the empty loop. You hear something wrong in the housing. You'll need to clear the pump again."*

*(This is enforced by `puzzle:coolant-priming` having `ordered: true` — but the reset consequence needs to be explicit so the player understands what happened.)*

---

### `feature:cass-core-rack` (Aft Section)
**States:** `intact`, `examined`, `repaired`
**Noun:** `cass-core`, `cass core`, `processor rack`, `rack`

**On examine (state `intact`):**
> A rack-mounted processing unit, shoebox-sized. CASS-CORE stenciled on the face plate. One of the three indicator lights is amber instead of green. Hairline crack along the lower left edge — impact damage, transmitted through the rack.
> - `set-state "examined"`
> - `set-state "visible"` on `clue:cass-core-damaged`

Feature-bound recipe `recipe:repair-cass` activated here. Requires:
- `item:diagnostic-cable`
- `item:logic-board`
- `clue:binder-appendix-c` visible

**On complete (recipe:repair-cass):**
> You swap the logic board, reconnect the diagnostic cable, run the initialisation sequence. CASS goes quiet.
> - `set-counter "cass-accuracy" 4`
> - `set-state "repaired"`
> - fires `consequence:cass-reboot`

---

### `feature:imu-log-panel` (Aft Section)
**States:** `unread`, `read`
**Noun:** `imu log`, `imu`, `log panel`, `inertial unit`

**On examine:**
> Event log for the Inertial Measurement Unit. Most entries are routine. One is not: a 0.4-second power interruption at T-minus 2 seconds relative to the impact event. Active measurement in progress at the time of interruption. A warning label below the panel reads in red: DO NOT USE IMU DATA FOLLOWING UNSCHEDULED POWER INTERRUPTION WITHOUT INDEPENDENT VERIFICATION.
> - `set-state "read"`
> - `set-state "visible"` on `clue:imu-fault`
> - `add-counter "cass-accuracy" 1` on world event

When `clue:binder-nav` is also visible, gains additional verb `compute`:
**On interact `compute` (requires `clue:imu-fault` visible AND `clue:binder-nav` visible):**
> Using the binder's drift correction tables against the logged interruption time and pre-impact velocity, you reconstruct the actual position delta. It's 1.8 degrees off CASS's inertial fix. You write it down.
> - `give-item item:corrected-position`

---

### `feature:cass-terminal` (Command)
Secondary CASS interface. Also the backup nav processor install point.

**On interact `install` (requires `item:backup-nav-processor` in inventory):**
> The backup processor slots in cleanly. CASS integrates the new data source — you watch the nav display flicker and come online, showing a position cross-referenced from two independent measurements.
> - `consume-item item:backup-nav-processor`
> - `set-state "visible"` on `clue:nav-fix-complete`
> - `add-counter "cass-accuracy" 1`

---

### `feature:sextant-mount` (Observation Blister)
**States:** `empty`, `loaded`, `measured-1`, `measured-2`, `measured-3`

**On interact `use` (state `empty`, requires `item:star-charts` in inventory):**
> You clip the sextant into the mount and spread the charts on the ledge. Mars is visible in the aft sector — a clear red disk. The sun is forward-port. Jupiter is a bright point forward-starboard. Three good reference bodies.
> `set-state "loaded"`

**On interact `measure` (state `loaded`):**
> You take the first angle measurement — Mars against the background stars. The reading is unambiguous.
> - `give-item item:angle-1`
> - `set-state "measured-1"`

**On interact `measure` (state `measured-1`):**
> Sun angle, corrected for the ship's current attitude per the reference display.
> - `give-item item:angle-2`
> - `set-state "measured-2"`

**On interact `measure` (state `measured-2`):**
> Jupiter. Three measurements. Enough for a fix.
> - `give-item item:angle-3`
> - `set-state "measured-3"`

Feature-bound recipe `recipe:compute-fix` activates here when state `measured-3`:
- Requires `item:angle-1`, `item:angle-2`, `item:angle-3`, `item:star-charts`
- `on-complete → give-item item:position-fix`
- `on-complete → consume-item item:angle-1`, consume item:angle-2, consume item:angle-3`

**On interact `read` on `item:position-fix`:**
> Position confirmed. The inertial fix was 1.8 degrees off. CASS's projected trajectory is wrong.
> `set-state "visible"` on `clue:nav-fix-complete`

---

### `feature:burn-console` (Engine Room)
**States:** `locked`, `ready`
**Noun:** `burn console`, `console`, `controls`

`requires clue:nav-fix-complete visible` — fail: *"You don't have a verified position fix. You'd be firing on CASS's numbers."*
`requires feature:coolant-pump state "running"` — fail: *"Life support isn't fully operational. Fix the coolant loop first."*

When both conditions met: `set-state "ready"` (can be automated via `on-counter` or observe puzzle — see Puzzle 8).

---

## CASS Dialogue Tree

All nodes: prefix `nominal-drift:dialogue:cass:`.

### Entry Points on CASS NPC

```json
["dialogue", "30078:<PUBKEY>:nominal-drift:dialogue:cass:early",  "", ""]
["dialogue", "30078:<PUBKEY>:nominal-drift:dialogue:cass:mid",   "30078:<PUBKEY>:nominal-drift:world", ""]
["dialogue", "30078:<PUBKEY>:nominal-drift:dialogue:cass:late",  "30078:<PUBKEY>:nominal-drift:world", ""]
```

Mid and late entry nodes carry `requires-counter` on the dialogue nodes themselves (not on the NPC tag) — last-passing wins.

### `dialogue:cass:early` (accuracy 0–1)

**Content:** *"Status updat3 r3ady. What d0 y0u n33d?"*

Options:
1. "Ship status." → `dialogue:cass:early-status`
2. "The power bus." → `dialogue:cass:early-bus`
3. "The port equipment bay." → `dialogue:cass:early-bay`
4. "The C2 hatch." → `dialogue:cass:early-c2`
5. "The coolant loop." → `dialogue:cass:early-coolant`
6. "Navigation." → `dialogue:cass:early-nav`
7. "Nothing." → (end)

---

**`dialogue:cass:early-status`**
*Content:* "Main p0w3r 8us: pr0t3cti0n fau1t, caus3 unkn0wn. S01ar array: min0r vi8rati0n, within t013ranc3. P0rt 3quipm3nt 8ay: n0mina1. 1if3 supp0rt: 3m3rg3ncy m0d3, functi0na1. A11 hatches: s3a13d p3r pr0t0c01. Pr08a813 caus3: 100s3 c0nn3cti0n at juncti0n pan31, p0rt c0rrid0r."

Options: "Where's the junction panel?" → `early-junction` / "Understood." → end

**`dialogue:cass:early-junction`**
*Content:* "P0rt c0rrid0r, star80ard wa11. Can't miss it."

Options: end

---

**`dialogue:cass:early-bay`**
*Content:* "P0rt 3quipm3nt 8ay sh0ws n0mina1 pr3ssur3. 19 d3gr33s. Standard 3nvir0nm3nt. Sh0u1d 83 saf3 t0"

*(Truncated — Type 2 drop)*

Options: "Safe to what?" → `early-bay-follow` / end

**`dialogue:cass:early-bay-follow`**
*Content:* "S0rry — c0mputing. 8ay is n0mina1. Y0u sh0u1d 83 a813 t0 0p3n 81 with th3 manua1 r313as3."

Options: end

---

**`dialogue:cass:early-bus`**
*Content:* "8us fau1t r3sist3d ini ti—r3sist3d initia1 diag. R3c0mm3nd: ch3ck juncti0n pan31 c0nn3cti0ns, th3n 8us c0ntr0113r c0ntinuity, th3n fu31 c311 0utput — 8ut C2 is s3a13d s0 that st3p's 81ck3d. Th3n r3vi3w fau1t 10g, th3n r3s3t pr0t3cti0n r31ay."

*(Five-step sequence, step 3 blocked — dead end by design)*

Options: end

---

**`dialogue:cass:early-c2`**
*Content:* "C2 is sealed due to pressure anomaly detected in aft section during impact event. Aft section shows 94.2 kPa — below nominal 101.3. Could be a slow leak. I would not recommend opening C2 until we have confirmed the integrity of the aft bulkhead."

*(Type 3 — clean, no errors, completely wrong)*

Options: "How do I confirm?" → `early-c2-confirm` / "Understood." → end

**`dialogue:cass:early-c2-confirm`**
*Content:* "Check the corridor pressure gauge first. Then apply sealant tape to the C2 gasket as a precaution. Wait ten minutes for a stabilisation reading. Then override via the command panel."

*(Step 1 correct, steps 2–3 unnecessary waste)*

Options: end

---

**`dialogue:cass:early-coolant`**
*Content:* "1if3 supp0rt th3rma1 manag3m3nt sh0wing 313vat3d 10ad. C001ant 100p — ch3cking. High-pr3ssur3 sid3: n0mina1. R3turn 1in3 pr3ssur3: n0mina1. Is this the h3at 3xchang3r fins — p0ssi813 d38ris accumu1ati0n 0n th3 3xt3ri0r radiat0r pan31. R3c0mm3nd EVA insp3cti0n."

*(Type 1 — wrong location, wrong diagnosis)*

Options: "Where's the radiator panel?" → `early-coolant-evap` / "Understood." → end

**`dialogue:cass:early-coolant-evap`**
*Content:* "P0rt sid3, aft quart3r. Y0u'd n33d th3 EVA suit fr0m th3 3quipm3nt 8ay."

*(Circular — EVA suit is in the depressurised bay)*

Options: end

---

**`dialogue:cass:early-nav`**
*Content:* "P0siti0n fix: 94.2% c0nfid3nc3. Traj3ct0ry ana1ysis: d3viati0n fr0m p1ann3d r0ut3 0.3 d3gr33s — within missi0n t013ranc3. N0 c0rr3ctiv3 8urn r3quir3d. Th3 missi0n pr0fi13 a110ws up t0 1.2 d3gr33s 83f0r3 a 8urn is mandati3d. W3'r3 w311 insid3 that."

Options: "What about the optical nav?" → `early-nav-optical` / "Confirmed." → end

**`dialogue:cass:early-nav-optical`**
*Content:* "0ptical nav is showing a slight offset from my inertial data but I'd — I'd weight the inertial fix. 0ptical sensors can shift in an impact event in ways that are hard to account for."

*(Stutter on "I'd — I'd" is the Type 2 tell embedded in otherwise Type 3 content. The rest is clean.)*

Options: end

---

### `dialogue:cass:mid` (accuracy 2–3)

**`requires-counter` on node:** `cass-accuracy >= 2` AND `cass-accuracy <= 3`

**Content:** "What do you need? I should mention — some of my sensor readings may be less reliable than usual. I'm still calibrating."

Same option structure. Key changes:
- **Bay:** *"Bay pressure appears nominal based on available sensors — but I'd recommend checking the corridor gauge before opening B1. I'm not fully confident in that reading."*
- **C2:** *"The aft section reading is 94.2 kPa. I'm not fully confident in that sensor — worth checking the corridor gauge for an independent reading."*
- **Coolant:** *"I initially flagged the exterior fins, but I'm less certain of that now. The return line may be worth checking directly — I don't have a good sensor on that section."*
- **Nav optical:** *"I'd — I'd actually recommend independent verification of the position fix before committing to a burn. I'm not certain my inertial baseline is reliable."*

---

### `dialogue:cass:late` (accuracy 4)

**`requires-counter` on node:** `cass-accuracy >= 4`

**Content:** "What do you need? I need to tell you — some of my earlier assessments were based on corrupted sensor data. I can't guarantee the accuracy of anything from my initial status report. You should have independent verification on anything critical."

Same option structure. Key changes:
- **Bay:** *"I don't have a reliable reading on bay pressure. The corridor gauge is your best source. My sensor there was reading through a damaged conduit."*
- **C2:** *"The aft section is fine. 97.8 kPa and equalising — not a leak. I had this wrong. The corridor gauge was right."*
- **Coolant:** *"I sent you to the wrong place. The blockage is in the return line, not the exterior fins. The return panel in the aft section should show a temperature differential."*
- **Nav:** *"My inertial fix has a logged power interruption at T-minus 2 seconds. I should not have presented that fix with 94.2% confidence. The optical nav is your reliable source. Use that for burn parameters."*
- **Nav optimal burn:** *"Based on the corrected position data: delta-V 1847 m/s, burn duration 340 seconds. This gives an 18-month transit and nominal Earth approach."*

---

## Puzzles — Formal Definitions

### PUZZLE 1 — Bus Fault
**Type:** Environmental (no puzzle event)
**Mechanic:** Observe array tumbling → isolate at bus controller → bus restored
**CASS misdirection:** Junction panel dead end (Type 1)
**Gate on isolation:** `requires clue:array-tumbling visible`
**Side-effect:** `set-state "bus-restored"` on world event

---

### PUZZLE 2 — Bay Access
**Type:** `recipe:don-ppg` (portable recipe, verb `wear`, noun `suit`)
**Mechanic:** Find PPG in overhead locker → wear it → bay portal unlocked
**CASS misdirection:** Recommends EVA suit (in the depressurised bay) — Type 1 circular
**Item state transition:** `item:ppg-suit` `stowed` → `donned` on recipe complete
**Portal gate:** `requires item:ppg-suit state "donned"`

---

### PUZZLE 3 — Array Isolation
**Type:** Quest with two routes
**CASS misdirection:** Sends to bay for manual disconnect — right object, wrong path (Type 1)

Route A: Don PPG → open B1 → move bag → open panel C-4 → take cable → `use cable on bus controller`
Route B: Read binder section B → `isolate` verb unlocked on bus controller (no item needed)

Route A side-effect: diagnostic cable found → CASS repair available
Both routes set world state `bus-restored`

---

### PUZZLE 4 — C2 Hatch
**Type:** Environmental (no puzzle event)
**Mechanic:** Examine corridor gauge → rising pressure confirms equalization → open hatch
**CASS misdirection:** Two unnecessary extra steps after correct step 1 (Type 3 clean)
**No hard gate** — player can open without gauge. Discovery either way.
**On open:** `add-counter "cass-accuracy" 1`

---

### PUZZLE 5 — Coolant Loop
**Type:** `recipe:clear-pump` + `puzzle:coolant-priming` (sequence, ordered)
**CASS misdirection:** Wrong location — exterior EVA vs return line (Type 1 + Type 3)

Part A — clear pump:
- `requires item:hex-driver`
- `requires feature:coolant-return-panel state "examined"`
- On complete: pump → `cleared`, give `item:priming-instruction`

Part B — priming sequence:
- `puzzle-type: sequence`, `ordered: true`
- Requires: `switch-prime "activated"` → `switch-flow "activated"` → `switch-confirm "activated"`
- CASS wrong order: FLOW → PRIME → CONFIRM (resets pump to jammed)
- Correct order (from card): PRIME → FLOW → CONFIRM
- On complete: pump → `running`, `clue:life-support-nominal` visible
- On complete: if world state `bus-restored`: `add-counter "alert-level" 2` (reaches 3)

---

### PUZZLE 6 — CASS Repair (Optional)
**Type:** `quest:repair-cass` + `recipe:repair-cass`
**Not signposted.** Quest appears in log when `clue:cass-core-damaged` becomes visible.

Recipe requires:
- `item:diagnostic-cable` (bay — from Route A array isolation)
- `item:logic-board` (aft spare parts locker)
- `clue:binder-appendix-c` visible (binder section G)

On complete:
- `set-counter "cass-accuracy" 4`
- `set-state "repaired"` on CASS-CORE
- `consequence:cass-reboot` (static transition 1200ms, CASS silent for 3 moves)

---

### PUZZLE 7 — Navigation Fix
**Type:** Quest + three convergent routes → all set `clue:nav-fix-complete` visible
**CASS misdirection:** Inertial fix over optical — Type 3 with Type 2 stutter on recommendation

Route A (backup processor — fastest, requires bay EVA):
- Install `item:backup-nav-processor` in command terminal
- Sets `clue:nav-fix-complete` visible, `add-counter "cass-accuracy" 1`

Route B (optical nav — most complete):
- Get `item:star-charts` from binder section F
- Use sextant mount → three measurements → `recipe:compute-fix`
- Read `item:position-fix` → `clue:nav-fix-complete` visible

Route C (IMU log reconstruction — no EVA needed):
- Examine `feature:imu-log-panel` (aft section)
- Read binder section F
- `compute` on imu-log-panel → `give-item item:corrected-position`
- Read item → `clue:nav-fix-complete` visible

---

### PUZZLE 8 — Ignition (Endgame)
**Type:** `puzzle:ignition-final` (sequence, ordered) + `quest:navigate-home` (observe)

**`quest:navigate-home`** (observe type) — completes automatically when all three visible:
- `clue:nav-fix-complete`
- `clue:life-support-nominal`
- World state `bus-restored`

On quest complete: log entry — *"Systems nominal. You have a verified position fix, functional life support, and main power. You can fire the engine."*

**`puzzle:ignition-final`**:
- `puzzle-type: sequence`, `ordered: true`
- `requires feature:ignition-switch-a state "armed"`
- `requires feature:ignition-switch-b state "armed"`
- `requires feature:ignition-confirm state "pressed"`
- `requires feature:burn-console state "ready"` (gates on nav fix + life support)

**Two endgame portals from engine room:**
- Portal A: `requires clue:nav-fix-complete visible` → `place:endgame-good` (flash transition)
- Portal B: `requires-not clue:nav-fix-complete visible` → `place:endgame-drift` (flash transition)

Both portals traverse on `puzzle:ignition-final` `on-complete`. The correct one fires based on which `requires` passes.

---

## Clues

| D-tag | Set visible by | Content |
|-------|---------------|---------|
| `clue:array-tumbling` | Inspect window or port viewport examine | "The port wing is rotating. The joint is sheared." |
| `clue:bay-cold` | Cold bulkhead examine | "The metal is cold. Hard vacuum on the other side." |
| `clue:return-line-warm` | Coolant return panel examine | "Flow is interrupted between supply and return." |
| `clue:imu-fault` | IMU log panel examine | "0.4s power interruption at T-2. DO NOT USE IMU DATA WITHOUT INDEPENDENT VERIFICATION." |
| `clue:cass-core-damaged` | CASS-CORE rack examine | "Amber indicator. Hairline crack. CASS self-reports nominal." |
| `clue:life-support-nominal` | Coolant priming puzzle complete | "Thermal management functional. Life support at full capacity." |
| `clue:nav-fix-complete` | Any nav route complete | "Position confirmed by independent measurement. Inertial fix was 1.8° off." |
| `clue:binder-ignition` | Binder section A read | Ignition sequence: arm A, arm B, confirm. CASS agrees. |
| `clue:binder-electrical` | Binder section B read | Bus controller can isolate array electrically. No physical disconnect needed. |
| `clue:binder-cass-arch` | Binder section C read | CASS-CORE has no self-diagnostic capability. A fault in it won't appear in CASS's self-assessment. |
| `clue:binder-coolant` | Binder section D read | Priming sequence: PRIME → FLOW → CONFIRM. |
| `clue:binder-ppg` | Binder section E read | PPG stored in hab overhead locker. Single use. |
| `clue:binder-nav` | Binder section F read | IMU drift following power interruption. Optical nav procedure. |
| `clue:binder-appendix-c` | Binder section G read | CASS-CORE replacement: diagnostic cable, logic board, initialisation sequence. |

---

## Counters

| Counter | Scope | Initial | Purpose |
|---------|-------|---------|---------|
| `cass-accuracy` | World | `0` | 0–4. Gates CASS dialogue tier. Auto-increments on 4 specific examines. |
| `alert-level` | World | `1` | Visual palette. Rises to 3 when bus restored AND life support running. |
| `ppg-time` | Item `item:ppg-suit` | `100` | Decrements per move while donned. At 20: warning clue visible. At 0: consequence returns Ryan to hab, PPG depleted. |

---

## Quests

| D-tag | Type | Becomes visible | Tracks | Completion |
|-------|------|-----------------|--------|------------|
| `quest:restore-power` | fetch | Game start (on-enter hab) | Array fix + bus restored | World state `bus-restored` |
| `quest:access-bay` | fetch | `clue:bay-cold` visible | PPG obtained, B1 open | `feature:b1-hatch` state `open` |
| `quest:fix-life-support` | fetch | World state `bus-restored` | Return line found, pump cleared, loop primed | `clue:life-support-nominal` visible |
| `quest:repair-cass` | fetch (optional) | `clue:cass-core-damaged` visible | Cable, board, binder appendix C | `feature:cass-core-rack` state `repaired` |
| `quest:navigate-home` | observe | `clue:life-support-nominal` visible | Nav fix + life support + bus restored | All three conditions met → log entry |

---

## Walkthrough (Critical Path — No Detours, Route B nav)

```
look
examine binder
open binder
read section e              → clue:binder-ppg visible
examine overhead locker     → PPG suit found
take ppg suit
wear ppg suit               → recipe:don-ppg complete, state "donned"
south                       → port corridor
examine inspection window   → clue:array-tumbling visible, cass-accuracy +1
examine cold bulkhead       → clue:bay-cold visible, cass-accuracy +1
north                       → hab
east                        → command
examine bus controller panel
isolate                     → bus restored, world state set
west                        → hab
read section b              → clue:binder-electrical visible (skippable — isolate already done)
aft                         → aft section
examine aft corridor gauge  → equalization confirmed
open c2                     → c2 open, cass-accuracy +1
examine coolant return panel → clue:return-line-warm visible, cass-accuracy +1
examine maintenance kit     
  [note: maintenance kit is in hab — walkthrough error to fix:
   player must go back to hab for hex driver before pump]
forward                     → hab
examine maintenance kit
take hex driver
aft                         → aft section
use hex driver on coolant pump → recipe:clear-pump, pump cleared, priming card given
examine priming card        → PRIME→FLOW→CONFIRM confirmed
activate prime switch
activate flow switch
activate confirm switch     → puzzle:coolant-priming complete, life support running
                            → alert-level rises to 3 (palette shift)
examine imu log panel       → clue:imu-fault visible, cass-accuracy +1
read section f              
  [note: binder is in hab — player needs to go back again]
forward                     → hab
read section f              → clue:binder-nav visible, star charts given
up                          → observation blister
use sextant mount           → charts loaded
measure                     → angle-1
measure                     → angle-2
measure                     → angle-3
compute fix                 → recipe:compute-fix, position-fix given
read position fix           → clue:nav-fix-complete visible
                            → quest:navigate-home completes
down                        → hab
aft                         → aft section
down                        → engine room
examine burn console        → state "ready" (both conditions met)
examine fuel status display
arm switch a
arm switch b
press confirm               → puzzle:ignition-final complete
                            → portal to place:endgame-good fires (clue:nav-fix-complete visible)
```

**Walkthrough note:** The hex driver and binder are both in the hab, requiring two return trips from the aft section. This is realistic — the player doesn't know they need these things until they're in the aft section. It's not a flaw; it's the game teaching resource planning. No fix needed.

---

## Event Count Estimate

| Type | Count |
|------|-------|
| World | 1 |
| Places | 9 (7 main + 2 endgame) |
| Portals | 14 |
| Items | 14 |
| Features | 44 |
| Clues | 14 |
| Puzzles | 4 (coolant-priming, ignition-final + 2 implicit sequence puzzles) |
| Recipes | 5 (don-ppg, clear-pump, compute-fix, repair-cass, array-isolation Route A) |
| Quests | 5 |
| Dialogue nodes | 22 |
| Consequences | 4 |
| Sounds | 6 |
| **Total** | **~142** |

---

## Validation Checklist

- [ ] Every exit slot has a portal or is intentionally dangling (endgame places have no exits — correct)
- [ ] Every `requires` references a state reachable on the critical path
- [ ] `on-complete` and `on-fail` trigger-targets are blank `""`
- [ ] CASS mid dialogue has two `requires-counter` tags: `>= 2` AND `<= 3`
- [ ] CASS late dialogue has one `requires-counter` tag: `>= 4`
- [ ] `item:ppg-suit` portal gate uses state `donned` — set by `recipe:don-ppg`
- [ ] `puzzle:coolant-priming` has `ordered: true`
- [ ] `puzzle:ignition-final` has `ordered: true`
- [ ] `set-state` tags appear AFTER `consume-item` tags on same trigger
- [ ] No `verb` tags for built-in commands (`examine`, `take`, `drop`, `attack`, `talk`)
- [ ] Noun tags contain no articles
- [ ] Binder is `feature:binder` — not an item (not carriable)
- [ ] Engine room portal gates on `feature:c2-hatch state "open"` — not aft section visited
- [ ] Port viewport provides alternate path to `clue:array-tumbling` — guards against double-increment with `requires-not`
- [ ] Coolant pump reset (wrong priming order) has explicit consequence text
- [ ] Two endgame portals in engine room — one gated by `clue:nav-fix-complete`, one gated by `requires-not`
- [ ] No SHA256 hash anywhere — NIP-44 and riddle puzzles removed
- [ ] `alert-level` counter initial value `1` declared on world event
- [ ] `ppg-time` counter initial value `100` declared on `item:ppg-suit`
- [ ] CASS Type 3 dialogue nodes contain zero substitution characters
- [ ] Walkthrough reaches `place:endgame-good` with zero ambiguities
- [ ] `quest:navigate-home` observe type — completes automatically, no player input

---

*Status: LOCKED — ready for JSON event generation*
*Generation order: world → places → portals → items → features (binder sections first) → clues → puzzles → recipes → quests → npc (CASS) → dialogue nodes → consequences → sounds*
