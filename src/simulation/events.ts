import { SimulationEvent, SimulationState } from './types.js';

export class EventSystem {
  private events: SimulationEvent[];
  private triggeredEvents: Set<string> = new Set();
  private randomEventCounters: Map<string, number> = new Map();

  constructor(events: SimulationEvent[]) {
    this.events = [...events];
    this.validateEvents();
  }

  private validateEvents(): void {
    for (const event of this.events) {
      if (event.type === 'random' && !event.probability) {
        throw new Error(`Random event ${event.id} must have a probability`);
      }
      if (event.type === 'conditional' && !event.condition) {
        throw new Error(`Conditional event ${event.id} must have a condition`);
      }
    }
  }

  /**
   * Get all events that should trigger at the specified time
   */
  public getEventsForTime(day: number, hour: number, minute: number): SimulationEvent[] {
    const triggeredEvents: SimulationEvent[] = [];

    for (const event of this.events) {
      if (event.type === 'scheduled' && this.shouldTriggerScheduledEvent(event, day, hour, minute)) {
        triggeredEvents.push(event);
      } else if (event.type === 'random' && this.shouldTriggerRandomEvent(event)) {
        triggeredEvents.push(event);
      }
    }

    return triggeredEvents;
  }

  /**
   * Check all conditional events against current state
   */
  public checkConditionalEvents(state: SimulationState): SimulationEvent[] {
    const triggeredEvents: SimulationEvent[] = [];

    for (const event of this.events) {
      if (event.type === 'conditional' && this.shouldTriggerConditionalEvent(event, state)) {
        triggeredEvents.push(event);
        // Mark as triggered to prevent repeated execution
        this.triggeredEvents.add(event.id);
      }
    }

    return triggeredEvents;
  }

  private shouldTriggerScheduledEvent(event: SimulationEvent, day: number, hour: number, minute: number): boolean {
    // Check if already triggered (for one-time events)
    if (this.triggeredEvents.has(event.id)) {
      return false;
    }

    // Check day match (if specified)
    if (event.day !== undefined && event.day !== day) {
      return false;
    }

    // Check hour match (if specified)
    if (event.hour !== undefined && event.hour !== hour) {
      return false;
    }

    // Check minute match (if specified)
    if (event.minute !== undefined && event.minute !== minute) {
      return false;
    }

    // If we get here, all specified time components match
    this.triggeredEvents.add(event.id);
    return true;
  }

  private shouldTriggerRandomEvent(event: SimulationEvent): boolean {
    if (!event.probability) return false;

    // Track how many times we've checked this event
    const count = this.randomEventCounters.get(event.id) || 0;
    this.randomEventCounters.set(event.id, count + 1);

    // Random chance based on probability
    const shouldTrigger = Math.random() < event.probability;

    if (shouldTrigger) {
      // Some random events can trigger multiple times, others are one-time
      // For now, let's allow all random events to trigger multiple times
      // but track them for potential future filtering
      return true;
    }

    return false;
  }

  private shouldTriggerConditionalEvent(event: SimulationEvent, state: SimulationState): boolean {
    // Check if already triggered
    if (this.triggeredEvents.has(event.id)) {
      return false;
    }

    if (!event.condition) return false;

    const { stateKey, operator, value } = event.condition;
    const currentValue = this.getNestedValue(state, stateKey);

    if (currentValue === undefined) {
      return false;
    }

    switch (operator) {
      case 'gt':
        return currentValue > value;
      case 'lt':
        return currentValue < value;
      case 'eq':
        return currentValue === value;
      case 'gte':
        return currentValue >= value;
      case 'lte':
        return currentValue <= value;
      default:
        return false;
    }
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  /**
   * Reset the event system (useful for new simulations)
   */
  public reset(): void {
    this.triggeredEvents.clear();
    this.randomEventCounters.clear();
  }

  /**
   * Get statistics about event triggering
   */
  public getEventStats(): { [eventId: string]: { type: string; triggered: boolean; randomCount?: number } } {
    const stats: { [eventId: string]: { type: string; triggered: boolean; randomCount?: number } } = {};

    for (const event of this.events) {
      stats[event.id] = {
        type: event.type,
        triggered: this.triggeredEvents.has(event.id)
      };

      if (event.type === 'random') {
        stats[event.id].randomCount = this.randomEventCounters.get(event.id) || 0;
      }
    }

    return stats;
  }

  /**
   * Create a time-based event (scheduled)
   */
  public static createScheduledEvent(
    id: string,
    name: string,
    description: string,
    day: number,
    hour?: number,
    minute?: number
  ): Partial<SimulationEvent> {
    return {
      id,
      type: 'scheduled',
      name,
      description,
      day,
      hour,
      minute,
      effects: {}
    };
  }

  /**
   * Create a probability-based event (random)
   */
  public static createRandomEvent(
    id: string,
    name: string,
    description: string,
    probability: number
  ): Partial<SimulationEvent> {
    if (probability < 0 || probability > 1) {
      throw new Error('Probability must be between 0 and 1');
    }

    return {
      id,
      type: 'random',
      name,
      description,
      probability,
      effects: {}
    };
  }

  /**
   * Create a condition-based event (conditional)
   */
  public static createConditionalEvent(
    id: string,
    name: string,
    description: string,
    stateKey: string,
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte',
    value: any
  ): Partial<SimulationEvent> {
    return {
      id,
      type: 'conditional',
      name,
      description,
      condition: {
        stateKey,
        operator,
        value
      },
      effects: {}
    };
  }

  /**
   * Add effects to an event
   */
  public static addEffects(
    event: Partial<SimulationEvent>,
    effects: {
      stateChanges?: Record<string, any>;
      emailToAgent?: { from: string; subject: string; body: string };
      alert?: string;
    }
  ): SimulationEvent {
    return {
      ...event,
      effects
    } as SimulationEvent;
  }
}

/**
 * Utility class for creating common event patterns
 */
export class EventBuilder {
  /**
   * Create a market demand fluctuation event
   */
  public static createDemandFluctuation(
    id: string,
    day: number,
    multiplier: number,
    reason: string
  ): SimulationEvent {
    return {
      id,
      type: 'scheduled',
      name: 'Market Demand Change',
      description: `Demand ${multiplier > 1 ? 'increases' : 'decreases'} due to ${reason}`,
      day,
      effects: {
        stateChanges: {
          'marketConditions.demandMultiplier': multiplier
        },
        emailToAgent: {
          from: 'market-research@company.com',
          subject: 'Market Demand Alert',
          body: `Our market research indicates that demand is expected to ${multiplier > 1 ? 'increase' : 'decrease'} by ${Math.abs(multiplier - 1) * 100}% due to ${reason}.`
        }
      }
    };
  }

  /**
   * Create a supplier delay event
   */
  public static createSupplierDelay(
    id: string,
    probability: number,
    delayDays: number
  ): SimulationEvent {
    return {
      id,
      type: 'random',
      name: 'Supplier Delay',
      description: `Supplier experiences ${delayDays}-day delay`,
      probability,
      effects: {
        emailToAgent: {
          from: 'supplier@vendor.com',
          subject: 'Delivery Delay Notice',
          body: `We regret to inform you that your order will be delayed by ${delayDays} days due to unexpected logistics issues.`
        },
        alert: `Supplier delay: ${delayDays} days`
      }
    };
  }

  /**
   * Create a competitor price change event
   */
  public static createCompetitorPriceChange(
    id: string,
    day: number,
    product: string,
    newPrice: number
  ): SimulationEvent {
    return {
      id,
      type: 'scheduled',
      name: 'Competitor Price Change',
      description: `Competitor changes price of ${product} to $${newPrice}`,
      day,
      effects: {
        stateChanges: {
          [`marketConditions.competitorPrices.${product}`]: newPrice
        },
        emailToAgent: {
          from: 'intelligence@company.com',
          subject: 'Competitor Intelligence Update',
          body: `Our competitor has adjusted their pricing for ${product} to $${newPrice}. Consider reviewing our pricing strategy.`
        }
      }
    };
  }

  /**
   * Create a crisis event triggered by low customer satisfaction
   */
  public static createSatisfactionCrisis(id: string): SimulationEvent {
    return {
      id,
      type: 'conditional',
      name: 'Customer Satisfaction Crisis',
      description: 'Customer satisfaction has dropped critically low',
      condition: {
        stateKey: 'customerSatisfaction',
        operator: 'lt',
        value: 30
      },
      effects: {
        stateChanges: {
          'customerSatisfaction': 20 // Further drop due to negative publicity
        },
        emailToAgent: {
          from: 'crisis-management@company.com',
          subject: 'URGENT: Customer Satisfaction Crisis',
          body: 'Customer satisfaction has reached critical levels. Immediate action required to prevent further damage to brand reputation. Consider emergency measures to address customer concerns.'
        },
        alert: 'CRISIS: Customer satisfaction critical!'
      }
    };
  }
}