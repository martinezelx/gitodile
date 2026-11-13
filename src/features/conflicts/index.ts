export * from "./domain";
export type { ConflictsPort, ConflictsQuery, ConflictSideDiffQuery } from "./port";
export { conflictsPort } from "./tauriAdapter";
export { createConflictsController, type ConflictsController, type ConflictsState } from "./controller";
export { useConflictsState } from "./hooks";
export { ConflictsScreen, conflictsScreenModule } from "./screen";
