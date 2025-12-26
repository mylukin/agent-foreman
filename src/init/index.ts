/**
 * Helper functions for the init command
 * Extracted from runInit to improve maintainability
 */

// Types
export type { AnalysisResult } from "./types.js";

// Project analysis
export { detectAndAnalyzeProject } from "./project-analysis.js";

// Feature merge
export { mergeOrCreateFeatures } from "./feature-merge.js";

// Harness files - main orchestrator and atomic functions
export {
  generateHarnessFiles,
  generateCapabilities,
  generateGitignore,
  generateInitScript,
  generateRules,
  generateProgressLog,
  showGitSuggestion,
  type InitContext,
} from "./harness-files.js";

// Individual merge helpers (for direct use if needed)
export { generateOrMergeInitScript } from "./init-script-merge.js";

// Rules module (new modular approach)
export {
  copyRulesToProject,
  hasRulesInstalled,
  RULE_TEMPLATES,
  type RuleTemplateName,
  type CopyRulesOptions,
  type CopyRulesResult,
} from "../rules/index.js";
