#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { SimulationEngine } from './simulation/engine.js';
import { ScenarioLoader } from './simulation/scenario.js';
import { MemoryManager } from './memory/index.js';
import { Logger } from './logging/index.js';
import { AgentInterface, SimulationResult, ScenarioConfig } from './simulation/types.js';

// Mock agent implementation for testing
class MockAgent implements AgentInterface {
  public id: string;
  public model: string;
  public tools: any = {};

  constructor(id: string, model: string) {
    this.id = id;
    this.model = model;
  }

  async processEvent(event: string, context: any): Promise<string> {
    // Simple mock agent that makes basic decisions
    switch (event) {
      case 'simulation_start':
        return `Starting simulation: ${context.scenario}`;

      case 'alert':
        return `Received alert: ${context.message}`;

      default:
        return `Processing event: ${event}`;
    }
  }

  async getState(): Promise<any> {
    return {};
  }
}

interface CLIOptions {
  command: string;
  scenario?: string;
  scenariosDir?: string;
  model?: string;
  models?: string[];
  speed?: number;
  verbose?: boolean;
  runs?: number;
  format?: 'table' | 'json' | 'csv';
  output?: string;
}

class KapustinClawCLI {
  private logger: Logger;
  private memory: MemoryManager;

  constructor() {
    this.logger = new Logger(undefined, {
      consoleOutput: true,
      minLevel: 'info'
    });
    this.memory = new MemoryManager();
  }

  private parseArgs(args: string[]): CLIOptions {
    const options: CLIOptions = { command: '' };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === 'run' || arg === 'benchmark' || arg === 'results') {
        options.command = arg;
      } else if (arg === '--model') {
        options.model = args[++i];
      } else if (arg === '--models') {
        options.models = args[++i].split(',');
      } else if (arg === '--speed') {
        options.speed = parseInt(args[++i], 10);
      } else if (arg === '--verbose' || arg === '-v') {
        options.verbose = true;
      } else if (arg === '--runs') {
        options.runs = parseInt(args[++i], 10);
      } else if (arg === '--format') {
        options.format = args[++i] as 'table' | 'json' | 'csv';
      } else if (arg === '--output' || arg === '-o') {
        options.output = args[++i];
      } else if (!arg.startsWith('--') && !options.scenario && !options.scenariosDir) {
        if (options.command === 'run') {
          options.scenario = arg;
        } else if (options.command === 'benchmark') {
          options.scenariosDir = arg;
        }
      }
    }

    return options;
  }

  private showHelp(): void {
    console.log(`
KapustinClaw - AI Agent Benchmark & Simulation Platform

Usage:
  kapustinclaw run <scenario.json> [options]        Run a single scenario
  kapustinclaw benchmark <scenarios-dir/> [options] Run benchmark suite
  kapustinclaw results [options]                    Show benchmark results

Options:
  --model <model>           Model to use (default: claude-sonnet-4-20250514)
  --models <model1,model2>  Multiple models for benchmark
  --speed <multiplier>      Simulation speed (default: 1, faster: 100)
  --runs <number>           Number of runs per scenario (default: 1)
  --verbose, -v             Verbose output
  --format <format>         Output format: table, json, csv (default: table)
  --output, -o <file>       Output file (default: stdout)

Examples:
  kapustinclaw run scenarios/vending-machine.json
  kapustinclaw run scenarios/coffee-shop.json --model claude-opus-4-6 --speed 100
  kapustinclaw benchmark scenarios/ --models claude-sonnet-4-20250514,gpt-4o --runs 3
  kapustinclaw results --format json --output results.json
`);
  }

  public async run(): Promise<void> {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
      this.showHelp();
      return;
    }

    const options = this.parseArgs(args);

    if (options.verbose) {
      this.logger = new Logger(undefined, {
        consoleOutput: true,
        minLevel: 'debug'
      });
    }

    try {
      switch (options.command) {
        case 'run':
          await this.runSingle(options);
          break;
        case 'benchmark':
          await this.runBenchmark(options);
          break;
        case 'results':
          await this.showResults(options);
          break;
        default:
          this.logger.error('cli', 'Unknown command. Use --help for usage information.');
          process.exit(1);
      }
    } catch (error: any) {
      this.logger.error('cli', 'Command failed', { error: error.message });
      process.exit(1);
    }
  }

  private async runSingle(options: CLIOptions): Promise<void> {
    if (!options.scenario) {
      throw new Error('Scenario file is required for run command');
    }

    this.logger.info('cli', `Loading scenario: ${options.scenario}`);
    const scenario = await ScenarioLoader.loadFromFile(options.scenario);

    const model = options.model || 'claude-sonnet-4-20250514';
    const speed = options.speed || 1;
    const agentId = `agent_${Date.now()}`;

    this.logger.info('cli', `Starting simulation`, {
      scenario: scenario.name,
      model,
      speed,
      agentId
    });

    const agent = new MockAgent(agentId, model);
    const engine = new SimulationEngine(scenario, agent, speed);

    // Setup event listeners for real-time feedback
    if (options.verbose) {
      engine.on('tick', (data) => {
        this.logger.debug('simulation', `Day ${data.day}, ${data.hour}:${data.minute.toString().padStart(2, '0')}`);
      });

      engine.on('log', (logEntry) => {
        this.logger.info('simulation', logEntry.description, logEntry.data);
      });
    }

    const result = await engine.start();

    this.logger.info('cli', 'Simulation completed', {
      score: result.score,
      duration: `${(result.duration / 1000).toFixed(2)}s`,
      actions: result.actions
    });

    // Store result in database
    await this.storeResult(result);

    // Output result
    if (options.output) {
      await this.outputResult(result, options.format || 'json', options.output);
    } else {
      this.displayResult(result, options.format || 'table');
    }
  }

  private async runBenchmark(options: CLIOptions): Promise<void> {
    if (!options.scenariosDir) {
      throw new Error('Scenarios directory is required for benchmark command');
    }

    this.logger.info('cli', `Loading scenarios from: ${options.scenariosDir}`);
    const scenarios = await ScenarioLoader.loadFromDirectory(options.scenariosDir);

    if (scenarios.length === 0) {
      throw new Error('No valid scenarios found in directory');
    }

    const models = options.models || [options.model || 'claude-sonnet-4-20250514'];
    const runs = options.runs || 1;
    const speed = options.speed || 1;

    this.logger.info('cli', `Starting benchmark`, {
      scenarios: scenarios.length,
      models: models.length,
      runs,
      totalExecutions: scenarios.length * models.length * runs
    });

    const allResults: SimulationResult[] = [];

    for (const scenario of scenarios) {
      for (const model of models) {
        for (let run = 1; run <= runs; run++) {
          const agentId = `agent_${scenario.name}_${model}_${run}_${Date.now()}`;

          this.logger.info('cli', `Running`, {
            scenario: scenario.name,
            model,
            run: `${run}/${runs}`
          });

          try {
            const agent = new MockAgent(agentId, model);
            const engine = new SimulationEngine(scenario, agent, speed);

            const result = await engine.start();
            allResults.push(result);
            await this.storeResult(result);

            this.logger.info('cli', `Completed`, {
              scenario: scenario.name,
              model,
              score: result.score.toFixed(2)
            });
          } catch (error: any) {
            this.logger.error('cli', `Failed`, {
              scenario: scenario.name,
              model,
              error: error.message
            });
          }
        }
      }
    }

    this.logger.info('cli', 'Benchmark completed', {
      totalResults: allResults.length,
      avgScore: allResults.length > 0 ? (allResults.reduce((sum, r) => sum + r.score, 0) / allResults.length).toFixed(2) : 0
    });

    // Output results
    if (options.output) {
      await this.outputResults(allResults, options.format || 'json', options.output);
    } else {
      this.displayResults(allResults, options.format || 'table');
    }
  }

  private async showResults(options: CLIOptions): Promise<void> {
    this.logger.info('cli', 'Loading stored results...');

    // For now, just show stats since we don't have a results storage yet
    const memoryStats = this.memory.getStats();
    const logStats = this.logger.getLogStats();

    const results = {
      memory: memoryStats,
      logs: logStats,
      timestamp: new Date().toISOString()
    };

    if (options.output) {
      const format = options.format || 'json';
      if (format === 'json') {
        await fs.promises.writeFile(options.output, JSON.stringify(results, null, 2));
      } else {
        // For table and csv, convert to simple format
        const content = `Memory: ${memoryStats.totalSize} entries, Logs: ${logStats.totalLogs} entries`;
        await fs.promises.writeFile(options.output, content);
      }
      this.logger.info('cli', `Results saved to ${options.output}`);
    } else {
      console.log('\nKapustinClaw Results:');
      console.log(`Memory: ${memoryStats.totalSize} entries`);
      console.log(`Logs: ${logStats.totalLogs} entries`);
    }
  }

  private async storeResult(result: SimulationResult): Promise<void> {
    // Store key information in memory for future reference
    this.memory.logAction(
      result.agentId,
      'simulation_completed',
      `Completed ${result.scenario} with score ${result.score.toFixed(2)}`,
      JSON.stringify({
        scenario: result.scenario,
        model: result.model,
        score: result.score,
        duration: result.duration,
        actions: result.actions
      }),
      8, // High importance
      ['simulation', 'benchmark', result.scenario]
    );
  }

  private displayResult(result: SimulationResult, format: string): void {
    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else if (format === 'csv') {
      console.log(this.resultToCSV([result]));
    } else {
      // Table format
      console.log('\n=== Simulation Result ===');
      console.log(`Scenario: ${result.scenario}`);
      console.log(`Agent: ${result.agentId}`);
      console.log(`Model: ${result.model}`);
      console.log(`Score: ${result.score.toFixed(2)}`);
      console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
      console.log('\nBreakdown:');
      console.log(`  Balance: ${result.breakdown.balance.toFixed(2)}`);
      console.log(`  Customer Satisfaction: ${result.breakdown.customerSatisfaction.toFixed(2)}`);
      console.log(`  Uptime: ${result.breakdown.uptime.toFixed(2)}`);
      console.log(`  Efficiency: ${result.breakdown.efficiency.toFixed(2)}`);
      console.log(`  Penalties: ${result.breakdown.penalties.toFixed(2)}`);
      console.log('\nActions:');
      console.log(`  Tool Calls: ${result.actions.toolCalls}`);
      console.log(`  Decisions: ${result.actions.decisions}`);
      console.log(`  Errors: ${result.actions.errors}`);
    }
  }

  private displayResults(results: SimulationResult[], format: string): void {
    if (format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else if (format === 'csv') {
      console.log(this.resultToCSV(results));
    } else {
      // Table format
      console.log('\n=== Benchmark Results ===');
      console.log(`Total runs: ${results.length}`);

      // Group by scenario and model
      const grouped = new Map<string, SimulationResult[]>();
      for (const result of results) {
        const key = `${result.scenario}-${result.model}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(result);
      }

      console.log('\nScenario\t\tModel\t\tAvg Score\tRuns');
      console.log('---'.repeat(20));

      for (const [key, runs] of grouped.entries()) {
        const [scenario, model] = key.split('-');
        const avgScore = runs.reduce((sum, r) => sum + r.score, 0) / runs.length;
        console.log(`${scenario}\t\t${model}\t\t${avgScore.toFixed(2)}\t\t${runs.length}`);
      }
    }
  }

  private async outputResult(result: SimulationResult, format: string, filename: string): Promise<void> {
    const dir = path.dirname(filename);
    await fs.promises.mkdir(dir, { recursive: true });

    if (format === 'json') {
      await fs.promises.writeFile(filename, JSON.stringify(result, null, 2));
    } else if (format === 'csv') {
      await fs.promises.writeFile(filename, this.resultToCSV([result]));
    } else {
      // Plain text
      const content = `Scenario: ${result.scenario}\nScore: ${result.score}\nDuration: ${result.duration}ms`;
      await fs.promises.writeFile(filename, content);
    }

    this.logger.info('cli', `Results saved to ${filename}`);
  }

  private async outputResults(results: SimulationResult[], format: string, filename: string): Promise<void> {
    const dir = path.dirname(filename);
    await fs.promises.mkdir(dir, { recursive: true });

    if (format === 'json') {
      await fs.promises.writeFile(filename, JSON.stringify(results, null, 2));
    } else if (format === 'csv') {
      await fs.promises.writeFile(filename, this.resultToCSV(results));
    } else {
      // Plain text summary
      const summary = results.map(r => `${r.scenario},${r.model},${r.score.toFixed(2)}`).join('\n');
      await fs.promises.writeFile(filename, `Scenario,Model,Score\n${summary}`);
    }

    this.logger.info('cli', `Results saved to ${filename}`);
  }

  private resultToCSV(results: SimulationResult[]): string {
    const headers = [
      'scenario', 'agentId', 'model', 'startTime', 'endTime', 'duration',
      'score', 'finalBalance', 'customerSatisfaction', 'uptime', 'efficiency', 'penalties',
      'toolCalls', 'decisions', 'errors', 'tokensUsed', 'avgResponseTime'
    ];

    const rows = results.map(r => [
      r.scenario,
      r.agentId,
      r.model,
      r.startTime,
      r.endTime,
      r.duration.toString(),
      r.score.toFixed(2),
      r.breakdown.balance.toFixed(2),
      r.breakdown.customerSatisfaction.toFixed(2),
      r.breakdown.uptime.toFixed(2),
      r.breakdown.efficiency.toFixed(2),
      r.breakdown.penalties.toFixed(2),
      r.actions.toolCalls.toString(),
      r.actions.decisions.toString(),
      r.actions.errors.toString(),
      r.performance.tokensUsed.toString(),
      r.performance.averageResponseTime.toFixed(2)
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  public close(): void {
    this.logger.close();
    this.memory.close();
  }
}

// Main execution
async function main() {
  const cli = new KapustinClawCLI();

  // Graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down KapustinClaw...');
    cli.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await cli.run();
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run only if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { KapustinClawCLI };