import fs from 'fs';
import path from 'path';
import { ScenarioConfig, SimulationEvent } from './types.js';

export class ScenarioLoader {
  /**
   * Load a scenario from a JSON file
   */
  public static async loadFromFile(scenarioPath: string): Promise<ScenarioConfig> {
    try {
      const absolutePath = path.resolve(scenarioPath);
      const content = await fs.promises.readFile(absolutePath, 'utf-8');
      const scenario = JSON.parse(content) as ScenarioConfig;

      this.validateScenario(scenario);
      return this.processScenario(scenario);
    } catch (error: any) {
      throw new Error(`Failed to load scenario from ${scenarioPath}: ${error.message}`);
    }
  }

  /**
   * Load multiple scenarios from a directory
   */
  public static async loadFromDirectory(scenariosDir: string): Promise<ScenarioConfig[]> {
    try {
      const absolutePath = path.resolve(scenariosDir);
      const files = await fs.promises.readdir(absolutePath);
      const scenarioFiles = files.filter(file => file.endsWith('.json'));

      const scenarios: ScenarioConfig[] = [];
      for (const file of scenarioFiles) {
        const filePath = path.join(absolutePath, file);
        try {
          const scenario = await this.loadFromFile(filePath);
          scenarios.push(scenario);
        } catch (error: any) {
          console.warn(`Warning: Failed to load scenario ${file}: ${error.message}`);
        }
      }

      return scenarios;
    } catch (error: any) {
      throw new Error(`Failed to load scenarios from directory ${scenariosDir}: ${error.message}`);
    }
  }

  /**
   * Save a scenario to a JSON file
   */
  public static async saveToFile(scenario: ScenarioConfig, outputPath: string): Promise<void> {
    try {
      this.validateScenario(scenario);
      const absolutePath = path.resolve(outputPath);
      const dir = path.dirname(absolutePath);

      // Ensure directory exists
      await fs.promises.mkdir(dir, { recursive: true });

      const content = JSON.stringify(scenario, null, 2);
      await fs.promises.writeFile(absolutePath, content, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to save scenario to ${outputPath}: ${error.message}`);
    }
  }

  /**
   * Validate scenario structure and constraints
   */
  private static validateScenario(scenario: any): void {
    if (!scenario || typeof scenario !== 'object') {
      throw new Error('Scenario must be an object');
    }

    // Required fields
    const requiredFields = ['name', 'description', 'duration', 'initialState', 'events', 'scoring', 'tools'];
    for (const field of requiredFields) {
      if (!(field in scenario)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate name and description
    if (typeof scenario.name !== 'string' || scenario.name.trim().length === 0) {
      throw new Error('Scenario name must be a non-empty string');
    }
    if (typeof scenario.description !== 'string') {
      throw new Error('Scenario description must be a string');
    }

    // Validate duration
    if (!scenario.duration || typeof scenario.duration !== 'object') {
      throw new Error('Duration must be an object');
    }
    if (typeof scenario.duration.days !== 'number' || scenario.duration.days <= 0) {
      throw new Error('Duration.days must be a positive number');
    }
    if (scenario.duration.hoursPerDay && (typeof scenario.duration.hoursPerDay !== 'number' || scenario.duration.hoursPerDay <= 0 || scenario.duration.hoursPerDay > 24)) {
      throw new Error('Duration.hoursPerDay must be a positive number <= 24');
    }

    // Validate initial state
    if (!scenario.initialState || typeof scenario.initialState !== 'object') {
      throw new Error('InitialState must be an object');
    }

    // Validate events
    if (!Array.isArray(scenario.events)) {
      throw new Error('Events must be an array');
    }
    for (let i = 0; i < scenario.events.length; i++) {
      this.validateEvent(scenario.events[i], i);
    }

    // Validate scoring
    this.validateScoring(scenario.scoring);

    // Validate tools
    this.validateTools(scenario.tools);
  }

  private static validateEvent(event: any, index: number): void {
    if (!event || typeof event !== 'object') {
      throw new Error(`Event at index ${index} must be an object`);
    }

    const requiredFields = ['id', 'type', 'name', 'description', 'effects'];
    for (const field of requiredFields) {
      if (!(field in event)) {
        throw new Error(`Event at index ${index} missing required field: ${field}`);
      }
    }

    if (typeof event.id !== 'string' || event.id.trim().length === 0) {
      throw new Error(`Event at index ${index}: id must be a non-empty string`);
    }

    if (!['scheduled', 'random', 'conditional'].includes(event.type)) {
      throw new Error(`Event at index ${index}: type must be 'scheduled', 'random', or 'conditional'`);
    }

    if (typeof event.name !== 'string' || event.name.trim().length === 0) {
      throw new Error(`Event at index ${index}: name must be a non-empty string`);
    }

    if (typeof event.description !== 'string') {
      throw new Error(`Event at index ${index}: description must be a string`);
    }

    // Type-specific validations
    if (event.type === 'scheduled') {
      if (event.day !== undefined && (typeof event.day !== 'number' || event.day <= 0)) {
        throw new Error(`Event at index ${index}: scheduled event day must be a positive number`);
      }
      if (event.hour !== undefined && (typeof event.hour !== 'number' || event.hour < 0 || event.hour >= 24)) {
        throw new Error(`Event at index ${index}: scheduled event hour must be 0-23`);
      }
      if (event.minute !== undefined && (typeof event.minute !== 'number' || event.minute < 0 || event.minute >= 60)) {
        throw new Error(`Event at index ${index}: scheduled event minute must be 0-59`);
      }
    }

    if (event.type === 'random') {
      if (typeof event.probability !== 'number' || event.probability < 0 || event.probability > 1) {
        throw new Error(`Event at index ${index}: random event probability must be between 0 and 1`);
      }
    }

    if (event.type === 'conditional' && !event.condition) {
      throw new Error(`Event at index ${index}: conditional event must have a condition`);
    }

    // Validate effects
    if (!event.effects || typeof event.effects !== 'object') {
      throw new Error(`Event at index ${index}: effects must be an object`);
    }
  }

  private static validateScoring(scoring: any): void {
    if (!scoring || typeof scoring !== 'object') {
      throw new Error('Scoring must be an object');
    }

    if (!scoring.weights || typeof scoring.weights !== 'object') {
      throw new Error('Scoring.weights must be an object');
    }

    const requiredWeights = ['finalBalance', 'customerSatisfaction', 'uptime', 'efficiency'];
    for (const weight of requiredWeights) {
      if (typeof scoring.weights[weight] !== 'number') {
        throw new Error(`Scoring.weights.${weight} must be a number`);
      }
    }

    if (!scoring.penalties || typeof scoring.penalties !== 'object') {
      throw new Error('Scoring.penalties must be an object');
    }

    const requiredPenalties = ['negativeBalance', 'lowSatisfaction', 'downtime'];
    for (const penalty of requiredPenalties) {
      if (typeof scoring.penalties[penalty] !== 'number' || scoring.penalties[penalty] < 0) {
        throw new Error(`Scoring.penalties.${penalty} must be a non-negative number`);
      }
    }
  }

  private static validateTools(tools: any): void {
    if (!tools || typeof tools !== 'object') {
      throw new Error('Tools must be an object');
    }

    const booleanTools = ['email', 'inventory', 'financial', 'webSearch'];
    for (const tool of booleanTools) {
      if (typeof tools[tool] !== 'boolean') {
        throw new Error(`Tools.${tool} must be a boolean`);
      }
    }

    if (tools.custom && !Array.isArray(tools.custom)) {
      throw new Error('Tools.custom must be an array');
    }
  }

  /**
   * Process and normalize scenario data
   */
  private static processScenario(scenario: ScenarioConfig): ScenarioConfig {
    // Ensure unique event IDs
    const eventIds = new Set<string>();
    for (const event of scenario.events) {
      if (eventIds.has(event.id)) {
        throw new Error(`Duplicate event ID: ${event.id}`);
      }
      eventIds.add(event.id);
    }

    // Set defaults
    if (!scenario.duration.hoursPerDay) {
      scenario.duration.hoursPerDay = 24;
    }

    // Sort events by priority (scheduled first, then random, then conditional)
    scenario.events.sort((a, b) => {
      const priority = { scheduled: 1, random: 2, conditional: 3 };
      return priority[a.type] - priority[b.type];
    });

    return scenario;
  }

  /**
   * Create a scenario template with sensible defaults
   */
  public static createTemplate(name: string, description: string): ScenarioConfig {
    return {
      name,
      description,
      duration: {
        days: 30,
        hoursPerDay: 24
      },
      initialState: {
        balance: 10000,
        inventory: {},
        customerSatisfaction: 100,
        totalRevenue: 0,
        totalCosts: 0,
        uptime: 100,
        custom: {}
      },
      events: [],
      scoring: {
        weights: {
          finalBalance: 0.3,
          customerSatisfaction: 0.25,
          uptime: 0.2,
          efficiency: 0.25
        },
        penalties: {
          negativeBalance: 2.0,
          lowSatisfaction: 10.0,
          downtime: 5.0
        }
      },
      tools: {
        email: true,
        inventory: true,
        financial: true,
        webSearch: true
      }
    };
  }
}