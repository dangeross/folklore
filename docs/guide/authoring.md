# Create Worlds with AI

Use a large language model to design and author folklore worlds. The LLM handles the creative writing, event structure, and tag shapes — you provide the concept.

---

## The Process

### 1. Worked Example

Start here. The worked example shows how a world goes from a feeling ("isolated, coastal, melancholy") to a complete set of events. It covers the creative conversation between designer and LLM — how to describe what you want, how the LLM translates that into places, items, puzzles, and sound.

**File:** [folklore-worked-example.md](https://github.com/dangeross/folklore/blob/main/docs/authoring/folklore-worked-example.md)

### 2. Authoring Guide

The conventions, patterns, and validation workflow. This is the LLM's primary reference during authoring — it covers event types, tag naming conventions, common patterns (gated doors, state machines, NPC dialogue), and the JSON output format.

**File:** [folklore-authoring-guide.md](https://github.com/dangeross/folklore/blob/main/docs/authoring/folklore-authoring-guide.md)

### 3. Design Spec

The complete technical specification. Every tag shape, every event type, every action type — defined precisely. The LLM uses this as the ground truth when implementing specific mechanics.

**File:** [folklore-design.md](https://github.com/dangeross/folklore/blob/main/docs/spec/folklore-design.md)

### Supporting References

- **Tag Reference** — [tag-reference.md](https://github.com/dangeross/folklore/blob/main/docs/authoring/tag-reference.md) — compact lookup table of every tag per event type, with shapes and descriptions.
- **Authoring Process** — [folklore-authoring-process.md](https://github.com/dangeross/folklore/blob/main/docs/authoring/folklore-authoring-process.md) — step-by-step checklist for the authoring workflow.
- **Lighthouse Keeper** — [lighthouse-events.json](https://github.com/dangeross/folklore/blob/main/docs/worlds/lighthouse-events.json) — complete reference world (43 events) showing all mechanics working together.

---

## Validation

The validation API checks your world JSON for errors before importing:

```
POST /api/validate
Content-Type: application/json

{ "events": [...], "answers": {...} }
```

The response includes errors, warnings, and hints with fix suggestions. Feed these back to the LLM to iterate.

---

## Start Authoring

Copy the prompt below and paste it into your preferred LLM. The prompt links to the authoring docs so the LLM can read the conventions and tag shapes.
