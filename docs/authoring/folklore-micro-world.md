# FOAKLOAR — Micro-World Example
*The Lighthouse Keeper — a complete world*

---

## Design Notes

This document is a complete worked example of an original FOAKLOAR world — conceived for the schema, not adapted from an existing game or film. It demonstrates every core mechanic in a small, coherent narrative.

**Tone:** Melancholy, coastal, quiet. The lighthouse has been dark for years. The keeper left something behind.

**Placeholders:** All `a`-tag references use `<PUBKEY>` as the author pubkey placeholder. Before publishing, replace every `<PUBKEY>` with your actual hex pubkey.

**Dangling exit:** The Shore Path has a south exit with no portal — a deliberate omission. It hints at a larger world (the village the keeper came from, the road he walked away on) without requiring the author to build it. It also demonstrates the pattern for collaborators: the south exit is an open invitation.

**Arc:** The player arrives at a dark lighthouse. They restore power to the light. In doing so they learn why the keeper left — and find the last thing he wrote. Three endings: follow the bearing, extinguish the lamp, or walk away.

**Item chain:**
```
Find crank handle → restore lamp mechanism → lamp runs →
light reveals hidden signal → signal decoded →
derive key → decrypt keeper's final log → choose ending
```

**Win state:** NIP-44 sealed final log, decrypted by key derived from decoded signal. Endgame quest completes when the player reads the log and chooses.

**Map:**
```
[Shore Path] ── north ── [Lighthouse Base]
                               |
                              up
                               |
                        [Lamp Room]
                               |
                             east (hidden until lamp runs)
                               |
                        [Signal Alcove] ← sealed until lamp runs

[Keeper's Cottage] ── east ── [Lighthouse Base]

After reading the final log, two new paths:
  Shore Path → south (The Bearing — follow the coordinates)
  Shore Path → west (The Coast Road — walk away)
  Lamp Room: extinguish lamp (a third ending)
```

---

## Complete Events

The full event JSON is at [`docs/worlds/lighthouse-events.json`](../worlds/lighthouse-events.json).

Import this file via the builder's draft panel to see the complete world structure, then publish to play.

---

## Narrative Notes for LLM Authorship

**What makes this work:**

1. **The mystery is earned, not given.** The player pieces together who the keeper was from three independent sources (logbook, letter, hearth ash) before they know what happened to him. The win state answers the question those clues raised.

2. **Every place has a reason to exist.** Shore Path: arrival, crank handle. Lighthouse Base: mechanism, logbook, junction. Lamp Room: lamp state, lens, signal reveal. Cottage: character, desk letter. Alcove: signal panel, final log.

3. **The item chain is felt, not just mechanical.** The crank handle is found in tide wrack (the sea brought it back). The mechanism runs the lamp. The lamp reveals the signal. The signal is the key. Each step feels like discovery.

4. **The tone is consistent.** Every content field sounds like the same world: coastal, melancholy, matter-of-fact about strange things.

5. **The win state recontextualises everything.** After reading the final log, the player understands the dark lamp, the sealed logbook, the burned papers, the abandoned letter. Everything was already there.

6. **The ending is a choice.** Three paths after the revelation — follow, extinguish, or leave. Each has a different endgame consequence and closing prose. The player's choice says something about them, not just the keeper.

**What an LLM should hold in mind when authoring:**

- The win state is the thesis. Everything else is evidence.
- Clues should be comprehensible in hindsight, not in foresight.
- The world should feel like it existed before the player arrived.
- Transition text is the world responding. Keep it brief and in the world's voice.
- If a place has nothing to do, cut it or add something.
- Give the player agency at the end — even a small choice makes the story theirs.

---

## NIP-44 Sealed Content

The signal alcove place content is NIP-44 encrypted. The decryption flow:

1. The author generates a lock keypair before publishing
2. The signal alcove place content is NIP-44 encrypted to the lock public key
3. The puzzle `answer-hash` is `SHA256("<answer>" + "<salt>")`
4. The player enters the answer — client verifies hash match
5. Client uses the answer as key material to derive the NIP-44 conversation key
6. Client decrypts the signal alcove place content — sealed prose renders

The answer is simultaneously the puzzle solution and the decryption key. Both the `answer-hash` on the puzzle event and the NIP-44 encryption of the place content must use the same underlying answer.

An LLM can author all events and prose but **cannot perform the NIP-44 encryption** — the publisher must encrypt the content before publishing using a NOSTR library (e.g. nostr-tools).

---

*Total play time: approximately 20-30 minutes for a player reading carefully.*
