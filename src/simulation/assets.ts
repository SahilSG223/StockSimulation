import type { AssetParams } from "./types.js";

/** Default hackathon universe: a handful of symbols across sectors. */
export const DEFAULT_ASSETS: readonly AssetParams[] = [
  {
    symbol: "TECH",
    name: "Aether Software",
    sector: "Technology",
    initialPrice: 100,
    mu: 0.0002,
    beta: 1.1,
    vol: 0.012,
    eventExposure: 1.0,
  },
  {
    symbol: "SEMI",
    name: "Lattice Silicon",
    sector: "Semiconductors",
    initialPrice: 80,
    mu: 0.00025,
    beta: 1.4,
    vol: 0.018,
    eventExposure: 1.3,
  },
  {
    symbol: "ENRG",
    name: "Northwind Energy",
    sector: "Energy",
    initialPrice: 60,
    mu: 0.0001,
    beta: 0.7,
    vol: 0.015,
    eventExposure: 0.9,
  },
  {
    symbol: "BANK",
    name: "Harbor Financial",
    sector: "Financials",
    initialPrice: 50,
    mu: 0.00015,
    beta: 1.0,
    vol: 0.01,
    eventExposure: 0.8,
  },
  {
    symbol: "CONS",
    name: "Everyday Goods Co",
    sector: "Consumer",
    initialPrice: 40,
    mu: 0.00012,
    beta: 0.6,
    vol: 0.008,
    eventExposure: 0.7,
  },
] as const;

export function assetsBySymbol(assets: readonly AssetParams[]): ReadonlyMap<string, AssetParams> {
  return new Map(assets.map((a) => [a.symbol, a]));
}
