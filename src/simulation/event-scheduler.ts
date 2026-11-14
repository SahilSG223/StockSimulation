import type { MarketEvent, PublicEventInfo } from "./types.js";

/** Schedules events and resolves which are active at a given tick. */
export class EventScheduler {
  private readonly events: MarketEvent[] = [];

  schedule(event: MarketEvent): void {
    if (!Number.isInteger(event.tick) || event.tick < 0) {
      throw new Error(`event.tick must be a non-negative integer`);
    }
    if (!Number.isInteger(event.duration) || event.duration < 1) {
      throw new Error(`event.duration must be a positive integer`);
    }
    if (this.events.some((e) => e.id === event.id)) {
      throw new Error(`duplicate event id: ${event.id}`);
    }
    this.events.push(structuredClone(event));
    this.events.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
  }

  /** Events whose [tick, tick+duration) window covers `tick`. */
  activeAt(tick: number): MarketEvent[] {
    return this.events.filter((e) => tick >= e.tick && tick < e.tick + e.duration);
  }

  /** Full events (includes ground-truth effects) — evaluation / engine only. */
  all(): readonly MarketEvent[] {
    return this.events;
  }

  /** Public view for agent observations — no effect fields. */
  publicInfoAt(tick: number): PublicEventInfo[] {
    return this.activeAt(tick).map(toPublicInfo);
  }

  publicInfoAll(): PublicEventInfo[] {
    return this.events.map(toPublicInfo);
  }
}

export function toPublicInfo(event: MarketEvent): PublicEventInfo {
  const info: PublicEventInfo = {
    id: event.id,
    type: event.type,
    tick: event.tick,
    duration: event.duration,
    headline: event.publicInfo.headline,
    summary: event.publicInfo.summary,
  };
  if (event.affectedSymbols !== undefined) {
    info.affectedSymbols = event.affectedSymbols;
  }
  if (event.affectedSectors !== undefined) {
    info.affectedSectors = event.affectedSectors;
  }
  return info;
}
