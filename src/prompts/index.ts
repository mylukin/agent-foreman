/**
 * Prompt Templates Module
 * Re-exports all prompt generation functions
 */

// Harness documentation prompts (minimal - rules are in .claude/rules/)
export { generateMinimalClaudeMd, generateMinimalAgentsMd } from "./harness.js";

// Git-related prompts
export { generateCommitMessage } from "./git.js";

// Guidance prompts
export {
  generateFeatureGuidance,
  generateImpactGuidance,
  generateSessionSummary,
} from "./guidance.js";
