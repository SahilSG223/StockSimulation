/** Closed sets and domain types for the deterministic simulation engine. */

export const SECTORS = [
  "Technology",
  "Semiconductors",
  "Energy",
  "Financials",
  "Consumer",
] as const;
export type Sector = (typeof SECTORS)[number];

export const REGIME_IDS = ["bull", "bear", "high_vol", "low_vol"] as const;
export type RegimeId = (typeof REGIME_IDS)[number];

export const ORDER_SIDES = ["buy", "sell"] as const;
export type OrderSide = (typeof ORDER_SIDES)[number];

/** Per-asset generation parameters. */
export interface AssetParams {
  symbol: string;
  name: string;
  sector: Sector;
  initialPrice: number;
  /** Idiosyncratic drift (per tick). */
  mu: number;
  /** Sensitivity to market factor return. */
  beta: number;
  /** Idiosyncratic volatility (std of ε). */
  vol: number;
  /** Multiplier on event shocks targeting this asset/sector. */
  eventExposure: number;
}

/** How a named regime remaps market-factor and asset generation. */
export interface RegimeParams {
  id: RegimeId;
  /** Market-factor drift. */
  marketMu: number;
  /** Market-factor volatility. */
  marketVol: number;
  /** Scales each asset's idiosyncratic μ. */
  driftMultiplier: number;
  /** Scales each asset's idiosyncratic vol. */
  volMultiplier: number;
}

/**
 * Scheduled market shock. Agents may only see `publicInfo`;
 * `effect` is ground truth for the simulator.
 */
export interface MarketEvent {
  id: string;
  type: string;
  /** Tick at which the event becomes active. */
  tick: number;
  /** Number of ticks the effect remains active (including start tick). */
  duration: number;
  affectedSymbols?: readonly string[];
  affectedSectors?: readonly Sector[];
  publicInfo: {
    headline: string;
    summary: string;
  };
  effect: {
    /** Additive shock to affected asset returns each active tick. */
    returnShock: number;
    /** Multiplies idiosyncratic vol while active. */
    volMultiplier: number;
    /** Additive bias to idiosyncratic drift while active. */
    driftBias: number;
  };
}

/** Public slice of an event (what agents should observe). */
export interface PublicEventInfo {
  id: string;
  type: string;
  tick: number;
  duration: number;
  affectedSymbols?: readonly string[];
  affectedSectors?: readonly Sector[];
  headline: string;
  summary: string;
}

export interface Order {
  agentId: string;
  symbol: string;
  side: OrderSide;
  /** Strictly positive share count. */
  quantity: number;
}

export type RejectReason =
  | "unknown_agent"
  | "unknown_symbol"
  | "invalid_quantity"
  | "insufficient_cash"
  | "insufficient_shares"
  | "position_limit";

export type ExecutionResult =
  | {
      status: "filled";
      order: Order;
      fillPrice: number;
      notional: number;
      fee: number;
      tick: number;
    }
  | {
      status: "rejected";
      order: Order;
      reason: RejectReason;
      tick: number;
    };

export interface Position {
  symbol: string;
  quantity: number;
  /** Volume-weighted average cost of the open position. */
  avgCost: number;
}

export interface PortfolioState {
  agentId: string;
  cash: number;
  positions: ReadonlyMap<string, Position>;
  realizedPnl: number;
}

export interface PortfolioSnapshot {
  agentId: string;
  cash: number;
  positions: readonly Position[];
  realizedPnl: number;
  unrealizedPnl: number;
  equity: number;
}

export interface PriceSnapshot {
  tick: number;
  prices: Readonly<Record<string, number>>;
  marketReturn: number;
  regime: RegimeId;
}

export interface SimulationConfig {
  seed: number;
  assets: readonly AssetParams[];
  /** Starting cash for newly registered agents. */
  initialCash: number;
  /** Proportional transaction cost on notional (e.g. 0.001 = 10 bps). */
  transactionCostRate: number;
  /** Max absolute shares per symbol per agent; omit for unlimited. */
  maxPositionSize?: number;
  initialRegime?: RegimeId;
}
