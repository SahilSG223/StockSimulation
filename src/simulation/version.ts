/**
 * Version of the market model. Experiment records store it so runs are only
 * compared against runs from the same model.
 *
 * Bump it whenever a change alters trajectories or fills for the same seed and
 * config (price formula, RNG draw order, regime/asset defaults, execution or
 * fee rules). `tests/simulation/golden-trajectory.test.ts` fails on such
 * changes; update its expected values in the same commit as the bump.
 */
export const SIMULATION_VERSION = "1.0.0";
