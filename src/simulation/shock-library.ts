import type { MarketEvent } from "./types.js";

/**
 * Ready-made market shocks for scenarios. Edit the table to retune a shock;
 * add an entry to create a new one. Each preset is a MarketEvent minus its
 * id and start tick, which {@link createShock} fills in.
 *
 * Effect fields apply every tick the shock is active and are scaled per asset
 * by `eventExposure` (e.g. SEMI 1.3×):
 * - returnShock: added to the asset's return (-0.02 = -2% per tick)
 * - volMultiplier: multiplies the asset's own volatility
 * - driftBias: added to the asset's drift
 *
 * Omitting both affectedSectors and affectedSymbols hits the whole market.
 * Agents see `type`, `publicInfo`, affected sectors, start tick and duration;
 * `effect` stays ground truth.
 */
export const SHOCK_PRESETS = {
  market_crash: {
    type: "market_crash",
    duration: 3,
    publicInfo: {
      headline: "Markets plunge in broad sell-off",
      summary: "Heavy selling across every sector as investors rush to cash.",
    },
    effect: { returnShock: -0.04, volMultiplier: 2.5, driftBias: -0.002 },
  },
  rate_hike: {
    type: "rate_hike",
    duration: 3,
    affectedSectors: ["Technology", "Semiconductors", "Consumer"],
    publicInfo: {
      headline: "Central bank raises interest rates",
      summary: "Policy rate up 50bps; growth and consumer names under pressure.",
    },
    effect: { returnShock: -0.01, volMultiplier: 1.3, driftBias: -0.0005 },
  },
  chip_export_ban: {
    type: "chip_export_ban",
    duration: 5,
    affectedSectors: ["Semiconductors"],
    publicInfo: {
      headline: "Government restricts chip exports",
      summary: "New export controls cut off key overseas customers for chipmakers.",
    },
    effect: { returnShock: -0.025, volMultiplier: 1.6, driftBias: -0.001 },
  },
  ai_demand_spike: {
    type: "ai_demand_spike",
    duration: 8,
    affectedSectors: ["Technology", "Semiconductors"],
    publicInfo: {
      headline: "AI infrastructure demand spikes",
      summary: "Unexpected surge in orders for AI chips and cloud capacity.",
    },
    effect: { returnShock: 0.02, volMultiplier: 1.4, driftBias: 0.001 },
  },
  oil_supply_shock: {
    type: "oil_supply_shock",
    duration: 4,
    affectedSectors: ["Energy"],
    publicInfo: {
      headline: "Major oil supply disruption",
      summary: "Pipeline outage tightens supply; energy prices jump.",
    },
    effect: { returnShock: 0.025, volMultiplier: 1.5, driftBias: 0.001 },
  },
  supply_chain_disruption: {
    type: "supply_chain_disruption",
    duration: 6,
    affectedSectors: ["Consumer", "Technology"],
    publicInfo: {
      headline: "Global shipping delays worsen",
      summary: "Port congestion delays goods and components; margins expected to fall.",
    },
    effect: { returnShock: -0.012, volMultiplier: 1.3, driftBias: -0.0005 },
  },
} as const satisfies Record<string, Omit<MarketEvent, "id" | "tick">>;

export type ShockPresetId = keyof typeof SHOCK_PRESETS;

/**
 * Build a schedulable event from a preset. The id is `<preset>-t<tick>`, so the
 * same shock can be scheduled at several ticks in one run.
 */
export function createShock(
  preset: ShockPresetId,
  options: { tick: number; duration?: number },
): MarketEvent {
  // Clone so callers can't mutate the shared preset table.
  const base: Omit<MarketEvent, "id" | "tick"> = structuredClone(SHOCK_PRESETS[preset]);
  return {
    ...base,
    id: `${preset}-t${options.tick}`,
    tick: options.tick,
    duration: options.duration ?? base.duration,
  };
}
