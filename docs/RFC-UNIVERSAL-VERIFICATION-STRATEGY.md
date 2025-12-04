# RFC: Universal Verification Strategy System

> Status: **Proposed** | Priority: **High** | Created: 2025-12-04

## Summary

Transform agent-foreman from a code-centric testing tool into a **universal task framework** with pluggable verification strategies. This enables verification of any type of task - coding, operations, data pipelines, infrastructure, and non-technical work (marketing, content creation, etc.).

## Problem Statement

The current verification system has significant limitations:

### 1. Testing-Centric Design

The `testRequirements` field only supports two verification types:

```typescript
interface TestRequirements {
  unit?: { required: boolean; pattern?: string; cases?: string[]; };
  e2e?: { required: boolean; pattern?: string; tags?: string[]; };
}
```

This excludes:
- API endpoint verification (curl/httpie checks)
- Database state verification (SQL queries)
- File output verification (check generated files)
- External service verification (did the tweet post?)
- Manual verification (human review required)
- Custom script verification (shell scripts)

### 2. Code-Centric Capability Detection

The capability detection system looks for development files:
- `package.json`, `Cargo.toml`, `pom.xml`, etc.
- Assumes projects have test frameworks, linters, type checkers

This fails for:
- Operations projects with only shell scripts
- Data pipelines with Python notebooks
- Ansible/Terraform infrastructure projects
- Marketing automation tasks

### 3. Verification Assumes Code Changes

The diff-based verification expects git changes:
- Operations tasks may not change code at all
- May execute external actions (post to social media, run migrations)
- Need verification of **outcomes**, not code

### 4. No Composite Verification

Cannot combine multiple verification methods:
- "Run tests AND check API endpoint"
- "Either manual approval OR automated script passes"

## Proposed Solution

Introduce a **pluggable verification strategy system** that supports multiple verification methods per feature while maintaining full backward compatibility.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Strategy storage | `verificationStrategies[]` array on Feature | Multiple strategies per feature, explicit ordering |
| Backward compatibility | Runtime auto-conversion of `testRequirements` | Zero migration required for existing projects |
| Default behavior | AI verification when no strategies defined | Maintains current behavior for existing features |
| Composite logic | AND/OR with nested strategies | Supports complex verification requirements |
| Execution model | Sequential with early-exit on failure (AND) | Predictable, debuggable behavior |

## Technical Design

### New Type Definitions

Add to `src/verification-types.ts`:

```typescript
// ============================================================================
// Verification Strategy Types
// ============================================================================

/**
 * Verification strategy type identifiers
 */
export type VerificationStrategyType =
  | "test"      // Unit/integration tests (existing behavior)
  | "e2e"       // End-to-end tests (existing behavior)
  | "script"    // Custom shell script verification
  | "http"      // HTTP endpoint verification
  | "file"      // File existence/content verification
  | "command"   // Command execution with expected output
  | "manual"    // Human review required
  | "ai"        // AI-powered verification
  | "composite"; // Combination of multiple strategies

/**
 * Base interface for all verification strategies
 */
export interface BaseVerificationStrategy {
  /** Strategy type discriminator */
  type: VerificationStrategyType;
  /** Human-readable description */
  description?: string;
  /** Whether this strategy must pass for verification to succeed */
  required: boolean;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Retry count on failure (default: 0) */
  retries?: number;
  /** Environment variables for execution */
  env?: Record<string, string>;
}

/**
 * Test-based verification
 * Backward compatible with testRequirements.unit
 */
export interface TestVerificationStrategy extends BaseVerificationStrategy {
  type: "test";
  /** Glob pattern for test files */
  pattern?: string;
  /** Test framework (auto-detected if not specified) */
  framework?: string;
  /** Expected test case names */
  cases?: string[];
  /** Tags for filtering */
  tags?: string[];
}

/**
 * E2E test verification
 * Backward compatible with testRequirements.e2e
 */
export interface E2EVerificationStrategy extends BaseVerificationStrategy {
  type: "e2e";
  /** Glob pattern for E2E test files */
  pattern?: string;
  /** E2E framework (playwright, cypress, puppeteer) */
  framework?: string;
  /** Tags for filtering (@smoke, @auth, etc.) */
  tags?: string[];
  /** Expected scenario names */
  scenarios?: string[];
}

/**
 * Custom script verification
 * For shell scripts that verify task completion
 */
export interface ScriptVerificationStrategy extends BaseVerificationStrategy {
  type: "script";
  /** Path to script (relative to project root) */
  script: string;
  /** Arguments to pass to script */
  args?: string[];
  /** Expected exit code (default: 0) */
  expectedExitCode?: number;
  /** Regex pattern that stdout must match */
  outputPattern?: string;
}

/**
 * HTTP endpoint verification
 * For API health checks and response validation
 */
export interface HttpVerificationStrategy extends BaseVerificationStrategy {
  type: "http";
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  /** URL (supports ${ENV_VAR} substitution) */
  url: string;
  /** Expected HTTP status code(s) */
  expectedStatus: number | number[];
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT/PATCH) */
  body?: string | Record<string, unknown>;
  /** Regex pattern for response body */
  responsePattern?: string;
  /** JSON path assertions for response */
  jsonAssertions?: Array<{
    path: string;
    expected: unknown;
  }>;
}

/**
 * File verification
 * For checking generated files, outputs, artifacts
 */
export interface FileVerificationStrategy extends BaseVerificationStrategy {
  type: "file";
  /** File paths to check (glob patterns supported) */
  paths: string[];
  /** Checks to perform on each file */
  checks: Array<{
    type: "exists" | "not-exists" | "contains" | "matches" | "size" | "permissions";
    value?: string | number;
  }>;
}

/**
 * Command verification
 * For arbitrary command execution with output validation
 */
export interface CommandVerificationStrategy extends BaseVerificationStrategy {
  type: "command";
  /** Command to execute */
  command: string;
  /** Working directory (default: project root) */
  cwd?: string;
  /** Expected exit code (default: 0) */
  expectedExitCode?: number | number[];
  /** Regex pattern for stdout */
  stdoutPattern?: string;
  /** Regex pattern for stderr */
  stderrPattern?: string;
  /** Patterns that should NOT appear in output (fail if found) */
  notPatterns?: string[];
}

/**
 * Manual verification
 * For human review with guided checklist
 */
export interface ManualVerificationStrategy extends BaseVerificationStrategy {
  type: "manual";
  /** Instructions for the reviewer */
  instructions: string;
  /** Checklist items to verify */
  checklist?: string[];
  /** Assigned reviewer (optional) */
  assignee?: string;
}

/**
 * AI-powered verification
 * Uses AI to analyze artifacts and determine completion
 */
export interface AIVerificationStrategy extends BaseVerificationStrategy {
  type: "ai";
  /** AI verification mode */
  mode?: "diff" | "autonomous";
  /** Custom prompt for AI analysis */
  customPrompt?: string;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
}

/**
 * Composite verification
 * Combines multiple strategies with AND/OR logic
 */
export interface CompositeVerificationStrategy extends BaseVerificationStrategy {
  type: "composite";
  /** Logical operator for combining results */
  logic: "and" | "or";
  /** Child strategies to execute */
  strategies: VerificationStrategy[];
}

/**
 * Union type of all verification strategies
 */
export type VerificationStrategy =
  | TestVerificationStrategy
  | E2EVerificationStrategy
  | ScriptVerificationStrategy
  | HttpVerificationStrategy
  | FileVerificationStrategy
  | CommandVerificationStrategy
  | ManualVerificationStrategy
  | AIVerificationStrategy
  | CompositeVerificationStrategy;
```

### Feature Interface Extension

Add to `src/types.ts`:

```typescript
/**
 * Task type hint for appropriate verification defaults
 */
export type TaskType = "code" | "ops" | "data" | "infra" | "manual";

export interface Feature {
  // ... existing fields ...

  /**
   * DEPRECATED: Use verificationStrategies instead
   * Kept for backward compatibility - auto-converted at runtime
   */
  testRequirements?: TestRequirements;

  /**
   * Verification strategies for this feature (NEW)
   * When defined, replaces testRequirements and AI default
   */
  verificationStrategies?: VerificationStrategy[];

  /**
   * Task type hint for appropriate verification defaults
   */
  taskType?: TaskType;
}
```

### Strategy Executor Framework

New file `src/strategy-executor.ts`:

```typescript
export interface StrategyExecutionResult {
  /** Strategy that was executed */
  strategy: VerificationStrategy;
  /** Whether execution succeeded */
  success: boolean;
  /** Command/script output */
  output?: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Strategy-specific details */
  details?: Record<string, unknown>;
}

export interface ExecutionContext {
  /** Project root directory */
  cwd: string;
  /** Feature being verified */
  feature: Feature;
  /** Detected project capabilities */
  capabilities: ExtendedCapabilities;
  /** Verbose output mode */
  verbose?: boolean;
}

export interface StrategyExecutor<T extends VerificationStrategy> {
  /** Execute the verification strategy */
  execute(strategy: T, context: ExecutionContext): Promise<StrategyExecutionResult>;
  /** Validate strategy configuration */
  validate(strategy: T): { valid: boolean; errors: string[] };
}

export class StrategyExecutorRegistry {
  private executors = new Map<VerificationStrategyType, StrategyExecutor<any>>();

  register<T extends VerificationStrategy>(
    type: T["type"],
    executor: StrategyExecutor<T>
  ): void {
    this.executors.set(type, executor);
  }

  async execute(
    strategy: VerificationStrategy,
    context: ExecutionContext
  ): Promise<StrategyExecutionResult> {
    const executor = this.executors.get(strategy.type);
    if (!executor) {
      throw new Error(`No executor registered for strategy type: ${strategy.type}`);
    }
    return executor.execute(strategy, context);
  }
}
```

### Strategy Resolution Logic

Add to `src/verifier.ts`:

```typescript
/**
 * Determine verification strategies for a feature
 * Priority:
 * 1. feature.verificationStrategies (if defined)
 * 2. Convert feature.testRequirements (if defined) - BACKWARD COMPAT
 * 3. Default based on feature.taskType
 * 4. AI verification (ultimate fallback)
 */
export function getVerificationStrategies(feature: Feature): VerificationStrategy[] {
  // 1. Use explicit strategies if defined
  if (feature.verificationStrategies?.length > 0) {
    return feature.verificationStrategies;
  }

  // 2. Convert legacy testRequirements (full backward compatibility)
  if (feature.testRequirements) {
    return convertTestRequirementsToStrategies(feature.testRequirements);
  }

  // 3. Use taskType defaults
  if (feature.taskType) {
    return getDefaultStrategiesForTaskType(feature.taskType);
  }

  // 4. Default to AI verification
  return [{ type: "ai", required: true, mode: "autonomous" }];
}

function convertTestRequirementsToStrategies(
  requirements: TestRequirements
): VerificationStrategy[] {
  const strategies: VerificationStrategy[] = [];

  if (requirements.unit) {
    strategies.push({
      type: "test",
      required: requirements.unit.required,
      pattern: requirements.unit.pattern,
      cases: requirements.unit.cases,
    });
  }

  if (requirements.e2e) {
    strategies.push({
      type: "e2e",
      required: requirements.e2e.required,
      pattern: requirements.e2e.pattern,
      tags: requirements.e2e.tags,
      scenarios: requirements.e2e.scenarios,
    });
  }

  return strategies;
}

function getDefaultStrategiesForTaskType(
  taskType: TaskType
): VerificationStrategy[] {
  switch (taskType) {
    case "code":
      return [
        { type: "test", required: false },
        { type: "ai", required: true, mode: "autonomous" }
      ];
    case "ops":
      return [
        { type: "script", required: false, script: "./verify.sh" },
        { type: "ai", required: true, mode: "autonomous" }
      ];
    case "data":
      return [
        { type: "file", required: false, paths: [], checks: [] },
        { type: "ai", required: true }
      ];
    case "infra":
      return [
        { type: "command", required: false, command: "terraform validate" },
        { type: "ai", required: true }
      ];
    case "manual":
      return [{ type: "manual", required: true, instructions: "" }];
    default:
      return [{ type: "ai", required: true }];
  }
}
```

## Implementation Plan

### Phase 1: Type System Extension

**Files:**
- `src/verification-types.ts` - Add all strategy type definitions
- `src/types.ts` - Add `verificationStrategies`, `taskType` to Feature

**Estimated changes:** ~300 lines

### Phase 2: Strategy Executor Framework

**Files:**
- `src/strategy-executor.ts` (NEW) - Executor framework and registry

**Estimated changes:** ~150 lines

### Phase 3: Individual Strategy Executors

**New directory: `src/strategies/`**

| File | Priority | Description |
|------|----------|-------------|
| `index.ts` | High | Registry and exports |
| `test-executor.ts` | High | Unit test (refactor existing) |
| `e2e-executor.ts` | High | E2E test (refactor existing) |
| `script-executor.ts` | High | Custom shell scripts |
| `command-executor.ts` | High | Command with expected output |
| `ai-executor.ts` | High | AI verification (refactor existing) |
| `http-executor.ts` | High | HTTP endpoint verification |
| `manual-executor.ts` | High | Manual checklist prompts |
| `file-executor.ts` | Medium | File existence/content checks |
| `composite-executor.ts` | High | AND/OR composite logic |

**Estimated changes:** ~800 lines total

### Phase 4: Verifier Integration

**Files:**
- `src/verifier.ts` - Integrate strategy executor framework

**Estimated changes:** ~200 lines

### Phase 5: Schema Updates

**Files:**
- `src/schema.ts` - Add JSON Schema for new fields

**Estimated changes:** ~150 lines

### Phase 6: Feature Storage Updates

**Files:**
- `src/feature-storage.ts` - Serialize/parse strategies in YAML frontmatter

**Estimated changes:** ~50 lines

## Example Configurations

### 1. Frontend Coding (Unchanged - Backward Compatible)

Existing `testRequirements` continues to work:

```yaml
id: auth.login
testRequirements:
  unit:
    required: true
    pattern: "tests/auth/**/*.test.ts"
  e2e:
    required: false
    tags: ["@auth"]
```

### 2. Backend API Development

```yaml
id: api.users.create
taskType: code
verificationStrategies:
  - type: composite
    logic: and
    required: true
    strategies:
      - type: test
        required: true
        pattern: "tests/api/users/**/*.test.ts"
      - type: http
        required: true
        method: POST
        url: "http://localhost:3000/api/users"
        body:
          name: "Test User"
          email: "test@example.com"
        expectedStatus: 201
        jsonAssertions:
          - path: "$.id"
            expected: { "type": "string" }
```

### 3. Operations Task (Database Backup)

```yaml
id: ops.backup_database
taskType: ops
verificationStrategies:
  - type: composite
    logic: and
    required: true
    strategies:
      - type: script
        required: true
        script: "./scripts/verify-backup.sh"
        timeout: 300000
      - type: file
        required: true
        paths: ["/backups/db-*.sql.gz"]
        checks:
          - type: exists
          - type: size
            value: 1000000
```

### 4. Marketing Task (Social Media Post)

```yaml
id: marketing.twitter_campaign
taskType: manual
verificationStrategies:
  - type: manual
    required: true
    instructions: |
      Verify the following for the Twitter campaign:
      1. Tweet was posted to @company account
      2. Image/media is correctly attached
      3. All hashtags are present and correct
      4. Link is working and tracking correctly
    checklist:
      - "Tweet is live on @company account"
      - "Image displays correctly"
      - "Hashtags: #launch #product #2025"
      - "UTM tracking link works"
    assignee: "marketing-team"
```

### 5. Data Pipeline Task

```yaml
id: data.etl.customer_sync
taskType: data
verificationStrategies:
  - type: composite
    logic: and
    required: true
    strategies:
      - type: command
        required: true
        command: "python -m pytest tests/etl/ -v"
      - type: file
        required: true
        paths: ["output/customers_*.csv"]
        checks:
          - type: exists
          - type: contains
            value: "customer_id,name,email"
```

### 6. Infrastructure Task (Terraform)

```yaml
id: infra.aws.vpc_setup
taskType: infra
verificationStrategies:
  - type: composite
    logic: and
    required: true
    strategies:
      - type: command
        required: true
        command: "terraform validate"
        cwd: "infrastructure/aws"
      - type: command
        required: true
        command: "terraform plan -detailed-exitcode"
        cwd: "infrastructure/aws"
        expectedExitCode: [0, 2]
      - type: command
        required: false
        command: "tflint"
        cwd: "infrastructure/aws"
```

## Security Considerations

### 1. Command Injection Prevention

All command strings must be sanitized before execution:

```typescript
// Use existing isPathWithinRoot() pattern
function sanitizeCommand(command: string, cwd: string): string {
  // Validate command doesn't escape project root
  // Escape shell metacharacters
  // Block dangerous patterns
}
```

### 2. Path Traversal Prevention

File paths in `FileVerificationStrategy` must be validated:

```typescript
// Validate all paths stay within project root
function validateFilePaths(paths: string[], cwd: string): boolean {
  return paths.every(p => isPathWithinRoot(p, cwd));
}
```

### 3. HTTP SSRF Prevention

URL validation for `HttpVerificationStrategy`:

```typescript
// Only allow localhost/internal URLs or explicit allowlist
function validateUrl(url: string, allowedHosts: string[]): boolean {
  const parsed = new URL(url);
  return allowedHosts.includes(parsed.hostname);
}
```

### 4. Environment Variable Safety

Never log sensitive environment variables:

```typescript
const SENSITIVE_PATTERNS = [/password/i, /secret/i, /token/i, /key/i];

function redactSensitiveEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([k, v]) =>
      SENSITIVE_PATTERNS.some(p => p.test(k)) ? [k, "***REDACTED***"] : [k, v]
    )
  );
}
```

## Testing Strategy

### Unit Tests

1. **Strategy executors**: Each executor tested in isolation with mocked dependencies
2. **Composite logic**: AND/OR combinations with various success/failure patterns
3. **Backward compatibility**: `testRequirements` to `verificationStrategies` conversion

### Integration Tests

1. **Full verification flow**: Feature with multiple strategies
2. **Timeout handling**: Strategies that exceed timeout
3. **Retry logic**: Failed strategies with retry configuration

### E2E Tests

1. **CLI integration**: `agent-foreman done` with new strategy types
2. **Manual verification**: Interactive prompt flow (skip in CI)

## Migration Path

### Automatic Backward Compatibility

1. **Existing `testRequirements`** - Automatically converted to `verificationStrategies` via `convertTestRequirementsToStrategies()` at runtime
2. **No `testRequirements` or `verificationStrategies`** - Defaults to AI verification (current behavior)
3. **Existing TDD mode features** - Continue to work because conversion preserves `required: true`

### No Breaking Changes

The implementation ensures:
- Existing features with `testRequirements` continue to work unchanged
- Existing `e2eTags` field continues to work
- `determineVerificationMode()` continues to work for legacy features
- All existing CLI commands work without modification

## Future Considerations

1. **Database verification strategy** - Direct SQL query assertions
2. **Cloud resource verification** - AWS/GCP/Azure resource state checks
3. **Webhook verification** - Wait for webhook callback
4. **Approval workflow** - Multi-person approval chains
5. **Custom strategy plugins** - User-defined strategy types
6. **Strategy templates** - Reusable strategy configurations

---

*This RFC documents a proposed enhancement to agent-foreman for universal task verification.*
