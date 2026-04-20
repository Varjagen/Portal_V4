/* The Plague's Call — single-file React app (formerly "Shadowquill" v1)
 * - Dual-mode (DM / Player) with strict permission separation
 * - PeerJS WebRTC sync (free public broker — no backend required)
 * - LocalStorage persistence + Export/Import JSON
 */
const { useState, useEffect, useRef, useReducer, useMemo, useCallback, createContext, useContext } = React;

// ====================================================================
// CONSTANTS
// ====================================================================
// Storage keys bumped to v2 for the Plague's Call rebrand. Older
// 'shadowquill.*' sessions are still readable — see migrateState() below,
// which checks both namespaces for legacy compatibility.
const STORAGE_KEY  = 'plagues-call.session.v2';
const AUTH_KEY     = 'plagues-call.auth.v2';
const SETTINGS_KEY = 'plagues-call.settings.v2';
const PEER_PREFIX  = 'plagues-call-';
const LEGACY_STORAGE_KEY = 'shadowquill.session.v1';
const LEGACY_AUTH_KEY    = 'shadowquill.auth.v1';
const LEGACY_PEER_PREFIX = 'shadowquill-';

// Simple password for DM mode (placeholder — swap with real auth for production)
const DM_PASSWORD = 'dragon';

const APP_NAME = "The Plague's Call";

const CONDITIONS = [
  'Blinded','Charmed','Deafened','Frightened','Grappled',
  'Incapacitated','Invisible','Paralyzed','Petrified','Poisoned',
  'Prone','Restrained','Stunned','Unconscious','Exhausted',
  'Concentrating','Raging','Blessed','Hasted','Dead'
];

const CONDITION_COLORS = {
  'Poisoned': '#6b8e3f', 'Stunned': '#c9b03a', 'Blinded': '#444',
  'Paralyzed': '#7a4bc4', 'Charmed': '#c46ab8', 'Frightened': '#b56a3a',
  'Prone': '#6b7280', 'Restrained': '#8b5a2b', 'Unconscious': '#4a4a6a',
  'Dead': '#8b2020', 'Invisible': '#4a7cbd', 'Blessed': '#d4a574',
  'Concentrating': '#9b6ac4', 'Raging': '#c43e3e', 'Hasted': '#d4a574',
};

// Entity types. Added in v2: Familiar, Neutral Beast, Object.
//  - Familiar      : player-claimable, possibly multiple per player, HP visible to players
//  - Neutral Beast : environmental / non-hostile, visibility-gated like monsters
//  - Object        : static/interactable, no initiative by default, HP hidden from players
const ENTITY_TYPES = ['PC', 'Monster', 'NPC', 'Familiar', 'Neutral Beast', 'Object'];

const DEFAULT_COLORS = {
  'PC': '#4a7cbd',
  'Monster': '#8b2020',
  'NPC': '#d4a574',
  'Familiar': '#5fb58a',
  'Neutral Beast': '#7a9274',
  'Object': '#8a7f6e',
};

// Entity types whose HP bars/numbers players can see. Everything else is
// abstracted to a Strong/Rough/Waning status label for players.
const PLAYER_HP_VISIBLE_TYPES = new Set(['PC', 'Familiar']);

// Entity types that are player-claimable.
const CLAIMABLE_TYPES = new Set(['PC', 'Familiar']);

// Player-visible descriptors for the DM-set Sickness stat (0–3).
const SICKNESS_DESCRIPTORS = [
  '',                       // 0 — nothing
  'A bit pale',             // 1
  'Sluggish and pale',      // 2
  'Sick',                   // 3
];

const DEFAULT_SETTINGS = {
  theme: 'dark',   // 'dark' | 'light'
  mapScale: 1.0,   // global DM control: map-vs-token perceived size multiplier
};

// v3: built-in token presets. DM can add custom ones on top; these are merged
// in at read time (never saved to state so they always reflect code updates).
const BUILTIN_TOKEN_PRESETS = [
  { id: 'builtin:goblin',   name: 'Goblin',     builtin: true,
    entity: { type: 'Monster', name: 'Goblin',  color: '#6b8e3f',
              hp: { current: 7, max: 7 }, ac: 15, speed: 30, initBonus: 2,
              stats: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
              cr: '1/4', passivePerception: 9,
              playerDescription: 'A wiry, sharp-toothed creature in scavenged leather.' } },
  { id: 'builtin:commoner', name: 'Commoner',   builtin: true,
    entity: { type: 'NPC', name: 'Commoner',    color: '#9b8b7a',
              hp: { current: 4, max: 4 }, ac: 10, speed: 30, initBonus: 0,
              stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
              role: 'villager', passivePerception: 10 } },
  { id: 'builtin:guard',    name: 'Guard',      builtin: true,
    entity: { type: 'NPC', name: 'Guard',       color: '#5a7088',
              hp: { current: 11, max: 11 }, ac: 16, speed: 30, initBonus: 1,
              stats: { str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10 },
              role: 'town guard', passivePerception: 12 } },
  { id: 'builtin:bandit',   name: 'Bandit',     builtin: true,
    entity: { type: 'Monster', name: 'Bandit',  color: '#6b4a2b',
              hp: { current: 11, max: 11 }, ac: 12, speed: 30, initBonus: 1,
              stats: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
              cr: '1/8', passivePerception: 10,
              playerDescription: 'A rough-looking brigand with a weathered blade.' } },
  { id: 'builtin:wolf',     name: 'Wolf',       builtin: true,
    entity: { type: 'Neutral Beast', name: 'Wolf', color: '#6a6358',
              hp: { current: 11, max: 11 }, ac: 13, speed: 40, initBonus: 2,
              stats: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
              role: 'wolf', passivePerception: 13,
              playerDescription: 'A lean grey wolf, ribs visible under matted fur.' } },
  { id: 'builtin:skeleton', name: 'Skeleton',   builtin: true,
    entity: { type: 'Monster', name: 'Skeleton', color: '#c9c3a8',
              hp: { current: 13, max: 13 }, ac: 13, speed: 30, initBonus: 2,
              stats: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
              cr: '1/4', passivePerception: 9,
              playerDescription: 'Yellowed bones bound together by a foul animating will.' } },
  { id: 'builtin:chest',    name: 'Chest',      builtin: true,
    entity: { type: 'Object', name: 'Chest', color: '#8b6540',
              hp: { current: 0, max: 0 }, ac: 12, speed: 0, initBonus: 0,
              rollsInitiative: false, role: 'container',
              playerDescription: 'An iron-bound chest, latched.' } },
  { id: 'builtin:torch',    name: 'Torch / Brazier', builtin: true,
    entity: { type: 'Object', name: 'Torch', color: '#d4a52e',
              hp: { current: 0, max: 0 }, ac: 10, speed: 0, initBonus: 0,
              rollsInitiative: false, role: 'light source',
              lightRadius: 20,
              playerDescription: 'A flickering flame casting long shadows.' } },
];

// ====================================================================
// UTILITIES
// ====================================================================
const uid = (prefix = '') => prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const roll = (sides) => 1 + Math.floor(Math.random() * sides);
const modFor = (stat) => Math.floor((stat - 10) / 2);

const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

const downloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const pickFile = (accept = 'application/json') => new Promise((res) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return res(null);
    const reader = new FileReader();
    reader.onload = () => res({ file, content: reader.result });
    reader.readAsText(file);
  };
  input.click();
});

const pickImage = () => new Promise((res) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return res(null);
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.readAsDataURL(file);
  };
  input.click();
});

// ====================================================================
// DEFAULT STATE
// ====================================================================
const makeDefaultState = () => {
  const mapId = uid('map_');
  return {
    entities: {},
    maps: {
      [mapId]: {
        id: mapId,
        name: 'The World',
        type: 'world',
        parentId: null,
        imageUrl: null,
        notes: '',
        viewport: { x: 0, y: 0, zoom: 1 }
      }
    },
    tokens: {},
    initiative: { active: false, entries: [], turn: 0, round: 1 },
    presets: {},
    currentMapId: mapId,
    forcedView: null,            // legacy (global push-view) — kept for back-compat
    forcedViewPerPeer: {},       // v3: per-peer push (peerId -> { mapId })
    playerMapOverride: null,     // player-chosen map when not forced
    claims: {},                  // v2 claim record
    entityOrder: [],
    reminders: {},               // per-user private reminder tokens
    mapScale: 1.0,               // global DM-controlled scale
    // v3 additions:
    timeOfDay: 0,                // 0 = bright day, 1 = deep night; smooth scalar
    blockZones: {},              // mapId -> [{id, x, y, w, h}]
    tokenPresets: {},            // DM-defined presets keyed by id: { id, name, entity: partial }
  };
};

const makeEntity = (overrides = {}) => ({
  id: uid('ent_'),
  name: 'Unnamed',
  type: 'PC',
  color: DEFAULT_COLORS['PC'],
  ac: 10,
  hp: { current: 10, max: 10 },
  speed: 30,
  initBonus: 0,
  passivePerception: 10,
  conditions: [],
  notes: '',
  playerDescription: '',
  imageUrl: null,
  sickness: 0,
  stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
  class: '', level: 1, playerName: '',
  cr: '1/4', abilities: '',
  faction: '', role: '',
  rollsInitiative: true,
  // v3 additions:
  darkvision: 0,               // feet; 0 = none
  lightRadius: 0,              // feet; 0 = no light carried
  // Bonded familiars: which peerId owns movement rights for Familiar-type entities.
  // Stored on the familiar itself for simplicity (single source of truth).
  bondedPeerId: null,
  // Death save tracking (DM-only). PCs only in practice.
  deathSaves: { successes: 0, failures: 0 },
  ...overrides,
});

// Reminder tokens are per-user and live outside the synced token model.
const makeReminder = (overrides = {}) => ({
  id: uid('rem_'),
  mapId: null,
  x: 0, y: 0,
  label: '',
  color: '#c9a34a',
  ...overrides,
});

// v3: block zones — DM-drawn rectangles that hide a portion of the map from
// players. Overlaid in screen space on the player map render. Also
// participates in the vision system as a line-of-sight blocker.
const makeBlockZone = (overrides = {}) => ({
  id: uid('blk_'),
  x: 0, y: 0, w: 100, h: 100,
  ...overrides,
});

// ====================================================================
// STATE MIGRATION (keeps older saved sessions forward-compatible)
// ====================================================================
function migrateState(raw) {
  if (!raw || typeof raw !== 'object') return makeDefaultState();
  const state = { ...raw };

  // Ensure entities object
  state.entities = state.entities || {};

  // Backfill missing fields on every entity. Spread order: existing values win.
  const entities = {};
  for (const [id, e] of Object.entries(state.entities)) {
    entities[id] = {
      playerDescription: '',
      imageUrl: null,
      sickness: 0,
      rollsInitiative: true,
      darkvision: 0,
      lightRadius: 0,
      bondedPeerId: null,
      deathSaves: { successes: 0, failures: 0 },
      ...e,
    };
    // deathSaves might exist but be malformed
    const ds = entities[id].deathSaves;
    if (!ds || typeof ds !== 'object') {
      entities[id].deathSaves = { successes: 0, failures: 0 };
    }
  }
  state.entities = entities;

  // Build/repair entityOrder — must contain every current entity id exactly once
  const existingIds = Object.keys(state.entities);
  const prevOrder = Array.isArray(state.entityOrder) ? state.entityOrder : [];
  const seen = new Set();
  const orderedIds = [];
  for (const id of prevOrder) {
    if (state.entities[id] && !seen.has(id)) {
      orderedIds.push(id);
      seen.add(id);
    }
  }
  // Append any new entities not yet in order (alphabetical fallback)
  const missing = existingIds
    .filter(id => !seen.has(id))
    .sort((a, b) => (state.entities[a].name || '').localeCompare(state.entities[b].name || ''));
  state.entityOrder = [...orderedIds, ...missing];

  // Ensure other expected top-level keys
  state.tokens = state.tokens || {};
  state.maps = state.maps || {};
  state.presets = state.presets || {};
  state.initiative = state.initiative || { active: false, entries: [], turn: 0, round: 1 };
  if (state.forcedView === undefined) state.forcedView = null;
  if (state.playerMapOverride === undefined) state.playerMapOverride = null;
  if (typeof state.mapScale !== 'number' || !isFinite(state.mapScale) || state.mapScale <= 0) state.mapScale = 1.0;
  state.reminders = state.reminders && typeof state.reminders === 'object' ? state.reminders : {};
  // v3 additions
  if (typeof state.timeOfDay !== 'number' || !isFinite(state.timeOfDay)) state.timeOfDay = 0;
  state.timeOfDay = clamp(state.timeOfDay, 0, 1);
  state.forcedViewPerPeer = state.forcedViewPerPeer && typeof state.forcedViewPerPeer === 'object' ? state.forcedViewPerPeer : {};
  state.blockZones = state.blockZones && typeof state.blockZones === 'object' ? state.blockZones : {};
  state.tokenPresets = state.tokenPresets && typeof state.tokenPresets === 'object' ? state.tokenPresets : {};

  // v2 claim model migration: `claimedPCs` (peerId -> entityId) becomes
  // `claims` (peerId -> { pc, familiars, playerName, spectator }).
  if (!state.claims || typeof state.claims !== 'object') state.claims = {};
  if (state.claimedPCs && typeof state.claimedPCs === 'object') {
    for (const [peerId, entId] of Object.entries(state.claimedPCs)) {
      if (!state.claims[peerId]) {
        state.claims[peerId] = { pc: entId || null, familiars: [], playerName: '', spectator: false };
      } else if (!state.claims[peerId].pc) {
        state.claims[peerId].pc = entId || null;
      }
    }
  }
  // Normalize every claim record so downstream code can trust its shape.
  const normalizedClaims = {};
  for (const [peerId, claim] of Object.entries(state.claims)) {
    const c = claim && typeof claim === 'object' ? claim : {};
    normalizedClaims[peerId] = {
      pc: c.pc || null,
      familiars: Array.isArray(c.familiars) ? c.familiars.filter(id => state.entities[id]) : [],
      playerName: typeof c.playerName === 'string' ? c.playerName : '',
      spectator: !!c.spectator,
    };
  }
  state.claims = normalizedClaims;
  delete state.claimedPCs; // stop storing the legacy shape

  // Ensure every token has visibility + scale
  const tokens = {};
  for (const [id, t] of Object.entries(state.tokens)) {
    tokens[id] = { visible: false, scale: 1.0, ...t };
    if (typeof tokens[id].scale !== 'number' || !isFinite(tokens[id].scale) || tokens[id].scale <= 0) {
      tokens[id].scale = 1.0;
    }
  }
  state.tokens = tokens;

  return state;
}

// ====================================================================
// STATE REDUCER
// ====================================================================
function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE': return migrateState({ ...state, ...action.payload });
    case 'REPLACE': return migrateState(action.payload);

    // Entities
    case 'ENTITY_UPSERT': {
      const isNew = !state.entities[action.entity.id];
      const entities = { ...state.entities, [action.entity.id]: action.entity };
      const entityOrder = isNew
        ? [...(state.entityOrder || []), action.entity.id]
        : (state.entityOrder || []);
      return { ...state, entities, entityOrder };
    }
    case 'ENTITY_DELETE': {
      const { [action.id]: _removed, ...rest } = state.entities;
      const tokens = Object.fromEntries(Object.entries(state.tokens).filter(([_, t]) => t.entityId !== action.id));
      const initEntries = state.initiative.entries.filter(e => e.entityId !== action.id);
      // Clear this entity from every peer's claim (pc and familiars)
      const claims = {};
      for (const [peerId, c] of Object.entries(state.claims || {})) {
        claims[peerId] = {
          ...c,
          pc: c.pc === action.id ? null : c.pc,
          familiars: (c.familiars || []).filter(fid => fid !== action.id),
        };
      }
      const entityOrder = (state.entityOrder || []).filter(id => id !== action.id);
      return {
        ...state,
        entities: rest,
        tokens,
        initiative: { ...state.initiative, entries: initEntries },
        claims,
        entityOrder,
      };
    }
    case 'ENTITY_REORDER': {
      // action.order: array of entity ids (DM's new explicit ordering)
      // Re-sync with current entities to avoid ghosts
      const existing = new Set(Object.keys(state.entities));
      const seen = new Set();
      const next = [];
      for (const id of action.order) {
        if (existing.has(id) && !seen.has(id)) { next.push(id); seen.add(id); }
      }
      // Append any entities not yet in order (safety)
      for (const id of Object.keys(state.entities)) {
        if (!seen.has(id)) next.push(id);
      }
      return { ...state, entityOrder: next };
    }
    case 'ENTITY_HP_ADJUST': {
      const e = state.entities[action.id];
      if (!e) return state;
      const cur = clamp(e.hp.current + action.delta, 0, e.hp.max);
      const updated = { ...e, hp: { ...e.hp, current: cur } };
      if (cur === 0 && !updated.conditions.includes('Unconscious')) {
        updated.conditions = [...updated.conditions, 'Unconscious'];
      }
      return { ...state, entities: { ...state.entities, [action.id]: updated } };
    }
    case 'ENTITY_TOGGLE_CONDITION': {
      const e = state.entities[action.id];
      if (!e) return state;
      const has = e.conditions.includes(action.condition);
      return {
        ...state,
        entities: {
          ...state.entities,
          [action.id]: {
            ...e,
            conditions: has
              ? e.conditions.filter(c => c !== action.condition)
              : [...e.conditions, action.condition]
          }
        }
      };
    }

    // Maps
    case 'MAP_UPSERT':
      return { ...state, maps: { ...state.maps, [action.map.id]: action.map } };
    case 'MAP_DELETE': {
      if (Object.keys(state.maps).length <= 1) return state;
      const { [action.id]: _r, ...rest } = state.maps;
      const tokens = Object.fromEntries(Object.entries(state.tokens).filter(([_, t]) => t.mapId !== action.id));
      let currentMapId = state.currentMapId;
      if (currentMapId === action.id) currentMapId = Object.keys(rest)[0];
      // reparent children
      const maps = Object.fromEntries(Object.entries(rest).map(([k, v]) => [
        k, v.parentId === action.id ? { ...v, parentId: null } : v
      ]));
      return { ...state, maps, tokens, currentMapId };
    }
    case 'MAP_SWITCH':
      return { ...state, currentMapId: action.id };
    case 'MAP_VIEWPORT':
      return {
        ...state,
        maps: {
          ...state.maps,
          [action.id]: { ...state.maps[action.id], viewport: action.viewport }
        }
      };

    // Tokens
    case 'TOKEN_PLACE': {
      // prevent duplicate placement per map per entity
      const existing = Object.values(state.tokens).find(
        t => t.entityId === action.token.entityId && t.mapId === action.token.mapId
      );
      if (existing) return state;
      return { ...state, tokens: { ...state.tokens, [action.token.id]: action.token } };
    }
    case 'TOKEN_MOVE': {
      const t = state.tokens[action.id];
      if (!t) return state;
      return { ...state, tokens: { ...state.tokens, [action.id]: { ...t, x: action.x, y: action.y } } };
    }
    case 'TOKEN_REMOVE': {
      const { [action.id]: _r, ...rest } = state.tokens;
      return { ...state, tokens: rest };
    }
    case 'TOKEN_VISIBILITY': {
      const t = state.tokens[action.id];
      if (!t) return state;
      return { ...state, tokens: { ...state.tokens, [action.id]: { ...t, visible: action.visible } } };
    }
    case 'TOKEN_REVEAL_ALL_ON_MAP': {
      const tokens = Object.fromEntries(Object.entries(state.tokens).map(([k, t]) => [
        k, t.mapId === action.mapId ? { ...t, visible: action.visible } : t
      ]));
      return { ...state, tokens };
    }

    // Initiative
    case 'INIT_SET': return { ...state, initiative: action.initiative };
    case 'INIT_ADVANCE': {
      const { entries } = state.initiative;
      if (!entries.length) return state;
      const nextTurn = (state.initiative.turn + 1) % entries.length;
      const round = nextTurn === 0 ? state.initiative.round + 1 : state.initiative.round;
      return { ...state, initiative: { ...state.initiative, turn: nextTurn, round } };
    }

    // Presets
    case 'PRESET_SAVE':
      return { ...state, presets: { ...state.presets, [action.preset.id]: action.preset } };
    case 'PRESET_DELETE': {
      const { [action.id]: _r, ...rest } = state.presets;
      return { ...state, presets: rest };
    }

    // Forced view
    case 'FORCED_VIEW': return { ...state, forcedView: action.forcedView };

    // Player map override
    case 'PLAYER_MAP_OVERRIDE': return { ...state, playerMapOverride: action.mapId };

    // v2: unified claim model
    case 'CLAIM_PC': {
      // Atomic: any other peer that claims this PC loses it first.
      const nextClaims = {};
      for (const [p, c] of Object.entries(state.claims)) {
        nextClaims[p] = (p !== action.peerId && c.pc === action.entityId)
          ? { ...c, pc: null }
          : c;
      }
      const prev = nextClaims[action.peerId] || { pc: null, familiars: [], playerName: '', spectator: false };
      nextClaims[action.peerId] = {
        ...prev,
        pc: action.entityId,
        playerName: action.playerName || prev.playerName || '',
        spectator: false,
      };
      return { ...state, claims: nextClaims };
    }
    case 'UNCLAIM_PC': {
      const prev = state.claims[action.peerId];
      if (!prev) return state;
      return {
        ...state,
        claims: { ...state.claims, [action.peerId]: { ...prev, pc: null } }
      };
    }
    case 'DM_UNCLAIM_PC': {
      // DM-initiated removal of a claim. Scans every peer and clears matching PC.
      const nextClaims = {};
      for (const [p, c] of Object.entries(state.claims)) {
        nextClaims[p] = c.pc === action.entityId ? { ...c, pc: null } : c;
      }
      return { ...state, claims: nextClaims };
    }
    case 'CLAIM_FAMILIAR': {
      // Familiars can be claimed by multiple peers? No — one peer per familiar,
      // but a single peer can claim multiple familiars. Transfer semantics.
      const nextClaims = {};
      for (const [p, c] of Object.entries(state.claims)) {
        nextClaims[p] = (p !== action.peerId && c.familiars.includes(action.entityId))
          ? { ...c, familiars: c.familiars.filter(id => id !== action.entityId) }
          : c;
      }
      const prev = nextClaims[action.peerId] || { pc: null, familiars: [], playerName: '', spectator: false };
      const nextFamiliars = prev.familiars.includes(action.entityId)
        ? prev.familiars
        : [...prev.familiars, action.entityId];
      nextClaims[action.peerId] = { ...prev, familiars: nextFamiliars, spectator: false };
      return { ...state, claims: nextClaims };
    }
    case 'UNCLAIM_FAMILIAR': {
      const prev = state.claims[action.peerId];
      if (!prev) return state;
      return {
        ...state,
        claims: {
          ...state.claims,
          [action.peerId]: { ...prev, familiars: prev.familiars.filter(id => id !== action.entityId) }
        }
      };
    }
    case 'DM_UNCLAIM_FAMILIAR': {
      const nextClaims = {};
      for (const [p, c] of Object.entries(state.claims)) {
        nextClaims[p] = c.familiars.includes(action.entityId)
          ? { ...c, familiars: c.familiars.filter(id => id !== action.entityId) }
          : c;
      }
      return { ...state, claims: nextClaims };
    }
    case 'CLAIM_SPECTATOR': {
      const prev = state.claims[action.peerId] || { pc: null, familiars: [], playerName: '', spectator: false };
      return {
        ...state,
        claims: {
          ...state.claims,
          [action.peerId]: { ...prev, spectator: true, pc: null, familiars: [], playerName: action.playerName || prev.playerName }
        }
      };
    }
    case 'SET_PLAYER_NAME': {
      const prev = state.claims[action.peerId] || { pc: null, familiars: [], playerName: '', spectator: false };
      return {
        ...state,
        claims: { ...state.claims, [action.peerId]: { ...prev, playerName: action.playerName || '' } }
      };
    }

    // v2: Sickness (DM-only write path, enforced at action sites not reducer)
    case 'SET_SICKNESS': {
      const e = state.entities[action.id];
      if (!e) return state;
      const lvl = clamp(Number(action.level) || 0, 0, 3);
      return { ...state, entities: { ...state.entities, [action.id]: { ...e, sickness: lvl } } };
    }

    // v2: Token scale
    case 'TOKEN_SCALE': {
      const t = state.tokens[action.id];
      if (!t) return state;
      const s = clamp(Number(action.scale) || 1, 0.3, 4);
      return { ...state, tokens: { ...state.tokens, [action.id]: { ...t, scale: s } } };
    }

    // v2: global map-vs-token scale
    case 'MAP_SCALE_SET': {
      const s = clamp(Number(action.scale) || 1, 0.3, 3);
      return { ...state, mapScale: s };
    }

    // v2: reminder tokens (per-peer, DM treated as a peer too via its own key)
    case 'REMINDER_UPSERT': {
      const peerId = action.peerId;
      const list = state.reminders[peerId] || [];
      const idx = list.findIndex(r => r.id === action.reminder.id);
      const nextList = idx === -1 ? [...list, action.reminder] : list.map(r => r.id === action.reminder.id ? action.reminder : r);
      return { ...state, reminders: { ...state.reminders, [peerId]: nextList } };
    }
    case 'REMINDER_DELETE': {
      const peerId = action.peerId;
      const list = state.reminders[peerId] || [];
      return { ...state, reminders: { ...state.reminders, [peerId]: list.filter(r => r.id !== action.id) } };
    }

    // v3: generic safe patch on an entity (whitelist enforced at the
    // ACTION site, not here — reducer just applies the given field set).
    case 'ENTITY_PATCH': {
      const e = state.entities[action.id];
      if (!e) return state;
      const patch = action.patch || {};
      // Deep-merge hp and stats when partially specified
      const next = { ...e, ...patch };
      if (patch.hp) next.hp = { ...e.hp, ...patch.hp };
      if (patch.stats) next.stats = { ...e.stats, ...patch.stats };
      if (patch.deathSaves) next.deathSaves = { ...e.deathSaves, ...patch.deathSaves };
      // Re-clamp hp.current to [0, hp.max] if either changed
      if (patch.hp || patch.hp === 0) {
        next.hp.current = clamp(next.hp.current || 0, 0, next.hp.max || 0);
      }
      return { ...state, entities: { ...state.entities, [action.id]: next } };
    }

    // v3: death save counters (DM-only writes; action-site enforced)
    case 'DEATH_SAVE_SET': {
      const e = state.entities[action.id];
      if (!e) return state;
      const ds = {
        successes: clamp(Number(action.successes ?? e.deathSaves.successes), 0, 3),
        failures:  clamp(Number(action.failures  ?? e.deathSaves.failures),  0, 3),
      };
      return { ...state, entities: { ...state.entities, [action.id]: { ...e, deathSaves: ds } } };
    }
    case 'DEATH_SAVE_CLEAR': {
      const e = state.entities[action.id];
      if (!e) return state;
      return { ...state, entities: { ...state.entities, [action.id]: { ...e, deathSaves: { successes: 0, failures: 0 } } } };
    }

    // v3: Long rest — restore HP to max for target entities, clear specific
    // recoverable conditions, reset sickness to 0, reset death saves.
    case 'LONG_REST': {
      // action.entityIds may be an array (rest these specific ones) or
      // omitted (rest all PCs + Familiars).
      const targetIds = Array.isArray(action.entityIds)
        ? action.entityIds
        : Object.values(state.entities).filter(e => e.type === 'PC' || e.type === 'Familiar').map(e => e.id);
      const CLEARED = new Set(['Unconscious','Exhausted','Poisoned','Frightened','Blinded','Deafened','Charmed','Stunned','Paralyzed','Prone','Restrained','Incapacitated','Grappled']);
      const entities = { ...state.entities };
      for (const id of targetIds) {
        const e = entities[id];
        if (!e) continue;
        entities[id] = {
          ...e,
          hp: { ...e.hp, current: e.hp.max },
          conditions: e.conditions.filter(c => !CLEARED.has(c)),
          sickness: 0,
          deathSaves: { successes: 0, failures: 0 },
        };
      }
      return { ...state, entities };
    }

    // v3: Time of day (scalar, 0=day, 1=deep night)
    case 'TIME_OF_DAY_SET':
      return { ...state, timeOfDay: clamp(Number(action.value) || 0, 0, 1) };

    // v3: Per-peer push-view. Works alongside legacy global `forcedView`.
    case 'FORCED_VIEW_PEER_SET': {
      const next = { ...(state.forcedViewPerPeer || {}) };
      if (action.mapId == null) delete next[action.peerId];
      else next[action.peerId] = { mapId: action.mapId };
      return { ...state, forcedViewPerPeer: next };
    }
    case 'FORCED_VIEW_PEER_CLEAR_ALL':
      return { ...state, forcedViewPerPeer: {} };

    // v3: Block zones per map
    case 'BLOCK_ZONE_UPSERT': {
      const mapId = action.mapId;
      const list = state.blockZones[mapId] || [];
      const idx = list.findIndex(z => z.id === action.zone.id);
      const next = idx === -1 ? [...list, action.zone] : list.map(z => z.id === action.zone.id ? action.zone : z);
      return { ...state, blockZones: { ...state.blockZones, [mapId]: next } };
    }
    case 'BLOCK_ZONE_DELETE': {
      const mapId = action.mapId;
      const list = state.blockZones[mapId] || [];
      return { ...state, blockZones: { ...state.blockZones, [mapId]: list.filter(z => z.id !== action.id) } };
    }
    case 'BLOCK_ZONE_CLEAR_MAP':
      return { ...state, blockZones: { ...state.blockZones, [action.mapId]: [] } };

    // v3: DM-defined custom token presets
    case 'TOKEN_PRESET_UPSERT':
      return { ...state, tokenPresets: { ...state.tokenPresets, [action.preset.id]: action.preset } };
    case 'TOKEN_PRESET_DELETE': {
      const { [action.id]: _r, ...rest } = state.tokenPresets;
      return { ...state, tokenPresets: rest };
    }

    default: return state;
  }
}

// ====================================================================
// SYNC (PeerJS)
// ====================================================================
class SyncManager {
  constructor({ mode, onStateUpdate, onPlayerAction, onStatusChange, onPeerListChange, onError }) {
    this.mode = mode;
    this.peer = null;
    this.roomCode = null;
    this.connections = new Map(); // for DM
    this.dmConnection = null; // for Player
    this.myPeerId = null;
    this.onStateUpdate = onStateUpdate;
    this.onPlayerAction = onPlayerAction;
    this.onStatusChange = onStatusChange;
    this.onPeerListChange = onPeerListChange;
    this.onError = onError;
    this.status = 'offline';
  }
  setStatus(s) {
    this.status = s;
    this.onStatusChange?.(s);
  }
  async hostSession(roomCode) {
    this.setStatus('connecting');
    this.roomCode = roomCode;
    try {
      this.peer = new Peer(PEER_PREFIX + roomCode);
      this.peer.on('open', (id) => {
        this.myPeerId = id;
        this.setStatus('live');
      });
      this.peer.on('connection', (conn) => {
        conn.on('open', () => {
          this.connections.set(conn.peer, conn);
          this.onPeerListChange?.(Array.from(this.connections.keys()));
        });
        conn.on('data', (data) => {
          if (data.type === 'player_action') this.onPlayerAction?.(data.payload, conn.peer);
        });
        conn.on('close', () => {
          this.connections.delete(conn.peer);
          this.onPeerListChange?.(Array.from(this.connections.keys()));
        });
        conn.on('error', () => {
          this.connections.delete(conn.peer);
          this.onPeerListChange?.(Array.from(this.connections.keys()));
        });
      });
      this.peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          this.onError?.('Room code already in use. Pick another.');
          this.setStatus('error');
        } else {
          this.setStatus('error');
          this.onError?.(err.message || 'Connection error');
        }
      });
    } catch (err) {
      this.setStatus('error');
      this.onError?.(err.message);
    }
  }
  async joinSession(roomCode) {
    this.setStatus('connecting');
    this.roomCode = roomCode;
    try {
      this.peer = new Peer();
      this.peer.on('open', (id) => {
        this.myPeerId = id;
        const conn = this.peer.connect(PEER_PREFIX + roomCode, { reliable: true });
        this.dmConnection = conn;
        conn.on('open', () => {
          this.setStatus('live');
          conn.send({ type: 'hello', peerId: id });
        });
        conn.on('data', (data) => {
          if (data.type === 'state_update') this.onStateUpdate?.(data.payload);
        });
        conn.on('close', () => this.setStatus('offline'));
        conn.on('error', () => this.setStatus('error'));
      });
      this.peer.on('error', (err) => {
        this.setStatus('error');
        this.onError?.(err.message || 'Could not connect');
      });
    } catch (err) {
      this.setStatus('error');
      this.onError?.(err.message);
    }
  }
  broadcastState(state) {
    if (this.mode !== 'dm') return;
    const payload = { type: 'state_update', payload: state };
    for (const conn of this.connections.values()) {
      try { if (conn.open) conn.send(payload); } catch {}
    }
  }
  sendPlayerAction(action) {
    if (this.mode !== 'player' || !this.dmConnection?.open) return false;
    try {
      this.dmConnection.send({ type: 'player_action', payload: action });
      return true;
    } catch { return false; }
  }
  destroy() {
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.connections.clear();
    this.dmConnection = null;
    this.setStatus('offline');
  }
}

// ====================================================================
// VISIBILITY FILTER (what player can see)
// ====================================================================

// Strip DM-only fields from an entity for player-facing consumption.
function sanitizeEntityForPlayer(e) {
  if (!e) return e;
  // deathSaves is always DM-only — even on own PC.
  let out = { ...e, deathSaves: { successes: 0, failures: 0 } };
  if (e.type === 'Monster' || e.type === 'Neutral Beast') {
    out = { ...out, notes: '', abilities: '' };
  }
  if (e.type === 'NPC' || e.type === 'Object') {
    out = { ...out, notes: '' };
  }
  return out;
}

// v3: Vision system — convert feet to world-pixels using a fixed scale.
// 10 px/ft is a common VTT default (1" hex on a 72dpi 5-ft grid) but this
// lives in one constant so it can be tuned. Darkness system reads token
// positions + entity.darkvision + entity.lightRadius to compute the list
// of { x, y, radius } holes to punch in the dark overlay.
const PX_PER_FOOT = 10;

// DM helper: returns vision sources (as dashed outlines on the DM map) for
// every PC/Familiar with darkvision OR every entity of any type with
// lightRadius on the current map. Each gets a unique color keyed to its
// claimant (so the DM can eyeball "that's Ana's sight, that's Jonas's").
function computeVisionSources(state, mapId) {
  const sources = [];
  for (const t of Object.values(state.tokens)) {
    if (t.mapId !== mapId) continue;
    const e = state.entities[t.entityId];
    if (!e) continue;
    const dv = (e.darkvision || 0) * PX_PER_FOOT;
    const lr = (e.lightRadius || 0) * PX_PER_FOOT;
    if (dv <= 0 && lr <= 0) continue;
    const radius = Math.max(dv, lr);
    sources.push({ x: t.x, y: t.y, radius, color: e.color });
  }
  return sources;
}

// Player helper: vision sources this specific player benefits from.
// Includes all owned entities' darkvision + lightRadius plus any torch
// objects (lightRadius > 0) placed on the map as they illuminate everyone.
function computePlayerVisionSources(state, mapId, ownedEntityIds) {
  const sources = [];
  const owned = ownedEntityIds || new Set();
  for (const t of Object.values(state.tokens)) {
    if (t.mapId !== mapId) continue;
    const e = state.entities[t.entityId];
    if (!e) continue;
    const dv = (e.darkvision || 0) * PX_PER_FOOT;
    const lr = (e.lightRadius || 0) * PX_PER_FOOT;
    // Owned entities contribute both their darkvision and their carried light
    if (owned.has(e.id) && (dv > 0 || lr > 0)) {
      sources.push({ x: t.x, y: t.y, radius: Math.max(dv, lr) });
      continue;
    }
    // Unowned entities contribute only their carried/emitted light to others
    if (lr > 0) {
      sources.push({ x: t.x, y: t.y, radius: lr });
    }
  }
  return sources;
}

function filterStateForPlayer(state, peerId) {
  // Lookup claim record for this peer
  const claim = state.claims?.[peerId] || { pc: null, familiars: [], playerName: '', spectator: false };
  const ownedIds = new Set();
  if (claim.pc) ownedIds.add(claim.pc);
  for (const id of claim.familiars) ownedIds.add(id);
  // v3: peers also "own" familiars whose bondedPeerId points at them.
  for (const [id, ent] of Object.entries(state.entities)) {
    if (ent && ent.type === 'Familiar' && ent.bondedPeerId === peerId) {
      ownedIds.add(id);
    }
  }

  // Token visibility: always show PCs/Familiars + owned; else DM must reveal.
  const visibleTokens = {};
  Object.entries(state.tokens).forEach(([k, t]) => {
    const entity = state.entities[t.entityId];
    if (!entity) return;
    const alwaysVisible = entity.type === 'PC' || entity.type === 'Familiar';
    const isOwned = ownedIds.has(entity.id);
    if (alwaysVisible || isOwned || t.visible) {
      visibleTokens[k] = t;
    }
  });

  // Filter initiative entries - show PCs/Familiars (always) and entities with a visible token
  const filteredInitEntries = state.initiative.entries.filter(e => {
    const entity = state.entities[e.entityId];
    if (!entity) return false;
    if (entity.type === 'PC' || entity.type === 'Familiar') return true;
    return Object.values(state.tokens).some(t => t.entityId === entity.id && t.visible);
  });

  // Sanitize entities. Own PC keeps sickness; everyone else gets sickness=0
  // (v3: but players now DO see sickness as a diegetic condition on their own
  // PC — the EditMySheet renders it from this preserved value).
  const sanitizedEntities = {};
  for (const [id, e] of Object.entries(state.entities)) {
    let cleaned = sanitizeEntityForPlayer(e);
    if (!ownedIds.has(id)) cleaned = { ...cleaned, sickness: 0 };
    sanitizedEntities[id] = cleaned;
  }

  // Reminders are strictly private
  const myReminders = state.reminders?.[peerId] || [];
  const reminders = { [peerId]: myReminders };

  // v3: per-peer forced view. If this peer has a specific push, apply it.
  // Otherwise fall back to the legacy global forcedView (applies to all).
  const peerForced = state.forcedViewPerPeer?.[peerId];
  const effectiveForcedView = peerForced || state.forcedView || null;

  return {
    ...state,
    entities: sanitizedEntities,
    tokens: visibleTokens,
    initiative: { ...state.initiative, entries: filteredInitEntries },
    reminders,
    forcedView: effectiveForcedView,
    // Strip other peers' private forced-view map. Only keep this peer's own.
    forcedViewPerPeer: peerForced ? { [peerId]: peerForced } : {},
  };
}

// ====================================================================
// TOAST SYSTEM
// ====================================================================
const ToastContext = createContext(null);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'info', duration = 3000) => {
    const id = uid('t');
    setToasts((curr) => [...curr, { id, message, type }]);
    setTimeout(() => setToasts((curr) => curr.filter(t => t.id !== id)), duration);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
const useToast = () => useContext(ToastContext);

// ====================================================================
// AUTH SCREEN
// ====================================================================
function AuthScreen({ onAuth }) {
  const [tab, setTab] = useState('dm');
  const [password, setPassword] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  const handleDM = () => {
    if (password !== DM_PASSWORD) {
      setError('Incorrect passphrase.');
      return;
    }
    const code = roomCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || 'table-' + Math.random().toString(36).slice(2, 6);
    onAuth({ mode: 'dm', roomCode: code });
  };

  const handlePlayer = () => {
    if (!roomCode.trim()) { setError('Enter a room code.'); return; }
    if (!playerName.trim()) { setError('Choose a display name.'); return; }
    onAuth({
      mode: 'player',
      roomCode: roomCode.trim().toLowerCase(),
      playerName: playerName.trim()
    });
  };

  const handleLocal = () => {
    onAuth({ mode: 'dm', roomCode: null, local: true });
  };

  return (
    <div className="auth-screen">
      <div className="auth-card slide-up">
        <div className="auth-title">The Plague's Call</div>
        <div className="auth-subtitle">— a virtual tabletop for tales of rot and rust —</div>

        <div className="auth-tab-row">
          <div className={`auth-tab ${tab === 'dm' ? 'active' : ''}`} onClick={() => { setTab('dm'); setError(''); }}>
            ⚔ Dungeon Master
          </div>
          <div className={`auth-tab ${tab === 'player' ? 'active' : ''}`} onClick={() => { setTab('player'); setError(''); }}>
            ⌂ Player
          </div>
        </div>

        {tab === 'dm' ? (
          <>
            <div className="auth-field">
              <label>Passphrase</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter the arcane word…" autoFocus
                onKeyDown={e => e.key === 'Enter' && handleDM()} />
              <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>
                Default passphrase: <kbd>dragon</kbd> — edit <code>DM_PASSWORD</code> in <code>app.js</code>
              </div>
            </div>
            <div className="auth-field">
              <label>Room Code (optional)</label>
              <input value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="e.g. curse-of-strahd"
                onKeyDown={e => e.key === 'Enter' && handleDM()} />
              <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>
                Share with players so they may join.
              </div>
            </div>
            {error && <div style={{ color: 'var(--blood-bright)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={handleDM}>
              Open the Session
            </button>
            <div className="hr" />
            <button className="btn ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={handleLocal}>
              ⚐ Local-only mode (no sync)
            </button>
          </>
        ) : (
          <>
            <div className="auth-field">
              <label>Room Code</label>
              <input value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="e.g. curse-of-strahd" autoFocus
                onKeyDown={e => e.key === 'Enter' && handlePlayer()} />
            </div>
            <div className="auth-field">
              <label>Your Name</label>
              <input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="e.g. Elara"
                onKeyDown={e => e.key === 'Enter' && handlePlayer()} />
            </div>
            {error && <div style={{ color: 'var(--blood-bright)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
            <button className="btn primary" style={{ width: '100%', justifyContent: 'center', padding: '12px' }} onClick={handlePlayer}>
              Join the Table
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ====================================================================
// TOKEN COMPONENT
// ====================================================================
// Map entity.type → CSS shape class on `.token-shape`. New v2 types use
// distinct silhouettes so the map stays readable at a glance.
const TOKEN_SHAPE_CLASS = {
  'PC': 'pc',
  'Monster': 'monster',
  'NPC': 'npc',
  'Familiar': 'familiar',
  'Neutral Beast': 'neutral-beast',
  'Object': 'object',
};

function TokenView({
  token, entity, isCurrent, isSelected, canDrag,
  onStartDrag, onDoubleClick, onContextMenu,
  showLabel, isDraggingLocal,
  onHoverChange, mode,
}) {
  if (!entity) return null;
  const typeClass = TOKEN_SHAPE_CLASS[entity.type] || 'npc';
  const hpPct = entity.hp.max > 0 ? (entity.hp.current / entity.hp.max) * 100 : 0;
  const hpClass = hpPct <= 25 ? 'critical' : hpPct <= 50 ? 'low' : '';
  const initial = (entity.name || '?').slice(0, 1).toUpperCase();
  // v2: per-token scale factor. Applied as a CSS scale so hitboxes remain
  // centered on token.x/y (we compensate the offset with transform-origin).
  const scale = clamp(Number(token.scale) || 1, 0.3, 4);

  // v2: player-facing HP bar gating. DM sees everything; players only see
  // HP bars for PCs + Familiars (the "party" types).
  const showHpBar = entity.hp.max > 0 && (
    mode === 'dm' || PLAYER_HP_VISIBLE_TYPES.has(entity.type)
  );

  // v3: every status effect renders BELOW the token name, wrapped into a list.
  // Conditions with distinct colors still use CONDITION_COLORS; sickness
  // (player-facing descriptor) also appears here as a small italic tag.
  const statusItems = [...entity.conditions];
  const sicknessLabel = SICKNESS_DESCRIPTORS[entity.sickness || 0] || '';

  const onPointerDown = (e) => {
    if (e.button === 2) return;
    if (canDrag) {
      e.stopPropagation();
      onStartDrag?.(e);
    }
  };
  const onContext = (e) => {
    if (onContextMenu) { e.preventDefault(); onContextMenu(e); }
  };

  const classes = [
    'token',
    !token.visible ? 'hidden-token' : '',
    isCurrent ? 'current-turn' : '',
    isSelected ? 'selected' : '',
    isDraggingLocal ? 'dragging' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      data-tok={token.id}
      style={{ left: token.x - 18, top: token.y - 18, '--token-scale': scale }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.(e); }}
      onContextMenu={onContext}
      onTouchStart={(e) => { if (canDrag) { e.stopPropagation(); onStartDrag?.(e); }}}
      onMouseEnter={() => onHoverChange?.({ tokenId: token.id, entityId: entity.id })}
      onMouseLeave={() => onHoverChange?.(null)}
    >
      <div className="token-inner">
        {showHpBar && (
          <div className="token-hp-bar">
            <div className={`token-hp-fill ${hpClass}`} style={{ width: `${hpPct}%` }} />
          </div>
        )}
        <div className={`token-shape ${typeClass}`} style={{ '--color': entity.color }}>
          {entity.imageUrl ? (
            <img src={entity.imageUrl} alt="" className="token-portrait" draggable="false" />
          ) : (
            <span>{initial}</span>
          )}
        </div>
        {showLabel && <div className="token-label">{entity.name}</div>}
        {showLabel && (statusItems.length > 0 || sicknessLabel) && (
          <div className="token-status-stack">
            {statusItems.map(c => (
              <span key={c} className="token-status-chip" title={c}
                style={{ background: CONDITION_COLORS[c] || 'rgba(120,120,120,0.85)' }}>
                {c}
              </span>
            ))}
            {sicknessLabel && (
              <span className="token-status-chip sickness" title="Sickness">
                <em>{sicknessLabel.toLowerCase()}</em>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ====================================================================
// MAP CANVAS
// ====================================================================
function MapCanvas({
  map, entities, tokens, initiative, mode, peerId, claimedEntityId, ownedEntityIds,
  onTokenMove, onTokenDoubleClick, onTokenContextMenu,
  onPlaceEntity, onViewportChange, selectedTokenId,
  mapScale = 1.0,
  reminders = [], onReminderUpsert, onReminderDelete,
  placingReminder = false, onPlaceReminderDone,
  hoveredTokenId, onTokenHoverChange,
  // v3:
  visionEnabled = false,      // whether to dim the map where nothing sees
  visionSources = [],         // [{ x, y, radius }] — in world pixels
  blockZones = [],            // [{ id, x, y, w, h }] — in world pixels
  placingBlock = false, onPlaceBlockDone, onBlockUpsert, onBlockDelete,
}) {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const [viewport, setViewport] = useState(map?.viewport || { x: 0, y: 0, zoom: 1 });
  const [panning, setPanning] = useState(false);
  const panRef = useRef(null);
  const dragTokenRef = useRef(null);
  const [, forceRender] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  // v3: in-progress block zone rectangle while DM is dragging to draw.
  // Lives locally; committed to state on pointer-up via onBlockUpsert.
  const [drawingBlock, setDrawingBlock] = useState(null);
  const drawRef = useRef(null);

  // Update viewport when map changes
  useEffect(() => {
    setViewport(map?.viewport || { x: 0, y: 0, zoom: 1 });
  }, [map?.id]);

  // persist viewport debounced
  useEffect(() => {
    const handle = setTimeout(() => {
      if (mode === 'dm' && map) {
        onViewportChange?.(map.id, viewport);
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [viewport.x, viewport.y, viewport.zoom]);

  const screenToWorld = useCallback((sx, sy) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return {
      x: (sx - rect.left - viewport.x) / viewport.zoom,
      y: (sy - rect.top - viewport.y) / viewport.zoom,
    };
  }, [viewport]);

  // --- Panning + placement ---
  const onWrapPointerDown = (e) => {
    // Only react to pointer-downs on the canvas backdrop, not on tokens/pins.
    if (e.target !== wrapRef.current
        && !e.target.classList.contains('canvas-stage')
        && !e.target.classList.contains('map-image')) return;

    // v3: Block-zone draw mode (DM only). Start a rectangle in world coords.
    if (placingBlock && mode === 'dm') {
      e.preventDefault();
      const world = screenToWorld(e.clientX, e.clientY);
      drawRef.current = { startX: world.x, startY: world.y };
      setDrawingBlock({ x: world.x, y: world.y, w: 0, h: 0 });
      return;
    }

    // Reminder placement is handled by onStagePointerClick below, so a
    // click is committed on pointer-up (lets panning still work if the
    // user changes their mind).
    if (placingReminder) return;

    setPanning(true);
    panRef.current = { startX: e.clientX, startY: e.clientY, vx: viewport.x, vy: viewport.y };
  };

  // v3: block-zone drawing pointer-move / pointer-up lifecycle
  useEffect(() => {
    if (!drawingBlock) return;
    const onMove = (e) => {
      const world = screenToWorld(e.clientX, e.clientY);
      const sx = drawRef.current.startX, sy = drawRef.current.startY;
      setDrawingBlock({
        x: Math.min(sx, world.x),
        y: Math.min(sy, world.y),
        w: Math.abs(world.x - sx),
        h: Math.abs(world.y - sy),
      });
    };
    const onUp = () => {
      const rect = drawingBlock;
      setDrawingBlock(null);
      drawRef.current = null;
      // Commit iff big enough to be intentional
      if (rect && rect.w > 8 && rect.h > 8) {
        onBlockUpsert?.({ id: uid('blk_'), x: rect.x, y: rect.y, w: rect.w, h: rect.h });
      }
      onPlaceBlockDone?.();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drawingBlock, onBlockUpsert, onPlaceBlockDone, screenToWorld]);
  useEffect(() => {
    if (!panning) return;
    const onMove = (e) => {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      setViewport(v => ({ ...v, x: panRef.current.vx + dx, y: panRef.current.vy + dy }));
    };
    const onUp = () => setPanning(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [panning]);

  // --- Wheel zoom ---
  const onWheel = (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const nextZoom = clamp(viewport.zoom * (1 + delta), 0.15, 4);
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // keep mouse position stable
    const ratio = nextZoom / viewport.zoom;
    const nx = mx - (mx - viewport.x) * ratio;
    const ny = my - (my - viewport.y) * ratio;
    setViewport({ x: nx, y: ny, zoom: nextZoom });
  };
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [viewport]);

  // --- Token dragging ---
  const startTokenDrag = (tokenId, e) => {
    const token = tokens[tokenId];
    if (!token) return;
    const point = e.touches ? e.touches[0] : e;
    const world = screenToWorld(point.clientX, point.clientY);
    dragTokenRef.current = {
      tokenId,
      offsetX: world.x - token.x,
      offsetY: world.y - token.y,
      lastX: token.x, lastY: token.y,
    };
    forceRender(n => n + 1);
  };
  useEffect(() => {
    const onMove = (e) => {
      if (!dragTokenRef.current) return;
      const point = e.touches ? e.touches[0] : e;
      const world = screenToWorld(point.clientX, point.clientY);
      const x = world.x - dragTokenRef.current.offsetX;
      const y = world.y - dragTokenRef.current.offsetY;
      dragTokenRef.current.lastX = x;
      dragTokenRef.current.lastY = y;
      forceRender(n => n + 1);
      // Also update DOM directly for smoothness
      const tokenEl = document.querySelector(`[data-tok="${dragTokenRef.current.tokenId}"]`);
      if (tokenEl) {
        tokenEl.style.left = (x - 18) + 'px';
        tokenEl.style.top = (y - 18) + 'px';
      }
    };
    const onUp = () => {
      if (dragTokenRef.current) {
        const { tokenId, lastX, lastY } = dragTokenRef.current;
        onTokenMove?.(tokenId, lastX, lastY);
        dragTokenRef.current = null;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [onTokenMove, screenToWorld]);

  // --- HTML5 drag & drop from sidebar ---
  const onDragOver = (e) => {
    if (mode !== 'dm') return;
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (mode !== 'dm') return;
    const entityId = e.dataTransfer.getData('text/entity-id');
    if (!entityId) return;
    const world = screenToWorld(e.clientX, e.clientY);
    onPlaceEntity?.(entityId, world.x, world.y);
  };

  const zoomBy = (factor) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = rect.width / 2, my = rect.height / 2;
    const nextZoom = clamp(viewport.zoom * factor, 0.15, 4);
    const ratio = nextZoom / viewport.zoom;
    const nx = mx - (mx - viewport.x) * ratio;
    const ny = my - (my - viewport.y) * ratio;
    setViewport({ x: nx, y: ny, zoom: nextZoom });
  };
  const resetView = () => setViewport({ x: 0, y: 0, zoom: 1 });

  const canDragToken = (t) => {
    if (mode === 'dm') return true;
    const ent = entities[t.entityId];
    if (!ent) return false;
    if (ownedEntityIds && ownedEntityIds.has(ent.id)) return true;
    return claimedEntityId === ent.id;
  };

  const currentInitEntityId = initiative.active && initiative.entries[initiative.turn]?.entityId;

  // --- Tokens visible on this map ---
  const visibleTokens = useMemo(
    () => Object.values(tokens).filter(t => t.mapId === map?.id),
    [tokens, map?.id]
  );

  // Click-on-empty-canvas while in "placing reminder" mode → drops a reminder.
  const onStagePointerClick = (e) => {
    if (!placingReminder) return;
    // Ignore clicks on actual tokens (they have their own handlers)
    if (e.target.closest('.token')) return;
    if (e.target.closest('.reminder-pin')) return;
    const world = screenToWorld(e.clientX, e.clientY);
    const label = prompt('Reminder label (shown only to you)');
    if (!label) { onPlaceReminderDone?.(); return; }
    onReminderUpsert?.({
      id: uid('rem_'),
      mapId: map?.id || null,
      x: world.x,
      y: world.y,
      label: label.slice(0, 200),
      color: '#c9a34a',
    });
    onPlaceReminderDone?.();
  };

  return (
    <div
      ref={wrapRef}
      className={`canvas-wrap ${panning ? 'panning' : ''} ${dragOver ? 'can-drop' : ''} ${placingReminder ? 'placing-reminder' : ''} ${placingBlock ? 'placing-block' : ''}`}
      onPointerDown={onWrapPointerDown}
      onClick={onStagePointerClick}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ height: '100%', width: '100%' }}
    >
      <div
        ref={stageRef}
        className="canvas-stage"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom * (mapScale || 1)})`,
        }}
      >
        {map?.imageUrl ? (
          <img src={map.imageUrl} alt={map.name} className="map-image" draggable="false" />
        ) : null}

        {visibleTokens.map(t => {
          const ent = entities[t.entityId];
          if (!ent) return null;
          const isOwned = ownedEntityIds ? ownedEntityIds.has(ent.id) : claimedEntityId === ent.id;
          return (
            <TokenView
              key={t.id}
              token={t}
              entity={ent}
              isCurrent={currentInitEntityId === ent.id}
              isSelected={selectedTokenId === t.id}
              canDrag={canDragToken(t)}
              isDraggingLocal={dragTokenRef.current?.tokenId === t.id}
              showLabel={mode === 'dm' || t.visible || isOwned}
              onStartDrag={(e) => startTokenDrag(t.id, e)}
              onDoubleClick={() => onTokenDoubleClick?.(t.id)}
              onContextMenu={mode === 'dm' ? (e) => onTokenContextMenu?.(t.id, e) : undefined}
              onHoverChange={onTokenHoverChange}
              mode={mode}
            />
          );
        })}

        {/* Reminder pins — private to this viewer */}
        {reminders.filter(r => r.mapId === map?.id).map(r => (
          <div
            key={r.id}
            className="reminder-pin"
            style={{ left: r.x - 10, top: r.y - 26, color: r.color }}
            title={r.label}
            onClick={(e) => { e.stopPropagation(); }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete reminder "${r.label}"?`)) onReminderDelete?.(r.id);
            }}
          >
            <div className="reminder-pin-body">◆</div>
            <div className="reminder-pin-label">{r.label}</div>
          </div>
        ))}

        {/* v3: Block zones — solid occluders for players, editable outlines for DM */}
        {blockZones.map(z => (
          <div
            key={z.id}
            className={`block-zone ${mode === 'dm' ? 'dm' : 'player'}`}
            style={{ left: z.x, top: z.y, width: z.w, height: z.h }}
            onDoubleClick={mode === 'dm' ? (e) => {
              e.stopPropagation();
              if (confirm('Delete this block zone?')) onBlockDelete?.(z.id);
            } : undefined}
            title={mode === 'dm' ? 'Double-click to delete' : undefined}
          />
        ))}

        {/* In-progress block zone preview while DM is dragging to draw */}
        {drawingBlock && mode === 'dm' && (
          <div
            className="block-zone drawing"
            style={{ left: drawingBlock.x, top: drawingBlock.y, width: drawingBlock.w, height: drawingBlock.h }}
          />
        )}

        {/* v3: Vision mask (player only). SVG layer at the world-stage level
            so it scales with zoom. A dark rectangle covers the whole map,
            and each vision source punches a soft-edged hole through it. */}
        {mode === 'player' && visionEnabled && visionSources.length > 0 && map?.imageUrl && (() => {
          // Compute the bounds: use image natural-size fallback to 4000x4000
          // since the stage is un-clipped and pan/zoom handles overflow.
          const maskId = `vis-mask-${map.id}`;
          const W = 8000, H = 8000, OFF = 4000; // huge overlay, recentered
          return (
            <svg
              className="vision-mask"
              xmlns="http://www.w3.org/2000/svg"
              style={{ position: 'absolute', left: -OFF, top: -OFF, width: W, height: H, pointerEvents: 'none', zIndex: 4 }}
              viewBox={`${-OFF} ${-OFF} ${W} ${H}`}
            >
              <defs>
                <mask id={maskId} maskUnits="userSpaceOnUse">
                  {/* White = visible. Start with white covering everything, then
                      paint black rectangles outside each vision disc via the
                      combined fill below. Reversed: cover all black, punch
                      white holes. */}
                  <rect x={-OFF} y={-OFF} width={W} height={H} fill="black" />
                  {visionSources.map((s, i) => (
                    <radialGradient key={i} id={`vg-${maskId}-${i}`}
                      cx={s.x} cy={s.y} r={s.radius}
                      gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="white" stopOpacity="1" />
                      <stop offset="70%" stopColor="white" stopOpacity="1" />
                      <stop offset="100%" stopColor="white" stopOpacity="0" />
                    </radialGradient>
                  ))}
                  {visionSources.map((s, i) => (
                    <circle key={i}
                      cx={s.x} cy={s.y} r={s.radius}
                      fill={`url(#vg-${maskId}-${i})`} />
                  ))}
                  {/* Block zones are black on the mask → they stay dark
                      even if vision would otherwise reach them. */}
                  {blockZones.map(z => (
                    <rect key={z.id} x={z.x} y={z.y} width={z.w} height={z.h} fill="black" />
                  ))}
                </mask>
              </defs>
              <rect x={-OFF} y={-OFF} width={W} height={H}
                fill="rgba(4,6,10,0.96)"
                mask={`url(#${maskId})`} />
            </svg>
          );
        })()}

        {/* v3: DM vision outlines — dashed circles per character so DM sees
            what each player can see. Rendered above the map, below tokens. */}
        {mode === 'dm' && visionSources.length > 0 && (
          <svg className="vision-outlines"
            xmlns="http://www.w3.org/2000/svg"
            style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible', zIndex: 2 }}>
            {visionSources.map((s, i) => (
              <circle key={i}
                cx={s.x} cy={s.y} r={s.radius}
                fill="none"
                stroke={s.color || '#4a7cbd'}
                strokeWidth="2"
                strokeDasharray="6 6"
                opacity="0.55" />
            ))}
          </svg>
        )}
      </div>

      {!map?.imageUrl && (
        <div className="map-empty">
          <div className="glyph">⚜</div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 18 }}>
            {mode === 'dm'
              ? 'The canvas awaits. Upload a map image to begin.'
              : 'The realm is shrouded in mist.'}
          </div>
        </div>
      )}

      <div className="canvas-overlay top-right">
        <div className="zoom-controls">
          <button className="zoom-btn" title="Zoom in" onClick={() => zoomBy(1.2)}>＋</button>
          <button className="zoom-btn" title="Reset" onClick={resetView}>⌂</button>
          <button className="zoom-btn" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>－</button>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// ENTITY FORM (create / edit entity)
// ====================================================================
function EntityForm({ initial, onSave, onCancel }) {
  const [entity, setEntity] = useState(() => initial || makeEntity());

  const update = (patch) => setEntity(e => ({ ...e, ...patch }));
  const updateStat = (stat, value) => setEntity(e => ({ ...e, stats: { ...e.stats, [stat]: Number(value) || 0 } }));
  const updateHp = (key, value) => setEntity(e => ({ ...e, hp: { ...e.hp, [key]: Number(value) || 0 } }));

  useEffect(() => {
    // if type changes, reset color if default
    if (Object.values(DEFAULT_COLORS).includes(entity.color)) {
      setEntity(e => ({ ...e, color: DEFAULT_COLORS[e.type] }));
    }
  }, [entity.type]);

  // Simple in-browser image upload. We downscale to at most 256×256 and
  // re-encode as JPEG (~0.8 quality) to keep the base64 sync payload small.
  const uploadImage = async () => {
    try {
      const dataUrl = await pickImage();
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        update({ imageUrl: compressed });
      };
      img.onerror = () => update({ imageUrl: dataUrl }); // fall back to raw
      img.src = dataUrl;
    } catch {}
  };

  // Shorthands
  const isHpType = entity.type !== 'Object';
  const isPlayerFacing = ['Monster','NPC','Neutral Beast','Object'].includes(entity.type);

  return (
    <div className="form-grid">
      <div className="form-row-2">
        <div>
          <label>Name</label>
          <input value={entity.name} onChange={e => update({ name: e.target.value })} />
        </div>
        <div>
          <label>Type</label>
          <select value={entity.type} onChange={e => update({ type: e.target.value })}>
            {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Portrait / token image */}
      <div>
        <label>Token Image <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— optional; falls back to colored token</span></label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="portrait-preview" style={{ background: entity.color }}>
            {entity.imageUrl ? <img src={entity.imageUrl} alt="" draggable="false" /> : <span>{(entity.name || '?').slice(0,1).toUpperCase()}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn sm" type="button" onClick={uploadImage}>⇧ Upload image</button>
            {entity.imageUrl && (
              <button className="btn sm ghost" type="button" onClick={() => update({ imageUrl: null })}>Remove image</button>
            )}
          </div>
        </div>
      </div>

      <div className="form-row-3">
        <div>
          <label>Color</label>
          <input type="color" value={entity.color} onChange={e => update({ color: e.target.value })} />
        </div>
        <div>
          <label>AC</label>
          <input type="number" value={entity.ac} onChange={e => update({ ac: Number(e.target.value) || 0 })} />
        </div>
        <div>
          <label>Speed</label>
          <input type="number" value={entity.speed} onChange={e => update({ speed: Number(e.target.value) || 0 })} />
        </div>
      </div>

      {isHpType && (
        <div className="form-row-3">
          <div>
            <label>HP Current</label>
            <input type="number" value={entity.hp.current} onChange={e => updateHp('current', e.target.value)} />
          </div>
          <div>
            <label>HP Max</label>
            <input type="number" value={entity.hp.max} onChange={e => updateHp('max', e.target.value)} />
          </div>
          <div>
            <label>Init Bonus</label>
            <input type="number" value={entity.initBonus} onChange={e => update({ initBonus: Number(e.target.value) || 0 })} />
          </div>
        </div>
      )}

      {/* Objects don't need a stat block but may still roll init if DM wants */}
      {entity.type === 'Object' && (
        <div className="form-row-2">
          <div>
            <label>Rolls Initiative?</label>
            <label className="toggle-row">
              <input type="checkbox"
                checked={!!entity.rollsInitiative}
                onChange={e => update({ rollsInitiative: e.target.checked })} />
              <span>{entity.rollsInitiative ? 'Included in initiative' : 'Static object — skipped'}</span>
            </label>
          </div>
          <div>
            <label>Init Bonus</label>
            <input type="number" value={entity.initBonus} disabled={!entity.rollsInitiative}
              onChange={e => update({ initBonus: Number(e.target.value) || 0 })} />
          </div>
        </div>
      )}

      {['PC','Monster','NPC','Familiar','Neutral Beast'].includes(entity.type) && (
        <div>
          <label>Ability Scores</label>
          <div className="form-row-6">
            {['str','dex','con','int','wis','cha'].map(s => (
              <div key={s} className="stat-box">
                <label>{s.toUpperCase()}</label>
                <input type="number" value={entity.stats[s]} onChange={e => updateStat(s, e.target.value)} />
                <div style={{ fontSize: 9, color: 'var(--ink-mute)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {modFor(entity.stats[s]) >= 0 ? `+${modFor(entity.stats[s])}` : modFor(entity.stats[s])}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="form-row-2">
        <div>
          <label>Passive Perception</label>
          <input type="number" value={entity.passivePerception} onChange={e => update({ passivePerception: Number(e.target.value) || 0 })} />
        </div>
        {entity.type === 'PC' && (
          <div>
            <label>Level</label>
            <input type="number" value={entity.level} onChange={e => update({ level: Number(e.target.value) || 1 })} />
          </div>
        )}
        {entity.type === 'Monster' && (
          <div>
            <label>Challenge Rating</label>
            <input value={entity.cr} onChange={e => update({ cr: e.target.value })} />
          </div>
        )}
        {entity.type === 'NPC' && (
          <div>
            <label>Faction</label>
            <input value={entity.faction} onChange={e => update({ faction: e.target.value })} />
          </div>
        )}
        {entity.type === 'Familiar' && (
          <div>
            <label>Bonded To <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— the master PC name, if any</span></label>
            <input value={entity.faction} onChange={e => update({ faction: e.target.value })} placeholder="e.g. Caelum the wizard" />
          </div>
        )}
        {entity.type === 'Neutral Beast' && (
          <div>
            <label>Nature</label>
            <input value={entity.role} onChange={e => update({ role: e.target.value })} placeholder="e.g. deer, forest spirit" />
          </div>
        )}
        {entity.type === 'Object' && (
          <div>
            <label>Kind</label>
            <input value={entity.role} onChange={e => update({ role: e.target.value })} placeholder="e.g. altar, chest, rune" />
          </div>
        )}
      </div>

      {entity.type === 'PC' && (
        <div className="form-row-2">
          <div>
            <label>Class</label>
            <input value={entity.class} onChange={e => update({ class: e.target.value })} placeholder="e.g. Wizard" />
          </div>
          <div>
            <label>Player Name</label>
            <input value={entity.playerName} onChange={e => update({ playerName: e.target.value })} />
          </div>
        </div>
      )}

      {/* v2: Sickness — DM only, hidden stat, PCs only (ignored at render for other types) */}
      {entity.type === 'PC' && (
        <div>
          <label>Sickness <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— DM-only; applies a creeping pallor to this player's view</span></label>
          <div className="sickness-picker">
            {[0,1,2,3].map(lvl => (
              <button
                key={lvl}
                type="button"
                className={`sickness-btn ${entity.sickness === lvl ? 'active' : ''} sick-level-${lvl}`}
                onClick={() => update({ sickness: lvl })}
              >
                <span className="sickness-num">{lvl}</span>
                <span className="sickness-label">{lvl === 0 ? 'Healthy' : SICKNESS_DESCRIPTORS[lvl]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(entity.type === 'Monster' || entity.type === 'Neutral Beast') && (
        <div>
          <label>Abilities / DM Notes</label>
          <textarea value={entity.abilities} onChange={e => update({ abilities: e.target.value })}
            placeholder="Multiattack, breath weapon, legendary actions…" />
        </div>
      )}

      {isPlayerFacing && (
        <div>
          <label>Player-Visible Description <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— shown to players when revealed / on hover</span></label>
          <textarea value={entity.playerDescription || ''} onChange={e => update({ playerDescription: e.target.value })}
            placeholder="A hulking brute draped in rusted chains. Its breath reeks of rot." />
        </div>
      )}

      {/* v3: Vision — darkvision and light-radius in feet. Used by the
          darkness / vision rendering system. */}
      {['PC','Familiar','Monster','Neutral Beast','NPC'].includes(entity.type) && (
        <div>
          <label>Vision <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— darkvision + carried light (feet)</span></label>
          <div className="form-row-2">
            <div>
              <label style={{ fontSize: 9 }}>Darkvision</label>
              <input type="number" min="0" step="5" value={entity.darkvision || 0}
                onChange={e => update({ darkvision: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={{ fontSize: 9 }}>Light Radius</label>
              <input type="number" min="0" step="5" value={entity.lightRadius || 0}
                onChange={e => update({ lightRadius: Number(e.target.value) || 0 })} />
            </div>
          </div>
        </div>
      )}

      <div>
        <label>Conditions</label>
        <div className="cond-grid">
          {CONDITIONS.map(c => (
            <div
              key={c}
              className={`cond-chip ${entity.conditions.includes(c) ? 'active' : ''}`}
              onClick={() => update({
                conditions: entity.conditions.includes(c)
                  ? entity.conditions.filter(x => x !== c)
                  : [...entity.conditions, c]
              })}
            >{c}</div>
          ))}
        </div>
      </div>

      <div>
        <label>DM Notes <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— never shown to players</span></label>
        <textarea value={entity.notes} onChange={e => update({ notes: e.target.value })} />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn primary" onClick={() => onSave(entity)}>Save</button>
      </div>
    </div>
  );
}

// ====================================================================
// ENTITY SIDEBAR (DM)
// ====================================================================
function EntitySidebar({ state, dispatch, onEditEntity, onSelectEntity, selectedEntityId }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [showDead, setShowDead] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const order = state.entityOrder || [];
  const entitiesByOrder = order.map(id => state.entities[id]).filter(Boolean);
  // include any entity not yet in entityOrder (should be migrated but defensive)
  for (const e of Object.values(state.entities)) {
    if (!order.includes(e.id)) entitiesByOrder.push(e);
  }

  // Filtering preserves order. We never mutate master order based on filter.
  const filtered = entitiesByOrder.filter(e => {
    if (filter !== 'All' && e.type !== filter) return false;
    if (!showDead && e.hp.current <= 0) return false;
    if (search && !e.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const newEntity = () => onEditEntity(makeEntity());
  const adjustHp = (id, delta) => dispatch({ type: 'ENTITY_HP_ADJUST', id, delta });

  // v3: Token preset shortcut. Creates a new entity pre-filled from a built-in
  // preset or a DM-saved custom preset, then opens the edit form so the DM
  // can tweak before saving.
  const newFromPreset = (preset) => {
    if (!preset) return;
    onEditEntity(makeEntity({ ...preset.entity }));
    setShowPresetMenu(false);
  };
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  // Allow DM to save any entity as a custom preset via ENTITY_REORDER, stored
  // inside state.tokenPresets keyed by uid. Expose save/delete here.
  const saveAsPreset = (entity) => {
    const name = prompt('Preset name:', entity.name);
    if (!name) return;
    const id = uid('preset_');
    dispatch({
      type: 'TOKEN_PRESET_UPSERT',
      preset: {
        id, name,
        entity: { ...entity, id: undefined, imageUrl: entity.imageUrl || null },
      },
    });
  };
  const deletePreset = (id) => {
    if (!confirm('Delete this preset?')) return;
    dispatch({ type: 'TOKEN_PRESET_DELETE', id });
  };
  const allPresets = [
    ...BUILTIN_TOKEN_PRESETS,
    ...Object.values(state.tokenPresets || {}),
  ];

  const tokensByEntity = useMemo(() => {
    const m = {};
    Object.values(state.tokens).forEach(t => {
      if (t.mapId === state.currentMapId) m[t.entityId] = t;
    });
    return m;
  }, [state.tokens, state.currentMapId]);

  const toggleVisibility = (token) => {
    dispatch({ type: 'TOKEN_VISIBILITY', id: token.id, visible: !token.visible });
  };

  const handleCardClick = (e, entity) => {
    // Expand/collapse. Also notify parent for selection wiring (token highlight).
    setExpandedId(prev => prev === entity.id ? null : entity.id);
    onSelectEntity?.(entity.id);
  };

  // --- Drag-to-reorder logic ---
  // We use the same drag that places on map (dataTransfer entity-id),
  // but let the sidebar cards act as drop targets to reorder.
  const onCardDragStart = (ev, entity) => {
    ev.dataTransfer.setData('text/entity-id', entity.id);
    ev.dataTransfer.effectAllowed = 'copyMove';
    // Use the parent card element as the drag ghost so it doesn't look
    // like the user is dragging just a 12px handle grip.
    const card = ev.currentTarget.closest('.entity-card');
    if (card) {
      try { ev.dataTransfer.setDragImage(card, 20, 20); } catch {}
    }
  };
  const onCardDragOver = (ev, overEntity) => {
    // Only treat as reorder when no search filter differs from master — we still
    // allow it, but reorder maps to the master list.
    const draggingId = ev.dataTransfer.types.includes('text/entity-id');
    if (!draggingId) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    setDragOverId(overEntity.id);
  };
  const onCardDragLeave = () => setDragOverId(null);
  const onCardDrop = (ev, overEntity) => {
    ev.preventDefault();
    ev.stopPropagation(); // prevent canvas drop
    setDragOverId(null);
    const srcId = ev.dataTransfer.getData('text/entity-id');
    if (!srcId || srcId === overEntity.id) return;
    const base = state.entityOrder || [];
    const srcIdx = base.indexOf(srcId);
    const dstIdx = base.indexOf(overEntity.id);
    if (srcIdx === -1 || dstIdx === -1) return;
    // Drop-before-target semantics: remove src, then insert at the target's
    // index. Target shifts left by 1 if src was originally before it.
    const next = [...base];
    next.splice(srcIdx, 1);
    const insertAt = srcIdx < dstIdx ? dstIdx - 1 : dstIdx;
    next.splice(insertAt, 0, srcId);
    dispatch({ type: 'ENTITY_REORDER', order: next });
  };

  return (
    <>
      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>Bestiary</span>
          <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
            <button className="btn sm" onClick={() => setShowPresetMenu(v => !v)}
              title="Quick-create from a preset">
              ❈ Preset
            </button>
            <button className="btn sm primary" onClick={newEntity}>＋ New</button>
            {showPresetMenu && (
              <div className="preset-menu">
                <div className="preset-menu-header">Built-in</div>
                {BUILTIN_TOKEN_PRESETS.map(p => (
                  <div key={p.id} className="preset-menu-item" onClick={() => newFromPreset(p)}>
                    <div className="preset-menu-swatch" style={{ background: p.entity.color || '#888' }} />
                    <div style={{ flex: 1 }}>
                      <div className="preset-menu-name">{p.name}</div>
                      <div className="preset-menu-type">{p.entity.type}</div>
                    </div>
                  </div>
                ))}
                {Object.values(state.tokenPresets || {}).length > 0 && (
                  <>
                    <div className="preset-menu-header">Custom</div>
                    {Object.values(state.tokenPresets).map(p => (
                      <div key={p.id} className="preset-menu-item" onClick={() => newFromPreset(p)}>
                        <div className="preset-menu-swatch" style={{ background: p.entity.color || '#888' }} />
                        <div style={{ flex: 1 }}>
                          <div className="preset-menu-name">{p.name}</div>
                          <div className="preset-menu-type">{p.entity.type}</div>
                        </div>
                        <button className="preset-menu-del" onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }}
                          title="Delete preset">×</button>
                      </div>
                    ))}
                  </>
                )}
                <div className="preset-menu-footer">
                  Drag any entity card → "Save as preset" from its menu
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="search-row">
          <input placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="filter-pills">
          {['All','PC','Monster','NPC'].map(f => (
            <div key={f} className={`pill ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f}</div>
          ))}
          <div className={`pill ${!showDead ? 'active' : ''}`} onClick={() => setShowDead(!showDead)}>
            {showDead ? 'Hide dead' : 'Show dead'}
          </div>
        </div>
      </div>
      <div className="sidebar-section grow">
        <div className="entity-list">
          {filtered.length === 0 && (
            <div className="empty-state">
              <span className="glyph">✦</span>
              {entitiesByOrder.length === 0 ? 'No entities yet. Forge one.' : 'No matching entities.'}
            </div>
          )}
          {filtered.map(e => {
            const onMap = tokensByEntity[e.id];
            const hpPct = e.hp.max > 0 ? e.hp.current / e.hp.max : 0;
            const hpClass = hpPct <= 0.25 ? 'critical' : hpPct <= 0.5 ? 'low' : '';
            const isDead = e.hp.current <= 0;
            const swatchClass = e.type === 'Monster' ? 'monster' : e.type === 'NPC' ? 'npc' : '';
            const expanded = expandedId === e.id;
            const selected = selectedEntityId === e.id;
            const dropping = dragOverId === e.id;
            return (
              <div
                key={e.id}
                className={`entity-card ${selected ? 'selected' : ''} ${isDead ? 'dead' : ''} ${expanded ? 'expanded' : ''} ${dropping ? 'drop-target' : ''}`}
                onDragOver={(ev) => onCardDragOver(ev, e)}
                onDragLeave={onCardDragLeave}
                onDrop={(ev) => onCardDrop(ev, e)}
              >
                <div
                  className="entity-card-row"
                  onClick={(ev) => handleCardClick(ev, e)}
                >
                  {/* Drag handle — draggable, used for reorder AND map placement */}
                  <div
                    className="drag-handle"
                    draggable
                    onDragStart={(ev) => { ev.stopPropagation(); onCardDragStart(ev, e); }}
                    onClick={(ev) => ev.stopPropagation()}
                    title="Drag to reorder or to place on map"
                  >⋮⋮</div>
                  <div className={`entity-swatch ${swatchClass}`} style={{ background: e.color }} />
                  <div className="entity-info">
                    <div className="entity-name">{e.name}</div>
                    <div className="entity-meta">
                      <span className="mono">{e.type === 'PC' ? `L${e.level} ${e.class||''}` : e.type === 'Monster' ? `CR ${e.cr}` : e.role || 'NPC'}</span>
                      <span className={`entity-hp ${hpClass} mono`}>{e.hp.current}/{e.hp.max}</span>
                      <span className="mono" style={{ color: 'var(--ink-mute)' }}>AC {e.ac}</span>
                    </div>
                  </div>
                  {/* Eye toggle — only shown when entity has a token on current map */}
                  {onMap && (
                    <button
                      className={`eye-btn ${onMap.visible ? 'on' : 'off'}`}
                      onClick={(ev) => { ev.stopPropagation(); toggleVisibility(onMap); }}
                      title={onMap.visible ? 'Visible to players — click to hide' : 'Hidden from players — click to reveal'}
                    >
                      {onMap.visible ? '👁' : '⦿'}
                    </button>
                  )}
                  <div className="entity-actions" onClick={ev => ev.stopPropagation()}>
                    <button className="btn sm danger" onClick={() => adjustHp(e.id, -1)} title="-1 HP">−</button>
                    <button className="btn sm" onClick={() => adjustHp(e.id, +1)} title="+1 HP">+</button>
                    <button className="btn sm" onClick={() => onEditEntity(e)} title="Edit full sheet">✎</button>
                  </div>
                </div>
                {expanded && <EntityStatBlock entity={e} onMap={onMap} />}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// Inline, expandable stat block shown when a DM clicks an entity card.
function EntityStatBlock({ entity, onMap }) {
  const e = entity;
  const hpPct = e.hp.max > 0 ? (e.hp.current / e.hp.max) * 100 : 0;
  const hpClass = hpPct <= 25 ? 'critical' : hpPct <= 50 ? 'low' : '';
  return (
    <div className="entity-expanded">
      <div className="statblock-row">
        <div className="statblock-cell">
          <div className="statblock-label">AC</div>
          <div className="statblock-value mono">{e.ac}</div>
        </div>
        <div className="statblock-cell">
          <div className="statblock-label">HP</div>
          <div className="statblock-value mono">
            {e.hp.current}<span style={{ color: 'var(--ink-mute)' }}>/{e.hp.max}</span>
          </div>
        </div>
        <div className="statblock-cell">
          <div className="statblock-label">Speed</div>
          <div className="statblock-value mono">{e.speed}</div>
        </div>
        <div className="statblock-cell">
          <div className="statblock-label">Init</div>
          <div className="statblock-value mono">{e.initBonus >= 0 ? `+${e.initBonus}` : e.initBonus}</div>
        </div>
      </div>
      <div className="statblock-hp-bar">
        <div className={`statblock-hp-fill ${hpClass}`} style={{ width: `${hpPct}%` }} />
      </div>
      <div className="statblock-stats">
        {['str','dex','con','int','wis','cha'].map(s => (
          <div key={s} className="statblock-stat">
            <div className="statblock-stat-label">{s.toUpperCase()}</div>
            <div className="statblock-stat-value mono">{e.stats[s]}</div>
            <div className="statblock-stat-mod mono">
              {modFor(e.stats[s]) >= 0 ? `+${modFor(e.stats[s])}` : modFor(e.stats[s])}
            </div>
          </div>
        ))}
      </div>
      {e.conditions.length > 0 && (
        <div className="statblock-conditions">
          {e.conditions.map(c => (
            <div key={c} className="cond-chip active" style={{ cursor: 'default' }}>{c}</div>
          ))}
        </div>
      )}
      {e.type === 'PC' && e.playerName && (
        <div className="statblock-note"><strong>Player:</strong> {e.playerName}</div>
      )}
      {e.type === 'Monster' && e.abilities && (
        <div className="statblock-note"><strong>Abilities:</strong><br />{e.abilities}</div>
      )}
      {e.type === 'Monster' && e.playerDescription && (
        <div className="statblock-note" style={{ borderColor: 'var(--gold-dim)' }}>
          <strong style={{ color: 'var(--gold)' }}>Player-Visible:</strong><br />{e.playerDescription}
        </div>
      )}
      {e.type === 'NPC' && (e.faction || e.role) && (
        <div className="statblock-note">
          {e.role && <><strong>Role:</strong> {e.role}<br /></>}
          {e.faction && <><strong>Faction:</strong> {e.faction}</>}
        </div>
      )}
      {e.notes && (
        <div className="statblock-note"><strong>DM Notes:</strong><br />{e.notes}</div>
      )}
      {onMap && (
        <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 6, fontStyle: 'italic' }}>
          ◆ Placed on current map {onMap.visible ? '— visible to players' : '— hidden from players'}
        </div>
      )}
    </div>
  );
}

// ====================================================================
// INITIATIVE TRACKER
// ====================================================================
function InitiativeTracker({ state, dispatch, mode, onClose }) {
  const { initiative, entities, currentMapId } = state;
  const rollAll = () => {
    const tokensHere = Object.values(state.tokens).filter(t => t.mapId === currentMapId);
    const entitiesHere = tokensHere.map(t => entities[t.entityId]).filter(Boolean);
    const entries = entitiesHere.map(e => ({
      entityId: e.id,
      roll: roll(20) + (e.initBonus || 0),
    }));
    entries.sort((a, b) => b.roll - a.roll || (entities[b.entityId]?.initBonus || 0) - (entities[a.entityId]?.initBonus || 0) || entities[a.entityId].name.localeCompare(entities[b.entityId].name));
    dispatch({ type: 'INIT_SET', initiative: { active: true, entries, turn: 0, round: 1 } });
  };

  const clearInit = () => dispatch({ type: 'INIT_SET', initiative: { active: false, entries: [], turn: 0, round: 1 } });
  const advance = () => dispatch({ type: 'INIT_ADVANCE' });

  const updateRoll = (entityId, newRoll) => {
    const entries = initiative.entries.map(e => e.entityId === entityId ? { ...e, roll: Number(newRoll) || 0 } : e);
    entries.sort((a, b) => b.roll - a.roll);
    dispatch({ type: 'INIT_SET', initiative: { ...initiative, entries } });
  };

  const removeEntry = (entityId) => {
    const entries = initiative.entries.filter(e => e.entityId !== entityId);
    const turn = Math.min(initiative.turn, Math.max(0, entries.length - 1));
    dispatch({ type: 'INIT_SET', initiative: { ...initiative, entries, turn } });
  };

  return (
    <div className="float-panel" style={{ right: 16, top: 80, width: 340 }}>
      <div className="float-panel-header">
        <span>⚔ Initiative · Round {initiative.round}</span>
        <button className="close-x" onClick={onClose}>×</button>
      </div>
      <div className="float-panel-body">
        {mode === 'dm' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button className="btn primary" onClick={rollAll}>🎲 Roll All</button>
            <button className="btn" onClick={advance} disabled={!initiative.entries.length}>⏭ Next Turn</button>
            <button className="btn danger" onClick={clearInit} disabled={!initiative.entries.length}>Clear</button>
          </div>
        )}
        <div className="init-list">
          {initiative.entries.length === 0 ? (
            <div className="empty-state"><span className="glyph">⚔</span>Initiative not yet rolled.</div>
          ) : initiative.entries.map((entry, idx) => {
            const e = entities[entry.entityId];
            if (!e) return null;
            // Players see HP only for PCs; monsters get a descriptor instead of numbers
            const showExactHp = mode === 'dm' || e.type === 'PC';
            const hpPctRaw = e.hp.max > 0 ? (e.hp.current / e.hp.max) * 100 : 0;
            const monsterStatus =
              hpPctRaw <= 0 ? 'Down' :
              hpPctRaw < 30 ? 'Waning' :
              hpPctRaw <= 70 ? 'Rough' :
              'Strong';
            return (
              <div key={entry.entityId} className={`init-entry ${idx === initiative.turn ? 'current' : ''}`}>
                {mode === 'dm' ? (
                  <input className="mono" type="number" value={entry.roll}
                    onChange={(ev) => updateRoll(entry.entityId, ev.target.value)}
                    style={{ width: 48, padding: 4, textAlign: 'center', fontWeight: 600 }} />
                ) : (
                  <div className="init-roll">{entry.roll}</div>
                )}
                <div className="entity-swatch" style={{ background: e.color, width: 10, height: 10 }} />
                <div className="init-name">{e.name}</div>
                {showExactHp ? (
                  <div className="init-hp">{e.hp.current}/{e.hp.max}</div>
                ) : (
                  <div className={`init-status status-${monsterStatus.toLowerCase()}`}>{monsterStatus}</div>
                )}
                {mode === 'dm' && (
                  <button className="btn sm ghost" onClick={() => removeEntry(entry.entityId)} title="Remove">×</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// MAP MANAGER
// ====================================================================
function MapManager({ state, dispatch, onClose, toast }) {
  const [editing, setEditing] = useState(null);
  const maps = Object.values(state.maps);

  const newMap = () => {
    const id = uid('map_');
    setEditing({ id, name: 'New Map', type: 'region', parentId: null, imageUrl: null, notes: '', viewport: { x: 0, y: 0, zoom: 1 } });
  };

  const uploadImage = async () => {
    const data = await pickImage();
    if (data) setEditing({ ...editing, imageUrl: data });
  };

  const saveMap = () => {
    dispatch({ type: 'MAP_UPSERT', map: editing });
    setEditing(null);
    toast('Map saved', 'success');
  };

  const deleteMap = (id) => {
    if (!confirm('Delete this map and all its tokens?')) return;
    dispatch({ type: 'MAP_DELETE', id });
    toast('Map deleted');
  };

  if (editing) {
    return (
      <div className="float-panel" style={{ right: 16, top: 80, width: 400 }}>
        <div className="float-panel-header">
          <span>⌖ {state.maps[editing.id] ? 'Edit Map' : 'New Map'}</span>
          <button className="close-x" onClick={() => setEditing(null)}>×</button>
        </div>
        <div className="float-panel-body">
          <div className="form-grid">
            <div>
              <label>Name</label>
              <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="form-row-2">
              <div>
                <label>Type</label>
                <select value={editing.type} onChange={e => setEditing({ ...editing, type: e.target.value })}>
                  <option value="world">World</option>
                  <option value="region">Region</option>
                  <option value="city">City</option>
                  <option value="dungeon">Dungeon</option>
                  <option value="interior">Interior</option>
                  <option value="encounter">Encounter</option>
                </select>
              </div>
              <div>
                <label>Parent Map</label>
                <select value={editing.parentId || ''} onChange={e => setEditing({ ...editing, parentId: e.target.value || null })}>
                  <option value="">— None —</option>
                  {maps.filter(m => m.id !== editing.id).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label>Map Image</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn" onClick={uploadImage}>📁 Upload Image</button>
                {editing.imageUrl && (
                  <>
                    <img src={editing.imageUrl} style={{ height: 48, borderRadius: 4, border: '1px solid var(--border)' }} />
                    <button className="btn sm danger" onClick={() => setEditing({ ...editing, imageUrl: null })}>Clear</button>
                  </>
                )}
              </div>
              <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4 }}>Embedded as base64 — stays in session.</div>
            </div>
            <div>
              <label>Notes (DM only)</label>
              <textarea value={editing.notes} onChange={e => setEditing({ ...editing, notes: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn primary" onClick={saveMap}>Save Map</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="float-panel" style={{ right: 16, top: 80, width: 360 }}>
      <div className="float-panel-header">
        <span>⌖ Maps & Realms</span>
        <button className="close-x" onClick={onClose}>×</button>
      </div>
      <div className="float-panel-body">
        <button className="btn primary" onClick={newMap} style={{ marginBottom: 12 }}>＋ New Map</button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {maps.map(m => {
            const parent = m.parentId ? state.maps[m.parentId]?.name : null;
            const isCurrent = state.currentMapId === m.id;
            return (
              <div key={m.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: 10, borderRadius: 5,
                background: isCurrent ? 'rgba(212,165,116,0.1)' : 'var(--bg-0)',
                border: `1px solid ${isCurrent ? 'var(--gold-dim)' : 'var(--border-soft)'}`
              }}>
                {m.imageUrl && <img src={m.imageUrl} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 3 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-mute)' }}>
                    {m.type}{parent ? ` · in ${parent}` : ''}
                  </div>
                </div>
                <button className="btn sm" onClick={() => dispatch({ type: 'MAP_SWITCH', id: m.id })} disabled={isCurrent}>Go</button>
                <button className="btn sm ghost" onClick={() => setEditing(deepClone(m))}>✎</button>
                <button className="btn sm ghost" onClick={() => deleteMap(m.id)} disabled={maps.length <= 1}>×</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// PRESETS PANEL
// ====================================================================
function PresetsPanel({ state, dispatch, onClose, toast }) {
  const [name, setName] = useState('');
  const presets = Object.values(state.presets);

  const savePreset = () => {
    if (!name.trim()) { toast('Enter a name', 'error'); return; }
    const tokensOnMap = Object.values(state.tokens).filter(t => t.mapId === state.currentMapId);
    const preset = {
      id: uid('preset_'),
      name: name.trim(),
      mapId: state.currentMapId,
      tokens: tokensOnMap.map(t => ({ ...t })),
    };
    dispatch({ type: 'PRESET_SAVE', preset });
    setName('');
    toast('Preset saved', 'success');
  };

  const loadPreset = (preset) => {
    if (!confirm(`Load "${preset.name}"? This replaces tokens on the target map.`)) return;
    // Remove current tokens on that map and restore preset tokens
    Object.keys(state.tokens).forEach(tid => {
      if (state.tokens[tid].mapId === preset.mapId) {
        dispatch({ type: 'TOKEN_REMOVE', id: tid });
      }
    });
    preset.tokens.forEach(t => {
      dispatch({ type: 'TOKEN_PLACE', token: { ...t, id: uid('tok_') } });
    });
    dispatch({ type: 'MAP_SWITCH', id: preset.mapId });
    toast('Preset loaded', 'success');
  };

  const overwritePreset = (preset) => {
    if (!confirm(`Overwrite "${preset.name}" with current state?`)) return;
    const tokensOnMap = Object.values(state.tokens).filter(t => t.mapId === state.currentMapId);
    dispatch({
      type: 'PRESET_SAVE',
      preset: { ...preset, mapId: state.currentMapId, tokens: tokensOnMap.map(t => ({ ...t })) }
    });
    toast('Preset overwritten', 'success');
  };

  const deletePreset = (id) => {
    if (!confirm('Delete this preset?')) return;
    dispatch({ type: 'PRESET_DELETE', id });
  };

  return (
    <div className="float-panel" style={{ right: 16, top: 80, width: 360 }}>
      <div className="float-panel-header">
        <span>❈ Encounter Presets</span>
        <button className="close-x" onClick={onClose}>×</button>
      </div>
      <div className="float-panel-body">
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input placeholder="Name this encounter…" value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && savePreset()} />
          <button className="btn primary" onClick={savePreset}>Save</button>
        </div>
        {presets.length === 0 ? (
          <div className="empty-state"><span className="glyph">❈</span>No saved encounters yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {presets.map(p => {
              const map = state.maps[p.mapId];
              return (
                <div key={p.id} style={{
                  padding: 10, borderRadius: 5,
                  background: 'var(--bg-0)', border: '1px solid var(--border-soft)'
                }}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginBottom: 6 }}>
                    {p.tokens.length} tokens · {map?.name || 'unknown map'}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn sm primary" onClick={() => loadPreset(p)}>Load</button>
                    <button className="btn sm" onClick={() => overwritePreset(p)}>Overwrite</button>
                    <button className="btn sm danger" onClick={() => deletePreset(p.id)}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ====================================================================
// TOKEN DETAIL PANEL
// ====================================================================
function TokenDetailPanel({ state, token, entity, mode, dispatch, onClose, claimedEntityId, playerActionSender, onLongRest }) {
  const [hpDelta, setHpDelta] = useState(0);

  if (!entity) return null;

  const isDM = mode === 'dm';
  const isOwnPC = entity.id === claimedEntityId;
  // v2: HP/AC/Speed get hidden from players for anything that isn't PC/Familiar.
  // Player's own PC and claimed familiars still show everything because
  // those flow through the own-sheet code paths.
  const isOpaqueForPlayer = !isDM && !PLAYER_HP_VISIBLE_TYPES.has(entity.type);

  // DM edits via local dispatch. Own-PC player edits go through playerActionSender
  // which routes through the DM as authority — keeping sync clean.
  const emitHpAdjust = (delta) => {
    if (isDM) {
      dispatch({ type: 'ENTITY_HP_ADJUST', id: entity.id, delta });
    } else if (isOwnPC && playerActionSender) {
      playerActionSender({ type: 'patch_own_entity', payload: { op: 'hp_adjust', delta } });
    }
  };
  const emitToggleCondition = (c) => {
    if (isDM) {
      dispatch({ type: 'ENTITY_TOGGLE_CONDITION', id: entity.id, condition: c });
    } else if (isOwnPC && playerActionSender) {
      playerActionSender({ type: 'patch_own_entity', payload: { op: 'toggle_condition', condition: c } });
    }
  };

  const applyHp = (sign) => {
    const d = Math.abs(hpDelta) * sign;
    if (d === 0) return;
    emitHpAdjust(d);
    setHpDelta(0);
  };

  const toggleVisibility = () => {
    dispatch({ type: 'TOKEN_VISIBILITY', id: token.id, visible: !token.visible });
  };

  const removeToken = () => {
    if (!confirm('Remove this token from the map?')) return;
    dispatch({ type: 'TOKEN_REMOVE', id: token.id });
    onClose();
  };

  // HP descriptor for monsters viewed by players
  const hpPctRaw = entity.hp.max > 0 ? (entity.hp.current / entity.hp.max) * 100 : 0;
  const monsterStatus =
    hpPctRaw <= 0 ? 'Down' :
    hpPctRaw < 30 ? 'Waning' :
    hpPctRaw <= 70 ? 'Rough' :
    'Strong';

  const canEditHp = isDM || isOwnPC;
  const canEditConditions = isDM || isOwnPC;

  return (
    <div className="float-panel" style={{ left: 16, top: 80, width: 340 }}>
      <div className="float-panel-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="entity-swatch" style={{ background: entity.color, width: 12, height: 12 }} />
          {entity.name}
          {isOwnPC && <span className="own-pc-badge">YOU</span>}
        </span>
        <button className="close-x" onClick={onClose}>×</button>
      </div>
      <div className="float-panel-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
          {!isOpaqueForPlayer && (
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-0)', borderRadius: 4, border: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>AC</div>
              <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--gold)' }}>{entity.ac}</div>
            </div>
          )}
          <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-0)', borderRadius: 4, border: '1px solid var(--border-soft)' }}>
            <div style={{ fontSize: 10, color: 'var(--ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>HP</div>
            {isOpaqueForPlayer ? (
              <div className={`status-label status-${monsterStatus.toLowerCase()}`}>{monsterStatus}</div>
            ) : (
              <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{entity.hp.current}<span style={{ color: 'var(--ink-mute)', fontSize: 12 }}>/{entity.hp.max}</span></div>
            )}
          </div>
          {!isOpaqueForPlayer && (
            <div style={{ textAlign: 'center', padding: 8, background: 'var(--bg-0)', borderRadius: 4, border: '1px solid var(--border-soft)' }}>
              <div style={{ fontSize: 10, color: 'var(--ink-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Speed</div>
              <div className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{entity.speed}</div>
            </div>
          )}
        </div>

        <div style={{ fontSize: 11, color: 'var(--ink-dim)', marginBottom: 8 }}>
          {entity.type === 'PC' && `Level ${entity.level} ${entity.class || ''}${entity.playerName ? ` · ${entity.playerName}` : ''}`}
          {entity.type === 'Monster' && isDM && `CR ${entity.cr}`}
          {entity.type === 'NPC' && (entity.faction ? `${entity.role} · ${entity.faction}` : entity.role || 'NPC')}
        </div>

        {isOpaqueForPlayer && entity.playerDescription && (
          <div className="statblock-note" style={{ marginBottom: 10 }}>
            {entity.playerDescription}
          </div>
        )}

        {canEditHp && (
          <>
            <label>Adjust HP {isOwnPC && !isDM && <span style={{ color: 'var(--gold-dim)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— your character</span>}</label>
            <div className="hp-adjuster" style={{ marginBottom: 10 }}>
              <button className="btn danger" onClick={() => applyHp(-1)}>− Damage</button>
              <input type="number" value={hpDelta} onChange={e => setHpDelta(Math.abs(Number(e.target.value)) || 0)} />
              <button className="btn" onClick={() => applyHp(+1)}>+ Heal</button>
            </div>
          </>
        )}

        <div style={{ marginBottom: 10 }}>
          <label>Conditions</label>
          <div className="cond-grid">
            {CONDITIONS.slice(0, 15).map(c => (
              <div
                key={c}
                className={`cond-chip ${entity.conditions.includes(c) ? 'active' : ''}`}
                onClick={canEditConditions ? () => emitToggleCondition(c) : undefined}
                style={{ cursor: canEditConditions ? 'pointer' : 'default' }}
              >{c}</div>
            ))}
          </div>
        </div>

        {isDM && entity.type === 'Monster' && entity.abilities && (
          <div style={{ marginBottom: 10 }}>
            <label>Abilities</label>
            <div style={{ fontSize: 12, padding: 8, background: 'var(--bg-0)', borderRadius: 4, whiteSpace: 'pre-wrap' }}>{entity.abilities}</div>
          </div>
        )}

        {isDM && entity.notes && (
          <div style={{ marginBottom: 10 }}>
            <label>DM Notes</label>
            <div style={{ fontSize: 12, padding: 8, background: 'var(--bg-0)', borderRadius: 4, whiteSpace: 'pre-wrap' }}>{entity.notes}</div>
          </div>
        )}

        {/* v3: DM-only death save tracker (PCs only). Counters clamp 0–3. */}
        {isDM && entity.type === 'PC' && (
          <div style={{ marginBottom: 10 }}>
            <label>Death Saves <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— DM only</span></label>
            <div className="death-saves">
              <div className="death-saves-row">
                <span className="death-saves-label good">Successes</span>
                <div className="death-pip-row">
                  {[1,2,3].map(n => {
                    const filled = (entity.deathSaves?.successes || 0) >= n;
                    return (
                      <button key={n} type="button"
                        className={`death-pip success ${filled ? 'filled' : ''}`}
                        onClick={() => dispatch({ type: 'DEATH_SAVE_SET', id: entity.id,
                          successes: filled && (entity.deathSaves?.successes === n) ? n - 1 : n })}
                        title={`Set successes to ${n}`}>✓</button>
                    );
                  })}
                </div>
              </div>
              <div className="death-saves-row">
                <span className="death-saves-label bad">Failures</span>
                <div className="death-pip-row">
                  {[1,2,3].map(n => {
                    const filled = (entity.deathSaves?.failures || 0) >= n;
                    return (
                      <button key={n} type="button"
                        className={`death-pip failure ${filled ? 'filled' : ''}`}
                        onClick={() => dispatch({ type: 'DEATH_SAVE_SET', id: entity.id,
                          failures: filled && (entity.deathSaves?.failures === n) ? n - 1 : n })}
                        title={`Set failures to ${n}`}>✗</button>
                    );
                  })}
                </div>
              </div>
              {(entity.deathSaves?.successes > 0 || entity.deathSaves?.failures > 0) && (
                <button className="btn sm ghost" style={{ marginTop: 4 }}
                  onClick={() => dispatch({ type: 'DEATH_SAVE_CLEAR', id: entity.id })}>
                  Clear death saves
                </button>
              )}
            </div>
          </div>
        )}

        {/* v3: Familiar bonding dropdown — DM can bond a Familiar to any
            connected player (by their peer id, with the player's friendly name
            shown). Bonding gives that player movement rights. */}
        {isDM && entity.type === 'Familiar' && state && (
          <div style={{ marginBottom: 10 }}>
            <label>Bonded To <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— grants movement rights</span></label>
            <select
              className="mono"
              value={entity.bondedPeerId || ''}
              onChange={(e) => {
                const peerId = e.target.value || null;
                dispatch({ type: 'ENTITY_PATCH', id: entity.id, patch: { bondedPeerId: peerId } });
              }}
              style={{ width: '100%' }}>
              <option value="">— unbonded —</option>
              {Object.entries(state.claims || {}).map(([peerId, claim]) => (
                <option key={peerId} value={peerId}>
                  {claim.playerName || `peer ${peerId.slice(0, 8)}…`}
                  {claim.pc && state.entities[claim.pc] ? ` — plays ${state.entities[claim.pc].name}` : ''}
                </option>
              ))}
            </select>
            {entity.bondedPeerId && (
              <div className="settings-hint">
                Bonded player can move this familiar's token during their turn.
              </div>
            )}
          </div>
        )}

        {/* v3: Vision stats — darkvision + light radius (DM-only edit) */}
        {isDM && ['PC','Familiar','Monster','Neutral Beast','NPC'].includes(entity.type) && (
          <div style={{ marginBottom: 10 }}>
            <label>Vision <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— used by the darkness system</span></label>
            <div className="form-row-2">
              <div>
                <label style={{ fontSize: 9 }}>Darkvision (ft)</label>
                <input type="number" min="0" step="5" value={entity.darkvision || 0}
                  onChange={(e) => dispatch({ type: 'ENTITY_PATCH', id: entity.id, patch: { darkvision: Number(e.target.value) || 0 } })} />
              </div>
              <div>
                <label style={{ fontSize: 9 }}>Light Radius (ft)</label>
                <input type="number" min="0" step="5" value={entity.lightRadius || 0}
                  onChange={(e) => dispatch({ type: 'ENTITY_PATCH', id: entity.id, patch: { lightRadius: Number(e.target.value) || 0 } })} />
              </div>
            </div>
          </div>
        )}

        {/* v2: DM-only sickness editor for PCs. Hidden stat; only narrative
            descriptor leaks to the player on their own sheet. */}
        {isDM && entity.type === 'PC' && (
          <div style={{ marginBottom: 10 }}>
            <label>Sickness <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— creeping pallor on this player's view</span></label>
            <div className="sickness-picker">
              {[0,1,2,3].map(lvl => (
                <button
                  key={lvl}
                  type="button"
                  className={`sickness-btn ${entity.sickness === lvl ? 'active' : ''} sick-level-${lvl}`}
                  onClick={() => dispatch({ type: 'SET_SICKNESS', id: entity.id, level: lvl })}
                >
                  <span className="sickness-num">{lvl}</span>
                  <span className="sickness-label">{lvl === 0 ? 'Healthy' : SICKNESS_DESCRIPTORS[lvl]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* v2: DM-only per-token scale slider. Lets bosses grow, imps shrink. */}
        {isDM && (
          <div style={{ marginBottom: 10 }}>
            <label>Token Size <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— scale on this map</span></label>
            <div className="scale-row">
              <button className="btn sm" onClick={() => dispatch({ type: 'TOKEN_SCALE', id: token.id, scale: Math.max(0.3, (token.scale || 1) - 0.1) })}>−</button>
              <input type="range" min="0.3" max="4" step="0.05"
                value={token.scale || 1}
                onChange={(e) => dispatch({ type: 'TOKEN_SCALE', id: token.id, scale: Number(e.target.value) })} />
              <button className="btn sm" onClick={() => dispatch({ type: 'TOKEN_SCALE', id: token.id, scale: Math.min(4, (token.scale || 1) + 0.1) })}>+</button>
              <span className="mono scale-value">{((token.scale || 1) * 100).toFixed(0)}%</span>
              <button className="btn sm ghost" onClick={() => dispatch({ type: 'TOKEN_SCALE', id: token.id, scale: 1 })}>Reset</button>
            </div>
          </div>
        )}

        {isDM && (
          <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn" onClick={toggleVisibility}>
              {token.visible ? '🕶 Hide from players' : '👁 Reveal to players'}
            </button>
            {onLongRest && (entity.type === 'PC' || entity.type === 'Familiar') && (
              <button className="btn" onClick={() => onLongRest(entity.id)} title="Long rest this character only">⛭ Rest</button>
            )}
            <button className="btn danger" onClick={removeToken}>Remove</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ====================================================================
// TOKEN TOOLTIP  (hover info — DM sees full, player sees public subset)
// ====================================================================
// Small floating chip that follows the cursor. Not a React portal (lives
// inside the canvas container) so its coordinates are viewport-relative.
function TokenTooltip({ hovered, entities, mode, x, y }) {
  if (!hovered) return null;
  const ent = entities[hovered.entityId];
  if (!ent) return null;
  const isDM = mode === 'dm';
  const showHp = isDM || PLAYER_HP_VISIBLE_TYPES.has(ent.type);
  const hpPct = ent.hp.max > 0 ? (ent.hp.current / ent.hp.max) * 100 : 0;
  const status = hpPct <= 0 ? 'Down' : hpPct < 30 ? 'Waning' : hpPct <= 70 ? 'Rough' : 'Strong';
  const description = isDM
    ? (ent.notes || ent.playerDescription || '')
    : (ent.playerDescription || '');
  // v3: sickness as diegetic text — shows for DM always; for players only on
  // entities whose sickness survived the filter (i.e. their own owned PC).
  const sicknessLabel = SICKNESS_DESCRIPTORS[ent.sickness || 0] || '';
  return (
    <div className="token-tooltip" style={{ left: x + 16, top: y + 16 }}>
      <div className="token-tooltip-header">
        <span className="token-tooltip-name">{ent.name}</span>
        <span className={`token-tooltip-type type-${TOKEN_SHAPE_CLASS[ent.type] || 'npc'}`}>{ent.type}</span>
      </div>
      {ent.hp.max > 0 && (
        showHp
          ? <div className="token-tooltip-hp mono">HP {ent.hp.current}/{ent.hp.max}</div>
          : <div className={`status-label status-${status.toLowerCase()}`}>{status}</div>
      )}
      {sicknessLabel && (
        <div className={`token-tooltip-sickness sick-level-${ent.sickness}`}>
          <em>{sicknessLabel.toLowerCase()}</em>
        </div>
      )}
      {description && <div className="token-tooltip-desc">{description}</div>}
      {ent.conditions.length > 0 && (
        <div className="token-tooltip-conds">
          {ent.conditions.map(c => (
            <span key={c} className="party-cond-pill" style={{ background: CONDITION_COLORS[c] || '#555' }}>{c}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ====================================================================
// SETTINGS MODAL  (theme + global map scale)
// ====================================================================
function SettingsModal({ settings, onChange, onClose, mode, mapScale, onMapScaleChange }) {
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 460 }}>
        <div className="float-panel-header">
          <span>⚙ Settings</span>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="float-panel-body">
          <div className="settings-section">
            <label className="settings-label">Theme</label>
            <div className="theme-switch">
              <button
                className={`theme-option ${settings.theme === 'dark' ? 'active' : ''}`}
                onClick={() => onChange({ theme: 'dark' })}
              >
                <span className="theme-swatch dark" />
                <span>Dark Sanctum</span>
                <span className="theme-sub">Navy · gilded</span>
              </button>
              <button
                className={`theme-option ${settings.theme === 'light' ? 'active' : ''}`}
                onClick={() => onChange({ theme: 'light' })}
              >
                <span className="theme-swatch light" />
                <span>Warm Tavern</span>
                <span className="theme-sub">Parchment · oak</span>
              </button>
            </div>
          </div>

          {mode === 'dm' && (
            <div className="settings-section">
              <label className="settings-label">Map Scale <span className="settings-label-sub">— how large the map feels relative to tokens</span></label>
              <div className="scale-row">
                <button className="btn sm" onClick={() => onMapScaleChange(Math.max(0.3, (mapScale || 1) - 0.1))}>−</button>
                <input type="range" min="0.3" max="3" step="0.05"
                  value={mapScale || 1}
                  onChange={(e) => onMapScaleChange(Number(e.target.value))} />
                <button className="btn sm" onClick={() => onMapScaleChange(Math.min(3, (mapScale || 1) + 0.1))}>+</button>
                <span className="mono scale-value">{((mapScale || 1) * 100).toFixed(0)}%</span>
                <button className="btn sm ghost" onClick={() => onMapScaleChange(1)}>Reset</button>
              </div>
              <div className="settings-hint">
                Scales the entire map rendering uniformly. Pan/zoom still works on top.
              </div>
            </div>
          )}

          <div className="settings-section">
            <div className="settings-hint" style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>
              Preferences are stored on this device only.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// EDIT MY SHEET MODAL  (player self-service)
// ====================================================================
// Dedicated surface for a player to manage their own PC (and any
// familiars). Only HP adjustments and condition toggles are permitted;
// all writes are routed through the DM for validation.
function EditMySheetModal({ state, myPeerId, claim, playerActionSender, onClose }) {
  const [hpDelta, setHpDelta] = useState(0);
  const [focusedId, setFocusedId] = useState(claim.pc || claim.familiars[0] || null);
  const [expandedSection, setExpandedSection] = useState('core'); // core | stats | identity

  // v3: entity IDs the player may edit. PC + claimed familiars + bonded familiars.
  const myIds = useMemo(() => {
    const s = new Set([...(claim.familiars || [])]);
    if (claim.pc) s.add(claim.pc);
    // also include bonded familiars
    for (const [id, e] of Object.entries(state.entities)) {
      if (e && e.type === 'Familiar' && e.bondedPeerId === myPeerId) s.add(id);
    }
    return Array.from(s);
  }, [claim.pc, claim.familiars, state.entities, myPeerId]);

  const entity = focusedId && state.entities[focusedId] ? state.entities[focusedId] : null;

  // v3: direct field writer — routes through the DM-authoritative path.
  const setField = (patch) => {
    if (!entity) return;
    playerActionSender({ type: 'patch_own_entity', payload: { entityId: entity.id, op: 'field_set', patch } });
  };

  const applyHp = (sign) => {
    const d = Math.abs(hpDelta) * sign;
    if (!d || !entity) return;
    playerActionSender({ type: 'patch_own_entity', payload: { entityId: entity.id, op: 'hp_adjust', delta: d } });
    setHpDelta(0);
  };
  const toggleCond = (c) => {
    if (!entity) return;
    playerActionSender({ type: 'patch_own_entity', payload: { entityId: entity.id, op: 'toggle_condition', condition: c } });
  };

  // v3: player token image upload — reuses same compression pipeline as the DM form.
  const uploadImage = async () => {
    if (!entity) return;
    try {
      const dataUrl = await pickImage();
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const maxSide = 256;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        setField({ imageUrl: compressed });
      };
      img.onerror = () => setField({ imageUrl: dataUrl });
      img.src = dataUrl;
    } catch {}
  };

  if (!entity) {
    return (
      <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="modal slide-up" style={{ maxWidth: 420 }}>
          <div className="float-panel-header">
            <span>◈ Edit My Sheet</span>
            <button className="close-x" onClick={onClose}>×</button>
          </div>
          <div className="float-panel-body">
            <div className="empty-state"><span className="glyph">⚔</span>You haven't claimed a character yet.</div>
          </div>
        </div>
      </div>
    );
  }

  const sicknessLabel = SICKNESS_DESCRIPTORS[entity.sickness || 0] || '';

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal slide-up" style={{ maxWidth: 520 }}>
        <div className="float-panel-header">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="entity-swatch" style={{ background: entity.color, width: 12, height: 12 }} />
            ◈ {entity.name} — Your Sheet
          </span>
          <button className="close-x" onClick={onClose}>×</button>
        </div>
        <div className="float-panel-body">
          {myIds.length > 1 && (
            <div className="sheet-tabs">
              {myIds.map(id => {
                const e = state.entities[id];
                if (!e) return null;
                return (
                  <button
                    key={id}
                    className={`sheet-tab ${focusedId === id ? 'active' : ''}`}
                    onClick={() => setFocusedId(id)}
                  >
                    <div className="entity-swatch" style={{ background: e.color, width: 10, height: 10 }} />
                    {e.name}
                    {id === claim.pc ? <span className="own-pc-badge" style={{ marginLeft: 4 }}>PC</span> : <span className="familiar-badge">FAM</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* v3: editable portrait */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <div className="portrait-preview" style={{ background: entity.color }}>
              {entity.imageUrl
                ? <img src={entity.imageUrl} alt="" draggable="false" />
                : <span>{(entity.name || '?').slice(0,1).toUpperCase()}</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="btn sm" type="button" onClick={uploadImage}>⇧ Upload portrait</button>
              {entity.imageUrl && (
                <button className="btn sm ghost" type="button" onClick={() => setField({ imageUrl: '' })}>Remove image</button>
              )}
              <input type="color" value={entity.color}
                onChange={(e) => setField({ color: e.target.value })}
                title="Token color"
                style={{ width: 50, height: 24, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }} />
            </div>
          </div>

          {entity.type === 'PC' && sicknessLabel && (
            <div className={`sickness-note sick-level-${entity.sickness || 0}`}>
              <span className="sickness-glyph">❋</span>
              <span><em>You feel</em> <strong>{sicknessLabel.toLowerCase()}</strong>.</span>
            </div>
          )}

          {/* --- Core block: HP + quick stats --- */}
          <div className="sheet-stats">
            <div className="sheet-stat">
              <span>AC</span>
              <input className="sheet-stat-input mono" type="number"
                value={entity.ac}
                onChange={(e) => setField({ ac: Number(e.target.value) || 0 })} />
            </div>
            <div className="sheet-stat">
              <span>Speed</span>
              <input className="sheet-stat-input mono" type="number"
                value={entity.speed}
                onChange={(e) => setField({ speed: Number(e.target.value) || 0 })} />
            </div>
            <div className="sheet-stat">
              <span>Init</span>
              <input className="sheet-stat-input mono" type="number"
                value={entity.initBonus}
                onChange={(e) => setField({ initBonus: Number(e.target.value) || 0 })} />
            </div>
            <div className="sheet-stat">
              <span>Passive</span>
              <input className="sheet-stat-input mono" type="number"
                value={entity.passivePerception}
                onChange={(e) => setField({ passivePerception: Number(e.target.value) || 0 })} />
            </div>
          </div>

          <label>HP</label>
          <div className="form-row-2" style={{ marginBottom: 8 }}>
            <div>
              <label style={{ fontSize: 9, opacity: 0.6 }}>Current</label>
              <input type="number" value={entity.hp.current}
                onChange={(e) => setField({ hp: { current: Number(e.target.value) || 0, max: entity.hp.max } })} />
            </div>
            <div>
              <label style={{ fontSize: 9, opacity: 0.6 }}>Max</label>
              <input type="number" value={entity.hp.max}
                onChange={(e) => setField({ hp: { current: entity.hp.current, max: Number(e.target.value) || 0 } })} />
            </div>
          </div>

          <label>Quick Adjust</label>
          <div className="hp-adjuster" style={{ marginBottom: 10 }}>
            <button className="btn danger" onClick={() => applyHp(-1)}>− Damage</button>
            <input type="number" value={hpDelta} onChange={e => setHpDelta(Math.abs(Number(e.target.value)) || 0)} />
            <button className="btn" onClick={() => applyHp(+1)}>+ Heal</button>
          </div>

          {/* --- Ability scores (collapsible) --- */}
          {entity.type === 'PC' && (
            <>
              <label onClick={() => setExpandedSection(s => s === 'stats' ? '' : 'stats')}
                style={{ cursor: 'pointer', userSelect: 'none' }}>
                Ability Scores {expandedSection === 'stats' ? '▾' : '▸'}
              </label>
              {expandedSection === 'stats' && (
                <div className="form-row-6" style={{ marginBottom: 10 }}>
                  {['str','dex','con','int','wis','cha'].map(s => (
                    <div key={s} className="stat-box">
                      <label>{s.toUpperCase()}</label>
                      <input type="number" value={entity.stats[s]}
                        onChange={(e) => setField({ stats: { [s]: Number(e.target.value) || 0 } })} />
                      <div style={{ fontSize: 9, color: 'var(--ink-mute)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {modFor(entity.stats[s]) >= 0 ? `+${modFor(entity.stats[s])}` : modFor(entity.stats[s])}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* --- Identity (collapsible) --- */}
          {entity.type === 'PC' && (
            <>
              <label onClick={() => setExpandedSection(s => s === 'identity' ? '' : 'identity')}
                style={{ cursor: 'pointer', userSelect: 'none' }}>
                Identity {expandedSection === 'identity' ? '▾' : '▸'}
              </label>
              {expandedSection === 'identity' && (
                <div style={{ marginBottom: 10 }}>
                  <div className="form-row-2">
                    <div>
                      <label style={{ fontSize: 9 }}>Name</label>
                      <input value={entity.name} onChange={(e) => setField({ name: e.target.value })} />
                    </div>
                    <div>
                      <label style={{ fontSize: 9 }}>Class</label>
                      <input value={entity.class || ''} onChange={(e) => setField({ class: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row-2" style={{ marginTop: 6 }}>
                    <div>
                      <label style={{ fontSize: 9 }}>Level</label>
                      <input type="number" value={entity.level} onChange={(e) => setField({ level: Number(e.target.value) || 1 })} />
                    </div>
                    <div>
                      <label style={{ fontSize: 9 }}>Player Name</label>
                      <input value={entity.playerName || ''} onChange={(e) => setField({ playerName: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <label>Conditions <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— click to toggle</span></label>
          <div className="cond-grid">
            {CONDITIONS.slice(0, 15).map(c => (
              <div
                key={c}
                className={`cond-chip ${entity.conditions.includes(c) ? 'active' : ''}`}
                onClick={() => toggleCond(c)}
              >{c}</div>
            ))}
          </div>

          <label style={{ marginTop: 10 }}>Notes / Description</label>
          <textarea
            value={entity.playerDescription || ''}
            onChange={(e) => setField({ playerDescription: e.target.value })}
            placeholder="A short description of your character…" />

          <div className="settings-hint" style={{ marginTop: 12 }}>
            All changes sync in real time through the DM. The DM may override anything at any moment.
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// PLAYER ONBOARDING  (forced character selection on join)
// ====================================================================
// Shown full-screen as a gate before the player can interact with the map.
// The player must pick a PC, request a new one, or choose spectator mode.
function PlayerOnboardingGate({ state, myPeerId, playerName, playerActionSender, onRequestNewPC }) {
  const [search, setSearch] = useState('');
  const allClaimedIds = new Set(Object.values(state.claims || {}).map(c => c.pc).filter(Boolean));
  const availablePCs = Object.values(state.entities)
    .filter(e => e.type === 'PC' && !allClaimedIds.has(e.id))
    .filter(e => !search || e.name.toLowerCase().includes(search.toLowerCase()));

  const pickPC = (ent) => {
    playerActionSender({ type: 'claim_pc', payload: { entityId: ent.id, playerName } });
  };
  const pickSpectator = () => {
    playerActionSender({ type: 'claim_spectator', payload: { playerName } });
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-title">Step into the realm</div>
        <div className="onboarding-subtitle">Welcome, {playerName || 'traveler'}. Choose your presence at the table.</div>

        <div className="onboarding-section">
          <div className="onboarding-section-title">Existing Characters</div>
          {availablePCs.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px' }}>
              <span className="glyph">⚔</span>
              No unclaimed characters. Ask your DM to create one for you, or proceed as a spectator.
            </div>
          ) : (
            <>
              <input className="onboarding-search"
                placeholder="Search by name…"
                value={search}
                onChange={e => setSearch(e.target.value)} />
              <div className="onboarding-grid">
                {availablePCs.map(e => (
                  <div
                    key={e.id}
                    className="onboarding-pc"
                    onClick={() => pickPC(e)}
                  >
                    <div className="pc-avatar" style={{ background: e.color, width: 44, height: 44 }}>
                      {e.imageUrl
                        ? <img src={e.imageUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}} />
                        : (e.name[0] || '?').toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontFamily: 'Cinzel, serif', fontSize: 14 }}>{e.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
                        Level {e.level} {e.class} · {e.hp.max} HP · AC {e.ac}
                      </div>
                    </div>
                    <button className="btn primary sm">Claim</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="onboarding-divider">or</div>

        <div className="onboarding-actions">
          <button className="btn" onClick={onRequestNewPC}>＋ Request a new character</button>
          <button className="btn ghost" onClick={pickSpectator}>👁 Join as spectator</button>
        </div>

        <div className="settings-hint" style={{ textAlign: 'center', marginTop: 16 }}>
          You can change this later from the top bar.
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// DM WORLD PANEL  (time-of-day, per-peer push, block zones, etc.)
// ====================================================================
function DMWorldPanel({ state, dispatch, onClose, toast, onToggleBlockPlace, placingBlock }) {
  const peers = Object.entries(state.claims || {});
  const currentMapId = state.currentMapId;
  const tod = state.timeOfDay || 0;
  const maps = state.maps || {};

  const setPeerPush = (peerId, mapId) => {
    dispatch({ type: 'FORCED_VIEW_PEER_SET', peerId, mapId });
    if (mapId) toast('Pushed view to player', 'success');
  };
  const clearAllPush = () => {
    dispatch({ type: 'FORCED_VIEW', forcedView: null });
    dispatch({ type: 'FORCED_VIEW_PEER_CLEAR_ALL' });
    toast('All push-views released');
  };
  const pushGlobal = () => {
    if (state.forcedView?.mapId === currentMapId) {
      dispatch({ type: 'FORCED_VIEW', forcedView: null });
      toast('Global push released');
    } else {
      dispatch({ type: 'FORCED_VIEW', forcedView: { mapId: currentMapId } });
      toast('Pushed to all players', 'success');
    }
  };

  return (
    <div className="float-panel world-panel" style={{ right: 16, top: 80, width: 360 }}>
      <div className="float-panel-header">
        <span>🌍 World</span>
        <button className="close-x" onClick={onClose}>×</button>
      </div>
      <div className="float-panel-body">

        {/* Time of day */}
        <div className="settings-section">
          <label className="settings-label">Time of Day</label>
          <div className="scale-row">
            <span className="mono" style={{ fontSize: 11, color: 'var(--gold-dim)' }}>☀</span>
            <input type="range" min="0" max="1" step="0.02"
              value={tod}
              onChange={(e) => dispatch({ type: 'TIME_OF_DAY_SET', value: Number(e.target.value) })} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--azure)' }}>☾</span>
            <span className="mono scale-value">{Math.round(tod * 100)}%</span>
          </div>
          <div className="settings-hint">
            Shifts the player view from daylight toward deep night. DM view stays unchanged.
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
            {[
              { label: 'Day', v: 0 },
              { label: 'Dusk', v: 0.5 },
              { label: 'Night', v: 0.85 },
              { label: 'Deepest', v: 1 },
            ].map(p => (
              <button key={p.label} className={`btn sm ${Math.abs(tod - p.v) < 0.03 ? 'active' : ''}`}
                onClick={() => dispatch({ type: 'TIME_OF_DAY_SET', value: p.v })}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* Block zones */}
        <div className="settings-section">
          <label className="settings-label">Block Zones <span className="settings-label-sub">— hide portions of the current map from players</span></label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={`btn sm ${placingBlock ? 'active' : ''}`}
              onClick={onToggleBlockPlace}>
              {placingBlock ? '◼ Click-drag to draw…' : '◼ Draw Block'}
            </button>
            <button className="btn sm danger"
              disabled={!(state.blockZones?.[currentMapId] || []).length}
              onClick={() => {
                if (confirm('Clear all block zones on this map?')) {
                  dispatch({ type: 'BLOCK_ZONE_CLEAR_MAP', mapId: currentMapId });
                }
              }}>
              Clear All
            </button>
          </div>
          <div className="settings-hint">
            {(state.blockZones?.[currentMapId] || []).length} block zone(s) on this map.
          </div>
        </div>

        {/* Push-view */}
        <div className="settings-section">
          <label className="settings-label">Push View</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <button className={`btn sm ${state.forcedView?.mapId === currentMapId ? 'danger active' : ''}`}
              onClick={pushGlobal}>
              {state.forcedView?.mapId === currentMapId ? '⚑ Release All' : '⚑ Push to All'}
            </button>
            <button className="btn sm ghost" onClick={clearAllPush}>Clear all pushes</button>
          </div>
          {peers.length === 0 ? (
            <div className="settings-hint">No players connected.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {peers.map(([peerId, claim]) => {
                const pushed = state.forcedViewPerPeer?.[peerId];
                return (
                  <div key={peerId} className="world-peer-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 12 }}>
                        {claim.playerName || <em style={{ color: 'var(--ink-mute)' }}>unnamed</em>}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--ink-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {pushed ? `locked → ${maps[pushed.mapId]?.name || '?'}` : 'free'}
                      </div>
                    </div>
                    <select className="mono" style={{ padding: '4px 6px', fontSize: 11, maxWidth: 140 }}
                      value={pushed?.mapId || ''}
                      onChange={(e) => setPeerPush(peerId, e.target.value || null)}>
                      <option value="">— free —</option>
                      {Object.values(maps).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ====================================================================
// DM CLAIMS PANEL  (DM view of who has claimed what)
// ====================================================================
function DMClaimsPanel({ state, dispatch, onClose, toast }) {
  const peers = Object.entries(state.claims || {});
  return (
    <div className="float-panel" style={{ right: 16, top: 80, width: 340 }}>
      <div className="float-panel-header">
        <span>⚐ Claimed Characters</span>
        <button className="close-x" onClick={onClose}>×</button>
      </div>
      <div className="float-panel-body">
        {peers.length === 0 ? (
          <div className="empty-state"><span className="glyph">⚔</span>No players have joined yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {peers.map(([peerId, claim]) => {
              const pc = claim.pc ? state.entities[claim.pc] : null;
              return (
                <div key={peerId} className="claim-row">
                  <div className="claim-row-header">
                    <span className="claim-peer-name">{claim.playerName || <em style={{color:'var(--ink-mute)'}}>Unknown player</em>}</span>
                    {claim.spectator && <span className="claim-badge spectator">Spectator</span>}
                  </div>
                  <div className="claim-peer-id mono">id: {peerId.slice(0, 12)}…</div>
                  {pc ? (
                    <div className="claim-entity-row">
                      <div className="entity-swatch" style={{ background: pc.color, width: 12, height: 12 }} />
                      <span style={{ flex: 1, fontWeight: 500 }}>{pc.name}</span>
                      <span className="mono" style={{ color: 'var(--ink-mute)', fontSize: 11 }}>{pc.hp.current}/{pc.hp.max}</span>
                      <button className="btn sm danger" onClick={() => {
                        if (confirm(`Release ${pc.name} from this player?`)) {
                          dispatch({ type: 'DM_UNCLAIM_PC', entityId: pc.id });
                          toast('Claim released');
                        }
                      }}>Unclaim</button>
                    </div>
                  ) : !claim.spectator && (
                    <div className="claim-entity-row" style={{ color: 'var(--ink-mute)', fontStyle: 'italic' }}>No character claimed</div>
                  )}
                  {(claim.familiars || []).map(fid => {
                    const fam = state.entities[fid];
                    if (!fam) return null;
                    return (
                      <div key={fid} className="claim-entity-row" style={{ paddingLeft: 20 }}>
                        <div className="entity-swatch" style={{ background: fam.color, width: 10, height: 10 }} />
                        <span style={{ flex: 1, fontSize: 12 }}>{fam.name}</span>
                        <span className="familiar-badge">FAM</span>
                        <button className="btn sm ghost" onClick={() => {
                          if (confirm(`Release ${fam.name} from this player?`)) {
                            dispatch({ type: 'DM_UNCLAIM_FAMILIAR', entityId: fam.id });
                          }
                        }}>×</button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ====================================================================
// BREADCRUMB
// ====================================================================
function Breadcrumb({ map, maps, onSwitch }) {
  const chain = [];
  let c = map;
  while (c) {
    chain.unshift(c);
    c = c.parentId ? maps[c.parentId] : null;
  }
  return (
    <div className="breadcrumb">
      {chain.map((m, i) => (
        <React.Fragment key={m.id}>
          {i > 0 && <span className="breadcrumb-sep">›</span>}
          <span
            className={`breadcrumb-item ${i === chain.length - 1 ? 'current' : ''}`}
            onClick={i === chain.length - 1 ? undefined : () => onSwitch(m.id)}
          >{m.name}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

// ====================================================================
// DM INTERFACE
// ====================================================================
function DMInterface({ state, dispatch, sync, syncStatus, peerCount, onLogout, roomCode, toast, settings, onSettingsChange, onOpenSettings, showSettings, onCloseSettings }) {
  const [editingEntity, setEditingEntity] = useState(null);
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [showInit, setShowInit] = useState(false);
  const [showMaps, setShowMaps] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showClaims, setShowClaims] = useState(false);
  const [showWorld, setShowWorld] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null); // { tokenId, x, y }
  const [hoveredToken, setHoveredToken] = useState(null); // { tokenId, entityId }
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [placingReminder, setPlacingReminder] = useState(false);
  const [placingBlock, setPlacingBlock] = useState(false);
  const DM_KEY = 'dm'; // reminders key for DM ("peer id" substitute in local/hosted mode)

  const currentMap = state.maps[state.currentMapId];
  const selectedToken = selectedTokenId ? state.tokens[selectedTokenId] : null;
  const selectedTokenEntity = selectedToken ? state.entities[selectedToken.entityId] : null;

  // Track cursor for tooltip follow. Attached at the app-shell level.
  useEffect(() => {
    const onMove = (e) => setCursorPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const placeEntity = (entityId, x, y) => {
    const existing = Object.values(state.tokens).find(t => t.entityId === entityId && t.mapId === state.currentMapId);
    if (existing) {
      toast('Entity already placed on this map', 'error');
      return;
    }
    dispatch({
      type: 'TOKEN_PLACE',
      token: {
        id: uid('tok_'),
        entityId,
        mapId: state.currentMapId,
        x, y,
        visible: false, // new tokens default hidden
        scale: 1.0,
      }
    });
    toast('Token placed (hidden)', 'success');
  };

  const tokenMove = (tokenId, x, y) => {
    dispatch({ type: 'TOKEN_MOVE', id: tokenId, x, y });
  };

  const tokenDoubleClick = (tokenId) => setSelectedTokenId(tokenId);
  const tokenContextMenu = (tokenId, e) => {
    setCtxMenu({ tokenId, x: e.clientX, y: e.clientY });
  };
  const closeCtxMenu = () => setCtxMenu(null);
  // Close context menu on any click elsewhere
  useEffect(() => {
    if (!ctxMenu) return;
    const onAny = () => closeCtxMenu();
    window.addEventListener('click', onAny);
    window.addEventListener('contextmenu', onAny);
    return () => {
      window.removeEventListener('click', onAny);
      window.removeEventListener('contextmenu', onAny);
    };
  }, [ctxMenu]);

  const revealAllOnMap = (visible) => {
    dispatch({ type: 'TOKEN_REVEAL_ALL_ON_MAP', mapId: state.currentMapId, visible });
    toast(visible ? 'All tokens revealed' : 'All tokens hidden');
  };

  const saveEntity = (entity) => {
    dispatch({ type: 'ENTITY_UPSERT', entity });
    setEditingEntity(null);
    toast('Entity saved', 'success');
  };

  const deleteCurrentEntity = () => {
    if (!editingEntity || !state.entities[editingEntity.id]) { setEditingEntity(null); return; }
    if (!confirm('Delete this entity? All tokens will be removed.')) return;
    dispatch({ type: 'ENTITY_DELETE', id: editingEntity.id });
    setEditingEntity(null);
    toast('Entity deleted');
  };

  const onViewportChange = (mapId, viewport) => {
    dispatch({ type: 'MAP_VIEWPORT', id: mapId, viewport });
  };

  const pushView = () => {
    if (state.forcedView?.mapId === state.currentMapId) {
      dispatch({ type: 'FORCED_VIEW', forcedView: null });
      toast('Released player view control');
    } else {
      dispatch({ type: 'FORCED_VIEW', forcedView: { mapId: state.currentMapId } });
      toast('Players locked to this map', 'success');
    }
  };

  // v3: Long rest. Restores every PC + Familiar to full HP, clears
  // recoverable conditions, resets sickness to 0, resets death saves.
  const longRestAll = () => {
    if (!confirm('Long rest: restore all PCs + familiars to full HP, clear recoverable conditions, reset sickness and death saves?')) return;
    dispatch({ type: 'LONG_REST' });
    toast('The party rests. Wounds mend, fevers break.', 'success', 4000);
  };
  const longRestOne = (entityId) => {
    dispatch({ type: 'LONG_REST', entityIds: [entityId] });
    const e = state.entities[entityId];
    toast(`${e?.name || 'Character'} has rested.`, 'success');
  };

  const exportSession = () => {
    downloadJson(state, `plagues-call-session-${Date.now()}.json`);
    toast('Session exported', 'success');
  };

  const importSession = async () => {
    const result = await pickFile();
    if (!result) return;
    try {
      const data = JSON.parse(result.content);
      if (!confirm('This replaces your current session. Continue?')) return;
      dispatch({ type: 'REPLACE', payload: data });
      toast('Session imported', 'success');
    } catch {
      toast('Invalid session file', 'error');
    }
  };

  const myReminders = state.reminders?.[DM_KEY] || [];
  const reminderUpsert = (r) => dispatch({ type: 'REMINDER_UPSERT', peerId: DM_KEY, reminder: r });
  const reminderDelete = (id) => dispatch({ type: 'REMINDER_DELETE', peerId: DM_KEY, id });

  return (
    <div className="app-shell">
      <div className="topbar">
        <span className="mode-badge dm">⚔ Dungeon Master</span>
        <span className="topbar-title">{APP_NAME}</span>
        <div className="topbar-divider" />
        <button className="btn" onClick={() => setShowMaps(true)}>⌖ Maps</button>
        <button className={`btn ${showInit ? 'active' : ''}`} onClick={() => setShowInit(!showInit)}>⚔ Initiative</button>
        <button className="btn" onClick={() => setShowPresets(true)}>❈ Presets</button>
        <button className={`btn ${showClaims ? 'active' : ''}`} onClick={() => setShowClaims(!showClaims)}>⚐ Claims</button>
        <div className="topbar-divider" />
        <button className="btn" onClick={() => revealAllOnMap(true)}>👁 Reveal All</button>
        <button className="btn" onClick={() => revealAllOnMap(false)}>🕶 Hide All</button>
        <button className={`btn ${placingReminder ? 'active' : ''}`}
          onClick={() => setPlacingReminder(!placingReminder)}
          title="Place a private reminder on the map (only you see it)">
          {placingReminder ? '◆ Click to place…' : '◆ Reminder'}
        </button>
        <button className={`btn ${showWorld ? 'active' : ''}`}
          onClick={() => setShowWorld(!showWorld)}
          title="World: push view, time of day, block zones">
          🌍 World
        </button>
        <button className="btn" onClick={longRestAll}
          title="Restore HP, clear conditions, reset sickness for all party members">
          ⛭ Long Rest
        </button>
        <div className="topbar-spacer" />
        {roomCode && (
          <div className="conn-status">
            <div className={`conn-dot ${syncStatus === 'live' ? 'live' : syncStatus === 'connecting' ? 'connecting' : syncStatus === 'error' ? 'error' : ''}`} />
            <span className="mono">{roomCode}</span>
            <span style={{ color: 'var(--ink-dim)' }}>· {peerCount} {peerCount === 1 ? 'player' : 'players'}</span>
          </div>
        )}
        <button className="btn" onClick={exportSession}>⇩ Export</button>
        <button className="btn" onClick={importSession}>⇧ Import</button>
        <button className="btn ghost" title="Settings" onClick={onOpenSettings}>⚙</button>
        <button className="btn ghost" onClick={onLogout}>⎋ Exit</button>
      </div>

      <div className="main">
        <div className="sidebar">
          <EntitySidebar
            state={state}
            dispatch={dispatch}
            onEditEntity={setEditingEntity}
            onSelectEntity={setSelectedEntityId}
            selectedEntityId={selectedEntityId}
          />
        </div>

        <div className="canvas-container">
          <MapCanvas
            map={currentMap}
            entities={state.entities}
            tokens={state.tokens}
            initiative={state.initiative}
            mode="dm"
            onTokenMove={tokenMove}
            onTokenDoubleClick={tokenDoubleClick}
            onTokenContextMenu={tokenContextMenu}
            onPlaceEntity={placeEntity}
            onViewportChange={onViewportChange}
            selectedTokenId={selectedTokenId}
            mapScale={state.mapScale || 1}
            reminders={myReminders}
            onReminderUpsert={reminderUpsert}
            onReminderDelete={reminderDelete}
            placingReminder={placingReminder}
            onPlaceReminderDone={() => setPlacingReminder(false)}
            hoveredTokenId={hoveredToken?.tokenId}
            onTokenHoverChange={setHoveredToken}
            blockZones={state.blockZones?.[currentMapId] || []}
            placingBlock={placingBlock}
            onPlaceBlockDone={() => setPlacingBlock(false)}
            onBlockUpsert={(zone) => dispatch({ type: 'BLOCK_ZONE_UPSERT', mapId: currentMapId, zone })}
            onBlockDelete={(id) => dispatch({ type: 'BLOCK_ZONE_DELETE', mapId: currentMapId, id })}
            visionSources={computeVisionSources(state, currentMapId)}
          />

          <TokenTooltip hovered={hoveredToken} entities={state.entities} mode="dm" x={cursorPos.x} y={cursorPos.y} />

          <div className="canvas-overlay top-left">
            <Breadcrumb map={currentMap} maps={state.maps} onSwitch={(id) => dispatch({ type: 'MAP_SWITCH', id })} />
          </div>

          {showInit && <InitiativeTracker state={state} dispatch={dispatch} mode="dm" onClose={() => setShowInit(false)} />}
          {showMaps && <MapManager state={state} dispatch={dispatch} onClose={() => setShowMaps(false)} toast={toast} />}
          {showPresets && <PresetsPanel state={state} dispatch={dispatch} onClose={() => setShowPresets(false)} toast={toast} />}
          {showClaims && <DMClaimsPanel state={state} dispatch={dispatch} onClose={() => setShowClaims(false)} toast={toast} />}
          {showWorld && (
            <DMWorldPanel
              state={state}
              dispatch={dispatch}
              toast={toast}
              onClose={() => setShowWorld(false)}
              placingBlock={placingBlock}
              onToggleBlockPlace={() => setPlacingBlock(p => !p)}
            />
          )}

          {selectedToken && selectedTokenEntity && (
            <TokenDetailPanel
              state={state}
              token={selectedToken}
              entity={selectedTokenEntity}
              mode="dm"
              dispatch={dispatch}
              onLongRest={longRestOne}
              onClose={() => setSelectedTokenId(null)}
            />
          )}
        </div>{/* /canvas-container */}

        {ctxMenu && (() => {
          const t = state.tokens[ctxMenu.tokenId];
          if (!t) return null;
          const ent = state.entities[t.entityId];
          return (
            <div
              className="token-ctx-menu"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div className="token-ctx-header">
                <div className="entity-swatch" style={{ background: ent?.color, width: 10, height: 10 }} />
                <span>{ent?.name || 'Token'}</span>
              </div>
              <button className="token-ctx-item" onClick={() => {
                dispatch({ type: 'TOKEN_VISIBILITY', id: t.id, visible: !t.visible });
                closeCtxMenu();
              }}>
                <span className="ctx-icon">{t.visible ? '🕶' : '👁'}</span>
                {t.visible ? 'Hide from players' : 'Reveal to players'}
              </button>
              <button className="token-ctx-item" onClick={() => {
                setSelectedTokenId(t.id);
                closeCtxMenu();
              }}>
                <span className="ctx-icon">◈</span>
                Open details
              </button>
              {ent && (
                <button className="token-ctx-item" onClick={() => {
                  setEditingEntity(ent);
                  closeCtxMenu();
                }}>
                  <span className="ctx-icon">✎</span>
                  Edit entity
                </button>
              )}
              <div className="token-ctx-sep" />
              <button className="token-ctx-item danger" onClick={() => {
                if (confirm('Remove this token from the map?')) dispatch({ type: 'TOKEN_REMOVE', id: t.id });
                closeCtxMenu();
              }}>
                <span className="ctx-icon">✕</span>
                Remove token
              </button>
            </div>
          );
        })()}

        {editingEntity && (
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditingEntity(null)}>
            <div className="modal slide-up">
              <div className="float-panel-header">
                <span>{state.entities[editingEntity.id] ? '✎ Edit Entity' : '＋ New Entity'}</span>
                <button className="close-x" onClick={() => setEditingEntity(null)}>×</button>
              </div>
              <div className="float-panel-body">
                <EntityForm
                  initial={editingEntity}
                  onSave={saveEntity}
                  onCancel={() => setEditingEntity(null)}
                />
                {state.entities[editingEntity.id] && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-soft)' }}>
                    <button className="btn danger" onClick={deleteCurrentEntity}>Delete Entity</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={onSettingsChange}
          onClose={onCloseSettings}
          mode="dm"
          mapScale={state.mapScale || 1}
          onMapScaleChange={(v) => dispatch({ type: 'MAP_SCALE_SET', scale: v })}
        />
      )}
    </div>
  );
}

// ====================================================================
// PARTY SIDEBAR (Player — left)
// ====================================================================
// Shows all PCs and Familiars with HP bars and conditions. Player's own
// characters (PC + claimed familiars) are visually distinguished. This
// never leaks hidden-enemy info because it only iterates PC/Familiar types.
function PartySidebar({ state, claimedEntityId, ownedFamiliarIds = [], currentMapId, onSelectPC }) {
  // v3: only include party members who have a token on the current map.
  // Players on other maps are elsewhere in the world and shouldn't clutter
  // the current-scene sidebar.
  const entityIdsOnMap = useMemo(() => {
    const s = new Set();
    for (const t of Object.values(state.tokens)) {
      if (t.mapId === currentMapId) s.add(t.entityId);
    }
    return s;
  }, [state.tokens, currentMapId]);

  const partyMembers = Object.values(state.entities)
    .filter(e => (e.type === 'PC' || e.type === 'Familiar') && entityIdsOnMap.has(e.id))
    // Maintain DM-set order for stable presentation
    .sort((a, b) => {
      const order = state.entityOrder || [];
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  const ownedFamiliarSet = new Set(ownedFamiliarIds);

  return (
    <div className="sidebar player-sidebar left">
      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>⚜ The Party</span>
        </div>
      </div>
      <div className="sidebar-section grow">
        <div className="party-list">
          {partyMembers.length === 0 ? (
            <div className="empty-state"><span className="glyph">✦</span>No party members yet.</div>
          ) : partyMembers.map(e => {
            const hpPct = e.hp.max > 0 ? (e.hp.current / e.hp.max) * 100 : 0;
            const hpClass = hpPct <= 25 ? 'critical' : hpPct <= 50 ? 'low' : '';
            const isYou = e.id === claimedEntityId || ownedFamiliarSet.has(e.id);
            const isFamiliar = e.type === 'Familiar';
            const isDown = e.hp.current <= 0;
            return (
              <div
                key={e.id}
                className={`party-card ${isYou ? 'you' : ''} ${isDown ? 'down' : ''} ${isFamiliar ? 'familiar-card' : ''}`}
                onClick={() => onSelectPC?.(e.id)}
              >
                <div className="party-avatar" style={{ background: e.color }}>
                  {e.imageUrl
                    ? <img src={e.imageUrl} alt="" draggable="false" />
                    : (e.name[0] || '?').toUpperCase()}
                </div>
                <div className="party-info">
                  <div className="party-name">
                    {e.name}
                    {isYou && e.id === claimedEntityId && <span className="own-pc-badge">YOU</span>}
                    {isYou && isFamiliar && <span className="familiar-badge">YOURS</span>}
                    {isFamiliar && !isYou && <span className="familiar-badge dim">FAM</span>}
                  </div>
                  <div className="party-meta mono">
                    {isFamiliar ? (e.faction ? `bond: ${e.faction}` : 'Familiar') : `L${e.level} ${e.class || ''}`}
                  </div>
                  <div className="party-hp-row">
                    <div className="party-hp-bar">
                      <div className={`party-hp-fill ${hpClass}`} style={{ width: `${hpPct}%` }} />
                    </div>
                    <span className={`party-hp-text mono ${hpClass}`}>{e.hp.current}/{e.hp.max}</span>
                  </div>
                  {e.conditions.length > 0 && (
                    <div className="party-conditions">
                      {e.conditions.slice(0, 6).map(c => (
                        <span key={c} className="party-cond-pill" style={{ background: CONDITION_COLORS[c] || '#555' }}>
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// REVEALED MONSTERS SIDEBAR (Player — right)
// ====================================================================
// Lists monsters that have been revealed (visible tokens) to the player,
// showing the player-visible description and an approximate condition label.
function RevealedMonstersSidebar({ state, currentMapId }) {
  // v3: scope to current map — a foe revealed in another scene should not
  // leak into the current scene's right panel.
  const revealedFoes = useMemo(() => {
    const byId = new Map();
    for (const t of Object.values(state.tokens)) {
      if (!t.visible) continue;
      if (t.mapId !== currentMapId) continue;
      const ent = state.entities[t.entityId];
      if (!ent) continue;
      if (!['Monster', 'Neutral Beast', 'NPC'].includes(ent.type)) continue;
      if (!byId.has(ent.id)) byId.set(ent.id, { entity: ent, tokens: [] });
      byId.get(ent.id).tokens.push(t);
    }
    return Array.from(byId.values());
  }, [state.tokens, state.entities, currentMapId]);

  return (
    <div className="sidebar player-sidebar right">
      <div className="sidebar-section">
        <div className="sidebar-title">
          <span>❖ Revealed</span>
        </div>
      </div>
      <div className="sidebar-section grow">
        <div className="revealed-list">
          {revealedFoes.length === 0 ? (
            <div className="empty-state"><span className="glyph">❖</span>Nothing revealed yet.</div>
          ) : revealedFoes.map(({ entity: e, tokens }) => {
            const hpPct = e.hp.max > 0 ? (e.hp.current / e.hp.max) * 100 : 0;
            const status = hpPct <= 0 ? 'Down' : hpPct < 30 ? 'Waning' : hpPct <= 70 ? 'Rough' : 'Strong';
            const swatchClass = TOKEN_SHAPE_CLASS[e.type] || 'monster';
            return (
              <div key={e.id} className={`revealed-card revealed-type-${swatchClass}`}>
                <div className="revealed-header">
                  <div className={`entity-swatch ${swatchClass}`} style={{ background: e.color }} />
                  <div className="revealed-name">{e.name}</div>
                  <div className={`status-label status-${status.toLowerCase()}`}>{status}</div>
                </div>
                <div className="revealed-type-badge">{e.type}</div>
                {e.playerDescription ? (
                  <div className="revealed-desc">{e.playerDescription}</div>
                ) : (
                  <div className="revealed-desc" style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>
                    A creature of uncertain nature.
                  </div>
                )}
                {e.conditions.length > 0 && (
                  <div className="revealed-conditions">
                    {e.conditions.map(c => (
                      <span key={c} className="party-cond-pill" style={{ background: CONDITION_COLORS[c] || '#555' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {tokens.length > 1 && (
                  <div style={{ fontSize: 10, color: 'var(--ink-mute)', marginTop: 4, fontStyle: 'italic' }}>
                    {tokens.length} on the field
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ====================================================================
// PLAYER INTERFACE
// ====================================================================
function PlayerInterface({ state, myPeerId, playerName, sync, syncStatus, onLogout, roomCode, toast, settings, onSettingsChange, onOpenSettings, showSettings, onCloseSettings }) {
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [showInit, setShowInit] = useState(false);
  const [showClaim, setShowClaim] = useState(false);
  const [showSheet, setShowSheet] = useState(false); // dedicated "Edit My Sheet" modal
  const [hoveredToken, setHoveredToken] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [placingReminder, setPlacingReminder] = useState(false);

  // v2: read claim record (pc + familiars + playerName + spectator)
  const myClaim = state.claims?.[myPeerId] || { pc: null, familiars: [], playerName: '', spectator: false };
  const claimedEntityId = myClaim.pc || null;
  const claimedEntity = claimedEntityId ? state.entities[claimedEntityId] : null;
  const claimedFamiliarIds = myClaim.familiars || [];
  const hasMadeChoice = !!claimedEntityId || myClaim.spectator || claimedFamiliarIds.length > 0;
  // Set of entity IDs the player is allowed to move/edit
  const ownedEntityIds = useMemo(() => {
    const s = new Set(claimedFamiliarIds);
    if (claimedEntityId) s.add(claimedEntityId);
    return s;
  }, [claimedEntityId, claimedFamiliarIds]);

  // v3: resolve owned entities for the vision-enable check. Derives from
  // ownedEntityIds so it stays consistent with movement permissions and
  // bonded familiars.
  const visionOwned = useMemo(
    () => Array.from(ownedEntityIds).map(id => state.entities[id]).filter(Boolean),
    [ownedEntityIds, state.entities]
  );

  // v2: sickness visual filter. Only the player's own PC's sickness counts.
  const sicknessLevel = claimedEntity?.sickness || 0;

  const currentMapId = state.forcedView?.mapId || state.playerMapOverride || state.currentMapId;
  const currentMap = state.maps[currentMapId];
  const isForced = !!state.forcedView;

  const selectedToken = selectedTokenId ? state.tokens[selectedTokenId] : null;
  const selectedTokenEntity = selectedToken ? state.entities[selectedToken.entityId] : null;

  // Track cursor for hover tooltip
  useEffect(() => {
    const onMove = (e) => setCursorPos({ x: e.clientX, y: e.clientY });
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const tokenMove = (tokenId, x, y) => {
    const token = state.tokens[tokenId];
    if (!token) return;
    const entity = state.entities[token.entityId];
    if (!entity || !ownedEntityIds.has(entity.id)) {
      toast('You may only move your own characters', 'error');
      return;
    }
    sync.sendPlayerAction({
      type: 'move_token',
      payload: { tokenId, x, y },
      peerId: myPeerId,
    });
  };

  const tokenDoubleClick = (tokenId) => setSelectedTokenId(tokenId);

  // Player-action sender used by TokenDetailPanel/EditMySheet for own-entity writes
  const playerActionSender = useCallback((action) => {
    if (!sync) return;
    sync.sendPlayerAction({ ...action, peerId: myPeerId });
  }, [sync, myPeerId]);

  // Reminder helpers — reminders are stored per-peer, so we route
  // create/delete through the DM-authoritative action pipeline.
  const myReminders = state.reminders?.[myPeerId] || [];
  const reminderUpsert = (r) => {
    playerActionSender({ type: 'reminder_upsert', payload: { reminder: r } });
  };
  const reminderDelete = (id) => {
    playerActionSender({ type: 'reminder_delete', payload: { id } });
  };

  const claimPC = (entityId) => {
    sync.sendPlayerAction({
      type: 'claim_pc',
      payload: { entityId, playerName },
      peerId: myPeerId,
    });
    setShowClaim(false);
    toast('Requesting character…', 'success');
  };

  const claimFamiliar = (entityId) => {
    sync.sendPlayerAction({
      type: 'claim_familiar',
      payload: { entityId, playerName },
      peerId: myPeerId,
    });
    toast('Requesting familiar…', 'success');
  };

  const unclaimFamiliar = (entityId) => {
    sync.sendPlayerAction({
      type: 'unclaim_familiar',
      payload: { entityId },
      peerId: myPeerId,
    });
  };

  const claimSpectator = () => {
    sync.sendPlayerAction({
      type: 'claim_spectator',
      payload: { playerName },
      peerId: myPeerId,
    });
    setShowClaim(false);
  };

  const unclaimPC = () => {
    sync.sendPlayerAction({
      type: 'unclaim_pc',
      payload: {},
      peerId: myPeerId,
    });
  };

  // Already-claimed IDs across all peers (used to filter the claim modal list)
  const allClaimedPCIds = new Set(
    Object.values(state.claims || {}).map(c => c.pc).filter(Boolean)
  );
  const allClaimedFamiliarIds = new Set(
    Object.values(state.claims || {}).flatMap(c => c.familiars || [])
  );
  const unclaimedPCs = Object.values(state.entities).filter(e => {
    if (e.type !== 'PC') return false;
    return !allClaimedPCIds.has(e.id);
  });
  const availableFamiliars = Object.values(state.entities).filter(e => {
    if (e.type !== 'Familiar') return false;
    return !allClaimedFamiliarIds.has(e.id);
  });

  // Player-action sender already defined above at the top of this component.
  // (Previously there was a duplicate definition here — removed.)

  // Clicking a party card opens the detail panel for that PC's token
  // (only if it has one on the current map; otherwise focus the claimed PC).
  const selectPCById = (entityId) => {
    const tok = Object.values(state.tokens).find(t => t.entityId === entityId);
    if (tok) setSelectedTokenId(tok.id);
  };

  // ==========================================================
  // Forced onboarding: until the player has claimed a PC,
  // requested one, or chosen spectator mode, we render an
  // overlay gate so they can't interact with the map.
  // ==========================================================
  if (!hasMadeChoice && syncStatus === 'live') {
    return (
      <div className="app-shell">
        <div className="topbar">
          <span className="mode-badge player">⌂ Player</span>
          <span className="topbar-title">{APP_NAME}</span>
          <div className="topbar-spacer" />
          <div className="conn-status">
            <div className="conn-dot live" />
            <span className="mono">{roomCode}</span>
            <span style={{ color: 'var(--ink-dim)' }}>· {playerName}</span>
          </div>
          <button className="btn ghost" onClick={onLogout}>⎋ Leave</button>
        </div>
        <PlayerOnboardingGate
          state={state}
          myPeerId={myPeerId}
          playerName={playerName}
          playerActionSender={playerActionSender}
          onRequestNewPC={() => toast('Please ask your DM to create a character for you.', 'info', 5000)}
        />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <span className="mode-badge player">⌂ Player</span>
        <span className="topbar-title">{APP_NAME}</span>
        <div className="topbar-divider" />
        {claimedEntity ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="entity-swatch" style={{ background: claimedEntity.color, width: 12, height: 12 }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>{claimedEntity.name}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
              {claimedEntity.hp.current}/{claimedEntity.hp.max} HP
            </span>
            <button className="btn sm primary" onClick={() => setShowSheet(true)}>◈ Edit My Sheet</button>
            <button className="btn sm ghost" onClick={unclaimPC}>Release</button>
          </div>
        ) : myClaim.spectator ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-dim)' }}>👁 Spectator mode</span>
            <button className="btn sm" onClick={() => setShowClaim(true)}>⚐ Claim Character</button>
          </div>
        ) : (
          <button className="btn primary" onClick={() => setShowClaim(true)}>⚐ Claim Character</button>
        )}
        <div className="topbar-divider" />
        <button className={`btn ${showInit ? 'active' : ''}`} onClick={() => setShowInit(!showInit)}>⚔ Initiative</button>
        <button className={`btn ${placingReminder ? 'active' : ''}`}
          onClick={() => setPlacingReminder(!placingReminder)}
          title="Place a private reminder (only you see it)">
          {placingReminder ? '◆ Click to place…' : '◆ Reminder'}
        </button>
        <div className="topbar-spacer" />
        <div className="conn-status">
          <div className={`conn-dot ${syncStatus === 'live' ? 'live' : syncStatus === 'connecting' ? 'connecting' : syncStatus === 'error' ? 'error' : ''}`} />
          <span className="mono">{roomCode}</span>
          <span style={{ color: 'var(--ink-dim)' }}>· {playerName}</span>
        </div>
        <button className="btn ghost" title="Settings" onClick={onOpenSettings}>⚙</button>
        <button className="btn ghost" onClick={onLogout}>⎋ Leave</button>
      </div>

      <div className="main player-view">
        <PartySidebar
          state={state}
          claimedEntityId={claimedEntityId}
          ownedFamiliarIds={claimedFamiliarIds}
          currentMapId={currentMapId}
          onSelectPC={selectPCById}
        />

        <div className={`canvas-container sick-level-${sicknessLevel} tod-${Math.round((state.timeOfDay || 0) * 10)} ${claimedEntity && claimedEntity.hp.current <= 0 ? 'downed' : ''}`}>
          <MapCanvas
            map={currentMap}
            entities={state.entities}
            tokens={state.tokens}
            initiative={state.initiative}
            mode="player"
            peerId={myPeerId}
            claimedEntityId={claimedEntityId}
            ownedEntityIds={ownedEntityIds}
            onTokenMove={tokenMove}
            onTokenDoubleClick={tokenDoubleClick}
            onPlaceEntity={() => {}}
            onViewportChange={() => {}}
            selectedTokenId={selectedTokenId}
            mapScale={state.mapScale || 1}
            reminders={myReminders}
            onReminderUpsert={reminderUpsert}
            onReminderDelete={reminderDelete}
            placingReminder={placingReminder}
            onPlaceReminderDone={() => setPlacingReminder(false)}
            hoveredTokenId={hoveredToken?.tokenId}
            onTokenHoverChange={setHoveredToken}
            blockZones={state.blockZones?.[currentMapId] || []}
            visionEnabled={(state.timeOfDay || 0) >= 0.5 || visionOwned.some(v => v.darkvision > 0 || v.lightRadius > 0)}
            visionSources={computePlayerVisionSources(state, currentMapId, ownedEntityIds)}
          />

          <TokenTooltip hovered={hoveredToken} entities={state.entities} mode="player" x={cursorPos.x} y={cursorPos.y} />

          {/* Sickness vignette overlay — only visible when sickness > 0 */}
          {sicknessLevel > 0 && <div className={`sickness-vignette sick-level-${sicknessLevel}`} aria-hidden="true" />}

          <div className="canvas-overlay top-left">
            {currentMap && <Breadcrumb map={currentMap} maps={state.maps} onSwitch={() => {}} />}
          </div>

          {isForced && (
            <div className="canvas-overlay bottom-center">
              <div className="forced-view-banner">
                <span className="glyph">⚑</span>
                DM-controlled view · {currentMap?.name}
              </div>
            </div>
          )}

          {syncStatus !== 'live' && (
            <div className="canvas-overlay bottom-center">
              <div className="forced-view-banner">
                {syncStatus === 'connecting' ? 'Connecting to the table…' : syncStatus === 'error' ? 'Connection lost. Reopen the page to retry.' : 'Offline'}
              </div>
            </div>
          )}

          {showInit && <InitiativeTracker state={state} dispatch={() => {}} mode="player" onClose={() => setShowInit(false)} />}

          {selectedToken && selectedTokenEntity && (
            <TokenDetailPanel
              state={state}
              token={selectedToken}
              entity={selectedTokenEntity}
              mode="player"
              dispatch={() => {}}
              onClose={() => setSelectedTokenId(null)}
              claimedEntityId={claimedEntityId}
              playerActionSender={playerActionSender}
            />
          )}

          {showClaim && (
            <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowClaim(false)}>
              <div className="modal slide-up" style={{ maxWidth: 480 }}>
                <div className="float-panel-header">
                  <span>⚐ Claim</span>
                  <button className="close-x" onClick={() => setShowClaim(false)}>×</button>
                </div>
                <div className="float-panel-body">
                  {!claimedEntity && (
                    <>
                      <label>Characters</label>
                      {unclaimedPCs.length === 0 ? (
                        <div className="empty-state"><span className="glyph">⚔</span>No unclaimed characters.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                          {unclaimedPCs.map(e => (
                            <div key={e.id} className="claim-option"
                              onClick={() => claimPC(e.id)}>
                              <div className="pc-avatar" style={{ background: e.color, width: 36, height: 36 }}>
                                {e.imageUrl
                                  ? <img src={e.imageUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:'50%'}} />
                                  : (e.name[0] || '?').toUpperCase()}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500 }}>{e.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
                                  Level {e.level} {e.class} · {e.hp.max} HP · AC {e.ac}
                                </div>
                              </div>
                              <button className="btn primary sm">Claim</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {availableFamiliars.length > 0 && (
                    <>
                      <label>Familiars <span style={{ color: 'var(--ink-mute)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— you may claim multiple</span></label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {availableFamiliars.map(e => (
                          <div key={e.id} className="claim-option familiar"
                            onClick={() => claimFamiliar(e.id)}>
                            <div className="pc-avatar familiar-avatar" style={{ background: e.color, width: 32, height: 32 }}>
                              {(e.name[0] || '?').toUpperCase()}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 500 }}>{e.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--ink-dim)' }}>
                                Familiar {e.faction ? `· bonded to ${e.faction}` : ''}
                              </div>
                            </div>
                            <button className="btn sm">Claim</button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {claimedFamiliarIds.length > 0 && (
                    <>
                      <label style={{ marginTop: 14 }}>Your familiars</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {claimedFamiliarIds.map(fid => {
                          const f = state.entities[fid];
                          if (!f) return null;
                          return (
                            <div key={fid} className="claim-option" style={{ cursor: 'default' }}>
                              <div className="pc-avatar familiar-avatar" style={{ background: f.color, width: 28, height: 28 }}>
                                {(f.name[0] || '?').toUpperCase()}
                              </div>
                              <span style={{ flex: 1, fontSize: 13 }}>{f.name}</span>
                              <button className="btn sm ghost" onClick={() => unclaimFamiliar(fid)}>Release</button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {showSheet && (
            <EditMySheetModal
              state={state}
              myPeerId={myPeerId}
              claim={myClaim}
              playerActionSender={playerActionSender}
              onClose={() => setShowSheet(false)}
            />
          )}
        </div>

        <RevealedMonstersSidebar state={state} currentMapId={currentMapId} />
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={onSettingsChange}
          onClose={onCloseSettings}
          mode="player"
        />
      )}
    </div>
  );
}

// ====================================================================
// ROOT APP
// ====================================================================
function Root() {
  const [auth, setAuth] = useState(() => {
    // Try the v2 key first, then fall back to the legacy shadowquill key
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    try {
      const legacy = localStorage.getItem(LEGACY_AUTH_KEY);
      if (legacy) return JSON.parse(legacy);
    } catch {}
    return null;
  });

  // v2: global settings (theme + whatever else lands here later).
  // Stored outside game state so they're per-device, not per-session.
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {}
    return { ...DEFAULT_SETTINGS };
  });

  // Apply + persist theme whenever it changes. Uses `data-theme` on the root
  // element so CSS can toggle variable blocks without a full reload.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  const updateSettings = (patch) => setSettings(s => ({ ...s, ...patch }));

  const [showSettings, setShowSettings] = useState(false);

  if (!auth) {
    return (
      <AuthScreen onAuth={(a) => {
        setAuth(a);
        try { localStorage.setItem(AUTH_KEY, JSON.stringify(a)); } catch {}
      }} />
    );
  }

  const logout = () => {
    try { localStorage.removeItem(AUTH_KEY); } catch {}
    try { localStorage.removeItem(LEGACY_AUTH_KEY); } catch {}
    setAuth(null);
  };

  return (
    <Session
      auth={auth}
      onLogout={logout}
      settings={settings}
      onSettingsChange={updateSettings}
      showSettings={showSettings}
      onOpenSettings={() => setShowSettings(true)}
      onCloseSettings={() => setShowSettings(false)}
    />
  );
}

function Session({ auth, onLogout, settings, onSettingsChange, showSettings, onOpenSettings, onCloseSettings }) {
  const toast = useToast();
  const [state, dispatch] = useReducer(reducer, null, () => {
    if (auth.mode === 'dm') {
      // v2: new storage key first, fall back to legacy shadowquill key
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return migrateState(JSON.parse(raw));
      } catch {}
      try {
        const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacy) return migrateState(JSON.parse(legacy));
      } catch {}
      return makeDefaultState();
    }
    // Player starts with empty state (will be hydrated by DM)
    return makeDefaultState();
  });

  const [syncStatus, setSyncStatus] = useState('offline');
  const [peerList, setPeerList] = useState([]);
  const [myPeerId, setMyPeerId] = useState(null);
  const syncRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Persist DM state
  useEffect(() => {
    if (auth.mode === 'dm') {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
    }
  }, [state, auth.mode]);

  // Setup sync
  useEffect(() => {
    if (auth.local) return;
    if (!auth.roomCode) return;

    const sync = new SyncManager({
      mode: auth.mode,
      onStateUpdate: (newState) => {
        if (auth.mode === 'player') {
          dispatch({ type: 'REPLACE', payload: newState });
        }
      },
      onPlayerAction: (action, peerId) => {
        handlePlayerAction(action, peerId);
      },
      onStatusChange: setSyncStatus,
      onPeerListChange: setPeerList,
      onError: (msg) => toast(msg, 'error'),
    });

    syncRef.current = sync;

    if (auth.mode === 'dm') {
      sync.hostSession(auth.roomCode);
    } else {
      sync.joinSession(auth.roomCode);
    }

    const pollPeerId = setInterval(() => {
      if (sync.myPeerId && !myPeerId) {
        setMyPeerId(sync.myPeerId);
      }
    }, 200);

    return () => {
      clearInterval(pollPeerId);
      sync.destroy();
    };
  }, [auth.roomCode, auth.mode, auth.local]);

  // DM broadcasts on state change
  useEffect(() => {
    if (auth.mode !== 'dm' || !syncRef.current || syncStatus !== 'live') return;
    // Broadcast filtered state per player
    const handle = setTimeout(() => {
      peerList.forEach(pid => {
        const conn = syncRef.current.connections.get(pid);
        if (conn?.open) {
          try {
            conn.send({
              type: 'state_update',
              payload: filterStateForPlayer(stateRef.current, pid)
            });
          } catch {}
        }
      });
    }, 30);
    return () => clearTimeout(handle);
  }, [state, peerList, syncStatus, auth.mode]);

  // Send initial state to new peers
  useEffect(() => {
    if (auth.mode !== 'dm' || !syncRef.current) return;
    peerList.forEach(pid => {
      const conn = syncRef.current.connections.get(pid);
      if (conn?.open) {
        try {
          conn.send({ type: 'state_update', payload: filterStateForPlayer(stateRef.current, pid) });
        } catch {}
      }
    });
  }, [peerList, auth.mode]);

  // Handle player actions (DM side). All writes go through here so the DM
  // can validate ownership before dispatching. Players never mutate state
  // directly — they always send an intent message.
  const handlePlayerAction = useCallback((action, peerId) => {
    const curr = stateRef.current;

    // Helper: collect entity IDs this peer owns. Includes:
    //  - claimed PC
    //  - claimed familiars (explicit claim list)
    //  - familiars where bondedPeerId === this peer
    const ownedByPeer = (s, pid) => {
      const c = s.claims?.[pid];
      const out = new Set();
      if (c) {
        for (const id of (c.familiars || [])) out.add(id);
        if (c.pc) out.add(c.pc);
      }
      // v3: bonded familiars
      for (const [eid, ent] of Object.entries(s.entities)) {
        if (ent && ent.type === 'Familiar' && ent.bondedPeerId === pid) out.add(eid);
      }
      return out;
    };

    // v3: which top-level fields a player is allowed to write on their own
    // entities via `patch_own_entity: op=field_set`. Keeping this narrow so
    // a malicious client can never flip DM-only things (e.g. bondedPeerId,
    // deathSaves, sickness, type, id, imageUrl-on-monster-they-don't-own).
    const PLAYER_FIELD_WHITELIST = new Set([
      'name', 'color', 'ac', 'speed', 'initBonus', 'passivePerception',
      'class', 'level', 'playerName', 'notes', 'playerDescription',
      'imageUrl', 'faction', 'role',
    ]);
    const PLAYER_HP_WHITELIST = new Set(['current', 'max']);
    const PLAYER_STATS_WHITELIST = new Set(['str', 'dex', 'con', 'int', 'wis', 'cha']);

    switch (action.type) {
      case 'claim_pc': {
        const { entityId, playerName } = action.payload;
        const entity = curr.entities[entityId];
        if (!entity || entity.type !== 'PC') return;
        const takenBySomeoneElse = Object.entries(curr.claims || {})
          .some(([k, c]) => c.pc === entityId && k !== peerId);
        if (takenBySomeoneElse) return;
        dispatch({ type: 'CLAIM_PC', peerId, entityId, playerName });
        toast(`${entity.name} claimed by ${playerName || 'a player'}`, 'success');
        break;
      }
      case 'unclaim_pc':
        dispatch({ type: 'UNCLAIM_PC', peerId });
        break;
      case 'claim_familiar': {
        const { entityId, playerName } = action.payload;
        const entity = curr.entities[entityId];
        if (!entity || entity.type !== 'Familiar') return;
        const takenBySomeoneElse = Object.entries(curr.claims || {})
          .some(([k, c]) => (c.familiars || []).includes(entityId) && k !== peerId);
        if (takenBySomeoneElse) return;
        dispatch({ type: 'CLAIM_FAMILIAR', peerId, entityId });
        if (playerName) dispatch({ type: 'SET_PLAYER_NAME', peerId, playerName });
        break;
      }
      case 'unclaim_familiar':
        dispatch({ type: 'UNCLAIM_FAMILIAR', peerId, entityId: action.payload.entityId });
        break;
      case 'claim_spectator':
        dispatch({ type: 'CLAIM_SPECTATOR', peerId, playerName: action.payload.playerName });
        break;
      case 'move_token': {
        const { tokenId, x, y } = action.payload;
        const token = curr.tokens[tokenId];
        if (!token) return;
        const entity = curr.entities[token.entityId];
        if (!entity) return;
        if (!ownedByPeer(curr, peerId).has(entity.id)) return;
        dispatch({ type: 'TOKEN_MOVE', id: tokenId, x, y });
        break;
      }
      case 'patch_own_entity': {
        // v3: expanded whitelist — players may edit the full stat block on
        // their own entities, but certain DM-only fields are never writable.
        const { entityId, op } = action.payload || {};
        const targetId = entityId || curr.claims?.[peerId]?.pc;
        if (!targetId) return;
        if (!ownedByPeer(curr, peerId).has(targetId)) return;
        const entity = curr.entities[targetId];
        if (!entity) return;
        if (op === 'hp_adjust') {
          const delta = Number(action.payload.delta) || 0;
          dispatch({ type: 'ENTITY_HP_ADJUST', id: targetId, delta: clamp(delta, -1000, 1000) });
        } else if (op === 'toggle_condition') {
          const condition = String(action.payload.condition || '');
          if (!CONDITIONS.includes(condition)) return;
          dispatch({ type: 'ENTITY_TOGGLE_CONDITION', id: targetId, condition });
        } else if (op === 'field_set') {
          // Apply a patch of allowed fields. Drop anything outside the whitelist.
          const raw = action.payload.patch || {};
          const patch = {};
          for (const [k, v] of Object.entries(raw)) {
            if (PLAYER_FIELD_WHITELIST.has(k)) patch[k] = v;
          }
          if (raw.hp && typeof raw.hp === 'object') {
            const hp = {};
            for (const [k, v] of Object.entries(raw.hp)) {
              if (PLAYER_HP_WHITELIST.has(k)) hp[k] = clamp(Number(v) || 0, 0, 10000);
            }
            if (Object.keys(hp).length) patch.hp = hp;
          }
          if (raw.stats && typeof raw.stats === 'object') {
            const stats = {};
            for (const [k, v] of Object.entries(raw.stats)) {
              if (PLAYER_STATS_WHITELIST.has(k)) stats[k] = clamp(Number(v) || 0, 1, 30);
            }
            if (Object.keys(stats).length) patch.stats = stats;
          }
          if (raw.conditions && Array.isArray(raw.conditions)) {
            patch.conditions = raw.conditions.filter(c => CONDITIONS.includes(c));
          }
          // Sanitize image data URL — must start with data:image/
          if (typeof patch.imageUrl === 'string' && !patch.imageUrl.startsWith('data:image/') && patch.imageUrl !== '') {
            delete patch.imageUrl;
          }
          if (Object.keys(patch).length) {
            dispatch({ type: 'ENTITY_PATCH', id: targetId, patch });
          }
        }
        break;
      }
      case 'reminder_upsert': {
        // Player's own reminder on their own track. Defensive sanitize.
        const r = action.payload?.reminder;
        if (!r || typeof r !== 'object') return;
        const safe = {
          id: String(r.id || uid('rem_')),
          mapId: r.mapId ? String(r.mapId) : null,
          x: Number(r.x) || 0,
          y: Number(r.y) || 0,
          label: String(r.label || '').slice(0, 200),
          color: typeof r.color === 'string' ? r.color.slice(0, 20) : '#c9a34a',
        };
        dispatch({ type: 'REMINDER_UPSERT', peerId, reminder: safe });
        break;
      }
      case 'reminder_delete': {
        dispatch({ type: 'REMINDER_DELETE', peerId, id: String(action.payload?.id || '') });
        break;
      }
    }
  }, [toast]);

  if (auth.mode === 'dm') {
    return (
      <DMInterface
        state={state}
        dispatch={dispatch}
        sync={syncRef.current}
        syncStatus={auth.local ? 'local' : syncStatus}
        peerCount={peerList.length}
        onLogout={onLogout}
        roomCode={auth.local ? null : auth.roomCode}
        toast={toast}
        settings={settings}
        onSettingsChange={onSettingsChange}
        onOpenSettings={onOpenSettings}
        showSettings={showSettings}
        onCloseSettings={onCloseSettings}
      />
    );
  }

  return (
    <PlayerInterface
      state={state}
      myPeerId={myPeerId}
      playerName={auth.playerName}
      sync={syncRef.current}
      syncStatus={syncStatus}
      onLogout={onLogout}
      roomCode={auth.roomCode}
      toast={toast}
      settings={settings}
      onSettingsChange={onSettingsChange}
      onOpenSettings={onOpenSettings}
      showSettings={showSettings}
      onCloseSettings={onCloseSettings}
    />
  );
}

// ====================================================================
// MOUNT
// ====================================================================
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ToastProvider>
    <Root />
  </ToastProvider>
);
