# The Plague's Call

*(formerly Shadowquill VTT — v2 rename)*

A lightweight, single-page virtual tabletop for D&D and other tabletop RPGs. Built as a static web app with **no backend required** — real-time sync between DM and players runs peer-to-peer over WebRTC via PeerJS's free public broker.

Designed to be deployed on GitHub Pages in under two minutes.

---

## Features

- **Dual-mode interface** — separate DM (authoritative) and Player (restricted) views with strict permission asymmetry
- **Entity system** — PCs, Monsters, and NPCs with full D&D 5e stat blocks, HP/AC, ability scores, conditions, and separate DM / player-facing description fields for monsters
- **Hierarchical maps** — world → region → dungeon → room, with breadcrumb navigation and per-map viewport memory
- **Per-token visibility** — DM hides or reveals individual tokens via right-click context menu, sidebar eye-toggle, or the token detail panel. Hidden tokens stay fully visible to the DM; players never see them.
- **Drag & drop placement** — drag entities from the sidebar onto the map to place; drop onto another sidebar card to reorder
- **Reorderable bestiary** — DM drags the grip handle on any entity card to reorder the sidebar; order persists and syncs
- **Expandable stat blocks** — DM clicks an entity card to expand an inline stat block with AC, HP bar, ability scores, conditions, abilities, DM notes, and player-visible description
- **Smooth token animation** — when another user moves a token, it glides to its new position rather than snapping. Local drag stays 1:1 responsive.
- **Smaller, tidier tokens** — 36px tokens with aligned labels, HP bars, and condition dots
- **Player party sidebar** — left panel on the player view shows all PCs with HP bars and visible conditions; your own character is highlighted
- **Player revealed-monsters sidebar** — right panel shows monsters the DM has revealed, with public description and an approximate condition label (Strong / Rough / Waning / Down). Exact HP is hidden from players.
- **Player self-edit** — claimed PCs can adjust their own HP and toggle their own conditions. All player edits are whitelisted and routed through the DM for validation.
- **Hidden monster HP** — players never see exact monster HP in initiative, token detail, or revealed sidebar — only narrative condition labels
- **Initiative tracker** — auto-roll, manual override, turn advancement, tiebreak by initiative bonus then name
- **Encounter presets** — save & load map snapshots (token positions + visibility) for repeatable encounters
- **PC claiming** — players claim an available PC and can only move + edit that token
- **Push-view** — DM force-locks players to a specific map mid-scene
- **Conditions** — 20 predefined D&D conditions, toggleable per entity with colored token dots and pills
- **Export / import** — full session as JSON for backup or sharing
- **Backward compatible saved data** — old sessions migrate automatically on load (adds `entityOrder`, `playerDescription`, default token visibility)
- **LocalStorage persistence** — auto-saves session and auth
- **Mobile-friendly** — touch drag, responsive layout, mobile panels
- **Dark fantasy aesthetic** — Cinzel + Cormorant Garamond serifs, gold accents on midnight blue, softly-glowing tokens

---

## Deploy to GitHub Pages (2 minutes)

1. Create a new repository on GitHub (e.g. `shadowquill-vtt`).
2. Copy the four files from this folder into the repo root:
   - `index.html`
   - `app.js`
   - `.nojekyll`
   - `README.md` (optional)
3. Commit and push to the `main` branch.
4. In the repo, go to **Settings → Pages**.
5. Under **Source**, choose **Deploy from a branch**.
6. Select `main` branch and `/ (root)` folder, then **Save**.
7. Wait ~30 seconds. Your site is live at `https://<your-username>.github.io/<repo-name>/`.

That's it. No build step, no npm, no server.

> The `.nojekyll` file tells GitHub Pages not to run Jekyll, which would otherwise ignore files starting with underscores and slow deploys.

---

## Usage

### Starting a session

**As DM:**
1. Open the site.
2. Click the **DM** tab.
3. Enter the DM password (default: `dragon` — see *Configuration* below).
4. Pick a room code (any string, e.g. `friday-night`) and click **Begin Session**.
5. Share the room code with your players.

**As a Player:**
1. Open the same URL.
2. Click the **Player** tab.
3. Enter your name and the room code the DM gave you.
4. Click **Join Session**.

**Local / offline mode:**
Click **Continue without sync** on the auth screen to run the app solo without connecting peers. Useful for prep, solo play, or when one person is screen-sharing.

### During a session

- **DM** builds maps (top bar → Maps → upload image), creates entities from the left sidebar, drags them onto the map, and reveals them when players encounter them.
- **Players** see only revealed tokens and their claimed PC. They drag their own PC to move.
- **Push view** (DM top bar) forces all players to view the current map — useful for dramatic scene transitions.
- **Presets** save the current token layout so encounters can be reloaded later.

---

## Configuration

### Changing the DM password

Open `app.js` and edit line 15:
```js
const DM_PASSWORD = 'dragon';
```
Change the string, commit, and redeploy. Note: this is a client-side check and is **not real security** — anyone can read the JS source. For a trusted group of players it's fine; for public-facing deployment, put the app behind a real auth layer.

### Changing the PeerJS broker

By default the app uses PeerJS's free public cloud broker at `0.peerjs.com`. If you need higher reliability or want to self-host, see [PeerJS server docs](https://github.com/peers/peerjs-server). You'd then pass config to `new Peer(...)` in `app.js` around line 303.

---

## How sync works

- DM is authoritative — the DM's browser holds the canonical game state.
- Players connect to the DM's peer via WebRTC (PeerJS handles signaling through its broker, then peers talk directly).
- Player actions (move my PC, claim a PC) are sent to the DM as messages; the DM validates, applies, and broadcasts filtered state back to each player individually — each player only receives the tokens they're allowed to see.
- Room codes map to peer IDs via the prefix `shadowquill-` to avoid collisions.

### Known limitations

- If the DM refreshes or closes the tab, players get disconnected and must rejoin.
- Very large map images (multi-MB PNGs) sync slowly because PeerJS chunks binary data inefficiently. Keep maps under ~2 MB for smooth joins. For heavy assets, host images externally and paste the URL instead of uploading.
- The public PeerJS broker occasionally rate-limits — if you can't connect, wait a minute and retry.
- No optimistic updates on the player side: there's a ~50–150 ms round-trip when moving your PC. Usually imperceptible.

---

## Local testing

You can't open `index.html` via `file://` because browsers block XHR fetches (Babel needs to fetch `app.js`). Use a local static server:

```bash
# Python 3
cd shadowquill-vtt
python -m http.server 8080
# then visit http://localhost:8080
```

Or any other static server (`npx serve`, `caddy file-server`, etc.).

---

## Tech stack

- **React 18** (loaded via CDN as UMD bundle — no build step)
- **Babel Standalone** transforms JSX in the browser
- **PeerJS** for WebRTC real-time sync
- Pure CSS with CSS custom properties for theming
- HTML5 drag-drop + pointer events for interactions
- LocalStorage for persistence

No bundler. No npm. No backend. Four files total.

---

## Security notes

- The DM password is a client-side placeholder; treat it as a "soft" gate, not real auth.
- WebRTC connections are peer-to-peer and encrypted in transit (DTLS), but the signaling broker sees connection metadata.
- Session state lives in LocalStorage on each user's device. Use Export/Import to back up.

---

## License

MIT — do what you want. Attribution appreciated but not required.

---

## Changelog — v2 upgrade

This release adds substantial DM/player workflow features on top of the v1 core.

### New in v2

1. **Per-token visibility** — DM hide/reveal from three places:
   - Right-click any token on the map → floating context menu with *Hide/Reveal*, *Open details*, *Edit entity*, *Remove*
   - Eye-icon button on the sidebar card (visible only for entities with a token on the current map)
   - The token detail panel (double-click a token)
2. **Smaller tokens** — 36 px (down from 44 px). Labels, HP bars, and hitboxes all scaled to match.
3. **Smooth remote movement** — tokens glide on `left/top` CSS transitions (~220 ms) when another user moves them. Local drag remains 1:1 responsive via a `.dragging` class that suppresses the transition.
4. **Drag-to-reorder bestiary** — DM drags the `⋮⋮` grip on the left of any entity card to reorder; dropping on another card places the dragged item before it. Reorder persists in `entityOrder` and survives export/import.
5. **Click-to-expand stat block** — clicking an entity card in the DM sidebar toggles an inline stat block (AC / HP bar / Speed / Init / six abilities / conditions / abilities / notes / player-visible description). The edit pencil still opens the full form.
6. **Player party sidebar** (left) — lists all PCs with HP bar, visible conditions, and a gold **YOU** badge for the claimed character. Click a party member to open their details (only writable if it's your own).
7. **Player self-edit** — in the token detail panel, the player can adjust HP (damage/heal) and toggle conditions on their own claimed PC. Edits are whitelisted and routed through the DM as `patch_own_entity` actions; the DM validates ownership and dispatches authoritatively. No other writes are permitted.
8. **Hidden monster HP for players** — monster HP is replaced everywhere players can see it (initiative tracker, right sidebar, token detail panel) with a condition label: **Strong** (>70%), **Rough** (30–70%), **Waning** (<30%), **Down** (0).
9. **Revealed-monsters sidebar** (right) — lists every monster with at least one visible token, showing the player-visible description and condition label. DM-private notes and abilities never reach this panel.

### Data model changes (migrated automatically)

Old saved sessions load cleanly on first open. `migrateState()` runs on HYDRATE, REPLACE, and initial DM `localStorage` load.

- `state.entityOrder: string[]` — explicit ordering of entity IDs. Missing on old sessions; rebuilt from the existing entities alphabetically.
- `entity.playerDescription: string` — player-visible text for monsters, kept separate from DM `notes`. Defaults to `''` when absent.
- `token.visible: boolean` — defaulted to `false` if missing from old tokens.
- Server-side filter (`filterStateForPlayer`) now strips `notes` and `abilities` from monsters before sending to players, and strips `notes` from NPCs.

### UX decisions (where the spec left room)

- **Reorder semantics are drop-before-target.** Dropping A onto C places A immediately before C. This is the standard convention for drag-reorder UIs and feels natural with the visible drop-target highlight.
- **The expand/collapse interaction reuses `selectedEntityId`**, so clicking a card visually connects to the token on the current map (via highlight) *and* expands the stat block in the same click. The pencil button (full edit form) is kept distinct.
- **A right-click context menu replaces the previous single-confirm "remove" behavior.** Right-click now offers visibility toggle, open details, edit entity, and remove — all clearly grouped in one floating panel.
- **Player self-edit is deliberately narrow** — only HP adjust and condition toggle. Editing notes, stats, class, name, etc. would require a richer permission model and is out of scope. The DM's validation clamps HP deltas to `±1000` and accepts only known condition strings.
- **Players lose `notes` and `abilities` on monsters via the sync filter, not just visually.** This means the data truly never leaves the DM's browser, so there's no risk of a sophisticated player reading DevTools and cheating.
- **Monster AC is hidden in the player's token detail panel**, along with Speed. Players only see Name, HP label, conditions, and the player-visible description — keeping surprise encounters mysterious.
- **The party sidebar never shows hidden enemies** — it only iterates `PC`-type entities. The revealed sidebar only iterates monsters with visible tokens. There's no shared computation that could accidentally leak data.

### Known constraints

- The drag-handle reorder uses HTML5 drag-and-drop, which means you can't currently drop *below* the last card or *above* the first without a card target. In practice this isn't a problem — drop onto the nearest neighbor and then again if needed.
- The context menu is fixed-positioned to the cursor and doesn't auto-flip near screen edges. Edge cases may go off-screen on very small viewports.

---

## Changelog — v3 (The Plague's Call)

This release is a significant upgrade focused on immersion, customization, and a new sickness-based gameplay mechanic. It adds 14 distinct features while preserving the v2 claim/visibility/sync model.

### 1. Rebrand

- Renamed from *Shadowquill* to **The Plague's Call** across title, topbar, auth screen, metadata, and export filenames.
- Icon updated to ☠ (from ⚔) to lean into the plague/decay aesthetic.
- Subtitle now reads "— a virtual tabletop for tales of rot and rust —".

### 2. Theme system — Dark Sanctum / Warm Tavern

- Settings cog (⚙) in the topbar opens a modal with a theme switcher.
- **Dark Sanctum** is the existing navy + gold look, kept unchanged.
- **Warm Tavern** is a full parchment/oak/candlelight reskin — every color variable is redefined under `[data-theme="light"]` on the root element, so no CSS rule had to change.
- Theme persists to `localStorage` under `plagues-call.settings.v2`.
- A tiny inline `<script>` in `index.html` applies the stored theme **before first paint** to avoid a flash of the wrong theme.
- Body transitions smoothly between themes (`transition: background/color 0.4s ease`).

### 3. Forced player onboarding

- When a player joins a live session without a claim, they see a full-screen **onboarding gate** instead of the map.
- They must pick an existing unclaimed PC, request a new one, or explicitly enter spectator mode.
- Spectators still see the map but aren't tied to a character; they can claim one later from the topbar.

### 4. DM visibility of claimed characters

- New DM topbar button **⚐ Claims** opens a side panel listing every connected peer: their name, peer ID, claimed PC (with live HP), and any claimed familiars.
- DM has a one-click **Unclaim** button per row — dispatches `DM_UNCLAIM_PC` or `DM_UNCLAIM_FAMILIAR` and re-broadcasts state.

### 5. New entity types

- **Familiar** — teardrop/leaf silhouette, green accent. Claimable by players; a single player can claim any number of familiars. Rendered in the party sidebar alongside PCs with a green **YOURS / FAM** badge. HP is visible to players (treated as party-tier).
- **Neutral Beast** — ellipse shape, amber. Uses normal visibility gating like monsters; HP hidden from players; shows up in the "Revealed" sidebar when made visible.
- **Object** — hexagon shape, bone/ivory. Static by default; a checkbox in the entity form toggles whether it participates in initiative.

### 6. Token hover tooltip

- Hovering a token (DM or player) shows a floating info chip near the cursor.
- DM tooltip: name, type badge, exact HP, conditions pills, description OR DM notes.
- Player tooltip: name, type badge, HP or Strong/Rough/Waning/Down label (per type gating), and the player-visible description if set.
- Fades in on hover with a 0.12 s transition; tracks the cursor via window `pointermove`.

### 7. Token image overlays

- Every entity now has an optional `imageUrl` field in the form.
- Upload compresses in-browser to 256×256 JPEG (quality 0.82) so sync payloads stay small.
- The image renders inside the token shape, masked to the shape's `border-radius`. Fallback is the colored shape with the initial letter.
- Portrait also appears in party cards, onboarding tiles, and claim modals.

### 8. Health bar visibility rules

- Only **PCs** and **Familiars** (the party types) show HP bars on their tokens for players.
- Monsters, NPCs, Neutral Beasts, and Objects never reveal exact HP to players — only the status descriptor.
- DM sees every HP bar unchanged.
- Exposed as a `PLAYER_HP_VISIBLE_TYPES` constant for consistency across `TokenView`, `TokenTooltip`, `InitiativeTracker`, and `TokenDetailPanel`.

### 9. Private reminder tokens

- New ◆ Reminder button in both DM and player topbars.
- Click the button to enter placement mode; click anywhere on the map to drop a pin with a short label.
- Each pin is **strictly private** — the filter layer ships only the requesting peer's own reminder list to them, and nothing to anyone else.
- Double-click a pin to delete it.
- Stored per-peer in `state.reminders[peerId]`. DM reminders use the synthetic key `dm`.

### 10. Map scale (DM-only global)

- In Settings, DM has a slider from 30 % to 300 %. Applied as a uniform multiplier on the `.canvas-stage` `scale()` transform.
- Stored in `state.mapScale`; synced to all players so everyone sees the same "world size".
- Pan/zoom still works on top of this — it's a base scale for the whole render, not a UI zoom.

### 11. Individual token scaling

- Per-token slider in the TokenDetailPanel (DM only): 30 %–400 %.
- Applied via a CSS custom property `--token-scale` on the token's inner wrapper, so the scaling happens inside the token rather than shifting its world position.
- Useful for bosses (large), imps or mice (small), or object props.

### 12. Edit My Sheet modal

- Dedicated player self-service screen, opened from the topbar "◈ Edit My Sheet" button.
- Tabbed interface if the player has claimed both a PC and familiars.
- Shows stats block (AC / HP / Speed / Level), HP adjuster, condition toggles, and the sickness descriptor (for PCs).
- All writes whitelist through the DM as `patch_own_entity` actions — only HP adjust and condition toggle are accepted.

### 13. Status effect positioning

- Major statuses (**Unconscious**, **Dead**, **Petrified**, **Paralyzed**, **Stunned**) now render as a small labeled line **below the token name**, not as a dot stacked on the token graphic.
- Other conditions still appear as small colored dots in the top-right corner of the token.
- Keeps token artwork legible at all zoom levels.

### 14. Sickness system

This is the flagship gameplay feature for v3.

- New **hidden** `sickness` field (0–3) on every entity — only PCs use it.
- Only the DM can write it. The DM sets it in the PC's token detail panel or in the entity form, via a 4-button picker.
- Players never see the number.
- The player's **own PC** sees a narrative descriptor on their Edit My Sheet:
  - 0 → nothing
  - 1 → "A bit pale"
  - 2 → "Sluggish and pale"
  - 3 → "Sick"
- **Visual effect on the player's map viewport:**
  - Level 1: −25 % saturation + subtle inner vignette
  - Level 2: −50 % saturation + medium vignette
  - Level 3: −75 % saturation + 12 % brightness drop + heavy vignette
- All visual effects are CSS filters + box-shadow on a `<div class="sickness-vignette">` overlay. No canvas repaint, no perf cost.
- Transitions smoothly (0.6 s ease) when the DM changes the level.
- Effects apply **only to the player view** (DM is unaffected).
- **Filter scope is `.canvas-container`** — the topbar, sidebars, and UI chrome remain fully readable.
- The filter layer strips `sickness` from every entity except the player's own PC before sending, so a player can never infer another party member's sickness value.

---

## Data model changes

All v2 changes are **forward-compatible** — old saved sessions load without user action. `migrateState()` handles:

- `claimedPCs` (flat map) → `claims` (structured record per peer with `{ pc, familiars, playerName, spectator }`)
- Missing `entity.playerDescription` → `''`
- Missing `entity.imageUrl` → `null`
- Missing `entity.sickness` → `0`
- Missing `entity.rollsInitiative` → `true`
- Missing `token.scale` → `1.0`
- Missing `state.mapScale` → `1.0`
- Missing `state.reminders` → `{}`
- Storage keys bumped to `plagues-call.session.v2` / `plagues-call.auth.v2`; the reducer reads the legacy `shadowquill.session.v1` key as a fallback on first load.

## UX decisions (where the spec left room)

- **Familiars show HP to everyone** because they're party-tier. Their stats look too close to PCs to be worth gating.
- **Neutral Beasts hide HP** — they're treated narratively like monsters even though they're not hostile, so players should have to experience them rather than scout their HP pool.
- **Objects show no HP bar** at all (max = 0 by default). The `rollsInitiative` toggle defaults `true` for compatibility with existing code paths that scanned all placed tokens — a DM can turn it off for pure props.
- **Settings are per-device**, not per-session. Game state is per-session and synced; personal preferences (theme, etc.) are not. This keeps "I prefer dark" from overriding another player at the same table.
- **Reminder pin placement uses single-click** in "placing" mode rather than drag-and-drop, because the common case is "mark the spot I need to remember" which is a point, not a path.
- **Forced onboarding never appears** for the DM or for `auth.local` mode (solo/offline). Only live-player sessions gate the map.
- **The vignette is `mix-blend-mode: multiply`** rather than a straight dark overlay, so it darkens scene artwork without washing out tokens or text over it.

---

## Changelog — v3 update

v3 focuses on **player agency**, **immersion systems**, **DM control tools**, and **visual feedback**. It adds 15 major features while preserving the strict DM-authoritative architecture and the forward-compatible migration from v1 and v2 saves.

### 1. Player full-stat editing

Players can now edit their entire claimed character's stat block, not just HP and conditions.

- STR/DEX/CON/INT/WIS/CHA with auto-computed modifiers
- HP current and max (with separate "quick adjust" damage/heal buttons)
- AC, Speed, Initiative bonus, Passive Perception
- Name, Class, Level, Player Name
- Token color + portrait upload
- Description / narrative notes
- Conditions (unchanged from v2)

All writes flow through the DM-authority pipeline as `patch_own_entity: op='field_set'`, with a strict allowlist: DM-only fields (`sickness`, `deathSaves`, `bondedPeerId`, `darkvision`, `lightRadius`, `type`, `id`) are never writable by players. Image data URLs are sanitized to require the `data:image/` prefix. HP clamps 0–10,000; ability scores clamp 1–30.

The Edit My Sheet modal has collapsible Ability Scores and Identity sections so the default view stays compact.

### 2. Player-visible sickness as a condition

Sickness is now diegetic for players. Instead of a number they see a descriptor on their token tooltip and in their own sheet:
- 1 → *a bit pale*
- 2 → *sluggish and pale*
- 3 → *sick*

Level 0 shows nothing. The numeric value is still DM-only. The descriptor appears as an italic Cormorant chip in the token-status stack below the name and as a bordered line in the tooltip with level-graded coloring (amber → blood-bright).

### 3. All status effects under tokens

The v2 split into "major statuses below" and "minor dots on-token" is gone. Every active condition now renders as a wrapping stack of tiny Cinzel chips directly below the token name, with per-condition colors pulled from `CONDITION_COLORS`. No truncation — unlimited conditions simply wrap. The sickness descriptor sits at the end of the stack as a distinct italic chip.

### 4. Familiar bonding

Familiars now have a **Bonded To** dropdown in the DM's token detail panel, listing every connected peer by their friendly name (falling back to a peer-id snippet) with their claimed PC shown for context. Setting `bondedPeerId` on a Familiar grants that player movement rights for the familiar's token.

The ownership rule is: a peer owns an entity if it's their claimed PC, a claimed familiar, **or** a familiar whose `bondedPeerId` points at them. This is checked by the shared `ownedByPeer()` helper used everywhere from `move_token` validation to the filter's visibility gate.

### 5. Player token image upload

The Edit My Sheet modal has an **Upload portrait** button that reuses the DM's existing image pipeline — browser-side compression to 256×256 JPEG at quality 0.82, returned as a base64 data URL. Portraits appear inside the token circle with `border-radius: inherit` so they mask to the token shape. Upload is only available for the player's own PC and claimed familiars.

### 6. DM death-save tracking

In the DM's token detail panel for a PC, there's now a dedicated Death Saves block with 3 success pips (✓, emerald) and 3 failure pips (✗, blood red). Clicking a pip sets the counter to that value (or clears if you click the already-highest one — classic toggle). There's a **Clear** button to reset both to zero. Counters clamp 0–3. `deathSaves` is stripped from every player-facing filter — clients never see this field at all, even for their own PC.

### 7. Long rest

One **⛭ Long Rest** button in the DM topbar plus a **⛭ Rest** button on each PC/Familiar in the token detail panel. Both dispatch `LONG_REST`; the topbar variant rests everyone, the per-entity variant rests just that character. The action:

- Restores HP to max
- Clears: Unconscious, Exhausted, Poisoned, Frightened, Blinded, Deafened, Charmed, Stunned, Paralyzed, Prone, Restrained, Incapacitated, Grappled
- Resets sickness to 0
- Resets death saves to 0/0
- Leaves persistent narrative conditions (Dead, Petrified, custom) alone

A confirmation dialog prevents accidental presses.

### 8. Downed state visual effect

When the player's own PC drops to 0 HP, their canvas gets a `.downed` class. The CSS applies:
- Full desaturation + brightness drop + slight contrast reduction
- A heavy inner vignette via a pulsing `::after` pseudo-element
- A slow 4-second pulse animation keyed to a heartbeat-like cycle

Transition is 0.8s ease-out so it doesn't snap. Does not affect the DM view. Does not affect sidebars or topbar — scoped strictly to `.canvas-container`.

### 9. Warm Tavern theme — retuned

The light theme has been rebalanced away from the too-yellow parchment feel. New palette anchors:
- `--bg-deep: #d6c3a0` (stained oak floor)
- `--bg-0: #e4d3b0` (weathered tabletop)
- `--bg-2: #c4ac84` (burnished wood trim)
- `--gold: #6a3f13` (burnished copper)
- `--ink: #2a1b0d` (ink-on-parchment, but darker)

The canvas backdrop is now a radial gradient from `#c4a878` → `#8a6a42`. The feel is dim-lit-tavern rather than noon-under-sun.

### 10. Map filtering

Party sidebar and Revealed sidebar both now take `currentMapId` and only show entities with a token on that specific map. A character on a different map no longer shows up in the current scene's party panel. This is a pure read-side change — state stays complete, the UI just narrows its view.

### 11. DM per-player push

The new **🌍 World** panel lists every connected peer with a map dropdown. The DM can push any map to any specific player — or to the whole party via the "Push to All" button (which uses the legacy global `forcedView`). The panel shows each peer's current push state ("free" vs "locked → MapName") in real time. There's a "Clear all pushes" escape hatch that drops both the global and all per-peer locks.

Per-peer state is stored in `state.forcedViewPerPeer[peerId] = { mapId }`. The filter resolves per-peer first, then falls back to global, then to the player's own map override.

### 12. Time of day

The World panel has a day→night slider (0 to 1) with **Day / Dusk / Night / Deepest** quick-set buttons. The player's canvas gets a `tod-N` class (N = 0..10) that applies graduated CSS filters: decreasing `brightness` and `saturate` combined with a negative `hue-rotate` for a cool blue tint. The DM view is unaffected — they always see the map clearly regardless of in-world time. Transitions are 0.8 s ease.

The effect **stacks with sickness and downed states** (all are CSS filters on the same element, so they compose). A special override rule handles the extreme "downed at midnight" case gracefully.

### 13. Darkness / darkvision / light system

The flagship v3 feature. Every entity now has `darkvision` and `lightRadius` in feet (editable on both the full entity form and the quick token detail panel). A constant `PX_PER_FOOT = 10` converts feet to world pixels so vision scales with the map naturally.

**Player view** — when time of day ≥ 0.5 or any owned entity has vision, an SVG overlay sits above the map. The overlay is a 96%-opaque near-black rectangle. For each vision source, the mask punches a radial-gradient hole: fully visible at center, soft fade from 70% of the radius to the edge, fully dark beyond. **Block zones** (feature 15) paint additional black rectangles on the mask so they occlude even when inside someone's vision radius. Multiple sources naturally combine — the union of all radial gradients forms the lit area.

**DM view** — instead of a mask, the DM sees dashed colored outline circles for every vision source on the map. Each character's circle uses their token color so the DM can quickly identify "that's Ana's sight radius, that's Jonas's".

**Vision contribution rules:**
- Owned entities contribute both their darkvision and their carried light to the owner
- Unowned entities (NPCs, monsters, torches on the ground) contribute **only** their emitted `lightRadius` — a torch illuminates everyone, but a monster's darkvision stays private to the DM
- This means a lit lantern dropped on the floor has `type: 'Object'`, `lightRadius: 30`, and lights the room for everyone

SVG-based rendering is cheap — no per-frame canvas redraw, browser composites the radial gradients natively, and the layer is simple enough that even 10+ sources don't cause perf issues on low-end hardware.

### 14. Token presets

A new **❈ Preset** button in the DM entity sidebar opens a dropdown of quick-create presets. Built-in presets ship with the app:

- **Goblin** — CR 1/4 Monster, HP 7, AC 15
- **Commoner** — NPC, HP 4
- **Guard** — NPC, HP 11, AC 16
- **Bandit** — CR 1/8 Monster
- **Wolf** — Neutral Beast, Speed 40
- **Skeleton** — CR 1/4 Monster, undead flavor
- **Chest** — Object, no initiative
- **Torch / Brazier** — Object, lightRadius 20 ft (this one's a vision-system-aware convenience preset)

The DM can save any existing entity as a custom preset from the sidebar context, persisted to `state.tokenPresets[id]`. Custom presets show up in the same dropdown under a "Custom" header with individual delete buttons. Picking any preset creates a pre-filled new entity and opens the edit form so the DM can tweak before saving.

### 15. Map block zones

The World panel has an **◼ Draw Block** toggle. With it active, the DM drags a rectangle anywhere on the map to create a zone (minimum 8×8 px so a stray click doesn't commit an invisible zone). In-progress drawing shows a pulsing dashed rectangle so the DM can see the current extent while dragging. On release, the zone commits to `state.blockZones[mapId]` via `BLOCK_ZONE_UPSERT`.

**For the DM**, existing zones render as translucent dashed red rectangles (`rgba(160,60,60,0.18)` with dashed `rgba(200,80,80,0.55)` border). Hover darkens them slightly for editability affordance. Double-click deletes a zone (with confirm).

**For players**, block zones render as solid near-black panels that sit above the map but below vision and tokens. They also participate in the vision mask — a block zone inside a lit area still stays dark.

There's also a "Clear All" button in the World panel to wipe every zone on the current map.

---

## Data model additions (v3)

### On each entity
- `darkvision: number` — feet; default 0 (no darkvision)
- `lightRadius: number` — feet; default 0 (no carried light)
- `bondedPeerId: string | null` — peer ID of the player who controls this familiar; default null
- `deathSaves: { successes: number, failures: number }` — both 0–3, default `{0, 0}`

### On state (world level)
- `timeOfDay: number` — 0 (day) to 1 (deep night); default 0
- `blockZones: { [mapId]: BlockZone[] }` where `BlockZone = { id, x, y, w, h }`
- `tokenPresets: { [id]: { id, name, entity } }`
- `forcedViewPerPeer: { [peerId]: { mapId } }`

### Storage key
Unchanged from v2: `plagues-call.session.v2`. `migrateState()` backfills all v3 fields idempotently on first load, so any v1 or v2 save loads cleanly. Damaged `deathSaves` (e.g. `null`) is repaired to the zeroed object.

### Migration coverage
26/26 migration assertions pass — tested via `/tmp/v3_migration_test.js`:
- v1 `claimedPCs` → v3 `claims` structure
- All new entity fields backfill correctly with sensible defaults
- All new state fields backfill correctly
- Malformed `deathSaves` is repaired rather than throwing
- Pre-existing v3 field values are preserved (never overwritten by defaults)
- `migrateState(migrateState(x))` === `migrateState(x)` (idempotent)
- `timeOfDay` clamps to [0, 1] even if a malicious save has out-of-range values
- `makeDefaultState()` produces a state with all v3 fields at safe defaults

---

## Performance notes

- **Vision system** uses a single SVG overlay with N radial-gradient circles rather than a canvas redraw loop. Browser composites in GPU; no per-frame JS cost.
- **Time-of-day / sickness / downed** are all pure CSS `filter` rules on `.canvas-container`. They stack naturally because CSS filters compose. No JS animation loop.
- **Block zones** are DOM divs, not canvas rectangles — this lets the DM hover + double-click naturally and keeps draw interaction dead-simple.
- **Per-peer filter** runs once per (peer × state broadcast). The filter is a pure function over the state, so React's default structural sharing handles the memoization when the inputs don't change.
- **Map filtering** in the sidebars is inside a `useMemo` keyed on `state.tokens` and `currentMapId`, so it only recomputes when tokens change or the map switches.
- **Sync payload** still scales linearly with entity count. The new fields add ~80 bytes per entity on average.

---

## Feature scorecard

| # | Feature | Status |
|---|---------|--------|
| 1 | Player full stat editing | Shipped |
| 2 | Sickness as diegetic condition | Shipped |
| 3 | Status effects under tokens | Shipped |
| 4 | Familiar bonding dropdown | Shipped |
| 5 | Player token image upload | Shipped |
| 6 | DM death save tracker | Shipped |
| 7 | Long rest | Shipped |
| 8 | Downed visual effect | Shipped |
| 9 | Warm Tavern theme retuned | Shipped |
| 10 | Map filtering | Shipped |
| 11 | DM per-player push | Shipped |
| 12 | Time of day | Shipped |
| 13 | Darkness / vision system | Shipped |
| 14 | Token presets | Shipped |
| 15 | Map block zones | Shipped |

**15 of 15 features implemented.** Code parses clean (Babel), CSS balanced (481 rule blocks), 26/26 migration tests pass.
