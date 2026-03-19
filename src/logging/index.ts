import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  id?: number;
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  agentId?: string;
  scenarioName?: string;
  sessionId?: string;
}

export interface PerformanceMetric {
  id?: number;
  timestamp: string;
  agentId: string;
  scenarioName: string;
  metric: string;
  value: number;
  unit: string;
  sessionId?: string;
}

export interface LogQuery {
  level?: LogLevel[];
  category?: string[];
  agentId?: string;
  scenarioName?: string;
  sessionId?: string;
  timeRange?: {
    start: string;
    end: string;
  };
  limit?: number;
  offset?: number;
}

export class Logger {
  private db: Database.Database;
  private fileOutput?: fs.WriteStream;
  private consoleOutput: boolean;
  private minLevel: LogLevel;

  private static levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(
    dbPath?: string,
    options: {
      consoleOutput?: boolean;
      fileOutput?: string;
      minLevel?: LogLevel;
    } = {}
  ) {
    const actualDbPath = dbPath || path.join(process.cwd(), 'kapustinclaw-logs.db');
    this.db = new Database(actualDbPath);
    this.consoleOutput = options.consoleOutput !== false; // Default true
    this.minLevel = options.minLevel || 'info';

    this.initializeTables();

    if (options.fileOutput) {
      this.setupFileOutput(options.fileOutput);
    }
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT, -- JSON string
        agent_id TEXT,
        scenario_name TEXT,
        session_id TEXT
      );

      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        scenario_name TEXT NOT NULL,
        metric TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        session_id TEXT
      );

      -- Indexes for efficient querying
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
      CREATE INDEX IF NOT EXISTS idx_logs_category ON logs(category);
      CREATE INDEX IF NOT EXISTS idx_logs_agent ON logs(agent_id);
      CREATE INDEX IF NOT EXISTS idx_logs_scenario ON logs(scenario_name);
      CREATE INDEX IF NOT EXISTS idx_logs_session ON logs(session_id);

      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON performance_metrics(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_metrics_agent ON performance_metrics(agent_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_scenario ON performance_metrics(scenario_name);
      CREATE INDEX IF NOT EXISTS idx_metrics_metric ON performance_metrics(metric);
    `);
  }

  private setupFileOutput(filePath: string): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    this.fileOutput = fs.createWriteStream(filePath, { flags: 'a' });
  }

  /**
   * Log a debug message
   */
  public debug(category: string, message: string, data?: any, context?: { agentId?: string; scenarioName?: string; sessionId?: string }): void {
    this.log('debug', category, message, data, context);
  }

  /**
   * Log an info message
   */
  public info(category: string, message: string, data?: any, context?: { agentId?: string; scenarioName?: string; sessionId?: string }): void {
    this.log('info', category, message, data, context);
  }

  /**
   * Log a warning message
   */
  public warn(category: string, message: string, data?: any, context?: { agentId?: string; scenarioName?: string; sessionId?: string }): void {
    this.log('warn', category, message, data, context);
  }

  /**
   * Log an error message
   */
  public error(category: string, message: string, data?: any, context?: { agentId?: string; scenarioName?: string; sessionId?: string }): void {
    this.log('error', category, message, data, context);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, category: string, message: string, data?: any, context?: { agentId?: string; scenarioName?: string; sessionId?: string }): void {
    // Check if this log level should be processed
    if (Logger.levelPriority[level] < Logger.levelPriority[this.minLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();

    const entry: LogEntry = {
      timestamp,
      level,
      category,
      message,
      data,
      agentId: context?.agentId,
      scenarioName: context?.scenarioName,
      sessionId: context?.sessionId
    };

    // Store in database
    this.storeLogEntry(entry);

    // Output to console
    if (this.consoleOutput) {
      this.outputToConsole(entry);
    }

    // Output to file
    if (this.fileOutput) {
      this.outputToFile(entry);
    }
  }

  private storeLogEntry(entry: LogEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO logs (timestamp, level, category, message, data, agent_id, scenario_name, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.timestamp,
      entry.level,
      entry.category,
      entry.message,
      entry.data ? JSON.stringify(entry.data) : null,
      entry.agentId,
      entry.scenarioName,
      entry.sessionId
    );
  }

  private outputToConsole(entry: LogEntry): void {
    const levelColors = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m'  // Red
    };

    const resetColor = '\x1b[0m';
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();

    let contextStr = '';
    if (entry.agentId || entry.scenarioName || entry.sessionId) {
      const context = [
        entry.agentId && `agent:${entry.agentId}`,
        entry.scenarioName && `scenario:${entry.scenarioName}`,
        entry.sessionId && `session:${entry.sessionId}`
      ].filter(Boolean).join(' ');
      contextStr = ` [${context}]`;
    }

    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : '';

    console.log(
      `${levelColors[entry.level]}[${entry.level.toUpperCase()}]${resetColor} ` +
      `${timestamp} ${entry.category}${contextStr}: ${entry.message}${dataStr}`
    );
  }

  private outputToFile(entry: LogEntry): void {
    if (!this.fileOutput) return;

    const logLine = JSON.stringify(entry) + '\n';
    this.fileOutput.write(logLine);
  }

  /**
   * Record a performance metric
   */
  public recordMetric(
    agentId: string,
    scenarioName: string,
    metric: string,
    value: number,
    unit: string,
    sessionId?: string
  ): void {
    const timestamp = new Date().toISOString();

    const metricEntry: PerformanceMetric = {
      timestamp,
      agentId,
      scenarioName,
      metric,
      value,
      unit,
      sessionId
    };

    const stmt = this.db.prepare(`
      INSERT INTO performance_metrics (timestamp, agent_id, scenario_name, metric, value, unit, session_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metricEntry.timestamp,
      metricEntry.agentId,
      metricEntry.scenarioName,
      metricEntry.metric,
      metricEntry.value,
      metricEntry.unit,
      metricEntry.sessionId
    );

    this.info('metrics', `${metric}: ${value} ${unit}`, { value, unit }, {
      agentId,
      scenarioName,
      sessionId
    });
  }

  /**
   * Query logs with filters
   */
  public queryLogs(query: LogQuery = {}): LogEntry[] {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (query.level && query.level.length > 0) {
      const placeholders = query.level.map(() => '?').join(',');
      whereClause += ` AND level IN (${placeholders})`;
      params.push(...query.level);
    }

    if (query.category && query.category.length > 0) {
      const placeholders = query.category.map(() => '?').join(',');
      whereClause += ` AND category IN (${placeholders})`;
      params.push(...query.category);
    }

    if (query.agentId) {
      whereClause += ' AND agent_id = ?';
      params.push(query.agentId);
    }

    if (query.scenarioName) {
      whereClause += ' AND scenario_name = ?';
      params.push(query.scenarioName);
    }

    if (query.sessionId) {
      whereClause += ' AND session_id = ?';
      params.push(query.sessionId);
    }

    if (query.timeRange) {
      whereClause += ' AND timestamp BETWEEN ? AND ?';
      params.push(query.timeRange.start, query.timeRange.end);
    }

    let orderClause = 'ORDER BY timestamp DESC';
    let limitClause = '';

    if (query.limit) {
      limitClause = ' LIMIT ?';
      params.push(query.limit);

      if (query.offset) {
        limitClause += ' OFFSET ?';
        params.push(query.offset);
      }
    }

    const sql = `
      SELECT id, timestamp, level, category, message, data, agent_id, scenario_name, session_id
      FROM logs
      ${whereClause}
      ${orderClause}
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(params) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      level: row.level as LogLevel,
      category: row.category,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : undefined,
      agentId: row.agent_id,
      scenarioName: row.scenario_name,
      sessionId: row.session_id
    }));
  }

  /**
   * Query performance metrics
   */
  public queryMetrics(
    agentId?: string,
    scenarioName?: string,
    metric?: string,
    timeRange?: { start: string; end: string },
    limit?: number
  ): PerformanceMetric[] {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (agentId) {
      whereClause += ' AND agent_id = ?';
      params.push(agentId);
    }

    if (scenarioName) {
      whereClause += ' AND scenario_name = ?';
      params.push(scenarioName);
    }

    if (metric) {
      whereClause += ' AND metric = ?';
      params.push(metric);
    }

    if (timeRange) {
      whereClause += ' AND timestamp BETWEEN ? AND ?';
      params.push(timeRange.start, timeRange.end);
    }

    let limitClause = '';
    if (limit) {
      limitClause = ' LIMIT ?';
      params.push(limit);
    }

    const sql = `
      SELECT *
      FROM performance_metrics
      ${whereClause}
      ORDER BY timestamp DESC
      ${limitClause}
    `;

    const rows = this.db.prepare(sql).all(params) as any[];

    return rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      agentId: row.agent_id,
      scenarioName: row.scenario_name,
      metric: row.metric,
      value: row.value,
      unit: row.unit,
      sessionId: row.session_id
    }));
  }

  /**
   * Get log statistics
   */
  public getLogStats(timeRange?: { start: string; end: string }): {
    totalLogs: number;
    byLevel: Record<LogLevel, number>;
    byCategory: Record<string, number>;
    byAgent: Record<string, number>;
  } {
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];

    if (timeRange) {
      whereClause += ' AND timestamp BETWEEN ? AND ?';
      params.push(timeRange.start, timeRange.end);
    }

    // Total logs
    const totalResult = this.db.prepare(`SELECT COUNT(*) as count FROM logs ${whereClause}`).get(params) as { count: number };

    // By level
    const levelResults = this.db.prepare(`
      SELECT level, COUNT(*) as count
      FROM logs
      ${whereClause}
      GROUP BY level
    `).all(params) as { level: LogLevel; count: number }[];

    // By category
    const categoryResults = this.db.prepare(`
      SELECT category, COUNT(*) as count
      FROM logs
      ${whereClause}
      GROUP BY category
      ORDER BY count DESC
    `).all(params) as { category: string; count: number }[];

    // By agent
    const agentResults = this.db.prepare(`
      SELECT agent_id, COUNT(*) as count
      FROM logs
      ${whereClause}
      AND agent_id IS NOT NULL
      GROUP BY agent_id
      ORDER BY count DESC
    `).all(params) as { agent_id: string; count: number }[];

    return {
      totalLogs: totalResult.count,
      byLevel: Object.fromEntries(levelResults.map(r => [r.level, r.count])) as Record<LogLevel, number>,
      byCategory: Object.fromEntries(categoryResults.map(r => [r.category, r.count])),
      byAgent: Object.fromEntries(agentResults.map(r => [r.agent_id, r.count]))
    };
  }

  /**
   * Export logs to JSON
   */
  public exportLogs(query: LogQuery = {}): { logs: LogEntry[]; exported_at: string } {
    const logs = this.queryLogs(query);
    return {
      logs,
      exported_at: new Date().toISOString()
    };
  }

  /**
   * Export logs to CSV
   */
  public exportLogsToCSV(query: LogQuery = {}): string {
    const logs = this.queryLogs(query);

    const headers = ['timestamp', 'level', 'category', 'message', 'agentId', 'scenarioName', 'sessionId', 'data'];
    const csvLines = [headers.join(',')];

    for (const log of logs) {
      const row = [
        `"${log.timestamp}"`,
        `"${log.level}"`,
        `"${log.category}"`,
        `"${log.message.replace(/"/g, '""')}"`, // Escape quotes in message
        `"${log.agentId || ''}"`,
        `"${log.scenarioName || ''}"`,
        `"${log.sessionId || ''}"`,
        `"${log.data ? JSON.stringify(log.data).replace(/"/g, '""') : ''}"`
      ];
      csvLines.push(row.join(','));
    }

    return csvLines.join('\n');
  }

  /**
   * Clear old logs
   */
  public clearOldLogs(olderThanDays: number): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const cutoffTimestamp = cutoffDate.toISOString();

    const result = this.db.prepare('DELETE FROM logs WHERE timestamp < ?').run(cutoffTimestamp);
    return result.changes;
  }

  /**
   * Close database connection and file streams
   */
  public close(): void {
    if (this.fileOutput) {
      this.fileOutput.end();
    }
    this.db.close();
  }
}