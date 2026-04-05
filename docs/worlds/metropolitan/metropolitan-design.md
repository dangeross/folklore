# METROPOLITAN
### A folklore World
*London, 1863. The Metropolitan Railway. One girl. Three factions. No good endings.*

---

## Overview

World slug: `metropolitan`
Start place: `metropolitan:place:saffron-hill-court`
Inventory limit: 6 (a child's pockets)
Collaboration: closed
Colour theme: dark background, amber accent (gaslight), deep red for faction-danger states
Voice: third person, past-inflected present. "Ida steps onto the platform. The smoke has not cleared."

**~417 events across three acts. No NIP-44 puzzles. Endings are quest-completion and dialogue-flag driven.**

---

## The Story

London, 1863. The Metropolitan Railway has just opened — seven stations, Paddington to Farringdon, the first underground railway anywhere in the world. Steam locomotives in brick tunnels beneath a city that has never had to think about what lies under its feet before.

Ida is twelve or thirteen. She lives in Saffron Hill, Clerkenwell — a rookery in the shadow of Farringdon Street station, two minutes from Smithfield market. Her parents are sick. There are younger mouths. She picks pockets because she is good at it and because the alternative is worse.

One morning at King's Cross she lifts the wrong wallet. The man it belongs to is named Callow. He finds her the same day. He explains her situation without raising his voice. She works off the debt. The debt doesn't clear.

The jobs Callow gives her teach her the line. The line teaches her the city. The city teaches her that three powers run London — and that all three of them need something only she can provide.

She starts as a tool. The question is what she becomes.

---

## The Three Factions

### The Shambles
*Class: Lower. Territory: Farringdon, Smithfield, King's Cross coal yards.*

Named for the old word for a slaughterhouse. The Shambles controls the physical city — meat porters, navvies, market traders, the men who move things with their bodies. Their power is collective, organised like a union that doesn't call itself one. They are not criminals in the gentleman's sense. They are the city's muscle, and they know it.

Callow is adjacent to the Shambles — their instrument at street level, not a member of its hierarchy. The Shambles proper is represented by **Rook**, a market-floor organiser who has never once raised his voice because he has never needed to.

The Shambles give Ida protection, safe passage, and weight. She gives them reach into spaces they cannot enter and silence about things they cannot have known.

### The Quill
*Class: Middle. Territory: Baker Street, Gower Street, Portland Road.*

The professional class — lawyers, journalists, doctors, the men whose power lives in paper and reputation. The Quill does not get its hands dirty. It employs people who employ people who do. Their violence is slow, deniable, and permanent. A man ruined by the Quill does not know it happened until it has already finished.

The Quill's representative is **Aldous Fenn**, a solicitor's clerk, thirty, ambitious, careful. He recruits Ida because she can go where documents go and come back with what was in them. He treats her like an investment. He is not unkind. He is worse than unkind: he is correct.

The Quill gives Ida education, access, and the forged papers that allow her to move through London as someone else. She gives them a deniable operative in every class of carriage.

### The Concern
*Class: Upper. Territory: Paddington, Edgware Road, the railway itself.*

The Metropolitan Railway Company investors. The men who financed the tunnels and expect a return on everything. The Concern does not merely use the line — it owns it. Their power is infrastructure: they control access, they control the survey maps, they control which streets get cleared for expansion and which families find themselves without homes on a Tuesday morning.

The Concern's representative is **Harwick** — a railway company solicitor, cold and correct, whose name appears in places it shouldn't. He is the last faction Ida reaches, the highest rung, the one who offers her the most money and the most danger simultaneously.

The Concern gives Ida coin, first-class access, and the uncomfortable knowledge of how power actually moves. She gives them intelligence from the other two factions. She is their spy in worlds they do not understand and have no wish to.

---

## Ida's Progression

Ida is not aligned. She works the factions sequentially, then simultaneously, then against each other. The arc is not loyalty — it is leverage.

**Reputation is tracked per faction as counters:**
- `metropolitan:counter:rep-shambles` — builds through Shambles jobs, gates Shambles NPCs, places, and dialogue
- `metropolitan:counter:rep-quill` — builds through Quill jobs, gates Quill NPCs, places, and items
- `metropolitan:counter:rep-concern` — builds through Concern jobs, gates Concern places and endgame dialogue

Rep with one faction can cost rep with another when jobs conflict. The skill is finding jobs that pay across multiple ledgers — or damaging a faction in ways they cannot trace back to her.

---

## The Railway as Mechanic

The Metropolitan line runs west to east: Paddington → Edgware Road → Baker Street → Portland Road → Gower Street → King's Cross → Farringdon.

**Ticket-gating:** Farringdon and King's Cross are free — Ida's home territory, walkable. Every station further west requires a ticket. Tickets cost money she must earn. The line opens as her means open. Paddington is the last and most expensive unlock — the furthest point, the highest faction, the endgame.

**Carriage class:** Third class is the Shambles' world. First class is the Concern's. The Quill rides second and watches both directions. Ida starts in third. The Quill's forged service-girl papers unlock first class. By Act III she can sit anywhere without question — which is the most dangerous thing she has learned.

**Train places:** Carriages are persistent locations. The player can linger, observe, act during transit. Every job has departure-board logic — miss the train and the problem changes shape. The tunnel between stations is a place of pressure, used in Act III for encounters and no-exit narrative moments.

---

## Win States

The story ends through the choices Ida makes at the confrontation — expressed as quest completions and dialogue state flags. No cipher puzzles, no NIP-44. Three endings are possible. Each is a plain place the player reaches by earning it. The prose is the reward.

**Mechanic:** The confrontation dialogue at `metropolitan:place:garden-confrontation` presents three options gated on world state flags. Selecting one sets the corresponding choice flag, which completes `metropolitan:quest:endgame` with the matching variant, and opens the corresponding portal.

---

### Ending: EXPOSE
*Requires: `conspiracy-clear` + `evidence-found` + dialogue option sets `choice-expose`*

Quest `metropolitan:quest:endgame` completes with variant `expose`. Portal opens to `metropolitan:place:ending-expose`.

Ida takes the assembled documents to a journalist at the Times offices on Fleet Street. The story breaks in three days. The clearance is stopped — or delayed. Harwick resigns. Fenn is quietly disbarred. Callow disappears back into the rookeries he came from.

Saffron Hill survives another year.

Ida is known now. She cannot be invisible anymore. Every door that was open because no one noticed her is closed. She has traded her greatest asset for the city's gratitude, which is worth nothing and everything depending on the day.

---

### Ending: BURY
*Requires: dialogue option sets `choice-bury` (available regardless of rep combination)*

Quest `metropolitan:quest:endgame` completes with variant `bury`. Portal opens to `metropolitan:place:ending-bury`.

Ida negotiates. The documents stay buried. In exchange: the clearance schedule is quietly revised. Saffron Hill is not on the final list. Her family is safe. She takes money from all three factions to stay quiet — and leverage over all three to stay alive.

She is more powerful than she has ever been and she tells no one.

The people in the other courts on the clearance list are not her family. She knows this. She carries it home and puts it down somewhere she will not look at it. She cannot find it there in the morning.

---

### Ending: THE LAW *(hidden)*
*Requires: `conspiracy-clear` + `evidence-found` + `briggs-trusted` + dialogue option sets `choice-law`*

Quest `metropolitan:quest:endgame` completes with variant `law`. Portal opens to `metropolitan:place:ending-law`.

During Shambles job 3, Ida shadowed a constable named Briggs. He is not corrupt — which makes him unusual and, in 1863, almost useless. He has been trying to prove something is wrong at Smithfield for two years. He has found nothing because the Shambles is careful.

If Ida has cultivated him across Act II, she can hand him the documents at the confrontation. The Metropolitan Police are barely thirty years old and not untouched by the same interests. The outcome is the most uncertain of the three: it might work, it might not, it might take a decade.

Briggs thanks her. He does not know what it cost her to be in this garden tonight.

Ida walks back to Farringdon. The trains are still running.

---

## Side Quests

Hidden, optional, no progression reward. Sprinkled across all acts. Texture and character, not plot.

| Quest | Location | Description |
|-------|----------|-------------|
| `metropolitan:quest:lost-northerner` | King's Cross | A traveller from Leeds, first time in London, has been separated from his luggage and his money. Ida can help him (navigate to the lost luggage office, intercede with the cab tout who is overcharging him) or ignore him. No reward. The flower seller notices and remembers. |
| `metropolitan:quest:returned-watch` | Saffron Hill / King's Cross | After Callow job 1, Ida learns the watch she lifted belonged to a clockmaker's apprentice — not a wealthy man at all, just a man with one good thing. She can return it. She loses the coins it would have fetched. She gains nothing visible. |
| `metropolitan:quest:market-boy` | Smithfield | A boy younger than Ida is being worked by someone in the Shambles' orbit — running packages, not being paid. Ida can intervene (a word to Rook, or a direct confrontation) or ignore it. Completing it unlocks a single additional Rook dialogue about how the Shambles started. |
| `metropolitan:quest:ucl-notebook` | Gower Street | A student's notebook contains geological notes from the railway dig — the student doesn't know what they mean. Ida can take it (useful in Act III for the sealed chamber puzzle), return it, or leave it. Three outcomes, none required. |
| `metropolitan:quest:briggs-chain` | King's Cross / Smithfield / Farringdon | The hidden constable quest. Three encounters across Act II. Each requires Ida to choose whether to trust him incrementally. Unlocks the third ending if completed. Cannot be completed without all three encounters. |
| `metropolitan:quest:the-letter` | Train / Portland Road | Ida carries a Quill job letter and reads it before delivering (a choice, mildly risky). It is a love letter, not a document of power — someone in the Quill is corresponding with someone they shouldn't. No consequence either way. But Fenn's dialogue changes slightly if she delivers it late. |
| `metropolitan:quest:gin-shop-woman` | Saffron Hill | The woman who runs the gin shop on the lane has been paying protection to a Shambles junior. Ida can end this (by telling Rook, who does not approve of protection on his own street, or by confronting the junior directly). Reward: the woman leaves a small package at Ida's door once. Inside: a coin and no note. |
| `metropolitan:quest:paddington-chapel` | Paddington Green | A small church on Paddington Green has a verger who was present at the original Metropolitan Railway ceremony in January 1863. He will talk to anyone who sits still long enough. His memory of that day contains one detail that connects to the sealed chamber, but obliquely — the player may not notice until later. Purely exploratory. |

---

## Act Structure

### ACT I — THE DEBT
*Farringdon, Saffron Hill, King's Cross*
*~119 events*

Ida is small. She works alone. The railway is her hunting ground — King's Cross for the marks, Farringdon to come home.

The inciting incident: a wallet lifted at King's Cross. Callow finds her the same day. Five jobs to work off a debt that never quite clears. The jobs teach her the line. At the end of Act I, Callow introduces her to the Shambles — not as a gift, but because she's become useful enough that he needs her to have a handler.

Act I ends when the Shambles debt-quest completes and Rook makes first contact.

**Stations accessible:** Farringdon (free), King's Cross (free).
**Stations locked:** All others — tickets required, not yet affordable.

---

### ACT II — THE FACTIONS
*All seven stations*
*~199 events*

The full map opens as Ida earns enough to buy tickets west. Each station is a new world, a new faction layer, a new set of jobs. Three chains run in parallel — the player can work them in any order, but the Quill's service-girl papers must come before the Concern can be accessed properly.

The Quill jobs teach her that information is worth more than money. The Concern jobs show her the machinery above everything she's known.

Act II's turning point: Upper job 5. Harwick sends Ida to destroy a ledger page. She recognises the name on it. She keeps it instead.

From this moment, all three factions have a reason to want her found.

Act II ends when Ida accesses the sealed tunnel chamber and reads the dig records. She now holds everything.

**Stations unlock in order as earnings allow:**
Baker Street → Portland Road → Gower Street (Quill territory cluster)
Edgware Road (contested, transitional)
Paddington (final unlock — most expensive ticket, requires Quill papers for full access)

---

### ACT III — THE RECKONING
*Paddington, the tunnels, Farringdon at night*
*~94 events*

Ida is being looked for. The move counter starts. All three factions believe she is working for one of the others.

The world state changes: daytime places gain night variants. Familiar routes become dangerous. The tension sound layer activates.

Three threads converge:
1. Callow's night conversation — he knows she's kept something. He offers her a way out.
2. Harwick on the last train — she can observe or approach. Either way she learns something final.
3. The Paddington garden — all three factions send representatives. Ida arrives first.

The confrontation is not combat. It is a dialogue sequence where Ida deploys what she knows — each faction's fear, each faction's leverage — to create the space for her choice. The player who has paid attention has everything they need.

**Fail state:** If the move counter expires before the confrontation, the Shambles closes off Saffron Hill. Ida's family is used as leverage. She is reset to the start of Act III with the counter extended — but Callow's dialogue changes. He is no longer patient. The window is narrowing.

**Three portals out of the garden.** Each requires `confrontation-resolved` plus the specific dialogue flag. Each opens a sealed ending place.

---

## Key Characters

**Ida** — twelve or thirteen, Saffron Hill. Small, quick, observant. She stopped being surprised by things people do to each other around age nine. She is not cynical — she simply knows the price of everything because she has had to.

**Callow** — adjacent to the Shambles, street-level enforcer. Forty, looks older. Not cruel — transactional. People are assets and liabilities. He has been doing this since before Ida was born and it has calcified into who he is. His last scene is the night conversation in Act III: he tells her something true about himself. It does not change what he is. It changes how the player sees everything that came before.

**Rook** — Shambles mid-level organiser. Smithfield. He has never needed to raise his voice. His power is presence and memory — he remembers everything everyone has ever done in his territory. He sees Ida clearly from the first meeting and says very little about it.

**Aldous Fenn** — Quill recruiter, solicitor's clerk. Careful, ambitious, deniable. He treats Ida like an investment because that's what she is to him. He is not unkind. He is worse than unkind: he is correct, and he expects her to be grateful.

**The Clockmaker** (Felix) — Quill asset at Portland Road. Makes documents, asks no questions. Gives Ida the service-girl papers that change everything. His shop smells of oil and metal shavings. He has no dialogue beyond what's needed.

**Harwick** — The Concern's solicitor. Cold, correct, exceptionally well-dressed. The name in the green ledger. The end of the chain. He offers Ida the most money she has ever been offered to disappear. In a different world she might take it.

**Constable Briggs** — King's Cross beat. Not corrupt, which makes him unusual. Has been trying to prove something is wrong at Smithfield for two years. Has found nothing because the Shambles is careful. Ida can give him what he needs, if she trusts him enough, if she's built that slowly across Act II.

**Ida's mother** — In the home. Dialogue gates on quest states. Starts worried. Becomes frightened. Has one moment, mid-Act II, of something like hope. She does not know what Ida is doing and cannot ask.

---

## Sound Design

| d-tag | Role | Description |
|-------|------|-------------|
| `metropolitan:sound:underground-ambient` | Ambient | Low tunnel rumble, distant steam, dripping water. Tunnel and train places. |
| `metropolitan:sound:platform-ambient` | Ambient | Crowd murmur, distant whistles, pigeons. All station platforms. |
| `metropolitan:sound:saffron-hill-ambient` | Ambient | Smithfield distant, dogs, wet cobblestones, a child somewhere. Home places. |
| `metropolitan:sound:train-moving` | Ambient | Steam and rhythm, carriage rattle. Carriage places in motion. |
| `metropolitan:sound:market-ambient` | Ambient | Smithfield in full cry — shouting, animals, iron on stone. Market places. |
| `metropolitan:sound:upper-ambient` | Ambient | Paddington — iron and steam and cathedral space. High reverb, sparse. |
| `metropolitan:sound:lift-effect` | Effect | A soft rustle, a held breath. Fires on successful pickpocket interaction. |
| `metropolitan:sound:fail-effect` | Effect | A sudden shout, running boots. Fires on detected/failed lift. |
| `metropolitan:sound:document-sting` | Effect | A short, significant tone. Fires when the assembled document is first examined. |
| `metropolitan:sound:callow-theme` | Layer | Low, patient. A single repeated note with long decay. Callow encounter places. |
| `metropolitan:sound:tension-layer` | Layer | Rising drone. State-gated: activates when `being-hunted` world state is set in Act III. |
| `metropolitan:sound:ending-expose` | Ambient | Broad, exposed, irreversible. Morning light implied. The city above ground. |
| `metropolitan:sound:ending-bury` | Ambient | A single held low note. Eight-second release. Slowly fades. Nothing changes above ground. |
| `metropolitan:sound:ending-law` | Ambient | Footsteps on wet stone. Distant. Continuing. The trains are still running. |

---

## World State Flags

Key world states that gate content across the game:

| Flag | Set by | Gates |
|------|--------|-------|
| `visited-home` | Examining father's pallet | Anchors stakes — referenced in later dialogue |
| `debt-active` | Callow first dialogue | Unlocks Callow's court, begins job tracking |
| `shambles-known` | Rook first contact | Shambles job chain, Smithfield market full access |
| `quill-known` | Fenn first contact at Baker Street | Quill job chain, bookseller dead-drop |
| `papers-acquired` | Clockmaker gives service-girl papers | First-class carriage access, Concern territory |
| `concern-known` | Waiting room woman at Paddington | Concern job chain, Harwick meetings |
| `name-memorised` | Green ledger cipher puzzle | Harwick identified; Act II conspiracy thread |
| `conspiracy-glimpsed` | Edgware Road contested yard on-enter | Foreshadows the collusion; Rook dialogue shifts |
| `stakes-personal` | Canal basin demolition survey | Saffron Hill on the clearance list; tone shifts |
| `ledger-kept` | Upper job 5 — keeping instead of destroying | Triggers Act III; all factions begin hunting |
| `evidence-found` | Sealed chamber dig records examined | Required for EXPOSE and LAW endings |
| `conspiracy-clear` | Harwick dialogue state 4 | Required for EXPOSE and LAW endings |
| `being-hunted` | Begins Act III | Tension sound layer; night place variants active |
| `briggs-trusted` | Three Briggs encounters completed | Unlocks LAW ending dialogue at confrontation |
| `confrontation-resolved` | Garden confrontation dialogue complete | Gates all three ending portals |

---

## Event Count

| Type | Act I | Act II | Act III | Total |
|------|-------|--------|---------|-------|
| World | 1 | — | — | 1 |
| Sound | 14 | — | — | 14 |
| Place | 21 | 30 | 18 | 69 |
| Portal | 18 | 26 | 14 | 58 |
| Item | 11 | 18 | 6 | 35 |
| Feature | 14 | 26 | 8 | 48 |
| NPC | 6 | 14 | 8 | 28 |
| Dialogue | 18 | 42 | 22 | 82 |
| Clue | 8 | 16 | 6 | 30 |
| Quest | 5 | 13 | 2 | 20 |
| Consequence | 6 | 12 | 8 | 26 |
| Puzzle | — | 4 | — | 4 (sequence/environmental, no NIP-44) |
| Recipe | — | 2 | — | 2 |
| **Total** | **122** | **203** | **92** | **~417** |

---

## Critical Path

1. Saffron Hill → Farringdon approach → King's Cross (walk, no ticket needed)
2. King's Cross platform → lift Callow's wallet → Callow finds Ida → debt-active
3. Five Callow jobs across Farringdon, King's Cross, Baker Street (first ticket purchase)
4. Callow introduces Rook → Shambles known → Smithfield full access
5. Shambles jobs 1–3 → rep-shambles reaches 2 → Baker Street station accessible (ticket)
6. Baker Street → Fenn contact → Quill known
7. Quill jobs 1–2 → Portland Road accessible → Clockmaker → service-girl papers
8. Gower Street accessible → Quill jobs 3–4 → green ledger → name-memorised (Harwick)
9. Edgware Road accessible → contested yard → conspiracy-glimpsed
10. Paddington accessible (most expensive ticket + papers) → waiting room → Concern known → Harwick
11. Canal basin → demolition survey → stakes-personal
12. Concern jobs 1–4 running parallel with ongoing Shambles / Quill jobs
13. Concern job 5: find the ledger page → keep it → ledger-kept → Act III begins
14. Tunnel key (from Rook at rep 4) → maintenance door → sealed chamber → evidence-found
15. Act III: being-hunted active, night variants, move counter
16. Callow night conversation → Harwick on the last train
17. Paddington garden → confrontation dialogue → confrontation-resolved
18. Three portals: EXPOSE / BURY / LAW (if briggs-trusted)

---

## Resolved Design Decisions

- **Voice:** Third person. "Ida steps onto the platform. The smoke has not cleared." Unusual for the genre. Fits the tone — she is observed as much as she observes, and the player is watching her, not being her.
- **Win states:** Quest-completion and dialogue-flag endings. No NIP-44, no cipher puzzles. Three endings gated on world state flags set through play. The ending places are plain — the prose is earned, not decrypted. The four Act II puzzles are sequence or environmental: the green ledger is a feature with a `search` verb and state transition, constable observation is a sequence quest.
- **`answers` block:** Omitted from world JSON. No NIP-44 content anywhere in the world.
- **Ticket gates:** Stations unlock west as earnings allow. Paddington is the last and hardest unlock. The line is a class ladder and the game makes you climb it.
- **Callow's ending:** He has no resolution scene. His last appearance is the Act III night conversation. He continues. The city continues. He is the door she walked through, not a character who needs to be settled.
- **The constable:** Constable Briggs, optional across Act II, available as the hidden third ending if trusted.
- **The sealed crate:** It stays sealed. Contents unknown. Some mysteries are structural.
- **Side quests:** Eight hidden optional quests, no progression reward. The returned watch, the market boy, the lost northerner, the UCL notebook, the Briggs chain (which is the only one with a mechanical unlock), the love letter, the gin shop woman, the Paddington chapel verger.
- **Act III fail state:** Move counter expires → family threatened → reset to Act III start with extended counter and changed Callow dialogue. Punishing, narratively dressed, not arbitrary.
