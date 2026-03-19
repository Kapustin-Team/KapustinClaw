import Database from 'better-sqlite3';
import path from 'path';
import { FuzzySearch } from './search.js';

export interface AgentLog {
  id?: number;
  agentId: string;
  action: string;
  summary: string;
  context: string;
  importance: number; // 1-10 scale
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentKnowledge {
  id?: number;
  agentId: string;
  topic: string;
  content: string;
  category: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AgentDecision {
  id?: number;
  agentId: string;
  decision: string;
  reasoning: string;
  category: string;
  outcome?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchOptions {
  agentId?: string;
  category?: string;
  tags?: string[];
  minImportance?: number;
  timeRange?: {
    start: string;
    end: string;
  };
  limit?: number;
}

export interface SearchResult {
  type: 'log' | 'knowledge' | 'decision';
  id: number;
  agentId: string;
  content: string;
  relevanceScore: number;
  createdAt: string;
  metadata: any;
}

export class MemoryManager {
  private db: Database.Database;
  private fuzzySearch: FuzzySearch;

  constructor(dbPath?: string) {
    const actualPath = dbPath || path.join(process.cwd(), 'kapustinclaw-memory.db');
    this.db = new Database(actualPath);
    this.fuzzySearch = new FuzzySearch(this.db);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        action TEXT NOT NULL,
        summary TEXT NOT NULL,
        context TEXT NOT NULL,
        importance INTEGER NOT NULL CHECK(importance >= 1 AND importance <= 10),
        tags TEXT NOT NULL, -- JSON array
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_knowledge (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        tags TEXT NOT NULL, -- JSON array
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        category TEXT NOT NULL,
        outcome TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Create indexes for performance
      CREATE INDEX IF NOT EXISTS idx_logs_agent_created ON agent_logs(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_logs_importance ON agent_logs(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_knowledge_agent_category ON agent_knowledge(agent_id, category);
      CREATE INDEX IF NOT EXISTS idx_decisions_agent_created ON agent_decisions(agent_id, created_at DESC);

      -- Create FTS5 tables for full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS logs_fts USING fts5(
        agent_id, action, summary, context, tags,
        content='agent_logs',
        content_rowid='id'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        agent_id, topic, content, category, tags,
        content='agent_knowledge',
        content_rowid='id'
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS decisions_fts USING fts5(
        agent_id, decision, reasoning, category,
        content='agent_decisions',
        content_rowid='id'
      );

      -- Triggers to keep FTS tables in sync
      CREATE TRIGGER IF NOT EXISTS logs_fts_insert AFTER INSERT ON agent_logs
      BEGIN
        INSERT INTO logs_fts(rowid, agent_id, action, summary, context, tags)
        VALUES (NEW.id, NEW.agent_id, NEW.action, NEW.summary, NEW.context, NEW.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS logs_fts_delete AFTER DELETE ON agent_logs
      BEGIN
        DELETE FROM logs_fts WHERE rowid = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS logs_fts_update AFTER UPDATE ON agent_logs
      BEGIN
        UPDATE logs_fts SET
          agent_id = NEW.agent_id,
          action = NEW.action,
          summary = NEW.summary,
          context = NEW.context,
          tags = NEW.tags
        WHERE rowid = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_fts_insert AFTER INSERT ON agent_knowledge
      BEGIN
        INSERT INTO knowledge_fts(rowid, agent_id, topic, content, category, tags)
        VALUES (NEW.id, NEW.agent_id, NEW.topic, NEW.content, NEW.category, NEW.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_fts_delete AFTER DELETE ON agent_knowledge
      BEGIN
        DELETE FROM knowledge_fts WHERE rowid = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS knowledge_fts_update AFTER UPDATE ON agent_knowledge
      BEGIN
        UPDATE knowledge_fts SET
          agent_id = NEW.agent_id,
          topic = NEW.topic,
          content = NEW.content,
          category = NEW.category,
          tags = NEW.tags
        WHERE rowid = NEW.id;
      END;

      CREATE TRIGGER IF NOT EXISTS decisions_fts_insert AFTER INSERT ON agent_decisions
      BEGIN
        INSERT INTO decisions_fts(rowid, agent_id, decision, reasoning, category)
        VALUES (NEW.id, NEW.agent_id, NEW.decision, NEW.reasoning, NEW.category);
      END;

      CREATE TRIGGER IF NOT EXISTS decisions_fts_delete AFTER DELETE ON agent_decisions
      BEGIN
        DELETE FROM decisions_fts WHERE rowid = OLD.id;
      END;

      CREATE TRIGGER IF NOT EXISTS decisions_fts_update AFTER UPDATE ON agent_decisions
      BEGIN
        UPDATE decisions_fts SET
          agent_id = NEW.agent_id,
          decision = NEW.decision,
          reasoning = NEW.reasoning,
          category = NEW.category
        WHERE rowid = NEW.id;
      END;
    `);
  }

  /**
   * Log an agent action
   */
  public logAction(
    agentId: string,
    action: string,
    summary: string,
    context: string,
    importance: number,
    tags: string[] = []
  ): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO agent_logs (agent_id, action, summary, context, importance, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      agentId,
      action,
      summary,
      context,
      Math.max(1, Math.min(10, importance)),
      JSON.stringify(tags),
      now,
      now
    );

    return result.lastInsertRowid as number;
  }

  /**
   * Save agent knowledge
   */
  public saveKnowledge(
    agentId: string,
    topic: string,
    content: string,
    category: string,
    tags: string[] = []
  ): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO agent_knowledge (agent_id, topic, content, category, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(agentId, topic, content, category, JSON.stringify(tags), now, now);
    return result.lastInsertRowid as number;
  }

  /**
   * Save an agent decision
   */
  public saveDecision(
    agentId: string,
    decision: string,
    reasoning: string,
    category: string
  ): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO agent_decisions (agent_id, decision, reasoning, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(agentId, decision, reasoning, category, now, now);
    return result.lastInsertRowid as number;
  }

  /**
   * Update decision outcome
   */
  public updateDecisionOutcome(decisionId: number, outcome: string): void {
    const stmt = this.db.prepare(`
      UPDATE agent_decisions
      SET outcome = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(outcome, new Date().toISOString(), decisionId);
  }

  /**
   * Fuzzy search across all memory types
   */
  public search(query: string, options: SearchOptions = {}): SearchResult[] {
    return this.fuzzySearch.search(query, options);
  }

  /**
   * Recall relevant memories with ranking
   */
  public recall(query: string, limit: number = 10): SearchResult[] {
    const results = this.search(query, { limit: limit * 2 }); // Get more results for ranking

    // Simple ranking by relevance score and recency
    const rankedResults = results
      .map(result => ({
        ...result,
        recencyScore: this.calculateRecencyScore(result.createdAt),
        finalScore: result.relevanceScore * 0.7 + this.calculateRecencyScore(result.createdAt) * 0.3
      }))
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);

    return rankedResults;
  }

  private calculateRecencyScore(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - created.getTime()) / (1000 * 60 * 60);

    // Exponential decay: recent memories are more valuable
    return Math.exp(-hoursDiff / 168); // Half-life of 1 week (168 hours)
  }

  /**
   * Get recent activities for an agent
   */
  public getRecent(agentId: string, hours: number = 24, limit: number = 50): Array<{
    type: 'log' | 'knowledge' | 'decision';
    data: any;
    createdAt: string;
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const results: Array<{ type: 'log' | 'knowledge' | 'decision'; data: any; createdAt: string }> = [];

    // Get recent logs
    const logs = this.db.prepare(`
      SELECT * FROM agent_logs
      WHERE agent_id = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentId, since, limit);

    logs.forEach((log: any) => {
      results.push({
        type: 'log',
        data: { ...log, tags: JSON.parse(log.tags) },
        createdAt: log.created_at
      });
    });

    // Get recent knowledge
    const knowledge = this.db.prepare(`
      SELECT * FROM agent_knowledge
      WHERE agent_id = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentId, since, limit);

    knowledge.forEach((k: any) => {
      results.push({
        type: 'knowledge',
        data: { ...k, tags: JSON.parse(k.tags) },
        createdAt: k.created_at
      });
    });

    // Get recent decisions
    const decisions = this.db.prepare(`
      SELECT * FROM agent_decisions
      WHERE agent_id = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentId, since, limit);

    decisions.forEach((d: any) => {
      results.push({
        type: 'decision',
        data: d,
        createdAt: d.created_at
      });
    });

    // Sort all results by creation time
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
  }

  /**
   * Get memory statistics
   */
  public getStats(agentId?: string): {
    logs: number;
    knowledge: number;
    decisions: number;
    totalSize: number;
  } {
    const whereClause = agentId ? 'WHERE agent_id = ?' : '';
    const params = agentId ? [agentId] : [];

    const logs = this.db.prepare(`SELECT COUNT(*) as count FROM agent_logs ${whereClause}`).get(params) as { count: number };
    const knowledge = this.db.prepare(`SELECT COUNT(*) as count FROM agent_knowledge ${whereClause}`).get(params) as { count: number };
    const decisions = this.db.prepare(`SELECT COUNT(*) as count FROM agent_decisions ${whereClause}`).get(params) as { count: number };

    return {
      logs: logs.count,
      knowledge: knowledge.count,
      decisions: decisions.count,
      totalSize: logs.count + knowledge.count + decisions.count
    };
  }

  /**
   * Clear all memory for an agent
   */
  public clearAgent(agentId: string): void {
    const transaction = this.db.transaction(() => {
      this.db.prepare('DELETE FROM agent_logs WHERE agent_id = ?').run(agentId);
      this.db.prepare('DELETE FROM agent_knowledge WHERE agent_id = ?').run(agentId);
      this.db.prepare('DELETE FROM agent_decisions WHERE agent_id = ?').run(agentId);
    });

    transaction();
  }

  /**
   * Close the database connection
   */
  public close(): void {
    this.db.close();
  }

  /**
   * Export agent memory to JSON
   */
  public exportMemory(agentId: string): {
    logs: AgentLog[];
    knowledge: AgentKnowledge[];
    decisions: AgentDecision[];
    exported_at: string;
  } {
    const logs = this.db.prepare('SELECT * FROM agent_logs WHERE agent_id = ? ORDER BY created_at').all(agentId) as any[];
    const knowledge = this.db.prepare('SELECT * FROM agent_knowledge WHERE agent_id = ? ORDER BY created_at').all(agentId) as any[];
    const decisions = this.db.prepare('SELECT * FROM agent_decisions WHERE agent_id = ? ORDER BY created_at').all(agentId) as any[];

    return {
      logs: logs.map(log => ({ ...log, tags: JSON.parse(log.tags) })),
      knowledge: knowledge.map(k => ({ ...k, tags: JSON.parse(k.tags) })),
      decisions,
      exported_at: new Date().toISOString()
    };
  }
}