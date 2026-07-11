# ForgeLens — UI/UX Design Document

Companion to [README.md](./README.md) and [ARCHITECTURE.md](./ARCHITECTURE.md). This document covers the visual and interaction design of the dashboard: the design language, screen-by-screen layout, component inventory, states, and the reasoning behind each choice.

> **A note on "matching Honeywell's design":** Honeywell's actual internal system — Forge UI — is a private, proprietary design system owned by Honeywell and used across its Connected Enterprise products; its component specs aren't publicly documented, so this project doesn't (and can't) replicate it directly. What follows instead aligns with what's publicly verifiable about Honeywell's brand and product philosophy: its brand color, and the design principles Honeywell itself has published about Forge's operating context and AI positioning (§2.1). No Honeywell logo, wordmark, or proprietary asset is used anywhere in this project.

---

## Table of Contents

- [1. Design Brief](#1-design-brief)
- [2. Design Principles](#2-design-principles)
  - [2.1 Alignment with Honeywell's Design Language](#21-alignment-with-honeywells-design-language)
- [3. Design Tokens](#3-design-tokens)
- [4. Layout Concept](#4-layout-concept)
- [5. Screens](#5-screens)
- [6. Component Inventory](#6-component-inventory)
- [7. States: Empty, Loading, Error](#7-states-empty-loading-error)
- [8. Motion](#8-motion)
- [9. Copy Guidelines](#9-copy-guidelines)
- [10. Accessibility](#10-accessibility)
- [11. Design Decisions Log](#11-design-decisions-log)

---

## 1. Design Brief

**Subject:** an operator console for industrial HVAC monitoring — not a marketing dashboard, not a SaaS analytics product.
**Audience:** facility engineers making a maintenance call under time pressure, and separately, technical reviewers judging product/UX instinct.
**The page's one job:** let someone go from *"something's wrong"* to *"I trust this diagnosis and I know what to check first"* in under a minute.

That job rules out a few things immediately: no marketing-style hero, no decorative dashboard chrome, no confidence number floating without its evidence. The UI's entire job is to make reasoning visible.

## 2. Design Principles

**Look like an instrument, not an app.** The reference point is a SCADA/HMI operator console, not a startup analytics dashboard — dense, legible, calm under pressure, built for someone who will be staring at it during a real incident. That's also a deliberate departure from the generic AI-dashboard look (cream background + serif display + terracotta accent, or near-black + neon accent) — neither fits an industrial trust tool, and both would read as templated to a technical reviewer.

**Status color is semantic, never decorative.** Green/amber/red only ever mean risk level. No other UI element borrows that palette, so risk is never ambiguous with "just a highlight."

**Evidence is always visible, never a tooltip.** The explainability panel is not a hidden drawer you have to know to open — it's part of the default alert view. Hiding the "why" behind an extra click would undercut the entire pitch of the project.

**The memory effect must be seen, not read.** "Operator memory" is the single most important idea in this project. It gets its own persistent visual treatment (a small adjustment badge, §6) rather than being a sentence buried in a changelog.

### 2.1 Alignment with Honeywell's Design Language

Three things about Honeywell's own publicly stated product philosophy shaped this update:

1. **"Deterministic models with real-world operational constraints."** Honeywell's own public description of Forge draws the same line this project draws: Honeywell positions Forge as combining deterministic models with domain constraints, in contrast to opaque generic AI. That's a direct validation of ForgeLens's core thesis — deterministic-first, LLM-optional — using Honeywell's own language, not just an analogy this project invented.
2. **Designed for extreme environments, not just office screens.** People who've worked on Forge UI have described designing for a genuinely wide range of physical contexts — dark factories, control rooms, airplane cockpits, and bright construction sites — with accessibility, responsiveness, and internationalization called out as core tenets rather than afterthoughts. That's the justification for this project defaulting to a dark, high-contrast instrument theme (readable in a dim control room) while still meeting WCAG AA contrast (readable on a bright factory floor tablet) — see §10.
3. **A single recognizable brand color, used deliberately.** Honeywell's brand identity centers on one signature red (commonly cited as `#EE3124`). This project adopts that red as its one deliberate brand accent (§3) — used sparingly, in a way that doesn't collide with the red already reserved for critical-risk badges.

None of this is a claim that ForgeLens replicates Forge UI itself — it can't, since that system is private. It's a claim that the visual and philosophical direction below is a deliberate, researched alignment rather than an arbitrary palette choice.

## 3. Design Tokens

**Color**

| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#12161C` | App background — deep slate, not pure black (avoids the "near-black + neon" AI-default look) |
| `--bg-panel` | `#1B212A` | Cards, panels, sidebar |
| `--bg-inset` | `#0E1116` | Recessed areas — evidence rows, code-like data |
| `--text-primary` | `#E8EAED` | Primary text |
| `--text-muted` | `#8A93A1` | Secondary text, labels |
| `--brand-honeywell-red` | `#EE3124` | The one Honeywell brand touchpoint: product wordmark, primary CTA button, active nav indicator. Reserved for chrome and actions — never for risk state, so it never gets confused with the critical-risk badge below |
| `--accent-signal` | `#3DA9FC` | Interactive elements *within* data views — links, focus rings, selected-row highlight. Kept separate from brand red so "this is clickable" and "this is Honeywell-branded chrome" stay visually distinct |
| `--risk-low` | `#4CAF6D` | Risk badge: normal |
| `--risk-medium` | `#E0A93E` | Risk badge: watch — amber, not yellow (better contrast, reads as "instrument amber" not "caution tape") |
| `--risk-high` | `#B0241C` | Risk badge: critical — a deeper, darker red than the brand red above, plus a distinct triangle icon (§10), so a critical alert is never mistaken for a branding element or vice versa |
| `--border-hairline` | `#2A313C` | 1px dividers throughout |

**Typography**

| Role | Face | Notes |
|---|---|---|
| Display / headings | **Inter** (600–700) | Clean grotesk, no personality contest — the content is the personality here |
| Body | **Inter** (400–500) | Same family as display, different weights only — keeps the console feel unified rather than "designed" |
| Data / evidence values, sensor readings, timestamps | **JetBrains Mono** (400–500) | Tabular figures for scanability; this is the one deliberate typographic choice — numbers that matter get a monospace treatment so percentage changes and confidence scores are immediately scannable and never mistaken for prose |

**Layout tokens:** 8px base spacing unit. Zero large border-radius flourishes — `4px` radius throughout, consistent with an instrument-panel feel rather than a soft consumer-app feel.

**Signature element:** the **evidence weight bar** — each piece of evidence in the "Why do you think this?" panel renders as a labeled horizontal bar sized to its weight, with the actual percentage change printed in mono type at the end of the bar. It's the one place the UI visibly "shows its work," and it's designed to be the first thing a screenshot of this project shows.

## 4. Layout Concept

Three-pane console layout, not a card-grid dashboard. A slim top bar carries the one branded touchpoint (product name + `--brand-honeywell-red` underline/active-state), everything below it is the neutral instrument palette:

```
┌────────────────────────────────────────────────────────────────┐
│ ▌ForgeLens                                          Arman Ali ⚙│  ← brand-red accent bar
├─────────────┬──────────────────────────────────────────────────┤
│             │  Alert Header                                    │
│  Asset List │  AHU-04 · Temperature Deviation · [RISK: HIGH]   │
│  (sidebar)  ├───────────────────────────────────────────────────┤
│             │  Likely Cause          │  Why do you think        │
│  ● AHU-01   │  Valve degradation     │  this? (evidence)         │
│  ● AHU-02   │  Confidence: 72%       │  ▓▓▓▓▓▓▓░░ Valve cmd     │
│  ▲ AHU-04   │  Alt: Fan fault (18%)  │  ▓▓▓▓▓░░░░ Cooling out   │
│  ● AHU-05   │                        │  ▓▓░░░░░░░ Fan load      │
│             ├────────────────────────┴───────────────────────────┤
│             │  Action Plan            │  Feedback                 │
│             │  1. Inspect valve       │  [Correct] [Wrong]        │
│             │  2. Check actuator      │  [Snooze]                 │
│             │  3. Verify cooling out  │                           │
└─────────────┴──────────────────────────────────────────────────┘
```

The sidebar stays visible at all times — an operator scanning multiple assets should never lose the list to view one alert's detail. This mirrors real console behavior more than a typical single-focus web app pattern would.

## 5. Screens

### 5.1 Dashboard (asset list + alert feed)
- Sidebar: every asset with a risk-level dot/triangle icon (not color alone — see §10) and a one-line status.
- Empty selection state: prompts to select an asset, not a blank panel.

### 5.2 Alert Detail
- Header: asset, anomaly type, risk badge, detected-at timestamp.
- Likely Cause card: cause name, confidence %, one-line alternative hypothesis with its own %.
- Explainability panel: evidence weight bars (§3 signature element), each row showing signal name, direction, and actual measured change.
- Action Plan: numbered checklist (numbering here is legitimate — it's a real inspection sequence, not decorative).
- ETA-to-failure: shown as a range, not a false-precision single number.

### 5.3 Feedback Interaction
- Three buttons: Correct / Wrong / Snooze. "Wrong" opens an inline cause picker (not a modal — keeps the operator in context).
- On submit: an inline confirmation replaces the buttons — *"Recorded. This will adjust future matches for this pattern."*

### 5.4 History View
- A simple timeline per failure pattern showing confidence score over time with feedback markers (✓ / ✗) plotted at each correction — this is the "before/after" proof point for the memory effect, and the one screen worth leading a demo video with.

## 6. Component Inventory

| Component | Notes |
|---|---|
| `RiskBadge` | Icon + color + text label — never color alone |
| `EvidenceBar` | Label, weight-proportional bar, mono value, direction arrow |
| `PatternAdjustmentBadge` | Small pill: *"Adjusted · 3 prior corrections"* — appears wherever `pattern_weight ≠ 1.0` |
| `ActionChecklist` | Numbered, checkable items with an inspect-time estimate |
| `FeedbackControl` | Three-button group + inline cause picker on "Wrong" |
| `AssetListItem` | Icon-coded risk state, one-line status, active-state highlight using `--accent-signal` |
| `ConfidenceMeter` | Horizontal meter, always paired with the alternative-hypothesis percentage so it never reads as a lone black-box number |

## 7. States: Empty, Loading, Error

- **Empty (no anomalies):** *"No active anomalies. All five AHU-04 sensors are within normal range."* — states the actual condition, not a generic "All clear! 🎉".
- **Loading:** skeleton rows matching the real layout, no spinner-only screens.
- **Error (e.g., feed disconnected):** *"Live feed disconnected. Showing last known state as of [timestamp]. Reconnecting…"* — never a bare "Something went wrong."

## 8. Motion

Kept deliberately minimal, in line with "instrument, not app":
- New anomaly arriving via Socket.io: the asset-list row does a single brief highlight pulse (200ms), not a bounce or slide-in.
- Evidence bars animate their width once on first render only — reinforces that they're computed values, not a decorative loop.
- Feedback submission: the button row cross-fades to the confirmation line, no modal, no confetti.
- Respects `prefers-reduced-motion` — all of the above degrade to instant state changes.

## 9. Copy Guidelines

- Name things by what the engineer is looking at, not by system internals: "Likely Cause," not "Model Output."
- Every number is paired with what it measures — never a bare percentage floating without a label.
- Buttons state the action taken, and the confirmation echoes it back: "Wrong" → *"Recorded as wrong."* not a generic "Submitted."
- Errors and empty states describe the actual condition, in the interface's own voice — no false cheerfulness, no unexplained blanks.

## 10. Accessibility

- Risk is always icon + color + text, never color alone (color-blind safe).
- All interactive elements have a visible keyboard focus ring using `--accent-signal` at 2px.
- Evidence bars include the numeric value in text, not just bar length, for screen readers.
- Contrast: all text/background pairs meet WCAG AA at minimum against the dark palette above.
- Motion respects `prefers-reduced-motion` (§8).

## 11. Design Decisions Log

- **Rejected:** cream background + serif display + terracotta accent — reads as a generic AI-generated look, and doesn't fit an industrial trust tool regardless.
- **Rejected:** near-black + single neon accent — same genericness risk, and neon reads as "alert everything," which conflicts with using color strictly for risk semantics.
- **Rejected:** card-grid dashboard layout — optimized for glanceable KPIs, not for the single-alert deep-reasoning task this tool is actually built for.
- **Rejected:** using Honeywell red as the risk-critical color — the obvious first instinct, but it would make every critical alert look like a branding moment instead of a warning; the two needed to be visually distinct colors (§3).
- **Chosen:** SCADA/instrument-console reference point — grounded in the actual subject (industrial operators), gives a legitimate reason for a dense, dark, mono-accented palette instead of an arbitrary stylistic choice.
- **Chosen:** Honeywell red (`#EE3124`) as a single, deliberate brand touchpoint confined to chrome and primary actions — a researched nod to Honeywell's actual brand identity, without overreaching into claiming this replicates their private Forge UI system (§2.1).

---

**Author:** Arman Ali · Portfolio project, not affiliated with Honeywell International Inc.
