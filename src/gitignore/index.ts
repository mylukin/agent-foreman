/**
 * Gitignore generation module for agent-foreman
 *
 * Provides automatic .gitignore generation using:
 * - GitHub's official gitignore templates
 * - Local bundled templates for offline access
 * - Config file and language detection
 *
 * @module gitignore
 */

// Bundled templates (offline access)
export {
  BUNDLED_TEMPLATES,
  type BundledTemplateName,
  isBundledTemplate,
  getBundledTemplate,
  getBundledTemplateAsync,
  getAllBundledTemplates,
  verifyBundledTemplates,
} from "./bundled-templates.js";

// GitHub API client (with caching)
export {
  type FetchResult,
  getCacheDir,
  fetchGitignoreTemplate,
  listGitignoreTemplates,
  clearCache,
  getCacheTTL,
} from "./github-api.js";

// Main generator
export {
  type GitignoreResult,
  type GeneratorOptions,
  CONFIG_TO_TEMPLATE,
  LANGUAGE_TO_TEMPLATE,
  MINIMAL_GITIGNORE,
  getTemplate,
  detectTemplatesFromConfigFiles,
  detectTemplatesFromLanguages,
  generateGitignoreContent,
  generateGitignore,
  ensureMinimalGitignore,
  ensureComprehensiveGitignore,
} from "./generator.js";
