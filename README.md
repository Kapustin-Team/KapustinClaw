# 🧪 KapustinClaw

**AI Agent Benchmark & Simulation Platform**

Fork of [NanoClaw](https://github.com/qwibitai/nanoclaw) reimagined as a benchmark platform for evaluating AI agents in simulated business environments.

## What it does

KapustinClaw runs AI agents through realistic business simulations — managing a coffee shop, running a vending machine, handling inventory and pricing — and scores their performance over simulated time periods (days, months, years).

```
┌──────────────────────────────────────────────────────────┐
│                    KapustinClaw                          │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Scenarios   │  │  Simulation  │  │    Agent       │  │
│  │  (JSON)      │──│  Engine      │──│  (Claude/GPT)  │  │
│  │              │  │  - Events    │  │  - Tool calls  │  │
│  │  vending.json│  │  - Time      │  │  - Decisions   │  │
│  │  coffee.json │  │  - Scoring   │  │  - Memory      │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│                           │                              │
│              ┌────────────┴────────────┐                │
│              │                         │                │
│       ┌──────┴──────┐          ┌──────┴──────┐         │
│       │   Memory    │          │   Logging   │         │
│       │  SQLite+FTS5│          │  Structured │         │
│       │  Fuzzy srch │          │  JSON/CSV   │         │
│       └─────────────┘          └─────────────┘         │
└──────────────────────────────────────────────────────────┘
```

## Features

- **Simulation Engine** — Virtual time, events (scheduled/random/conditional), world state management
- **Memory Layer** — SQLite + FTS5 full-text search, knowledge base, decision logging
- **Fuzzy Search** — BM25 ranking across agent memory, logs, and knowledge
- **Scenario DSL** — JSON scenarios with events, scoring rules, and tool configs
- **Benchmark Runner** — Compare models side-by-side across multiple runs
- **Full Logging** — Every tool call, decision, and state change tracked
- **Deterministic** — Same seed = same results (reproducible benchmarks)

## Quick Start

```bash
git clone https://github.com/Kapustin-Team/KapustinClaw.git
cd KapustinClaw
npm install
npm run build

# Run a single scenario
node dist/index.js run scenarios/coffee-shop.json --model claude-sonnet-4-20250514 --speed 100

# Benchmark multiple models
node dist/index.js benchmark scenarios/ --models claude-sonnet-4-20250514,gpt-4o --runs 3

# View results
node dist/index.js results --format table
```

## Scenarios

Scenarios are JSON files that define:
- **Duration** — simulation length in days
- **Initial state** — starting balance, inventory, market conditions
- **Events** — things that happen (supplier delays, weather, competitor actions)
- **Scoring** — how to evaluate agent performance

### Included Scenarios

| Scenario | Duration | Description |
|----------|----------|-------------|
| `vending-machine.json` | 365 days | Manage inventory, pricing, restocking for a vending machine |
| `coffee-shop.json` | 90 days | Run a coffee shop — menu, pricing, staff, seasonal drinks |

### Create Your Own

```json
{
  "name": "My Scenario",
  "description": "Test agent on...",
  "duration": { "days": 30 },
  "initialState": {
    "balance": 10000,
    "inventory": { "item_a": 100 },
    "customerSatisfaction": 0.8
  },
  "events": [
    {
      "id": "price_spike",
      "type": "scheduled",
      "name": "Supplier price increase",
      "day": 15,
      "effects": {
        "stateChanges": { "marketConditions.demandMultiplier": 0.8 },
        "emailToAgent": {
          "from": "supplier@example.com",
          "subject": "Price Update",
          "body": "Due to market conditions, prices increase 20% starting next week."
        }
      }
    }
  ],
  "scoring": {
    "weights": { "finalBalance": 0.4, "customerSatisfaction": 0.3, "uptime": 0.2, "efficiency": 0.1 },
    "penalties": { "negativeBalance": 100, "lowSatisfaction": 50, "downtime": 10 }
  },
  "tools": { "email": true, "inventory": true, "financial": true, "webSearch": true }
}
```

## Memory System

Every agent action is logged to SQLite with FTS5 full-text search:

```typescript
// Agent memory operations
memory.logAction(agentId, 'restock', 'Restocked coffee beans', { quantity: 50 });
memory.saveKnowledge(agentId, 'pricing', 'Morning rush pricing should be 15% higher');
memory.saveDecision(agentId, 'Switched to local supplier', 'Better reliability despite 5% higher cost');

// Fuzzy search across all memory
const results = memory.search('coffee pricing strategy');
const recent = memory.getRecent(agentId, 24); // last 24 hours
```

## Architecture

Built on the container isolation model from NanoClaw — each agent runs in its own sandbox:

- **Simulation Engine** (`src/simulation/`) — time management, events, scoring
- **Memory Layer** (`src/memory/`) — SQLite + FTS5, knowledge storage
- **Logging** (`src/logging/`) — structured logging, export to JSON/CSV
- **CLI** (`src/index.ts`) — run, benchmark, results commands

## License

MIT

---

Built by [Kapustin Team](https://kapustin.team) 🚀
