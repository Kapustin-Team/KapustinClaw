import { SimulationEngine } from './engine.js';

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: string;
  read: boolean;
}

interface InventoryItem {
  name: string;
  quantity: number;
  price: number;
  cost: number;
  lastRestocked: string;
}

export class SimulationTools {
  private engine: SimulationEngine;
  private enabledTools: { email: boolean; inventory: boolean; financial: boolean; webSearch: boolean; custom?: string[] };
  private knowledgeBase: { [searchTerm: string]: string[] };

  // Tool state
  private emails: Email[] = [];
  private nextEmailId = 1;

  constructor(
    engine: SimulationEngine,
    enabledTools: { email: boolean; inventory: boolean; financial: boolean; webSearch: boolean; custom?: string[] },
    knowledgeBase: { [searchTerm: string]: string[] }
  ) {
    this.engine = engine;
    this.enabledTools = enabledTools;
    this.knowledgeBase = knowledgeBase;
  }

  /**
   * Handle email operations (send, receive, list)
   */
  public async handleEmail(action: 'send' | 'receive' | 'list', params: any): Promise<any> {
    if (!this.enabledTools.email) {
      throw new Error('Email tool is not enabled for this scenario');
    }

    this.engine.trackToolCall();

    switch (action) {
      case 'send':
        return this.sendEmail(params.to, params.subject, params.body);

      case 'receive':
        return this.receiveEmails();

      case 'list':
        return this.listEmails(params.unreadOnly || false);

      default:
        throw new Error(`Unknown email action: ${action}`);
    }
  }

  /**
   * Handle inventory operations (check, restock, set_price)
   */
  public async handleInventory(action: 'check' | 'restock' | 'set_price', params: any): Promise<any> {
    if (!this.enabledTools.inventory) {
      throw new Error('Inventory tool is not enabled for this scenario');
    }

    this.engine.trackToolCall();

    switch (action) {
      case 'check':
        return this.checkInventory(params.item);

      case 'restock':
        return this.restockItem(params.item, params.quantity, params.cost);

      case 'set_price':
        return this.setPrice(params.item, params.price);

      default:
        throw new Error(`Unknown inventory action: ${action}`);
    }
  }

  /**
   * Handle financial operations (balance, transfer, pay)
   */
  public async handleFinancial(action: 'balance' | 'transfer' | 'pay', params: any): Promise<any> {
    if (!this.enabledTools.financial) {
      throw new Error('Financial tool is not enabled for this scenario');
    }

    this.engine.trackToolCall();

    switch (action) {
      case 'balance':
        return this.checkBalance();

      case 'transfer':
        return this.transferFunds(params.amount, params.to, params.description);

      case 'pay':
        return this.payBill(params.vendor, params.amount, params.description);

      default:
        throw new Error(`Unknown financial action: ${action}`);
    }
  }

  /**
   * Handle web search operations
   */
  public async handleWebSearch(query: string): Promise<string[]> {
    if (!this.enabledTools.webSearch) {
      throw new Error('Web search tool is not enabled for this scenario');
    }

    this.engine.trackToolCall();

    // Simulate search using knowledge base
    const results: string[] = [];
    const queryLower = query.toLowerCase();

    for (const [searchTerm, searchResults] of Object.entries(this.knowledgeBase)) {
      if (queryLower.includes(searchTerm.toLowerCase()) || searchTerm.toLowerCase().includes(queryLower)) {
        results.push(...searchResults);
      }
    }

    // If no specific results found, return generic results
    if (results.length === 0) {
      results.push(
        `General information about ${query}`,
        `Industry trends related to ${query}`,
        `Best practices for ${query}`
      );
    }

    return results.slice(0, 5); // Limit to top 5 results
  }

  /**
   * Deliver email to agent (called by simulation engine)
   */
  public async deliverEmailToAgent(from: string, subject: string, body: string): Promise<void> {
    const email: Email = {
      id: `email_${this.nextEmailId++}`,
      from,
      to: 'agent@company.com',
      subject,
      body,
      timestamp: new Date().toISOString(),
      read: false
    };

    this.emails.unshift(email); // Add to beginning for most recent first
  }

  // Private email methods
  private async sendEmail(to: string, subject: string, body: string): Promise<{ success: boolean; messageId: string }> {
    const email: Email = {
      id: `sent_${this.nextEmailId++}`,
      from: 'agent@company.com',
      to,
      subject,
      body,
      timestamp: new Date().toISOString(),
      read: true // Sent emails are "read" by default
    };

    this.emails.unshift(email);

    // Simulate some responses for realistic behavior
    if (to.includes('supplier')) {
      this.simulateSupplierResponse(subject, body);
    }

    return {
      success: true,
      messageId: email.id
    };
  }

  private async receiveEmails(): Promise<Email[]> {
    // Mark all emails as read when agent checks them
    for (const email of this.emails) {
      if (!email.read) {
        email.read = true;
      }
    }

    return [...this.emails];
  }

  private async listEmails(unreadOnly: boolean = false): Promise<Email[]> {
    if (unreadOnly) {
      return this.emails.filter(email => !email.read);
    }
    return [...this.emails];
  }

  private simulateSupplierResponse(originalSubject: string, originalBody: string): void {
    // Simulate delayed supplier response (not immediate)
    setTimeout(() => {
      let subject = 'Re: ' + originalSubject;
      let body = 'Thank you for your inquiry. We have received your message and will process it accordingly.';

      if (originalBody.toLowerCase().includes('order') || originalBody.toLowerCase().includes('restock')) {
        body = 'Your order has been received and is being processed. Expected delivery time is 2-3 business days.';
      } else if (originalBody.toLowerCase().includes('urgent') || originalBody.toLowerCase().includes('emergency')) {
        body = 'We understand the urgency of your request. We will prioritize this and get back to you within 24 hours.';
      }

      this.deliverEmailToAgent('supplier@vendor.com', subject, body);
    }, 2000 + Math.random() * 8000); // 2-10 second delay
  }

  // Private inventory methods
  private async checkInventory(item?: string): Promise<any> {
    const state = this.engine.getState();

    if (item) {
      const quantity = state.inventory[item] || 0;
      return {
        item,
        quantity,
        available: quantity > 0
      };
    } else {
      return {
        inventory: { ...state.inventory },
        totalItems: Object.keys(state.inventory).length,
        totalQuantity: Object.values(state.inventory).reduce((sum: number, qty: any) => sum + (typeof qty === 'number' ? qty : 0), 0)
      };
    }
  }

  private async restockItem(item: string, quantity: number, cost: number): Promise<any> {
    if (quantity <= 0 || cost <= 0) {
      throw new Error('Quantity and cost must be positive numbers');
    }

    const state = this.engine.getState();
    const totalCost = quantity * cost;

    // Check if we have enough balance
    if (state.balance < totalCost) {
      return {
        success: false,
        error: 'Insufficient balance',
        required: totalCost,
        available: state.balance
      };
    }

    // Update inventory and balance
    const currentQuantity = state.inventory[item] || 0;
    this.engine.setState(`inventory.${item}`, currentQuantity + quantity);
    this.engine.setState('balance', state.balance - totalCost);
    this.engine.setState('totalCosts', state.totalCosts + totalCost);

    return {
      success: true,
      item,
      quantityAdded: quantity,
      newQuantity: currentQuantity + quantity,
      costPerUnit: cost,
      totalCost,
      newBalance: state.balance - totalCost
    };
  }

  private async setPrice(item: string, price: number): Promise<any> {
    if (price <= 0) {
      throw new Error('Price must be a positive number');
    }

    const state = this.engine.getState();

    // Check if item exists in inventory
    if (!(item in state.inventory)) {
      return {
        success: false,
        error: 'Item not found in inventory'
      };
    }

    // Store price in custom state (prices are not part of core state)
    const prices = state.custom.prices || {};
    prices[item] = price;
    this.engine.setState('custom.prices', prices);

    // Simulate market response to pricing changes
    this.simulateMarketResponse(item, price);

    return {
      success: true,
      item,
      newPrice: price,
      message: 'Price updated successfully'
    };
  }

  private simulateMarketResponse(item: string, price: number): void {
    // Simulate customer purchases based on pricing
    setTimeout(() => {
      const state = this.engine.getState();
      const quantity = state.inventory[item] || 0;

      if (quantity > 0) {
        // Higher prices = lower demand, lower prices = higher demand
        const basedemand = 5;
        const demandMultiplier = state.marketConditions?.demandMultiplier || 1.0;
        const priceAdjustment = Math.max(0.1, 100 / price); // Inverse relationship

        const expectedSales = Math.floor(basedemand * demandMultiplier * priceAdjustment * (0.5 + Math.random()));
        const actualSales = Math.min(expectedSales, quantity);

        if (actualSales > 0) {
          const revenue = actualSales * price;

          this.engine.setState(`inventory.${item}`, quantity - actualSales);
          this.engine.setState('balance', state.balance + revenue);
          this.engine.setState('totalRevenue', state.totalRevenue + revenue);

          // Update customer satisfaction based on pricing and availability
          let satisfactionChange = 0;
          if (price < 10) {
            satisfactionChange = 2; // Customers happy with low prices
          } else if (price > 50) {
            satisfactionChange = -1; // Customers unhappy with high prices
          }

          if (satisfactionChange !== 0) {
            const newSatisfaction = Math.max(0, Math.min(100, state.customerSatisfaction + satisfactionChange));
            this.engine.setState('customerSatisfaction', newSatisfaction);
          }
        }
      }
    }, 1000 + Math.random() * 5000); // 1-6 second delay
  }

  // Private financial methods
  private async checkBalance(): Promise<{ balance: number; totalRevenue: number; totalCosts: number; netProfit: number }> {
    const state = this.engine.getState();
    return {
      balance: state.balance,
      totalRevenue: state.totalRevenue,
      totalCosts: state.totalCosts,
      netProfit: state.totalRevenue - state.totalCosts
    };
  }

  private async transferFunds(amount: number, to: string, description: string): Promise<any> {
    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    const state = this.engine.getState();

    if (state.balance < amount) {
      return {
        success: false,
        error: 'Insufficient balance',
        required: amount,
        available: state.balance
      };
    }

    // Deduct from balance
    this.engine.setState('balance', state.balance - amount);
    this.engine.setState('totalCosts', state.totalCosts + amount);

    return {
      success: true,
      amount,
      to,
      description,
      newBalance: state.balance - amount,
      transactionId: `txn_${Date.now()}`
    };
  }

  private async payBill(vendor: string, amount: number, description: string): Promise<any> {
    return this.transferFunds(amount, vendor, `Payment to ${vendor}: ${description}`);
  }
}