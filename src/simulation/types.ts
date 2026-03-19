export interface SimulationState {
  // Core state
  balance: number;
  inventory: Record<string, number>;
  day: number;
  hour: number;
  minute: number;

  // Market conditions
  marketConditions: {
    demandMultiplier: number;
    competitorPrices: Record<string, number>;
    weatherImpact: number;
  };

  // Performance metrics
  customerSatisfaction: number;
  totalRevenue: number;
  totalCosts: number;
  uptime: number; // percentage

  // Custom state per scenario
  custom: Record<string, any>;
}

export interface SimulationEvent {
  id: string;
  type: 'scheduled' | 'random' | 'conditional';
  name: string;
  description: string;

  // Timing
  day?: number;
  hour?: number;
  minute?: number;
  probability?: number; // for random events (0-1)

  // Conditions (for conditional events)
  condition?: {
    stateKey: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    value: any;
  };

  // Effects
  effects: {
    stateChanges?: Record<string, any>;
    emailToAgent?: {
      from: string;
      subject: string;
      body: string;
    };
    alert?: string;
  };
}

export interface ScenarioConfig {
  name: string;
  description: string;
  duration: {
    days: number;
    hoursPerDay?: number; // default 24
  };

  initialState: Partial<SimulationState>;

  events: SimulationEvent[];

  // Scoring configuration
  scoring: {
    weights: {
      finalBalance: number;
      customerSatisfaction: number;
      uptime: number;
      efficiency: number; // revenue/costs ratio
    };
    penalties: {
      negativeBalance: number;
      lowSatisfaction: number; // penalty if < threshold
      downtime: number; // penalty per % downtime
    };
  };

  // Tool configuration for this scenario
  tools: {
    email: boolean;
    inventory: boolean;
    financial: boolean;
    webSearch: boolean;
    custom?: string[]; // custom tool names
  };

  // Knowledge base for web search
  knowledgeBase?: {
    [searchTerm: string]: string[];
  };
}

export interface SimulationResult {
  scenario: string;
  agentId: string;
  model: string;
  startTime: string;
  endTime: string;
  duration: number; // real milliseconds

  finalState: SimulationState;
  score: number;
  breakdown: {
    balance: number;
    customerSatisfaction: number;
    uptime: number;
    efficiency: number;
    penalties: number;
  };

  // Action tracking
  actions: {
    toolCalls: number;
    decisions: number;
    errors: number;
  };

  // Performance metrics
  performance: {
    tokensUsed: number;
    averageResponseTime: number;
    maxResponseTime: number;
  };
}

export interface AgentInterface {
  id: string;
  model: string;

  // Core methods the simulation calls
  processEvent(event: string, context: any): Promise<string>;
  getState(): Promise<any>;

  // Tool implementations
  tools: {
    email: (action: 'send' | 'receive' | 'list', params: any) => Promise<any>;
    inventory: (action: 'check' | 'restock' | 'set_price', params: any) => Promise<any>;
    financial: (action: 'balance' | 'transfer' | 'pay', params: any) => Promise<any>;
    web_search: (query: string) => Promise<string[]>;
  };
}

export interface EventLog {
  timestamp: string;
  day: number;
  hour: number;
  minute: number;
  type: 'event' | 'agent_action' | 'state_change' | 'error';
  description: string;
  data?: any;
}