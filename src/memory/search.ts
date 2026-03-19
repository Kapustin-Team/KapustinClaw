import Database from 'better-sqlite3';
import { SearchOptions, SearchResult } from './index.js';

export class FuzzySearch {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Perform a fuzzy search across all memory types using SQLite FTS5
   */
  public search(query: string, options: SearchOptions = {}): SearchResult[] {
    const results: SearchResult[] = [];

    // Clean and prepare query for FTS5
    const cleanQuery = this.prepareQuery(query);
    if (!cleanQuery) return [];

    // Search across all three memory types
    results.push(...this.searchLogs(cleanQuery, options));
    results.push(...this.searchKnowledge(cleanQuery, options));
    results.push(...this.searchDecisions(cleanQuery, options));

    // Sort by relevance score and apply limit
    const sortedResults = results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    if (options.limit) {
      return sortedResults.slice(0, options.limit);
    }

    return sortedResults;
  }

  private prepareQuery(query: string): string {
    // Remove special FTS5 characters and prepare for search
    const cleaned = query
      .replace(/[^\w\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) return '';

    // Create a query that uses FTS5 prefix matching
    const terms = cleaned.split(' ').filter(term => term.length > 2);
    if (terms.length === 0) return '';

    // Use OR logic for multiple terms with prefix matching
    return terms.map(term => `${term}*`).join(' OR ');
  }

  private searchLogs(query: string, options: SearchOptions): SearchResult[] {
    let whereClause = '';
    const params: any[] = [query];

    if (options.agentId) {
      whereClause += ' AND l.agent_id = ?';
      params.push(options.agentId);
    }

    if (options.minImportance) {
      whereClause += ' AND l.importance >= ?';
      params.push(options.minImportance);
    }

    if (options.timeRange) {
      whereClause += ' AND l.created_at BETWEEN ? AND ?';
      params.push(options.timeRange.start, options.timeRange.end);
    }

    const sql = `
      SELECT
        'log' as type,
        l.id,
        l.agent_id,
        l.action,
        l.summary,
        l.context,
        l.importance,
        l.tags,
        l.created_at,
        fts.rank
      FROM logs_fts fts
      JOIN agent_logs l ON l.id = fts.rowid
      WHERE logs_fts MATCH ?${whereClause}
      ORDER BY fts.rank
    `;

    try {
      const rows = this.db.prepare(sql).all(params);
      return rows.map((row: any) => this.mapLogToSearchResult(row));
    } catch (error: any) {
      // If FTS5 query fails, fall back to LIKE search
      return this.fallbackSearchLogs(query.replace(/\*/g, ''), options);
    }
  }

  private searchKnowledge(query: string, options: SearchOptions): SearchResult[] {
    let whereClause = '';
    const params: any[] = [query];

    if (options.agentId) {
      whereClause += ' AND k.agent_id = ?';
      params.push(options.agentId);
    }

    if (options.category) {
      whereClause += ' AND k.category = ?';
      params.push(options.category);
    }

    if (options.timeRange) {
      whereClause += ' AND k.created_at BETWEEN ? AND ?';
      params.push(options.timeRange.start, options.timeRange.end);
    }

    const sql = `
      SELECT
        'knowledge' as type,
        k.id,
        k.agent_id,
        k.topic,
        k.content,
        k.category,
        k.tags,
        k.created_at,
        fts.rank
      FROM knowledge_fts fts
      JOIN agent_knowledge k ON k.id = fts.rowid
      WHERE knowledge_fts MATCH ?${whereClause}
      ORDER BY fts.rank
    `;

    try {
      const rows = this.db.prepare(sql).all(params);
      return rows.map((row: any) => this.mapKnowledgeToSearchResult(row));
    } catch (error: any) {
      return this.fallbackSearchKnowledge(query.replace(/\*/g, ''), options);
    }
  }

  private searchDecisions(query: string, options: SearchOptions): SearchResult[] {
    let whereClause = '';
    const params: any[] = [query];

    if (options.agentId) {
      whereClause += ' AND d.agent_id = ?';
      params.push(options.agentId);
    }

    if (options.category) {
      whereClause += ' AND d.category = ?';
      params.push(options.category);
    }

    if (options.timeRange) {
      whereClause += ' AND d.created_at BETWEEN ? AND ?';
      params.push(options.timeRange.start, options.timeRange.end);
    }

    const sql = `
      SELECT
        'decision' as type,
        d.id,
        d.agent_id,
        d.decision,
        d.reasoning,
        d.category,
        d.outcome,
        d.created_at,
        fts.rank
      FROM decisions_fts fts
      JOIN agent_decisions d ON d.id = fts.rowid
      WHERE decisions_fts MATCH ?${whereClause}
      ORDER BY fts.rank
    `;

    try {
      const rows = this.db.prepare(sql).all(params);
      return rows.map((row: any) => this.mapDecisionToSearchResult(row));
    } catch (error: any) {
      return this.fallbackSearchDecisions(query.replace(/\*/g, ''), options);
    }
  }

  // Fallback search methods using LIKE when FTS5 fails
  private fallbackSearchLogs(query: string, options: SearchOptions): SearchResult[] {
    let whereClause = 'WHERE (l.action LIKE ? OR l.summary LIKE ? OR l.context LIKE ?)';
    const likeQuery = `%${query}%`;
    const params: any[] = [likeQuery, likeQuery, likeQuery];

    if (options.agentId) {
      whereClause += ' AND l.agent_id = ?';
      params.push(options.agentId);
    }

    if (options.minImportance) {
      whereClause += ' AND l.importance >= ?';
      params.push(options.minImportance);
    }

    if (options.timeRange) {
      whereClause += ' AND l.created_at BETWEEN ? AND ?';
      params.push(options.timeRange.start, options.timeRange.end);
    }

    const sql = `
      SELECT
        'log' as type,
        l.*,
        0.5 as rank
      FROM agent_logs l
      ${whereClause}
      ORDER BY l.importance DESC, l.created_at DESC
    `;

    const rows = this.db.prepare(sql).all(params);
    return rows.map((row: any) => this.mapLogToSearchResult(row));
  }

  private fallbackSearchKnowledge(query: string, options: SearchOptions): SearchResult[] {
    let whereClause = 'WHERE (k.topic LIKE ? OR k.content LIKE ?)';
    const likeQuery = `%${query}%`;
    const params: any[] = [likeQuery, likeQuery];

    if (options.agentId) {
      whereClause += ' AND k.agent_id = ?';
      params.push(options.agentId);
    }

    if (options.category) {
      whereClause += ' AND k.category = ?';
      params.push(options.category);
    }

    if (options.timeRange) {
      whereClause += ' AND k.created_at BETWEEN ? AND ?';
      params.push(options.timeRange.start, options.timeRange.end);
    }

    const sql = `
      SELECT
        'knowledge' as type,
        k.*,
        0.5 as rank
      FROM agent_knowledge k
      ${whereClause}
      ORDER BY k.created_at DESC
    `;

    const rows = this.db.prepare(sql).all(params);
    return rows.map((row: any) => this.mapKnowledgeToSearchResult(row));
  }

  private fallbackSearchDecisions(query: string, options: SearchOptions): SearchResult[] {
    let whereClause = 'WHERE (d.decision LIKE ? OR d.reasoning LIKE ?)';
    const likeQuery = `%${query}%`;
    const params: any[] = [likeQuery, likeQuery];

    if (options.agentId) {
      whereClause += ' AND d.agent_id = ?';
      params.push(options.agentId);
    }

    if (options.category) {
      whereClause += ' AND d.category = ?';
      params.push(options.category);
    }

    if (options.timeRange) {
      whereClause += ' AND d.created_at BETWEEN ? AND ?';
      params.push(options.timeRange.start, options.timeRange.end);
    }

    const sql = `
      SELECT
        'decision' as type,
        d.*,
        0.5 as rank
      FROM agent_decisions d
      ${whereClause}
      ORDER BY d.created_at DESC
    `;

    const rows = this.db.prepare(sql).all(params);
    return rows.map((row: any) => this.mapDecisionToSearchResult(row));
  }

  private mapLogToSearchResult(row: any): SearchResult {
    return {
      type: 'log',
      id: row.id,
      agentId: row.agent_id,
      content: `${row.action}: ${row.summary}\n${row.context}`,
      relevanceScore: this.convertRankToScore(row.rank),
      createdAt: row.created_at,
      metadata: {
        action: row.action,
        summary: row.summary,
        context: row.context,
        importance: row.importance,
        tags: row.tags ? JSON.parse(row.tags) : []
      }
    };
  }

  private mapKnowledgeToSearchResult(row: any): SearchResult {
    return {
      type: 'knowledge',
      id: row.id,
      agentId: row.agent_id,
      content: `${row.topic}\n${row.content}`,
      relevanceScore: this.convertRankToScore(row.rank),
      createdAt: row.created_at,
      metadata: {
        topic: row.topic,
        content: row.content,
        category: row.category,
        tags: row.tags ? JSON.parse(row.tags) : []
      }
    };
  }

  private mapDecisionToSearchResult(row: any): SearchResult {
    return {
      type: 'decision',
      id: row.id,
      agentId: row.agent_id,
      content: `Decision: ${row.decision}\nReasoning: ${row.reasoning}${row.outcome ? `\nOutcome: ${row.outcome}` : ''}`,
      relevanceScore: this.convertRankToScore(row.rank),
      createdAt: row.created_at,
      metadata: {
        decision: row.decision,
        reasoning: row.reasoning,
        category: row.category,
        outcome: row.outcome
      }
    };
  }

  private convertRankToScore(rank: number): number {
    // FTS5 rank is negative (lower = better), convert to positive score (higher = better)
    if (rank === undefined || rank === null) return 0.5;

    // Convert negative rank to positive relevance score between 0 and 1
    // FTS5 ranks typically range from -1 to -10 or lower
    return Math.max(0, Math.min(1, 1 + rank / 10));
  }

  /**
   * Get query suggestions based on existing content
   */
  public getSuggestions(partialQuery: string, limit: number = 5): string[] {
    const suggestions: Set<string> = new Set();

    if (partialQuery.length < 2) return [];

    const likeQuery = `%${partialQuery}%`;

    // Get suggestions from actions
    const actions = this.db.prepare(`
      SELECT DISTINCT action FROM agent_logs
      WHERE action LIKE ?
      LIMIT ?
    `).all(likeQuery, limit);

    actions.forEach((row: any) => suggestions.add(row.action));

    // Get suggestions from topics
    const topics = this.db.prepare(`
      SELECT DISTINCT topic FROM agent_knowledge
      WHERE topic LIKE ?
      LIMIT ?
    `).all(likeQuery, limit);

    topics.forEach((row: any) => suggestions.add(row.topic));

    // Get suggestions from categories
    const categories = this.db.prepare(`
      SELECT DISTINCT category FROM agent_knowledge
      WHERE category LIKE ?
      LIMIT ?
    `).all(likeQuery, limit);

    categories.forEach((row: any) => suggestions.add(row.category));

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Get the most common tags for auto-completion
   */
  public getPopularTags(limit: number = 20): Array<{ tag: string; count: number }> {
    const tagCounts: { [tag: string]: number } = {};

    // Get all tags from logs
    const logs = this.db.prepare('SELECT tags FROM agent_logs').all();
    logs.forEach((row: any) => {
      if (row.tags) {
        try {
          const tags = JSON.parse(row.tags);
          tags.forEach((tag: string) => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    });

    // Get all tags from knowledge
    const knowledge = this.db.prepare('SELECT tags FROM agent_knowledge').all();
    knowledge.forEach((row: any) => {
      if (row.tags) {
        try {
          const tags = JSON.parse(row.tags);
          tags.forEach((tag: string) => {
            tagCounts[tag] = (tagCounts[tag] || 0) + 1;
          });
        } catch (e) {
          // Ignore invalid JSON
        }
      }
    });

    // Convert to array and sort
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }
}