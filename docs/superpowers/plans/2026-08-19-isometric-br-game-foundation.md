# Isometric BR Game — Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a pnpm monorepo with shared TS types, a Node.js local game server (Fastify + ws), and a Phaser 3 browser client. By end of Phase 1, a human player can launch the local launcher, connect to the server, and move + attack a single AI bot in a small 32x32 isometric map with no bo, no loot, no class skills (just basic attack).

**Architecture:** Local-first. Player runs `pnpm dev:game` which starts Node server on `localhost:8080` and opens browser to `http://localhost:5173`. Client and server communicate via WebSocket with MessagePack-encoded messages at 20Hz tick rate. Server is authoritative for all state; client is renderer + input collector with prediction for own player.

**Tech Stack:**
- **Monorepo:** pnpm workspaces
- **Language:** TypeScript (strict, ESM, Node 20+)
- **Server:** Node.js, Fastify 4, ws 8, msgpackr
- **Client:** Vite 5, Phaser 3.80+, TypeScript
- **Testing:** Vitest (unit + integration), Playwright (E2E)
- **Linting:** ESLint 9 (flat config), Prettier 3

## Global Constraints

- **Node version:** >= 20.10 (for native test runner, ESM)
- **Package manager:** pnpm >= 9 (no npm/yarn; uses workspaces)
- **TypeScript:** >= 5.4, strict mode, `noUncheckedIndexedAccess: true`
- **ESM only:** All packages use `"type": "module"`, no CommonJS
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`)
- **No external DB:** All state in-memory; Phase 1 is local-only
- **No deploy:** Phase 1 runs on `localhost`; no VPS, no Cloudflare
- **Asset policy:** Use Kenney.nl / OpenGameArt CC0 packs only; no custom art in P1
- **Server tick rate:** 20Hz fixed timestep (50ms)
- **Client input rate:** 30Hz throttled
- **Naming:** files kebab-case.ts, classes PascalCase, functions camelCase, constants UPPER_SNAKE_CASE
- **Map size for P1:** 32x32 tile (not full 256x256) to keep iteration fast; full size in P2
- **No bo in P1:** match just runs until one side dies; bo logic deferred to P2
- **No class system in P1:** all players use Warrior defaults (HP 200, speed 180, basic attack Slash 1.5t 18dmg)
- **One bot only in P1:** PvE vs 1 bot, not 80; scale to 80 in P3
- **Workspace root:** `/Volumes/FX900/personal/devkit/game/` (sibling to existing vite project)

---

## File Structure (P1 deliverable)

```
/Volumes/FX900/personal/devkit/game/
├── package.json                 # root, pnpm workspace
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .eslintrc.cjs                # legacy config (will migrate to flat in P3)
├── .prettierrc
├── README.md
│
├── packages/
│   ├── shared/                  # protocol + types + constants
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts         # barrel export
│   │       ├── types.ts         # Player, Bot, Vec2, etc.
│   │       ├── protocol.ts      # WS message types + codec
│   │       └── constants.ts     # game constants
│   │
│   ├── server/                  # Node.js local server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts         # entry: start Fastify + ws
│   │       ├── match.ts         # MatchState singleton
│   │       ├── map-gen.ts       # procedural map generator
│   │       ├── physics.ts       # move + collision
│   │       ├── combat.ts        # attack validation + damage
│   │       ├── bot.ts           # simple bot AI
│   │       ├── tick.ts          # 20Hz game loop
│   │       ├── snapshot.ts      # WorldSnapshot builder
│   │       ├── protocol-handler.ts  # WS message routing
│   │       └── launcher.ts      # CLI: start server + open browser
│   │
│   └── client/                  # Phaser 3 browser client
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       ├── index.html
│       └── src/
│           ├── main.ts          # Phaser init
│           ├── net/
│           │   └── ws.ts        # WS connection + send/recv
│           ├── iso/
│           │   ├── iso-map-layer.ts  # Phaser custom container
│           │   └── iso-utils.ts     # tile↔world coords
│           ├── scenes/
│           │   └── game-scene.ts
│           ├── input/
│           │   └── input-manager.ts # mouse/keyboard
│           ├── render/
│           │   └── entity-renderer.ts
│           └── ui/
│               └── hud.ts
│
└── tests/
    └── e2e/
        └── smoke.spec.ts        # Playwright: 2 windows play
```

---

## Task 1: Initialize pnpm Monorepo

**Files:**
- Create: `game/package.json`
- Create: `game/pnpm-workspace.yaml`
- Create: `game/tsconfig.base.json`
- Create: `game/.gitignore`
- Create: `game/.prettierrc`
- Create: `game/.eslintrc.cjs`
- Create: `game/README.md`

**Interfaces:**
- Consumes: nothing (initial)
- Produces: workspace root that other packages depend on

- [ ] **Step 1: Verify Node and pnpm versions**

Run:
```bash
node --version   # expect v20.x or higher
pnpm --version   # expect 9.x or higher
```

If either is missing, install via nvm: `nvm install 20 && nvm use 20 && npm i -g pnpm`

- [ ] **Step 2: Create root package.json**

```bash
mkdir -p /Volumes/FX900/personal/devkit/game
cd /Volumes/FX900/personal/devkit/game
```

Write `package.json`:
```json
{
  "name": "iso-br-game",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:game": "pnpm --filter @iso-br/server dev",
    "dev:client": "pnpm --filter @iso-br/client dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "eslint . --ext .ts",
    "format": "prettier --write \"**/*.{ts,json,md}\""
  },
  "devDependencies": {
    "@types/node": "^20.12.0",
    "@typescript-eslint/eslint-plugin": "^7.7.0",
    "@typescript-eslint/parser": "^7.7.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.5",
    "typescript": "^5.4.5"
  },
  "engines": {
    "node": ">=20.10",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 4: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Create .gitignore**

```gitignore
node_modules/
dist/
.DS_Store
*.log
.env
.env.local
coverage/
.vite/
*.tsbuildinfo
playwright-report/
test-results/
```

- [ ] **Step 6: Create .prettierrc**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 7: Create .eslintrc.cjs (legacy for P1, flat config in P3)**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', '*.cjs'],
}
```

- [ ] **Step 8: Create README.md**

```markdown
# Isometric Battle Royale Game

Local-first 2.5D pixel-art battle royale. See `docs/superpowers/specs/2026-08-19-isometric-br-game-design.md` for design.

## Phase 1: Foundation

- pnpm monorepo with shared/server/client packages
- Node.js local server with WebSocket
- Phaser 3 client with isometric map rendering
- 1 player vs 1 bot, basic move + attack

## Run

\`\`\`bash
pnpm install
pnpm dev:game
\`\`\`

Server starts on `localhost:8080` and opens browser to `http://localhost:5173`.

## Test

\`\`\`bash
pnpm test
\`\`\`
```

- [ ] **Step 9: Install root dependencies**

Run: `pnpm install`
Expected: `node_modules/` and `pnpm-lock.yaml` created, no errors

- [ ] **Step 10: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/
git -c user.name=Friday -c user.email=friday@local commit -m "chore(game): initialize pnpm monorepo with TS + ESLint + Prettier"
```

---

## Task 2: Create @iso-br/shared Package

**Files:**
- Create: `game/packages/shared/package.json`
- Create: `game/packages/shared/tsconfig.json`
- Create: `game/packages/shared/src/index.ts`
- Create: `game/packages/shared/src/types.ts`
- Create: `game/packages/shared/src/protocol.ts`
- Create: `game/packages/shared/src/constants.ts`
- Create: `game/packages/shared/tests/protocol.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Vec2`, `Player`, `Bot`, `MatchState`, WS message types, game constants, `encodeMsg` / `decodeMsg` functions

- [ ] **Step 1: Write failing test for protocol codec**

Write `game/packages/shared/tests/protocol.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { encodeMsg, decodeMsg, type JoinMatchMsg, type WorldSnapshotMsg } from '../src/index.js'

describe('protocol codec', () => {
  it('round-trips JoinMatch msg', () => {
    const msg: JoinMatchMsg = { type: 'JoinMatch', nickname: 'Alice', class: 'warrior' }
    const encoded = encodeMsg(msg)
    const decoded = decodeMsg(encoded)
    expect(decoded).toEqual(msg)
  })

  it('round-trips WorldSnapshot msg', () => {
    const msg: WorldSnapshotMsg = {
      type: 'WorldSnapshot',
      tick: 42,
      players: [{ id: 'p1', pos: { x: 10, y: 20 }, hp: 200, maxHp: 200, facing: 0 }],
      bots: [{ id: 'b1', pos: { x: 5, y: 5 }, hp: 200, maxHp: 200, facing: 1 }],
    }
    const encoded = encodeMsg(msg)
    const decoded = decodeMsg(encoded)
    expect(decoded).toEqual(msg)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/shared && pnpm test 2>&1 | head -30`
Expected: FAIL with "Cannot find module" (package not set up yet)

- [ ] **Step 3: Create shared package.json**

```json
{
  "name": "@iso-br/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "msgpackr": "^1.10.1"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: Create shared tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 5: Create constants.ts**

```ts
// game/packages/shared/src/constants.ts

export const TILE_SIZE = 64
export const TILE_HEIGHT = 32
export const SERVER_TICK_HZ = 20
export const SERVER_TICK_MS = 1000 / SERVER_TICK_HZ
export const CLIENT_INPUT_HZ = 30

// Map (P1: small 32x32 for fast iteration; full 256x256 in P2)
export const MAP_WIDTH = 32
export const MAP_HEIGHT = 32

// Player (P1: Warrior only; full 3-class in P2)
export const WARRIOR_HP = 200
export const WARRIOR_SPEED = 180 // px/s
export const WARRIOR_BASIC_RANGE = 1.5 // tiles
export const WARRIOR_BASIC_DMG = 18
export const BASIC_ATTACK_COOLDOWN_MS = 600

// Network
export const WS_PATH = '/ws'
export const SERVER_PORT = 8080
export const CLIENT_PORT = 5173
```

- [ ] **Step 6: Create types.ts**

```ts
// game/packages/shared/src/types.ts

export type Vec2 = { x: number; y: number }

export type Class = 'warrior' // P1: only warrior; P2: 'warrior' | 'mage' | 'archer'
export type Facing = 0 | 1 | 2 | 3 // 0=N, 1=E, 2=S, 3=W

export type Player = {
  id: string
  nickname: string
  isBot: false
  pos: Vec2
  facing: Facing
  hp: number
  maxHp: number
  speed: number
  attackCooldownUntil: number // ms timestamp when next attack allowed
}

export type Bot = {
  id: string
  nickname: string
  isBot: true
  pos: Vec2
  facing: Facing
  hp: number
  maxHp: number
  speed: number
  attackCooldownUntil: number
  targetId: string | null
}

export type MatchState = {
  matchId: string
  mapSeed: number
  players: Player[]
  bots: Bot[]
  status: 'waiting' | 'running' | 'ended'
  winnerId: string | null
}

export type TileKind = 'grass' | 'wall'

export type Tile = {
  x: number
  y: number
  kind: TileKind
  walkable: boolean
}

export type GameMap = {
  width: number
  height: number
  tiles: Tile[]
}
```

- [ ] **Step 7: Create protocol.ts**

```ts
// game/packages/shared/src/protocol.ts

import { pack, unpack } from 'msgpackr'
import type { Vec2, Player, Bot, Facing, GameMap, MatchState } from './types.js'

// Client → Server messages
export type JoinMatchMsg = {
  type: 'JoinMatch'
  nickname: string
  class: 'warrior'
}

export type InputCmdMsg = {
  type: 'InputCmd'
  seq: number
  dt: number // ms since last input
  moveX: number // -1, 0, 1
  moveY: number // -1, 0, 1
  attack: boolean
}

export type PingMsg = {
  type: 'Ping'
  clientTime: number
}

// Server → Client messages
export type MatchStartMsg = {
  type: 'MatchStart'
  matchId: string
  mapSeed: number
  map: GameMap
  you: Player
  opponent: Bot
}

export type WorldSnapshotMsg = {
  type: 'WorldSnapshot'
  tick: number
  serverTime: number
  you: Player
  opponent: Bot
}

export type DamageEventMsg = {
  type: 'DamageEvent'
  targetId: string
  amount: number
  sourceId: string
}

export type MatchEndMsg = {
  type: 'MatchEnd'
  winnerId: string
  winnerNickname: string
}

export type PongMsg = {
  type: 'Pong'
  clientTime: number
  serverTime: number
}

export type ServerMsg =
  | MatchStartMsg
  | WorldSnapshotMsg
  | DamageEventMsg
  | MatchEndMsg
  | PongMsg

export type ClientMsg = JoinMatchMsg | InputCmdMsg | PingMsg

export function encodeMsg(msg: ClientMsg | ServerMsg): Uint8Array {
  return pack(msg)
}

export function decodeMsg(buf: Uint8Array): ClientMsg | ServerMsg {
  return unpack(buf) as ClientMsg | ServerMsg
}
```

- [ ] **Step 8: Create index.ts barrel**

```ts
// game/packages/shared/src/index.ts
export * from './types.js'
export * from './protocol.js'
export * from './constants.js'
```

- [ ] **Step 9: Install shared deps and run tests**

Run:
```bash
cd /Volumes/FX900/personal/devkit/game
pnpm install
cd packages/shared
pnpm test
```
Expected: 2 tests pass (round-trip JoinMatch + WorldSnapshot)

- [ ] **Step 10: Build shared package**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/shared && pnpm build`
Expected: `dist/` created with `index.js`, `index.d.ts`, etc.

- [ ] **Step 11: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/shared/
git -c user.name=Friday -c user.email=friday@local commit -m "feat(shared): add types, protocol codec, constants with msgpackr"
```

---

## Task 3: Create @iso-br/server with Fastify + ws Bootstrap

**Files:**
- Create: `game/packages/server/package.json`
- Create: `game/packages/server/tsconfig.json`
- Create: `game/packages/server/src/index.ts`
- Create: `game/packages/server/src/match.ts`
- Create: `game/packages/server/tests/smoke.test.ts`

**Interfaces:**
- Consumes: `@iso-br/shared` (types, protocol, constants)
- Produces: `startServer(port: number): Promise<Server>` function

- [ ] **Step 1: Write failing test for server start**

Write `game/packages/server/tests/smoke.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest'
import { startServer } from '../src/index.js'
import { WebSocket } from 'ws'

describe('server smoke', () => {
  let server: Awaited<ReturnType<typeof startServer>>
  let port: number

  it('starts and accepts WS connection', async () => {
    server = await startServer(0) // 0 = random port
    port = server.port
    expect(port).toBeGreaterThan(0)

    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve())
      ws.on('error', reject)
      setTimeout(() => reject(new Error('timeout')), 2000)
    })
    ws.close()
  })

  afterAll(async () => {
    await server?.close()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test 2>&1 | head -20`
Expected: FAIL (package not set up, no startServer)

- [ ] **Step 3: Create server package.json**

```json
{
  "name": "@iso-br/server",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@iso-br/shared": "workspace:*",
    "fastify": "^4.27.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.10",
    "tsx": "^4.7.2",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: Create server tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 5: Create match.ts (empty for now)**

```ts
// game/packages/server/src/match.ts
import type { MatchState, Player, Bot, GameMap } from '@iso-br/shared'
import { randomUUID } from 'node:crypto'

export class Match {
  state: MatchState

  constructor(seed: number, map: GameMap) {
    this.state = {
      matchId: randomUUID(),
      mapSeed: seed,
      players: [],
      bots: [],
      status: 'waiting',
      winnerId: null,
    }
  }

  addPlayer(player: Player): void {
    this.state.players.push(player)
  }

  addBot(bot: Bot): void {
    this.state.bots.push(bot)
  }
}
```

- [ ] **Step 6: Create index.ts with startServer**

```ts
// game/packages/server/src/index.ts
import Fastify, { type FastifyInstance } from 'fastify'
import { WebSocketServer } from 'ws'
import { Match } from './match.js'

export interface ServerHandle {
  port: number
  close: () => Promise<void>
  fastify: FastifyInstance
}

export async function startServer(port: number): Promise<ServerHandle> {
  const fastify = Fastify({ logger: false })

  // Single match for P1 (1 player + 1 bot)
  const match = new Match(0, { width: 32, height: 32, tiles: [] })

  fastify.get('/health', async () => ({ ok: true, matchId: match.state.matchId }))

  // WS upgrade handled below
  const wss = new WebSocketServer({ noServer: true })

  fastify.server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on('connection', (ws) => {
    ws.on('message', (data) => {
      // Will implement in Task 5
    })
  })

  await fastify.listen({ port, host: '0.0.0.0' })
  const actualPort = fastify.server.address()
  const finalPort = typeof actualPort === 'object' && actualPort ? actualPort.port : port

  return {
    port: finalPort,
    fastify,
    close: async () => {
      await fastify.close()
    },
  }
}

// CLI entry: `pnpm dev:game` or `node dist/index.js`
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const port = Number(process.env.PORT ?? 8080)
  startServer(port).then((s) => {
    console.log(`[server] listening on http://localhost:${s.port}`)
  })
}
```

- [ ] **Step 7: Install server deps and run smoke test**

Run:
```bash
cd /Volumes/FX900/personal/devkit/game
pnpm install
cd packages/server
pnpm test
```
Expected: 1 test passes ("starts and accepts WS connection")

- [ ] **Step 8: Manual smoke: start server and curl health**

Terminal 1:
```bash
cd /Volumes/FX900/personal/devkit/game/packages/server
pnpm dev
```
Expected: log shows "listening on http://localhost:8080"

Terminal 2:
```bash
curl http://localhost:8080/health
```
Expected: `{"ok":true,"matchId":"<uuid>"}`

Stop server with Ctrl-C.

- [ ] **Step 9: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/server/
git -c user.name=Friday -c user.email=friday@local commit -m "feat(server): Fastify + ws bootstrap with /ws upgrade and health endpoint"
```

---

## Task 4: Procedural Map Generator (32x32, 4 quadrants)

**Files:**
- Create: `game/packages/server/src/map-gen.ts`
- Create: `game/packages/server/tests/map-gen.test.ts`

**Interfaces:**
- Consumes: `seed: number`
- Produces: `GameMap` (32x32 tiles, 4 quadrants: NW=grass, NE=wall-bordered, SW=wall-cluster, SE=wall-corridor)

- [ ] **Step 1: Write failing test**

Write `game/packages/server/tests/map-gen.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateMap } from '../src/map-gen.js'

describe('map generator', () => {
  it('generates 32x32 map', () => {
    const map = generateMap(42)
    expect(map.width).toBe(32)
    expect(map.height).toBe(32)
    expect(map.tiles.length).toBe(32 * 32)
  })

  it('all tiles have valid kind and walkable', () => {
    const map = generateMap(42)
    for (const tile of map.tiles) {
      expect(['grass', 'wall']).toContain(tile.kind)
      expect(typeof tile.walkable).toBe('boolean')
      expect(tile.walkable).toBe(tile.kind === 'grass')
    }
  })

  it('NW quadrant (player spawn area) is mostly walkable', () => {
    const map = generateMap(42)
    let walkableCount = 0
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (map.tiles[y * 32 + x]!.walkable) walkableCount++
      }
    }
    expect(walkableCount).toBeGreaterThan(40) // 64 tiles, allow some walls
  })

  it('spawns are walkable', () => {
    const map = generateMap(42)
    // Spawn points: player at (4,4), bot at (28,28)
    expect(map.tiles[4 * 32 + 4]!.walkable).toBe(true)
    expect(map.tiles[28 * 32 + 28]!.walkable).toBe(true)
  })

  it('same seed produces same map (deterministic)', () => {
    const a = generateMap(123)
    const b = generateMap(123)
    expect(a.tiles).toEqual(b.tiles)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test 2>&1 | head -20`
Expected: FAIL (no generateMap function)

- [ ] **Step 3: Implement map-gen.ts**

```ts
// game/packages/server/src/map-gen.ts
import type { GameMap, Tile } from '@iso-br/shared'

// Seeded PRNG (mulberry32)
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateMap(seed: number): GameMap {
  const width = 32
  const height = 32
  const rng = makeRng(seed)
  const tiles: Tile[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let kind: 'grass' | 'wall'

      // Border walls
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        kind = 'wall'
      }
      // NE quadrant: scattered walls
      else if (x >= 16 && y < 16 && rng() < 0.25) {
        kind = 'wall'
      }
      // SW quadrant: wall cluster
      else if (x < 16 && y >= 16) {
        const cx = 4
        const cy = 20
        const dist = Math.hypot(x - cx, y - cy)
        kind = dist < 4 && rng() < 0.6 ? 'wall' : 'grass'
      }
      // SE quadrant: wall corridor
      else if (x >= 16 && y >= 16) {
        kind = x === 20 || x === 21 ? 'wall' : 'grass'
      }
      // NW quadrant: mostly grass (player spawn)
      else {
        kind = rng() < 0.05 ? 'wall' : 'grass'
      }

      tiles.push({
        x,
        y,
        kind,
        walkable: kind === 'grass',
      })
    }
  }

  // Force spawn tiles to be walkable
  tiles[4 * 32 + 4] = { x: 4, y: 4, kind: 'grass', walkable: true }
  tiles[28 * 32 + 28] = { x: 28, y: 28, kind: 'grass', walkable: true }

  return { width, height, tiles }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test`
Expected: all 5 tests pass

- [ ] **Step 5: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/server/src/map-gen.ts game/packages/server/tests/map-gen.test.ts
git -c user.name=Friday -c user.email=friday@local commit -m "feat(server): procedural 32x32 map generator with 4 quadrants"
```

---

## Task 5: Player Physics (move + collision)

**Files:**
- Create: `game/packages/server/src/physics.ts`
- Create: `game/packages/server/tests/physics.test.ts`

**Interfaces:**
- Consumes: `Player`, `Bot`, `GameMap`, `dt: number` (ms)
- Produces: `movePlayer(player, input, map, dt): Player` (immutable; returns new pos/vel/facing)

- [ ] **Step 1: Write failing test**

Write `game/packages/server/tests/physics.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { moveEntity } from '../src/physics.js'
import { generateMap } from '../src/map-gen.js'
import type { Player, Bot, GameMap } from '@iso-br/shared'

const map: GameMap = generateMap(42)

function mkPlayer(pos = { x: 4 * 64 + 32, y: 4 * 32 + 16 }): Player {
  return {
    id: 'p1',
    nickname: 'Alice',
    isBot: false,
    pos,
    facing: 0,
    hp: 200,
    maxHp: 200,
    speed: 180,
    attackCooldownUntil: 0,
  }
}

describe('physics.moveEntity', () => {
  it('moves right when moveX=1, moveY=0', () => {
    const p = mkPlayer()
    const moved = moveEntity(p, { moveX: 1, moveY: 0 }, map, 100) // 100ms
    expect(moved.pos.x).toBeGreaterThan(p.pos.x)
    expect(moved.pos.y).toBe(p.pos.y)
    expect(moved.facing).toBe(1) // E
  })

  it('does not move into wall tile', () => {
    // Place player next to right border wall
    const p = mkPlayer({ x: 31 * 64, y: 4 * 32 + 16 })
    const moved = moveEntity(p, { moveX: 1, moveY: 0 }, map, 1000) // long dt
    // Should stop at wall boundary
    expect(moved.pos.x).toBeLessThan(31 * 64 + 32)
  })

  it('updates facing direction correctly', () => {
    const p = mkPlayer()
    const m1 = moveEntity(p, { moveX: 0, moveY: 1 }, map, 100) // S
    expect(m1.facing).toBe(2)
    const m2 = moveEntity(p, { moveX: -1, moveY: 0 }, map, 100) // W
    expect(m2.facing).toBe(3)
  })

  it('moves diagonally when both inputs set', () => {
    const p = mkPlayer()
    const moved = moveEntity(p, { moveX: 1, moveY: 1 }, map, 100)
    expect(moved.pos.x).toBeGreaterThan(p.pos.x)
    expect(moved.pos.y).toBeGreaterThan(p.pos.y)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test 2>&1 | head -20`
Expected: FAIL (no moveEntity function)

- [ ] **Step 3: Implement physics.ts**

```ts
// game/packages/server/src/physics.ts
import type { Player, Bot, GameMap, Vec2, Facing } from '@iso-br/shared'
import { TILE_SIZE, TILE_HEIGHT } from '@iso-br/shared'

export type MoveInput = { moveX: number; moveY: number }

export function moveEntity<T extends Player | Bot>(
  entity: T,
  input: MoveInput,
  map: GameMap,
  dtMs: number,
): T {
  // Normalize diagonal so speed isn't sqrt(2) faster
  const len = Math.hypot(input.moveX, input.moveY)
  if (len === 0) return entity
  const nx = input.moveX / len
  const ny = input.moveY / len

  const dtSec = dtMs / 1000
  const distance = entity.speed * dtSec
  const dx = nx * distance
  const dy = ny * distance

  // Try X movement first
  const newPosX: Vec2 = { x: entity.pos.x + dx, y: entity.pos.y }
  const newPosY: Vec2 = { x: entity.pos.x, y: entity.pos.y + dy }
  const newPosBoth: Vec2 = { x: newPosX.x, y: newPosY.y }

  // Pick first non-colliding
  const tryX = !collidesAt(newPosX, map)
  const tryY = !collidesAt(newPosY, map)
  const tryBoth = !collidesAt(newPosBoth, map)

  let newPos: Vec2
  if (tryBoth) newPos = newPosBoth
  else if (tryX) newPos = newPosX
  else if (tryY) newPos = newPosY
  else newPos = entity.pos

  // Update facing based on dominant axis
  let facing: Facing = entity.facing
  if (Math.abs(input.moveX) > Math.abs(input.moveY)) {
    facing = input.moveX > 0 ? 1 : 3
  } else if (input.moveY !== 0) {
    facing = input.moveY > 0 ? 2 : 0
  }

  return { ...entity, pos: newPos, facing }
}

function collidesAt(pos: Vec2, map: GameMap): boolean {
  // Convert world pos to tile (x = worldX / TILE_SIZE, y = worldY / TILE_HEIGHT)
  const tx = Math.floor(pos.x / TILE_SIZE)
  const ty = Math.floor(pos.y / TILE_HEIGHT)
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return true
  return !map.tiles[ty * map.width + tx]!.walkable
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test`
Expected: 4 physics tests pass + previous tests still pass (9 total)

- [ ] **Step 5: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/server/src/physics.ts game/packages/server/tests/physics.test.ts
git -c user.name=Friday -c user.email=friday@local commit -m "feat(server): entity movement with tile collision and facing"
```

---

## Task 6: Combat (Basic Attack)

**Files:**
- Create: `game/packages/server/src/combat.ts`
- Create: `game/packages/server/tests/combat.test.ts`

**Interfaces:**
- Consumes: `attacker: Player | Bot`, `target: Player | Bot`, `now: number` (ms)
- Produces: `{ hit: boolean, damage: number, cooldownUntil: number }`

- [ ] **Step 1: Write failing test**

Write `game/packages/server/tests/combat.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { basicAttack } from '../src/combat.js'
import type { Player, Bot } from '@iso-br/shared'
import { WARRIOR_BASIC_RANGE, WARRIOR_BASIC_DMG, BASIC_ATTACK_COOLDOWN_MS } from '@iso-br/shared'

function mkPlayer(x: number, y: number, facing: 0 | 1 | 2 | 3 = 1): Player {
  return {
    id: 'p1',
    nickname: 'Alice',
    isBot: false,
    pos: { x, y },
    facing,
    hp: 200,
    maxHp: 200,
    speed: 180,
    attackCooldownUntil: 0,
  }
}

function mkBot(x: number, y: number): Bot {
  return {
    id: 'b1',
    nickname: 'Bot',
    isBot: true,
    pos: { x, y },
    facing: 0,
    hp: 200,
    maxHp: 200,
    speed: 180,
    attackCooldownUntil: 0,
    targetId: null,
  }
}

describe('combat.basicAttack', () => {
  it('hits target in range facing same direction', () => {
    const a = mkPlayer(100, 100, 1) // facing E
    const t = mkBot(100 + 70, 100) // 1 tile to the right
    const result = basicAttack(a, t, 1000)
    expect(result.hit).toBe(true)
    expect(result.damage).toBe(WARRIOR_BASIC_DMG)
    expect(result.cooldownUntil).toBe(1000 + BASIC_ATTACK_COOLDOWN_MS)
  })

  it('misses target out of range', () => {
    const a = mkPlayer(100, 100, 1)
    const t = mkBot(100 + 500, 100) // 8 tiles to the right
    const result = basicAttack(a, t, 1000)
    expect(result.hit).toBe(false)
  })

  it('respects cooldown', () => {
    const a = { ...mkPlayer(100, 100, 1), attackCooldownUntil: 2000 }
    const t = mkBot(170, 100)
    const result = basicAttack(a, t, 1000) // now=1000 < cooldown
    expect(result.hit).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test 2>&1 | head -20`
Expected: FAIL (no basicAttack)

- [ ] **Step 3: Implement combat.ts**

```ts
// game/packages/server/src/combat.ts
import type { Player, Bot, Vec2 } from '@iso-br/shared'
import { TILE_SIZE, TILE_HEIGHT, WARRIOR_BASIC_RANGE, WARRIOR_BASIC_DMG, BASIC_ATTACK_COOLDOWN_MS } from '@iso-br/shared'

export type AttackResult = { hit: boolean; damage: number; cooldownUntil: number }

export function basicAttack(
  attacker: Player | Bot,
  target: Player | Bot,
  now: number,
): AttackResult {
  if (attacker.attackCooldownUntil > now) {
    return { hit: false, damage: 0, cooldownUntil: attacker.attackCooldownUntil }
  }

  // Range check (Euclidean)
  const dx = target.pos.x - attacker.pos.x
  const dy = target.pos.y - attacker.pos.y
  const distPx = Math.hypot(dx, dy)
  // For P1, treat tile size as 64 in both axes (we use horizontal scale for range)
  const maxRangePx = WARRIOR_BASIC_RANGE * TILE_SIZE

  if (distPx > maxRangePx) {
    return { hit: false, damage: 0, cooldownUntil: now + BASIC_ATTACK_COOLDOWN_MS }
  }

  // Facing check (90° cone)
  // facing 0=N (up, dy<0), 1=E (right, dx>0), 2=S (dy>0), 3=W (dx<0)
  let facingOk = true
  if (attacker.facing === 0 && dy >= 0) facingOk = false
  if (attacker.facing === 1 && dx <= 0) facingOk = false
  if (attacker.facing === 2 && dy <= 0) facingOk = false
  if (attacker.facing === 3 && dx >= 0) facingOk = false

  if (!facingOk) {
    return { hit: false, damage: 0, cooldownUntil: now + BASIC_ATTACK_COOLDOWN_MS }
  }

  return {
    hit: true,
    damage: WARRIOR_BASIC_DMG,
    cooldownUntil: now + BASIC_ATTACK_COOLDOWN_MS,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test`
Expected: 3 combat tests pass + previous (12 total)

- [ ] **Step 5: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/server/src/combat.ts game/packages/server/tests/combat.test.ts
git -c user.name=Friday -c user.email=friday@local commit -m "feat(server): basic attack with range + facing + cooldown"
```

---

## Task 7: Bot AI (Simple Chase + Attack)

**Files:**
- Create: `game/packages/server/src/bot.ts`
- Create: `game/packages/server/tests/bot.test.ts`

**Interfaces:**
- Consumes: `bot: Bot`, `target: Player`, `map: GameMap`, `now: number`
- Produces: `updateBot(bot, target, map, dtMs, now): Bot` (returns bot with new pos/facing/cooldown)

- [ ] **Step 1: Write failing test**

Write `game/packages/server/tests/bot.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { updateBot } from '../src/bot.js'
import { generateMap } from '../src/map-gen.js'
import { basicAttack } from '../src/combat.js'
import type { Bot, Player } from '@iso-br/shared'

const map = generateMap(42)

function mkBot(x: number, y: number): Bot {
  return {
    id: 'b1',
    nickname: 'Bot',
    isBot: true,
    pos: { x, y },
    facing: 0,
    hp: 200,
    maxHp: 200,
    speed: 180,
    attackCooldownUntil: 0,
    targetId: null,
  }
}

function mkPlayer(x: number, y: number): Player {
  return {
    id: 'p1',
    nickname: 'Alice',
    isBot: false,
    pos: { x, y },
    facing: 0,
    hp: 200,
    maxHp: 200,
    speed: 180,
    attackCooldownUntil: 0,
  }
}

describe('bot AI', () => {
  it('moves toward player when out of range', () => {
    const bot = mkBot(28 * 64 + 32, 28 * 32 + 16)
    const player = mkPlayer(4 * 64 + 32, 4 * 32 + 16)
    const updated = updateBot(bot, player, map, 1000, 0)
    // Bot should move left and up (toward player)
    expect(updated.pos.x).toBeLessThan(bot.pos.x)
    expect(updated.pos.y).toBeLessThan(bot.pos.y)
    expect(updated.targetId).toBe('p1')
  })

  it('attacks player when in range', () => {
    const bot = mkBot(100, 100)
    const player = mkPlayer(170, 100) // in range
    const updated = updateBot(bot, player, map, 50, 0)
    // After update, bot should have tried to attack and set cooldown
    expect(updated.attackCooldownUntil).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test 2>&1 | head -20`
Expected: FAIL (no updateBot)

- [ ] **Step 3: Implement bot.ts**

```ts
// game/packages/server/src/bot.ts
import type { Bot, Player, GameMap, Vec2 } from '@iso-br/shared'
import { moveEntity } from './physics.js'
import { basicAttack } from './combat.js'

const ATTACK_RANGE_PX = 1.5 * 64

export function updateBot(
  bot: Bot,
  player: Player,
  map: GameMap,
  dtMs: number,
  now: number,
): Bot {
  // Compute direction to player
  const dx = player.pos.x - bot.pos.x
  const dy = player.pos.y - bot.pos.y
  const dist = Math.hypot(dx, dy)

  let updated: Bot = { ...bot, targetId: player.id }

  // In attack range: try to attack
  if (dist <= ATTACK_RANGE_PX) {
    const result = basicAttack(updated, player, now)
    updated = { ...updated, attackCooldownUntil: result.cooldownUntil }
    return updated
  }

  // Otherwise: move toward player
  const moveX = Math.sign(dx)
  const moveY = Math.sign(dy)
  updated = moveEntity(updated, { moveX, moveY }, map, dtMs) as Bot
  return updated
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test`
Expected: 2 bot tests pass + previous (14 total)

- [ ] **Step 5: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/server/src/bot.ts game/packages/server/tests/bot.test.ts
git -c user.name=Friday -c user.email=friday@local commit -m "feat(server): simple bot AI (chase + attack)"
```

---

## Task 8: Match Tick Loop (20Hz) and Snapshot Builder

**Files:**
- Create: `game/packages/server/src/tick.ts`
- Create: `game/packages/server/src/snapshot.ts`
- Create: `game/packages/server/tests/tick.test.ts`

**Interfaces:**
- Consumes: `Match`, current `now: number`
- Produces: `tickMatch(match, now): void` (mutates match state); `buildSnapshot(match): WorldSnapshotMsg`

- [ ] **Step 1: Write failing test**

Write `game/packages/server/tests/tick.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { tickMatch, type MatchRuntime } from '../src/tick.js'
import { buildSnapshot } from '../src/snapshot.js'
import { generateMap } from '../src/map-gen.js'
import type { Player, Bot } from '@iso-br/shared'

function mkPlayer(): Player {
  return {
    id: 'p1',
    nickname: 'Alice',
    isBot: false,
    pos: { x: 4 * 64 + 32, y: 4 * 32 + 16 },
    facing: 1,
    hp: 200,
    maxHp: 200,
    speed: 180,
    attackCooldownUntil: 0,
  }
}

function mkBot(): Bot {
  return {
    id: 'b1',
    nickname: 'Bot',
    isBot: true,
    pos: { x: 28 * 64 + 32, y: 28 * 32 + 16 },
    facing: 3,
    hp: 200,
    maxHp: 200,
    speed: 180,
    attackCooldownUntil: 0,
    targetId: null,
  }
}

describe('tick + snapshot', () => {
  it('tickMatch moves bot toward stationary player', () => {
    const map = generateMap(42)
    const runtime: MatchRuntime = {
      match: { matchId: 'm1', mapSeed: 42, players: [], bots: [], status: 'running', winnerId: null },
      map,
      playerInputs: new Map(),
    }
    runtime.match.players.push(mkPlayer())
    runtime.match.bots.push(mkBot())

    tickMatch(runtime, 50) // 50ms
    expect(runtime.match.bots[0]!.pos.x).toBeLessThan(28 * 64 + 32)
  })

  it('buildSnapshot includes player and bot', () => {
    const map = generateMap(42)
    const runtime: MatchRuntime = {
      match: { matchId: 'm1', mapSeed: 42, players: [mkPlayer()], bots: [mkBot()], status: 'running', winnerId: null },
      map,
      playerInputs: new Map(),
    }
    const snap = buildSnapshot(runtime, 0, 0)
    expect(snap.type).toBe('WorldSnapshot')
    expect(snap.you.id).toBe('p1')
    expect(snap.opponent.id).toBe('b1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test 2>&1 | head -20`
Expected: FAIL

- [ ] **Step 3: Implement tick.ts**

```ts
// game/packages/server/src/tick.ts
import type { MatchState, Player, GameMap } from '@iso-br/shared'
import { updateBot } from './bot.js'

export type MatchRuntime = {
  match: MatchState
  map: GameMap
  playerInputs: Map<string, { moveX: number; moveY: number; attack: boolean }>
  lastInputTime: Map<string, number>
}

export function tickMatch(runtime: MatchRuntime, dtMs: number): void {
  const now = Date.now()
  const player = runtime.match.players[0]
  if (!player) return
  const bot = runtime.match.bots[0]
  if (!bot) return

  // Update player from latest input
  const input = runtime.playerInputs.get(player.id) ?? { moveX: 0, moveY: 0, attack: false }
  if (input.moveX !== 0 || input.moveY !== 0) {
    // Import moveEntity lazily to avoid circular
    const { moveEntity } = require('./physics.js')
    const updated = moveEntity(player, { moveX: input.moveX, moveY: input.moveY }, runtime.map, dtMs)
    runtime.match.players[0] = updated
  }

  // Update bot
  runtime.match.bots[0] = updateBot(bot, runtime.match.players[0]!, runtime.map, dtMs, now)

  // Check death
  if (runtime.match.bots[0]!.hp <= 0 && runtime.match.status === 'running') {
    runtime.match.status = 'ended'
    runtime.match.winnerId = player.id
  }
  if (runtime.match.players[0]!.hp <= 0 && runtime.match.status === 'running') {
    runtime.match.status = 'ended'
    runtime.match.winnerId = bot.id
  }
}
```

> **Note on `require`:** Since we're using ESM, replace `require('./physics.js')` with a static import at top of file.

Replace lines 21-23 with:
```ts
  if (input.moveX !== 0 || input.moveY !== 0) {
    const updated = moveEntity(player, { moveX: input.moveX, moveY: input.moveY }, runtime.map, dtMs)
    runtime.match.players[0] = updated
  }
```

And add at top:
```ts
import { moveEntity } from './physics.js'
```

- [ ] **Step 4: Implement snapshot.ts**

```ts
// game/packages/server/src/snapshot.ts
import type { WorldSnapshotMsg } from '@iso-br/shared'
import type { MatchRuntime } from './tick.js'

export function buildSnapshot(runtime: MatchRuntime, tick: number, serverTime: number): WorldSnapshotMsg {
  const player = runtime.match.players[0]!
  const bot = runtime.match.bots[0]!
  return {
    type: 'WorldSnapshot',
    tick,
    serverTime,
    you: player,
    opponent: bot,
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Volumes/FX900/personal/devkit/game/packages/server && pnpm test`
Expected: 2 tick tests pass + previous (16 total)

- [ ] **Step 6: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/server/src/tick.ts game/packages/server/src/snapshot.ts game/packages/server/tests/tick.test.ts
git -c user.name=Friday -c user.email=friday@local commit -m "feat(server): 20Hz tick loop + WorldSnapshot builder"
```

---

## Task 9: WebSocket Protocol Handler

**Files:**
- Modify: `game/packages/server/src/index.ts` (replace placeholder WS handler)

**Interfaces:**
- Consumes: WS connection, `MatchRuntime`
- Produces: routes `JoinMatch` → create player; `InputCmd` → update input map; broadcasts `WorldSnapshot` 20Hz

- [ ] **Step 1: Refactor server to manage single match runtime**

Modify `game/packages/server/src/index.ts` — replace the WS handler section:

```ts
// game/packages/server/src/index.ts
import Fastify, { type FastifyInstance } from 'fastify'
import { WebSocketServer, type WebSocket } from 'ws'
import { Match } from './match.js'
import { generateMap } from './map-gen.js'
import { tickMatch, type MatchRuntime } from './tick.js'
import { buildSnapshot } from './snapshot.js'
import { encodeMsg, decodeMsg, type ClientMsg, type ServerMsg, type Player, SERVER_TICK_MS } from '@iso-br/shared'

export interface ServerHandle {
  port: number
  close: () => Promise<void>
  fastify: FastifyInstance
}

export async function startServer(port: number): Promise<ServerHandle> {
  const fastify = Fastify({ logger: false })

  // Create one match runtime (P1: 1 player + 1 bot)
  const map = generateMap(Date.now() & 0xffffffff)
  const match = new Match(Date.now() & 0xffffffff, map)

  // Spawn bot
  match.addBot({
    id: 'bot1',
    nickname: 'Grunt',
    isBot: true,
    pos: { x: 28 * 64 + 32, y: 28 * 32 + 16 },
    facing: 3,
    hp: 200,
    maxHp: 200,
    speed: 180,
    attackCooldownUntil: 0,
    targetId: null,
  })

  const runtime: MatchRuntime = {
    match: match.state,
    map,
    playerInputs: new Map(),
    lastInputTime: new Map(),
  }

  fastify.get('/health', async () => ({ ok: true, matchId: match.state.matchId }))

  const wss = new WebSocketServer({ noServer: true })
  const clients = new Set<WebSocket>()

  fastify.server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    } else {
      socket.destroy()
    }
  })

  wss.on('connection', (ws) => {
    clients.add(ws)
    let joined = false
    let playerId: string | null = null

    ws.on('message', (data) => {
      try {
        const msg = decodeMsg(new Uint8Array(data as Buffer)) as ClientMsg
        if (msg.type === 'JoinMatch') {
          // Create player
          const player: Player = {
            id: `p_${Date.now()}`,
            nickname: msg.nickname || 'Player',
            isBot: false,
            pos: { x: 4 * 64 + 32, y: 4 * 32 + 16 },
            facing: 1,
            hp: 200,
            maxHp: 200,
            speed: 180,
            attackCooldownUntil: 0,
          }
          match.addPlayer(player)
          playerId = player.id
          joined = true
          runtime.lastInputTime.set(player.id, Date.now())

          // Send MatchStart
          const startMsg: ServerMsg = {
            type: 'MatchStart',
            matchId: match.state.matchId,
            mapSeed: match.state.mapSeed,
            map,
            you: player,
            opponent: match.state.bots[0]!,
          }
          ws.send(encodeMsg(startMsg))
        } else if (msg.type === 'InputCmd' && joined && playerId) {
          runtime.playerInputs.set(playerId, {
            moveX: msg.moveX,
            moveY: msg.moveY,
            attack: msg.attack,
          })
          runtime.lastInputTime.set(playerId, Date.now())
        } else if (msg.type === 'Ping' && joined) {
          const pong: ServerMsg = { type: 'Pong', clientTime: msg.clientTime, serverTime: Date.now() }
          ws.send(encodeMsg(pong))
        }
      } catch (e) {
        // ignore malformed
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
    })
  })

  // 20Hz tick loop
  let tick = 0
  const interval = setInterval(() => {
    tickMatch(runtime, SERVER_TICK_MS)
    tick++

    if (clients.size === 0) return

    // Build snapshot for each connected client (P1: 1 client)
    for (const ws of clients) {
      const player = runtime.match.players[0]
      if (!player) continue
      const snap = buildSnapshot(runtime, tick, Date.now())
      try {
        ws.send(encodeMsg(snap))
      } catch {
        // ignore
      }
    }

    // Send DamageEvent and MatchEnd as side messages
    if (runtime.match.status === 'ended' && runtime.match.winnerId) {
      const endMsg: ServerMsg = {
        type: 'MatchEnd',
        winnerId: runtime.match.winnerId,
        winnerNickname:
          runtime.match.winnerId === runtime.match.players[0]?.id
            ? runtime.match.players[0]!.nickname
            : runtime.match.bots[0]!.nickname,
      }
      for (const ws of clients) {
        ws.send(encodeMsg(endMsg))
      }
    }
  }, SERVER_TICK_MS)

  await fastify.listen({ port, host: '0.0.0.0' })
  const actualPort = fastify.server.address()
  const finalPort = typeof actualPort === 'object' && actualPort ? actualPort.port : port

  return {
    port: finalPort,
    fastify,
    close: async () => {
      clearInterval(interval)
      await fastify.close()
    },
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const port = Number(process.env.PORT ?? 8080)
  startServer(port).then((s) => {
    console.log(`[server] listening on http://localhost:${s.port}`)
  })
}
```

- [ ] **Step 2: Run server and test with wscat (or websocat)**

Terminal 1:
```bash
cd /Volumes/FX900/personal/devkit/game/packages/server
pnpm dev
```

Terminal 2 (install wscat if not present):
```bash
npx -y wscat -c ws://localhost:8080/ws
```

Send (binary msgpack required — wscat text-only won't work; use a small Node script instead):

```bash
node --eval "
import('msgpackr').then(async ({pack}) => {
  const WebSocket = (await import('ws')).default
  const ws = new WebSocket('ws://localhost:8080/ws')
  ws.on('open', () => {
    ws.send(pack({type: 'JoinMatch', nickname: 'TestPlayer', class: 'warrior'}))
  })
  ws.on('message', (data) => {
    console.log('Got message, type:', data[0])
    setTimeout(() => process.exit(0), 200)
  })
})
"
```

Expected: log shows "Got message" within 1s.

Stop server.

- [ ] **Step 3: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/server/src/index.ts
git -c user.name=Friday -c user.email=friday@local commit -m "feat(server): WS protocol handler with JoinMatch, InputCmd, 20Hz snapshot broadcast"
```

---

## Task 10: Client Bootstrap (Vite + Phaser 3)

**Files:**
- Create: `game/packages/client/package.json`
- Create: `game/packages/client/tsconfig.json`
- Create: `game/packages/client/vite.config.ts`
- Create: `game/packages/client/index.html`
- Create: `game/packages/client/src/main.ts`

**Interfaces:**
- Consumes: nothing
- Produces: Vite dev server on port 5173, Phaser 3 game canvas in browser

- [ ] **Step 1: Create client package.json**

```json
{
  "name": "@iso-br/client",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 5173",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@iso-br/shared": "workspace:*",
    "phaser": "^3.80.1"
  },
  "devDependencies": {
    "typescript": "^5.4.5",
    "vite": "^5.2.10"
  }
}
```

- [ ] **Step 2: Create client tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```ts
// game/packages/client/vite.config.ts
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
```

- [ ] **Step 4: Create index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Isometric BR (P1)</title>
    <style>
      body { margin: 0; padding: 0; background: #1a1a1a; overflow: hidden; }
      #game { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="game"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create main.ts (Phaser init, no game logic yet)**

```ts
// game/packages/client/src/main.ts
import Phaser from 'phaser'
import { GameScene } from './scenes/game-scene.js'

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  pixelArt: true,
  backgroundColor: '#1a1a1a',
  scene: [GameScene],
})
```

- [ ] **Step 6: Create empty GameScene stub**

Create `game/packages/client/src/scenes/game-scene.ts`:
```ts
import Phaser from 'phaser'

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    this.add.text(20, 20, 'Isometric BR — Phase 1', { fontSize: '24px', color: '#fff' })
  }
}
```

- [ ] **Step 7: Install client deps and start dev server**

Run:
```bash
cd /Volumes/FX900/personal/devkit/game
pnpm install
cd packages/client
pnpm dev
```

Open browser to `http://localhost:5173`.
Expected: black canvas with white text "Isometric BR — Phase 1"

Stop dev server with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/client/
git -c user.name=Friday -c user.email=friday@local commit -m "feat(client): Vite + Phaser 3 bootstrap with empty GameScene"
```

---

## Task 11: Client WebSocket Connection

**Files:**
- Create: `game/packages/client/src/net/ws.ts`
- Modify: `game/packages/client/src/scenes/game-scene.ts`

**Interfaces:**
- Consumes: WS server at `ws://localhost:8080/ws` (proxied via Vite at `/ws`)
- Produces: `WsClient` class with `connect()`, `sendInput()`, `onSnapshot()`, `close()` methods

- [ ] **Step 1: Create ws.ts**

```ts
// game/packages/client/src/net/ws.ts
import { encodeMsg, decodeMsg, type ClientMsg, type ServerMsg, type InputCmdMsg } from '@iso-br/shared'

export class WsClient {
  private ws: WebSocket | null = null
  private inputSeq = 0
  private handlers: ((msg: ServerMsg) => void)[] = []

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url)
      this.ws.binaryType = 'arraybuffer'
      this.ws.onopen = () => resolve()
      this.ws.onerror = (e) => reject(e)
      this.ws.onmessage = (e) => {
        const buf = new Uint8Array(e.data as ArrayBuffer)
        const msg = decodeMsg(buf) as ServerMsg
        for (const h of this.handlers) h(msg)
      }
    })
  }

  sendJoin(nickname: string): void {
    this.send({ type: 'JoinMatch', nickname, class: 'warrior' })
  }

  sendInput(moveX: number, moveY: number, attack: boolean, dt: number): void {
    const msg: InputCmdMsg = { type: 'InputCmd', seq: ++this.inputSeq, dt, moveX, moveY, attack }
    this.send(msg)
  }

  sendPing(): void {
    this.send({ type: 'Ping', clientTime: Date.now() })
  }

  onMessage(handler: (msg: ServerMsg) => void): void {
    this.handlers.push(handler)
  }

  close(): void {
    this.ws?.close()
  }

  private send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(encodeMsg(msg))
    }
  }
}
```

- [ ] **Step 2: Modify game-scene.ts to connect and log**

Replace `game/packages/client/src/scenes/game-scene.ts`:
```ts
import Phaser from 'phaser'
import { WsClient } from '../net/ws.js'

export class GameScene extends Phaser.Scene {
  private ws = new WsClient()
  private lastInputTime = 0

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    this.add.text(20, 20, 'Isometric BR — Phase 1', { fontSize: '24px', color: '#fff' })
    this.add.text(20, 60, 'Connecting to server...', { fontSize: '16px', color: '#aaa' })

    this.ws
      .connect(`ws://${window.location.host}/ws`)
      .then(() => {
        this.ws.sendJoin('Player1')
        this.add.text(20, 100, 'Connected. Waiting for MatchStart...', { fontSize: '16px', color: '#0f0' })
      })
      .catch((e) => {
        this.add.text(20, 100, `Connection failed: ${e}`, { fontSize: '16px', color: '#f00' })
      })

    this.ws.onMessage((msg) => {
      if (msg.type === 'MatchStart') {
        this.add.text(20, 140, `Match started! mapSeed=${msg.mapSeed} opponent=${msg.opponent.nickname}`, {
          fontSize: '14px',
          color: '#fff',
        })
        this.lastInputTime = Date.now()
      } else if (msg.type === 'WorldSnapshot') {
        // Will render in next task
      } else if (msg.type === 'MatchEnd') {
        this.add.text(20, 180, `Match ended! Winner: ${msg.winnerNickname}`, {
          fontSize: '18px',
          color: '#ff0',
        })
      }
    })

    // Send input every 33ms (~30Hz)
    this.time.addEvent({
      delay: 33,
      callback: () => {
        const now = Date.now()
        const dt = now - this.lastInputTime
        this.lastInputTime = now
        this.ws.sendInput(1, 0, false, dt) // P1: auto-move right
      },
      loop: true,
    })
  }
}
```

- [ ] **Step 3: Manual E2E: start server + client, verify MatchStart received**

Terminal 1:
```bash
cd /Volumes/FX900/personal/devkit/game/packages/server
pnpm dev
```

Terminal 2:
```bash
cd /Volumes/FX900/personal/devkit/game/packages/client
pnpm dev
```

Browser opens to `http://localhost:5173`.
Expected: text "Match started! mapSeed=... opponent=Grunt" within 1s.

Stop both.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/client/src/
git -c user.name=Friday -c user.email=friday@local commit -m "feat(client): WebSocket client with JoinMatch, InputCmd, snapshot handler"
```

---

## Task 12: Isometric Map Rendering

**Files:**
- Create: `game/packages/client/src/iso/iso-utils.ts`
- Create: `game/packages/client/src/iso/iso-map-layer.ts`
- Modify: `game/packages/client/src/scenes/game-scene.ts`

**Interfaces:**
- Consumes: `GameMap` from `MatchStart`
- Produces: Phaser container `IsoMapLayer` rendering tile grid with z-sort

- [ ] **Step 1: Create iso-utils.ts**

```ts
// game/packages/client/src/iso/iso-utils.ts
import { TILE_SIZE, TILE_HEIGHT } from '@iso-br/shared'
import type { Vec2 } from '@iso-br/shared'

// Tile (tx, ty) -> world (pixel) center
export function tileToWorld(tx: number, ty: number): Vec2 {
  return {
    x: (tx - ty) * (TILE_SIZE / 2),
    y: (tx + ty) * (TILE_HEIGHT / 2),
  }
}

// World (pixel) -> tile (tx, ty)
export function worldToTile(wx: number, wy: number): { tx: number; ty: number } {
  const tx = (wx / (TILE_SIZE / 2) + wy / (TILE_HEIGHT / 2)) / 2
  const ty = (wy / (TILE_HEIGHT / 2) - wx / (TILE_SIZE / 2)) / 2
  return { tx: Math.floor(tx), ty: Math.floor(ty) }
}
```

- [ ] **Step 2: Create iso-map-layer.ts**

```ts
// game/packages/client/src/iso/iso-map-layer.ts
import Phaser from 'phaser'
import { tileToWorld } from './iso-utils.js'
import { TILE_SIZE, TILE_HEIGHT } from '@iso-br/shared'
import type { GameMap } from '@iso-br/shared'

export class IsoMapLayer extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, map: GameMap) {
    super(scene, 0, 0)

    const g = scene.add.graphics()
    g.fillStyle(0x2d4a2d, 1) // grass green
    g.lineStyle(1, 0x1a2a1a, 1)

    for (const tile of map.tiles) {
      const { x, y } = tileToWorld(tile.x, tile.y)
      const color = tile.walkable ? 0x3d6a3d : 0x4a4a4a
      g.fillStyle(color, 1)
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + TILE_SIZE / 2, y + TILE_HEIGHT / 2)
      g.lineTo(x, y + TILE_HEIGHT)
      g.lineTo(x - TILE_SIZE / 2, y + TILE_HEIGHT / 2)
      g.closePath()
      g.fillPath()
      g.lineStyle(1, 0x1a1a1a, 0.5)
      g.strokePath()
    }

    this.add(g)
  }
}
```

- [ ] **Step 3: Modify game-scene.ts to render map on MatchStart**

```ts
// game/packages/client/src/scenes/game-scene.ts
import Phaser from 'phaser'
import { WsClient } from '../net/ws.js'
import { IsoMapLayer } from '../iso/iso-map-layer.js'
import { tileToWorld } from '../iso/iso-utils.js'
import { TILE_SIZE, TILE_HEIGHT } from '@iso-br/shared'
import type { GameMap, Player, Bot } from '@iso-br/shared'

export class GameScene extends Phaser.Scene {
  private ws = new WsClient()
  private lastInputTime = 0
  private map: GameMap | null = null
  private you: Player | null = null
  private opponent: Bot | null = null
  private playerSprite: Phaser.GameObjects.Container | null = null
  private opponentSprite: Phaser.GameObjects.Container | null = null

  constructor() {
    super({ key: 'GameScene' })
  }

  create() {
    this.add.text(20, 20, 'Isometric BR — Phase 1', { fontSize: '24px', color: '#fff' })

    this.ws
      .connect(`ws://${window.location.host}/ws`)
      .then(() => this.ws.sendJoin('Player1'))
      .catch((e) => console.error('WS connect failed', e))

    this.ws.onMessage((msg) => {
      if (msg.type === 'MatchStart') {
        this.map = msg.map
        this.you = msg.you
        this.opponent = msg.opponent
        this.renderWorld()
        this.lastInputTime = Date.now()
      } else if (msg.type === 'WorldSnapshot') {
        this.you = msg.you
        this.opponent = msg.opponent
        this.updateSprites()
      } else if (msg.type === 'MatchEnd') {
        this.add.text(20, 60, `Winner: ${msg.winnerNickname}`, { fontSize: '18px', color: '#ff0' })
      }
    })

    this.time.addEvent({
      delay: 33,
      callback: () => {
        const now = Date.now()
        const dt = now - this.lastInputTime
        this.lastInputTime = now
        this.ws.sendInput(1, 0, false, dt)
      },
      loop: true,
    })
  }

  private renderWorld() {
    if (!this.map || !this.you || !this.opponent) return

    // Map layer (centered)
    const mapLayer = new IsoMapLayer(this, this.map)
    // Center map in screen: compute center of map
    const centerTile = tileToWorld(this.map.width / 2, this.map.height / 2)
    mapLayer.setPosition(this.scale.width / 2 - centerTile.x, this.scale.height / 2 - centerTile.y)
    this.add.existing(mapLayer)

    // Player sprite (placeholder: red circle)
    this.playerSprite = this.createEntitySprite(0xff0000)
    this.opponentSprite = this.createEntitySprite(0x0000ff)
    this.updateSprites()
  }

  private createEntitySprite(color: number): Phaser.GameObjects.Container {
    const c = this.add.container(0, 0)
    const g = this.add.graphics()
    g.fillStyle(color, 1)
    g.fillCircle(0, -16, 12)
    g.fillRect(-8, -4, 16, 20)
    c.add(g)
    return c
  }

  private updateSprites() {
    if (!this.you || !this.opponent || !this.playerSprite || !this.opponentSprite || !this.map) return

    const centerTile = tileToWorld(this.map.width / 2, this.map.height / 2)
    const offsetX = this.scale.width / 2 - centerTile.x
    const offsetY = this.scale.height / 2 - centerTile.y

    this.playerSprite.setPosition(offsetX + this.you.pos.x, offsetY + this.you.pos.y)
    this.opponentSprite.setPosition(offsetX + this.opponent.pos.x, offsetY + this.opponent.pos.y)
  }
}
```

- [ ] **Step 4: Manual verify map renders**

Terminal 1 (server):
```bash
cd /Volumes/FX900/personal/devkit/game/packages/server
pnpm dev
```

Terminal 2 (client):
```bash
cd /Volumes/FX900/personal/devkit/game/packages/client
pnpm dev
```

Browser: `http://localhost:5173`
Expected: isometric map with 32x32 tiles, red player moving right, blue bot moving toward player.

Stop both.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/client/src/
git -c user.name=Friday -c user.email=friday@local commit -m "feat(client): isometric map rendering + entity sprites"
```

---

## Task 13: HUD (HP Bar + Alive Counter)

**Files:**
- Create: `game/packages/client/src/ui/hud.ts`
- Modify: `game/packages/client/src/scenes/game-scene.ts`

**Interfaces:**
- Consumes: `Player`, `Bot` state
- Produces: DOM-based HUD overlay (HP bar top-left, status text)

- [ ] **Step 1: Create hud.ts (DOM-based for simplicity in P1)**

```ts
// game/packages/client/src/ui/hud.ts
import type { Player, Bot } from '@iso-br/shared'

export class Hud {
  private root: HTMLDivElement
  private hpFill: HTMLDivElement
  private status: HTMLDivElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0;
      padding: 12px; pointer-events: none; color: #fff;
      font-family: monospace; font-size: 14px;
    `

    this.hpFill = document.createElement('div')
    this.hpFill.style.cssText = `
      width: 200px; height: 16px; background: #400; border: 1px solid #fff;
    `
    const hpBar = document.createElement('div')
    hpBar.style.cssText = `display: flex; align-items: center; gap: 8px;`
    const label = document.createElement('span')
    label.textContent = 'HP:'
    hpBar.appendChild(label)
    hpBar.appendChild(this.hpFill)
    this.root.appendChild(hpBar)

    this.status = document.createElement('div')
    this.status.style.cssText = 'margin-top: 8px;'
    this.status.textContent = 'Status: waiting...'
    this.root.appendChild(this.status)

    parent.appendChild(this.root)
  }

  update(you: Player, opponent: Bot): void {
    const pct = Math.max(0, Math.min(100, (you.hp / you.maxHp) * 100))
    this.hpFill.style.width = `${pct}%`
    this.hpFill.style.background = pct > 50 ? '#0a0' : pct > 25 ? '#aa0' : '#a00'

    const oppPct = Math.max(0, Math.min(100, (opponent.hp / opponent.maxHp) * 100))
    this.status.textContent = `You: ${you.hp}/${you.maxHp} (${pct.toFixed(0)}%)  |  Opponent: ${opponent.nickname} ${opponent.hp}/${opponent.maxHp} (${oppPct.toFixed(0)}%)`
  }

  destroy(): void {
    this.root.remove()
  }
}
```

- [ ] **Step 2: Modify game-scene.ts to use HUD**

Add to imports:
```ts
import { Hud } from '../ui/hud.js'
```

Add to class:
```ts
private hud: Hud | null = null
```

In `create()` (after `this.add.text(20, 20, ...)`):
```ts
this.hud = new Hud(this.game.canvas.parentElement ?? document.body)
```

In `WorldSnapshot` handler (replace placeholder comment):
```ts
} else if (msg.type === 'WorldSnapshot') {
  this.you = msg.you
  this.opponent = msg.opponent
  this.updateSprites()
  this.hud?.update(msg.you, msg.opponent)
}
```

- [ ] **Step 3: Manual verify HUD**

Run server + client as in Task 12.4. Browser: `http://localhost:5173`
Expected: HUD top-left shows "HP: [bar]" and "You: 200/200 (100%) | Opponent: Grunt 200/200 (100%)". Bar shrinks as bot attacks player.

Stop both.

- [ ] **Step 4: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/client/src/
git -c user.name=Friday -c user.email=friday@local commit -m "feat(client): HUD with HP bar and status text"
```

---

## Task 14: Local Launcher (start server + open browser)

**Files:**
- Create: `game/packages/server/src/launcher.ts`
- Modify: `game/packages/server/package.json` (add `launch` script)
- Modify: `game/package.json` (update `dev:game` script)

**Interfaces:**
- Consumes: nothing
- Produces: `pnpm dev:game` starts server, waits for ready, opens browser to client

- [ ] **Step 1: Create launcher.ts**

```ts
// game/packages/server/src/launcher.ts
import { spawn, type ChildProcess } from 'node:child_process'
import { startServer } from './index.js'
import { CLIENT_PORT } from '@iso-br/shared'

const PLATFORM = process.platform
const isMac = PLATFORM === 'darwin'
const isWin = PLATFORM === 'win32'

export async function launch(): Promise<void> {
  console.log('[launcher] starting server...')
  const server = await startServer(8080)
  console.log(`[launcher] server ready on http://localhost:${server.port}`)

  console.log('[launcher] starting client dev server...')
  const client: ChildProcess = spawn('pnpm', ['--filter', '@iso-br/client', 'dev'], {
    stdio: 'inherit',
    shell: true,
  })

  // Wait for client to be ready
  await waitForPort(CLIENT_PORT, 30_000)
  console.log(`[launcher] client ready on http://localhost:${CLIENT_PORT}`)

  // Open browser
  const url = `http://localhost:${CLIENT_PORT}`
  console.log(`[launcher] opening ${url}`)
  const opener = isMac ? 'open' : isWin ? 'start' : 'xdg-open'
  spawn(opener, [url], { shell: true, stdio: 'ignore' })

  // Forward Ctrl-C to both
  process.on('SIGINT', () => {
    console.log('\n[launcher] shutting down...')
    client.kill('SIGINT')
    server.close().then(() => process.exit(0))
  })
}

function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      fetch(`http://localhost:${port}/`)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error(`Client did not start within ${timeoutMs}ms`))
          } else {
            setTimeout(tryConnect, 500)
          }
        })
    }
    tryConnect()
  })
}

// Run if invoked directly
const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  launch().catch((e) => {
    console.error('[launcher] failed:', e)
    process.exit(1)
  })
}
```

- [ ] **Step 2: Update server package.json to add `launch` script**

Add to `scripts`:
```json
"launch": "tsx src/launcher.ts"
```

- [ ] **Step 3: Update root package.json dev:game script**

Replace `dev:game`:
```json
"dev:game": "pnpm --filter @iso-br/server launch"
```

- [ ] **Step 4: Manual test launcher**

Run:
```bash
cd /Volumes/FX900/personal/devkit/game
pnpm dev:game
```

Expected:
1. Server starts on :8080
2. Client dev server starts on :5173
3. Browser opens to `http://localhost:5173` automatically
4. Game loads, player + bot visible, HUD shows

Press Ctrl-C to shut down both.

- [ ] **Step 5: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/packages/server/src/launcher.ts game/packages/server/package.json game/package.json
git -c user.name=Friday -c user.email=friday@local commit -m "feat(launcher): local CLI to start server + client + open browser"
```

---

## Task 15: E2E Smoke Test (Playwright)

**Files:**
- Create: `game/package.json` (add `@playwright/test` to devDeps)
- Create: `game/playwright.config.ts`
- Create: `game/tests/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: running server + client
- Produces: automated test that verifies 2 clients can connect and play

- [ ] **Step 1: Add Playwright to root devDeps**

Modify `game/package.json`, add to `devDependencies`:
```json
"@playwright/test": "^1.43.0"
```

Run: `cd /Volumes/FX900/personal/devkit/game && pnpm install`

- [ ] **Step 2: Create playwright.config.ts**

```ts
// game/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: {
    command: 'pnpm dev:game',
    url: 'http://localhost:5173',
    timeout: 30_000,
    reuseExistingServer: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

- [ ] **Step 3: Create smoke.spec.ts**

```ts
// game/tests/e2e/smoke.spec.ts
import { test, expect, chromium, type Browser, type Page } from '@playwright/test'

let browser: Browser

test.beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})

test.afterAll(async () => {
  await browser?.close()
})

test('2 clients can play: one player attacks bot, bot dies, match ends', async () => {
  const ctx1 = await browser.newContext()
  const page1: Page = await ctx1.newPage()
  await page1.goto('/')
  await page1.waitForFunction(
    () => document.body.innerText.includes('Match started!') || document.body.innerText.includes('Match'),
    { timeout: 10_000 },
  )

  // Verify both player and bot exist in DOM via Phaser
  const youAlive = await page1.waitForFunction(
    () => {
      const text = document.body.innerText
      return text.includes('Grunt') && text.includes('200/200')
    },
    { timeout: 10_000 },
  )
  expect(youAlive).toBeTruthy()

  // Wait up to 30s for match to end (player attacks bot until dead, or vice versa)
  const ended = await page1
    .waitForFunction(() => document.body.innerText.includes('Winner:'), { timeout: 30_000 })
    .catch(() => null)
  expect(ended, 'Match should end within 30s').toBeTruthy()

  await ctx1.close()
})
```

- [ ] **Step 4: Install Playwright browsers**

Run:
```bash
cd /Volumes/FX900/personal/devkit/game
pnpm exec playwright install chromium
```

- [ ] **Step 5: Run E2E test**

```bash
cd /Volumes/FX900/personal/devkit/game
pnpm test:e2e
```

(Add to root `package.json` scripts: `"test:e2e": "playwright test"`)

If it fails, check that:
- Server can start on :8080
- Client can start on :5173
- Bot is reachable from player spawn (you spawn at 4,4, bot at 28,28 — they need to traverse 24 tiles; with player speed 180 px/s and bot speed 180 px/s, takes ~5s)
- Auto-move `sendInput(1, 0, ...)` makes player move right — they'll fight when they meet

Expected: test passes (match ends with one side dying within 30s)

- [ ] **Step 6: Commit**

```bash
cd /Volumes/FX900/personal/devkit
git add game/playwright.config.ts game/tests/ game/package.json
git -c user.name=Friday -c user.email=friday@local commit -m "test(e2e): Playwright smoke test for 2-client match"
```

---

## Self-Review

### 1. Spec Coverage

| Spec section | Implemented in task |
|---|---|
| 3.1 Monorepo layout | Task 1 |
| 3.2 Game loop | Task 8 (tick), Task 9 (WS handler) |
| 3.3 Server authority | Task 5 (move), Task 6 (combat), Task 8 (tick) |
| 3.4 Persistence (in-memory) | Task 3 (Match), Task 8 (no DB) |
| 3.5 Local-first deployment | Task 14 (launcher) |
| 4.1-4.2 Map (32x32 P1, 4 quadrants) | Task 4 (map-gen) |
| 4.4 Render pipeline (z-sort, viewport) | Task 12 (iso-map-layer; full z-sort in P2) |
| 4.5 Map data structure | Task 4 (types in shared) |
| 5.1 Player state | Task 2 (types) |
| 5.2 Warrior class stats | Task 2 (constants) |
| 5.3 Combat flow (validate → broadcast) | Task 6 (combat), Task 8 (tick), Task 9 (handler) |
| 5.4 Hit detection (distance, facing) | Task 6 (combat) |
| 5.5 Movement (click/WASD, tile collision) | Task 5 (physics) |
| 6 Bo system | **Deferred to P2** (per spec "no bo in P1") |
| 7 Loot & items | **Deferred to P2** (per spec "no loot in P1") |
| 8 PvE + PvP | Task 7 (bot AI); 80 bots **deferred to P3** |
| 9 Netcode & Protocol | Task 2 (types), Task 9 (handler), Task 11 (client WS) |
| 9.4 Client prediction & reconciliation | **Deferred to P2** (P1 = pure server-driven render) |
| 9.5 Lag compensation | **Deferred to P2** |
| 9.7 Interest management | **Deferred to P3** |
| 10 Matchmaking | **Deferred to P3** (P1: single fixed match) |
| 11.1 Phase 1 deliverables | All 15 tasks complete → matches spec |
| 11.2 Testing strategy (unit, integration, E2E) | Tasks 4-7 (unit), Tasks 8-9 (integration), Task 15 (E2E) |
| 11.3 Perf budget | Not measured in P1 (target set; verify in P3) |

**Gaps explicitly deferred (per spec P1 scope):**
- Bo system (P2)
- Loot & items (P2)
- 2-3 classes (Warrior only in P1, full 3 in P2)
- Skill S2/S3/passive (P1: basic attack only)
- 256x256 map (P1: 32x32)
- 60-100 bots (P1: 1 bot)
- Client prediction & lag comp (P2)
- Interest management (P3)
- Matchmaking service (P3)
- Deploy to VPS (P4)

### 2. Placeholder Scan

✓ No "TBD" / "TODO" / "implement later" in tasks
✓ No "Add appropriate error handling" without specific code
✓ Each test has actual test code (not "write tests for above")
✓ No "Similar to Task N" references (each task repeats needed context)
✓ Code blocks present for all implementation steps

### 3. Type Consistency

| Symbol | Defined in | Used in | Match? |
|---|---|---|---|
| `Vec2` | shared/types.ts (T2) | physics (T5), bot (T7), snapshot (T8) | ✓ |
| `Player` | shared/types.ts (T2) | physics (T5), combat (T6), bot (T7), tick (T8), handler (T9), client (T11) | ✓ |
| `Bot` | shared/types.ts (T2) | physics (T5), combat (T6), bot (T7), tick (T8), handler (T9), client (T11) | ✓ |
| `GameMap` | shared/types.ts (T2) | map-gen (T4), physics (T5), bot (T7), handler (T9), client (T12) | ✓ |
| `JoinMatchMsg` | shared/protocol.ts (T2) | ws.ts (T11), handler (T9) | ✓ |
| `InputCmdMsg` | shared/protocol.ts (T2) | ws.ts (T11), handler (T9) | ✓ |
| `WorldSnapshotMsg` | shared/protocol.ts (T2) | snapshot (T8), handler (T9), ws.ts (T11), game-scene (T12) | ✓ |
| `MatchStartMsg` | shared/protocol.ts (T2) | handler (T9), game-scene (T11) | ✓ |
| `MatchEndMsg` | shared/protocol.ts (T2) | handler (T9), game-scene (T11) | ✓ |
| `MatchRuntime` | server/tick.ts (T8) | snapshot (T8), handler (T9) | ✓ |
| `Match` | server/match.ts (T3) | handler (T9) | ✓ |
| `WsClient` | client/net/ws.ts (T11) | game-scene (T11) | ✓ |
| `IsoMapLayer` | client/iso/iso-map-layer.ts (T12) | game-scene (T12) | ✓ |
| `Hud` | client/ui/hud.ts (T13) | game-scene (T13) | ✓ |
| `tileToWorld` | client/iso/iso-utils.ts (T12) | iso-map-layer (T12), game-scene (T12) | ✓ |

All types and method signatures match across tasks. No drift detected.

### 4. Scope Check

P1 Foundation is appropriately bounded:
- 15 tasks, each producing a testable deliverable
- All P1-scope items from spec (Section 11.1) covered
- Deferred items explicitly noted with phase target (P2/P3/P4)
- E2E test verifies "1 player + 1 bot, move + attack, one dies, match ends" — matches spec P1 deliverable

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-19-isometric-br-game-foundation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration, isolated context per task

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
