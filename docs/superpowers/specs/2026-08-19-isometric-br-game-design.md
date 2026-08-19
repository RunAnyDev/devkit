# Isometric Pixel Art Battle Royale — Design Spec

**Date:** 2026-08-19
**Status:** Draft (post-brainstorm)
**Workspace:** `/Volumes/FX900/personal/devkit` (greenfield brainstorm)
**Author:** Friday + Mavis

---

## 1. Concept

A 2.5D isometric pixel-art battle royale with shrinking-zone "bo" mechanic. Fantasy theme (kiếm + phép). Solo/Duo modes, 1 player vs AI bots. Server-authoritative simulation on Node.js with Phaser 3 client. Local-first development; deploy deferred until core loop is validated.

**Target experience:** 15-20 minute matches of "loot → fight mob → survive shrinking zone → last team standing" in a 256x256 tile isometric map with 4 biomes (forest/desert/snow/lava).

---

## 2. Decisions Locked

| Attribute | Decision |
|---|---|
| Genre | Battle Royale, 1 player vs 60-100 AI bots (later: multiplayer) |
| Bo mechanic | Shrinking zone, 5 rounds, 15-20 min total |
| Visual style | Isometric 2.5D (dimetric, 2:1 tile ratio), pixel art |
| Stack | Web TS monorepo, Phaser 3 client, Node.js local server |
| Theme | Fantasy (Warrior / Mage / Archer) |
| PvE/PvP | Hybrid: PvE-heavy early, PvP-heavy late (boss + bots only) |
| Classes | 3 fixed classes, chosen pre-match |
| Modes | Solo + Duo (Duo = post-MVP) |
| Account | Stateless, nickname only, no DB |
| Bot spawn | Fill match with AI bots when player count < 30 |
| Bot difficulty | Static medium (loot, attack when seen, no strategy) |
| Initial phase | Local-only, no deploy |

---

## 3. Architecture

### 3.1 Monorepo Layout

```
/packages
  /shared        # TypeScript types, constants, protocol msgs, game data
  /client        # Phaser 3 game (Vite build, browser)
  /server        # Node.js local server (Fastify + ws, runs in dev/CLI)
  /tools         # Map editor CLI, asset pipeline scripts
```

pnpm workspaces, ESM, TypeScript strict.

### 3.2 Game Loop (per match)

1. **Lobby phase** (server-side): 1 player + N bots spawn → state = `COUNTDOWN` (10s)
2. **In-match phase** (server tick 20Hz authoritative): bo, move, attack, skill, loot all server-resolved
3. **End phase**: 1 player/team alive → state = `OVER` → return to lobby

### 3.3 Server Authority

- Client sends `InputCmd{moveX, moveY, skillId, targetId, targetPos}` at 30Hz
- Server validates, runs simulation at 20Hz fixed timestep (50ms), broadcasts `WorldSnapshot{deltas}` at 20Hz
- Client interpolates between snapshots
- All state on server; client is pure renderer + input collector

### 3.4 Persistence

- Match state in-memory only
- No DB, no account, no save
- Each match is ephemeral; player identity is just the session nickname

### 3.5 Local-First Deployment (Phase 1-3)

- Client and server run in same process (Node.js spawns both)
- Player launches game → CLI starts server on localhost:8080 → opens browser to game
- WebSocket over `ws://localhost:8080/ws`
- Production deploy deferred until core loop validated

---

## 4. Map & Rendering

### 4.1 Map Dimensions

- 256x256 tile isometric grid
- Tile size 64x32 px (2:1 ratio)
- Total 65,536 tiles
- Chunk system: only render tiles in viewport + 1 tile margin

### 4.2 Biomes (4 quadrants)

| Biome | Quadrant | Tile types | Theme |
|---|---|---|---|
| Forest | NW | grass, mud, trees, chest | nature items, regen, poison |
| Desert | NE | sand, stone-path, ruins | gold, merchant, defense |
| Snow | SW | snow, ice, frozen-water | slow, freeze, ice shield |
| Lava | SE | stone, lava, obsidian | burn, dot, fire shield |
| Sanctuary | Center | grass, shrine | safe zone (no mobs), starter loot |

### 4.3 Tile Properties

- **Walkable:** grass, sand, snow, stone-path (full speed)
- **Slow:** mud, shallow-water (-30% speed)
- **Block:** deep-water, lava, wall, tree-trunk
- **Special:** chest (loot), teleporter (biome portals), shrine (buff)

### 4.4 Render Pipeline (Phaser 3)

- `IsoMapLayer` custom container; z-sort by `x + y` (back-to-front)
- Entity z-sort: `y * 2 + x` for correct depth
- Camera: smooth lerp follow player, zoom 1.0-2.0x
- Lighting: red overlay on tiles outside bo (shaders/pixel)
- Map data: server-authoritative, same seed for entire match

### 4.5 Map Data Structure

```ts
type Biome = 'forest' | 'desert' | 'snow' | 'lava' | 'sanctuary'
type TileType = 'grass' | 'mud' | 'sand' | 'snow' | 'stone' | 'water-shallow' | 'water-deep' | 'lava' | 'wall' | 'tree' | 'chest' | 'shrine' | 'teleporter'
type Tile = { biome: Biome; type: TileType; height: 0 | 1 | 2; walkable: boolean }
type Map = {
  width: 256
  height: 256
  tiles: Tile[][]
  spawnPoints: Vec2[]
  chestPositions: Vec2[]
  bossPositions: Vec2[]
}
```

---

## 5. Player, Classes, Combat

### 5.1 Player State

```ts
type Player = {
  id: string
  nickname: string
  class: Class
  pos: Vec2
  vel: Vec2
  facing: 0 | 1 | 2 | 3
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  statusEffects: StatusEffect[]
  items: Item[]  // weapon(1) + armor(3) + accessory(2) + consumable(4) = 10 slots
  cooldowns: Record<SkillId, number>
  teamId?: string  // for Duo
  isBot: boolean
}
```

### 5.2 Three Classes

| Stat | Warrior | Mage | Archer |
|---|---|---|---|
| HP | 200 | 120 | 150 |
| MP | 80 | 180 | 120 |
| Speed (px/s) | 180 | 170 | 220 |

| Skill | Warrior | Mage | Archer |
|---|---|---|---|
| **S1 (basic, free)** | Slash — melee 1.5t, 18 dmg | Spark — range 6t, 14 dmg | Arrow — range 8t, 16 dmg |
| **S2 (CD 7s, mana)** | Whirlwind — AoE 3t, 12x3 dmg | Fireball — AoE 2.5t, 25 dmg | Multi-shot — 3 arrows 5t, 10 dmg each |
| **S3 (CD 14s, ult)** | Charge — 5t dash, knockback + 30 dmg | Blizzard — AoE 8t, slow 50% 3s + 18 dmg | Snipe — range 12t, 60 dmg, channel 1.5s |
| **Passive** | +20% HP regen out of combat 5s | +10% spell dmg | +15% speed when not hit 3s |

### 5.3 Combat Flow

1. Client sends `InputCmd{skillId, targetPos?, targetId?}`
2. Server validates: cooldown, mana, range, line-of-sight (tile-block check)
3. If pass: apply effect, broadcast `SkillEvent{playerId, skillId, targetIds, dmg}`
4. Victim receives `DamageEvent{source, dmg, type}`, HP reduced, broadcast in next `WorldSnapshot`
5. HP <= 0 → `DEAD` state, drop items, optionally revivable by Duo teammate (5s channel, 60s window)

### 5.4 Hit Detection

- Distance check (Euclidean on isometric coords)
- Facing check (90° cone in front)
- Line-of-sight: tile-block check (raycast through walkable tiles)
- 100% server authoritative; client only predicts animations

### 5.5 Movement

- Click-to-move or WASD
- Max speed per class
- Tile-based collision: cannot walk on block tiles
- Smooth lerp between server snapshots on client

---

## 6. Bo System (Shrinking Zone)

### 6.1 Five Rounds

| Round | Wait before shrink | Shrink duration | Safe area (% map) | Outside-bo DPS |
|---|---|---|---|---|
| 1 | 90s | 90s | 80% | 1% HP/s |
| 2 | 60s | 60s | 55% | 1.5% HP/s |
| 3 | 45s | 45s | 30% | 2% HP/s |
| 4 | 30s | 30s | 15% | 2.5% HP/s |
| 5 (final) | 20s | 20s | 0% (1 tile) | 3% HP/s |

### 6.2 Bo Geometry

- Bo is a **diamond/ellipse** on isometric grid
- Center + 2 radii (rx, ry, in tile count)
- New bo center randomized within previous safe area
- Tiles outside current bo: take DPS every server tick
- Visual: red tint overlay + particle "burn" at edge

### 6.3 Bo State

```ts
type BoState = {
  round: 1 | 2 | 3 | 4 | 5
  center: Vec2
  rx: number
  ry: number
  phase: 'WAIT' | 'SHRINK' | 'SETTLED'
  phaseTimer: number  // ms remaining
  nextCenter?: Vec2  // preview for client UI
}
```

### 6.4 Player UX

- `nextCenter` sent at start of each `WAIT` phase
- Client renders preview circle on mini-map and main view
- Players self-navigate into safe area
- Bo 5 (final): no instant-kill; 3% DPS = 33s survival if stuck outside

---

## 7. Loot & Items

### 7.1 Rarity (5 tiers)

| Tier | Color | Drop rate | Stat multiplier | Special |
|---|---|---|---|---|
| Common | white | 50% | 1.0x | — |
| Uncommon | green | 30% | 1.4x | — |
| Rare | blue | 15% | 2.0x | — |
| Epic | purple | 4% | 3.0x | — |
| Legendary | orange | 1% | 5.0x | unique effect |

### 7.2 Item Types & Inventory

10-slot inventory:

- **Weapon** (1 slot): sword / bow / staff; +dmg to class skills; rarity multiplier
- **Armor** (3 slots): helm / chest / boot; +HP, +def, +speed
- **Accessory** (2 slots): ring / amulet; +mana, +cdr, special (lifesteal, double-jump, aoe-on-hit)
- **Consumable** (4 slots): HP pot (heal 30%), MP pot (restore 50%), buff pot (+20% atk/def 60s), food (regen 2 HP/s 30s)

### 7.3 Loot Sources

- **Chest spawn** (200 chests/256x256 map): spread across 4 biomes
  - 80% normal chest: 1-3 items (common-uncommon)
  - 20% golden chest: 5 items (rare+)
- **Mob drop**: 30% chance, 1 item, tier scales with round
- **Elite mob drop** (8 per match): 2-3 items, rare+
- **Shrine pickup** (random on map): 1 free consumable buff

### 7.4 Pickup Flow

1. Player clicks item within pickup range (1.5 tile)
2. Server validates: free slot? not duplicate type?
3. If pass: add to inventory, broadcast `ItemPickup{playerId, itemId}`
4. If full: show swap UI (player picks item to drop)

### 7.5 Drop on Death

- Player dies → all items drop to ground
- Items despawn after 5 minutes
- Anyone can pick up (including teammates? no — teammates cannot pick up in solo; yes in Duo)

### 7.6 Biome Item Themes

- **Forest:** poison, regen
- **Desert:** gold, merchant (post-MVP)
- **Snow:** slow, freeze
- **Lava:** burn, dot

---

## 8. PvE + PvP Hybrid

### 8.1 Mob Roster (6 normal + 4 boss)

| Mob | Biome | HP | Dmg | Behavior | Drop |
|---|---|---|---|---|---|
| Skeleton | forest | 60 | 8 | melee aggro 4t | common 30% |
| Wolf | forest | 80 | 12 | leap aggro 6t | common 40% |
| Slime | desert | 100 | 6 | slow, splits 2x | common 50% |
| Scorpion | desert | 70 | 14 | poison 3s | uncommon 30% |
| Bat | snow | 40 | 5 | flying, fast | common 60% |
| Ice golem | snow | 150 | 18 | slow + AoE | rare 20% |
| Magma elemental | lava | 200 | 22 | burn 5s | rare 30% |
| Dragon boss (4 on map) | all | 800 | 40 | aggro 10t, AoE | epic 100% |

### 8.2 Spawn Schedule per Round

| Round | Mob count | Types | Spawn rate (per chunk) | Player bot count |
|---|---|---|---|---|
| 1 | 200 | skeleton, wolf, slime, bat | 1/3s | fill to 80 |
| 2 | 150 | + scorpion, ice golem | 1/5s | ~70 |
| 3 | 100 | + magma elemental | 1/8s | ~50 |
| 4 | 30 | elite only | 1/15s | ~25 |
| 5 | 0 | boss + boss minions | 1/30s | ~10 |

### 8.3 Mob AI (state machine)

```
SPAWN
  → IDLE (3-8s)
  → PATROL (random 4t)
  → if player in aggro range: CHASE
    → if in attack range: ATTACK (basic)
    → if HP < 30%: FLEE or DESPAWN
  → if target lost 8s: return to PATROL
  → if HP = 0: DEAD → drop loot → despawn 30s
```

### 8.4 Pathfinding

- A* on tile grid
- Recompute every 1s OR when target moves > 2 tiles
- Cache path for 500ms

### 8.5 Bot Player AI

- Same class + skill as human player
- Behavior tree (re-evaluated every 500ms):
  1. Loot nearest item (if HP/MP < 50%)
  2. Move toward bo safe area
  3. If enemy in 8t vision: engage (attack skill priority: S3 > S2 > S1)
  4. If HP < 40%: use HP pot / retreat
  5. End-game (1v1): hunt weakest visible player
- Targeting: nearest in vision, tie-break by lowest HP
- Static medium difficulty (no ELO adaptation)

### 8.6 Hybrid Pacing

Encounter mix shifts from PvE-dominant early to PvP-dominant late. "PvE weight" = share of player attention/time spent on mob combat vs player combat.

| Round | PvE weight | PvP weight | Player focus |
|---|---|---|---|
| 1-2 | 70% | 30% | Loot zones, clear mob camps, occasional bot skirmish |
| 3 | 50% | 50% | Balance mob farming with bot hunting |
| 4-5 | 20% | 80% | Boss fight, bot hunt, final circle duels |

---

## 9. Netcode & Protocol

### 9.1 Transport

- WebSocket, binary MessagePack (compact + fast parse)
- 1 connection per match
- Auto-reconnect with session token (5 retries: 1s, 2s, 4s, 8s, 16s)

### 9.2 Tick Rates

- **Input tick** (client → server): 30Hz
- **Simulation tick** (server): 20Hz fixed timestep (50ms)
- **Snapshot tick** (server → client): 20Hz
- **Ping**: client sends every 2s, server responds, latency shown in HUD

### 9.3 Message Types

| Direction | Type | Freq | Payload |
|---|---|---|---|
| C→S | `JoinMatch` | 1x | `nickname, class, mode` |
| C→S | `InputCmd` | 30Hz | `seq, dt, moveX/Y, skill?, target?` |
| C→S | `PickupItem` | on click | `itemId` |
| C→S | `Ping` | 2s | `clientTime` |
| S→C | `MatchStart` | 1x | `mapSeed, spawnPos, matchId, players[]` |
| S→C | `WorldSnapshot` | 20Hz | `tick, players[], mobs[], items[], bo, events[]` |
| S→C | `Event` | on action | `type, data` (kill, pickup, skill cast) |
| S→C | `MatchEnd` | 1x | `winner, rankings` |
| S→C | `Pong` | per ping | `serverTime, clientTime` |

### 9.4 Client Prediction & Reconciliation

- Client predicts own player movement between snapshots
- On snapshot receipt: compare server pos vs client predicted pos
- If delta > 5px: smooth lerp to server pos over 100ms
- Result: instant input feel (client) + correct state (server)

### 9.5 Server-Side Lag Compensation

- Server ring buffer: 1s = 20 ticks of player positions
- When player A attacks player B: rewind 100-200ms (lag of A), check A's attack position vs B's historical position
- If hit valid: apply damage, broadcast
- Acceptable for 80-150ms ping (typical VN/EU)

### 9.6 Anti-Cheat (basic, post-MVP)

- Validate: speed ≤ max + 20% buffer, cooldown OK, mana OK, range OK, LoS OK
- Server 100% authoritative
- Flag suspicious behavior; ban (post-MVP)

### 9.7 Optimizations

- **Interest management:** server only sends entities in viewport ± 16 tile per client (~60% bandwidth reduction)
- **Delta encoding:** snapshot contains only changed entities vs previous snapshot
- **Compression:** MessagePack + zlib for snapshots

---

## 10. Matchmaking & Player Flow

### 10.1 Player Journey (Local-First)

```
[Title screen]
  ↓
[Main menu: Play / Settings / Credits]
  ↓
[Lobby]
  ├ Class select (Warrior/Mage/Archer) + skin pick
  ├ Mode option: vs 20 bots / vs 50 bots / vs 80 bots
  ├ Map seed (random / fixed for testing)
  └ Click "Start Match" → launch local server
  ↓
[Loading 1-3s]
  ↓
[Countdown 10s] (free practice at spawn)
  ↓
[In-match 15-20 min]
  ├ HUD: HP/MP bar, minimap, kill count, alive count, bo timer
  ├ Click-to-move, click-to-attack, hotkey 1-4 for skill
  ├ Death → spectate (watch others)
  ├ Top 3 left → "Final circle!"
  ↓
[Match end]
  ├ Result screen: rank, kills, dmg dealt, items collected
  ├ Top 3 podium
  └ "Return to lobby" or "Play again"
  ↓
back to [Lobby]
```

### 10.2 Local Match Setup

- Player clicks "Start Match" → spawn local Node server on `localhost:8080`
- Server generates map, spawns player + N AI bots, returns match token
- Client connects to `ws://localhost:8080/ws` with token
- Match runs to completion, server shuts down on match end
- No matchmaking service needed (no queue, no remote players)

### 10.3 Bot Matchmaking Logic

- Player chooses "vs 20/50/80 bots" in lobby
- Server spawns that many AI bots, distributed across biomes
- Each bot has random class + random nickname

### 10.4 Reconnect (Local)

- Disconnect → auto-reconnect 5 retries
- Success: server sends latest snapshot, client rebuilds state
- Fail: client shows "Connection lost" with retry button

### 10.5 Disqualify

- AFK > 2 min (no input) → warning
- AFK > 3 min → kill (drop items, mark dead)
- Manual quit → cannot reconnect this match

### 10.6 Spectator Mode

- After death: free-camera on map, click to spectate another player
- Read-only view; no input
- Post-MVP: text chat

### 10.7 Multiplayer (Post-MVP, Deferred)

- Add dedicated server deployment
- Add matchmaking service (queue, region, skill bracket)
- Add Duo queue + invite system
- Add leaderboard (requires DB)

---

## 11. Testing & Milestones

### 11.1 Phases (1 dev full-time, ~24 weeks)

| Phase | Weeks | Scope | Deliverable |
|---|---|---|---|
| **P1: Foundation** | 1-6 | Monorepo, Phaser client, Node local server, WS protocol, 256x256 map gen, 1 class (Warrior), basic move + attack, 1 chest spawn, no bo | 2 clients (1 player + 1 bot) connect to local server, fight on small map |
| **P2: Gameplay core** | 7-14 | 3 classes + full skill set, bo 5 rounds, loot 5 rarity, 6 normal mobs + 2 bosses, PvE balance | Player + 8 bots play 1 full match: kill mobs, loot, bo shrinks, last standing |
| **P3: Local bot + Polish** | 15-24 | Bot AI tree, 60-100 bot match, reconnect, spectator, HUD UI, asset pipeline, perf tuning, balance pass | Player vs 80 bots, full match playable, 60 FPS, < 50 KB/s network, no critical bugs |
| **P4: Multiplayer + Deploy** (post-MVP) | TBD | Dedicated server, matchmaking, Duo, leaderboard, deploy to VPS | Public beta, 100+ player queue |

### 11.2 Testing Strategy

| Layer | Tool | Coverage |
|---|---|---|
| **Unit** | Vitest | Server: combat calc, bo DPS, item drop, pathfinding, AI state machine |
| **Integration** | Vitest + supertest | Protocol messages, reconnect, snapshot integrity |
| **E2E** | Playwright + headless Phaser | 2-10 clients connect, click UI, verify game state |
| **Load** | k6 / autocannon | 100 concurrent clients, server CPU/RAM < 70%, tick < 50ms |
| **Visual regression** | Percy / Chromatic | UI screenshot per scene, compare to baseline |
| **Manual playtest** | Friday + 2-5 friends | 30 min/day, log bugs, track in issue list |

### 11.3 Performance Budget

- **Client:** 60 FPS with 100 entities in viewport; 200 MB RAM
- **Server:** 50ms tick with 100 player, 200 mob, 500 item
- **Network:** < 50 KB/s per client (interest-managed + delta)
- **Cold start** (match launch): < 5s for player + 80 bots

### 11.4 Critical Risks & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| Phaser isometric z-sort bug at scale | High | Test IsoMapLayer early in P1; fallback to top-down 2D if needed |
| Node.js can't handle 100 bots at 20Hz | High | Benchmark in P1; if fail, rewrite hot path in Rust/Go, or reduce bot count |
| Asset pixel art pipeline slow | Medium | Use OpenGameArt + Kenney asset packs for prototype; custom art later |
| AI bot too dumb or too smart | Medium | Iterate based on playtest; behavior tree is config-driven |
| Scope creep (5+ classes, more modes) | High | Freeze scope after P2; only polish in P3; defer new features to P4 |
| Cheat (memory edit, packet replay) | Low (local) | Server-authoritative; post-MVP: rate limit, Cloudflare proxy |

### 11.5 Definition of Done (per phase)

**P1 done when:** Player can start local match, move around map, attack 1 mob type, kill it, see loot drop, pick up.

**P2 done when:** Player can play 1 full match vs 8 bots: loot, fight 3 mob types, survive 5 bo rounds, kill at least 1 bot.

**P3 done when:** Player can play vs 80 bots, full match in 20 min, 60 FPS, 0 critical bugs after 1 week of playtest.

**P4 done when:** 2 players in different browsers can join same match, see each other, fight.

---

## 12. Open Questions (Post-MVP)

- Server region (VN / SG / Tokyo / multi-region)?
- Deploy target (VPS, Cloud Run, Fly.io)?
- CDN for assets (R2, S3, Cloudflare)?
- Analytics (PostHog, Plausible, custom)?
- Account system (Steam OAuth, Google, anonymous nickname)?
- Anti-cheat (server-side heuristics, Cloudflare, third-party)?
- Mobile support (touch controls, smaller viewport)?

---

## 13. References

- **Phaser 3 isometric tutorials:** https://phaser.io/examples (search "isometric")
- **PUBG bo system:** reference for pacing and visual cues
- **Vampire Survivors:** reference for mob density + auto-attack feel
- **Realm Royale:** reference for class-based BR
- **Forager:** reference for isometric 2.5D pixel art
- **OpenGameArt:** free pixel art asset library
- **Kenney:** free 2D/3D asset packs

---

## 14. Change Log

| Date | Change | Author |
|---|---|---|
| 2026-08-19 | Initial draft from brainstorming session | Friday + Mavis |
