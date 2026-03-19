import { EventEmitter } from 'events';
import {
  SimulationState,
  SimulationEvent,
  ScenarioConfig,
  AgentInterface,
  EventLog,
  SimulationResult
} from './types.js';
import { EventSystem } from './events.js';
import { SimulationTools } from './tools.js';

export class SimulationEngine extends EventEmitter {
  private scenario: ScenarioConfig;
  private agent: AgentInterface;
  private state: SimulationState;
  private eventSystem: EventSystem;
  private tools: SimulationTools;
  private logs: EventLog[] = [];
  private isRunning = false;
  private startTime?: Date;
  private endTime?: Date;
  private speed: number; // simulation speed multiplier (e.g., 100 = 100x faster)

  // Performance tracking
  private tokenCount = 0;
  private responseTimes: number[] = [];
  private actionCounts = {
    toolCalls: 0,
    decisions: 0,
    errors: 0
  };

  constructor(scenario: ScenarioConfig, agent: AgentInterface, speed: number = 1) {
    super();
    this.scenario = scenario;
    this.agent = agent;
    this.speed = speed;

    // Initialize state with scenario defaults
    this.state = this.initializeState(scenario);

    // Initialize subsystems
    this.eventSystem = new EventSystem(scenario.events);
    this.tools = new SimulationTools(this, scenario.tools, scenario.knowledgeBase || {});

    // Connect agent tools to our simulation tools
    this.connectAgentTools();
  }

  private initializeState(scenario: ScenarioConfig): SimulationState {
    const defaultState: SimulationState = {
      balance: 10000,
      inventory: {},
      day: 1,
      hour: 8,
      minute: 0,
      marketConditions: {
        demandMultiplier: 1.0,
        competitorPrices: {},
        weatherImpact: 1.0
      },
      customerSatisfaction: 100,
      totalRevenue: 0,
      totalCosts: 0,
      uptime: 100,
      custom: {}
    };

    return { ...defaultState, ...scenario.initialState };
  }

  private connectAgentTools(): void {
    this.agent.tools = {
      email: (action, params) => this.tools.handleEmail(action, params),
      inventory: (action, params) => this.tools.handleInventory(action, params),
      financial: (action, params) => this.tools.handleFinancial(action, params),
      web_search: (query) => this.tools.handleWebSearch(query)
    };
  }

  public async start(): Promise<SimulationResult> {
    if (this.isRunning) {
      throw new Error('Simulation is already running');
    }

    this.isRunning = true;
    this.startTime = new Date();
    this.log('event', 'Simulation started');

    try {
      // Send initial state to agent
      await this.notifyAgent('simulation_start', {
        scenario: this.scenario.name,
        description: this.scenario.description,
        duration: this.scenario.duration,
        initialState: this.state
      });

      // Main simulation loop
      const totalMinutes = this.scenario.duration.days * (this.scenario.duration.hoursPerDay || 24) * 60;
      let currentMinute = 0;

      while (currentMinute < totalMinutes && this.isRunning) {
        await this.tick();
        currentMinute++;

        // Real-time delay based on speed
        if (this.speed < 1000) { // Only delay for reasonable speeds
          await this.sleep(1000 / this.speed);
        }
      }

      this.endTime = new Date();
      this.log('event', 'Simulation completed');

      return this.generateResult();
    } catch (error: any) {
      this.isRunning = false;
      this.endTime = new Date();
      this.log('error', 'Simulation failed', { error: error.message });
      throw error;
    }
  }

  public async tick(): Promise<void> {
    if (!this.isRunning) return;

    // Advance time
    this.state.minute++;
    if (this.state.minute >= 60) {
      this.state.minute = 0;
      this.state.hour++;
      if (this.state.hour >= (this.scenario.duration.hoursPerDay || 24)) {
        this.state.hour = 0;
        this.state.day++;
      }
    }

    // Process scheduled and random events
    const events = this.eventSystem.getEventsForTime(this.state.day, this.state.hour, this.state.minute);
    for (const event of events) {
      await this.processEvent(event);
    }

    // Check conditional events
    const conditionalEvents = this.eventSystem.checkConditionalEvents(this.state);
    for (const event of conditionalEvents) {
      await this.processEvent(event);
    }

    // Emit tick event for external listeners
    this.emit('tick', {
      day: this.state.day,
      hour: this.state.hour,
      minute: this.state.minute,
      state: { ...this.state }
    });
  }

  private async processEvent(event: SimulationEvent): Promise<void> {
    this.log('event', `Processing event: ${event.name}`, { event });

    // Apply state changes
    if (event.effects.stateChanges) {
      for (const [key, value] of Object.entries(event.effects.stateChanges)) {
        this.setState(key, value);
      }
    }

    // Send email to agent
    if (event.effects.emailToAgent) {
      const email = event.effects.emailToAgent;
      await this.tools.deliverEmailToAgent(email.from, email.subject, email.body);
    }

    // Show alert
    if (event.effects.alert) {
      await this.notifyAgent('alert', {
        message: event.effects.alert,
        timestamp: this.getCurrentTimeString()
      });
    }
  }

  private async notifyAgent(eventType: string, data: any): Promise<void> {
    const startTime = Date.now();

    try {
      const response = await this.agent.processEvent(eventType, data);
      const responseTime = Date.now() - startTime;

      this.responseTimes.push(responseTime);
      this.actionCounts.decisions++;
      this.log('agent_action', `Agent response to ${eventType}`, { response, responseTime });

    } catch (error: any) {
      this.actionCounts.errors++;
      this.log('error', `Agent error processing ${eventType}`, { error: error.message });
    }
  }

  public setState(key: string, value: any): void {
    const keys = key.split('.');
    let target: any = this.state;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in target)) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }

    const previousValue = target[keys[keys.length - 1]];
    target[keys[keys.length - 1]] = value;

    this.log('state_change', `${key}: ${previousValue} -> ${value}`);
  }

  public getState(): SimulationState {
    return { ...this.state };
  }

  public getCurrentTimeString(): string {
    return `Day ${this.state.day}, ${this.state.hour.toString().padStart(2, '0')}:${this.state.minute.toString().padStart(2, '0')}`;
  }

  public getScore(): number {
    const weights = this.scenario.scoring.weights;
    const penalties = this.scenario.scoring.penalties;

    let score = 0;

    // Balance component
    score += this.state.balance * weights.finalBalance;

    // Customer satisfaction component
    score += this.state.customerSatisfaction * weights.customerSatisfaction;

    // Uptime component
    score += this.state.uptime * weights.uptime;

    // Efficiency component (revenue/costs ratio)
    const efficiency = this.state.totalCosts > 0 ? this.state.totalRevenue / this.state.totalCosts : 1;
    score += efficiency * weights.efficiency;

    // Apply penalties
    if (this.state.balance < 0) {
      score -= Math.abs(this.state.balance) * penalties.negativeBalance;
    }
    if (this.state.customerSatisfaction < 50) {
      score -= (50 - this.state.customerSatisfaction) * penalties.lowSatisfaction;
    }
    if (this.state.uptime < 100) {
      score -= (100 - this.state.uptime) * penalties.downtime;
    }

    return Math.max(0, score); // Ensure non-negative score
  }

  public trackToolCall(): void {
    this.actionCounts.toolCalls++;
  }

  public trackTokenUsage(tokens: number): void {
    this.tokenCount += tokens;
  }

  private log(type: EventLog['type'], description: string, data?: any): void {
    const logEntry: EventLog = {
      timestamp: new Date().toISOString(),
      day: this.state.day,
      hour: this.state.hour,
      minute: this.state.minute,
      type,
      description,
      data
    };

    this.logs.push(logEntry);
    this.emit('log', logEntry);
  }

  private generateResult(): SimulationResult {
    if (!this.startTime || !this.endTime) {
      throw new Error('Simulation not properly completed');
    }

    const efficiency = this.state.totalCosts > 0 ? this.state.totalRevenue / this.state.totalCosts : 1;
    const score = this.getScore();
    const weights = this.scenario.scoring.weights;
    const penalties = this.scenario.scoring.penalties;

    return {
      scenario: this.scenario.name,
      agentId: this.agent.id,
      model: this.agent.model,
      startTime: this.startTime.toISOString(),
      endTime: this.endTime.toISOString(),
      duration: this.endTime.getTime() - this.startTime.getTime(),

      finalState: { ...this.state },
      score,
      breakdown: {
        balance: this.state.balance * weights.finalBalance,
        customerSatisfaction: this.state.customerSatisfaction * weights.customerSatisfaction,
        uptime: this.state.uptime * weights.uptime,
        efficiency: efficiency * weights.efficiency,
        penalties: this.calculateTotalPenalties()
      },

      actions: { ...this.actionCounts },

      performance: {
        tokensUsed: this.tokenCount,
        averageResponseTime: this.responseTimes.length > 0
          ? this.responseTimes.reduce((a, b) => a + b) / this.responseTimes.length
          : 0,
        maxResponseTime: this.responseTimes.length > 0
          ? Math.max(...this.responseTimes)
          : 0
      }
    };
  }

  private calculateTotalPenalties(): number {
    const penalties = this.scenario.scoring.penalties;
    let totalPenalties = 0;

    if (this.state.balance < 0) {
      totalPenalties += Math.abs(this.state.balance) * penalties.negativeBalance;
    }
    if (this.state.customerSatisfaction < 50) {
      totalPenalties += (50 - this.state.customerSatisfaction) * penalties.lowSatisfaction;
    }
    if (this.state.uptime < 100) {
      totalPenalties += (100 - this.state.uptime) * penalties.downtime;
    }

    return totalPenalties;
  }

  public stop(): void {
    this.isRunning = false;
    this.endTime = new Date();
    this.log('event', 'Simulation stopped');
  }

  public getLogs(): EventLog[] {
    return [...this.logs];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}