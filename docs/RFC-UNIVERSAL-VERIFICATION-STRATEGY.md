# RFC: Universal Task Verification Strategy System

> Status: **Proposed** | Priority: **High** | Created: 2025-12-04

## Summary

Transform agent-foreman from a code-centric testing tool into a **universal task framework** with pluggable verification strategies. This enables verification of any type of task - coding, operations, data pipelines, infrastructure, and non-technical work (marketing, content creation, etc.).

### Key Terminology Change

| Old Term | New Term | Rationale |
|----------|----------|-----------|
| `features` | `tasks` | "Feature" implies software; "Task" is universal |
| `ai/features/` | `ai/tasks/` | Directory rename |
| `feature_list.json` | `task_list.json` | File rename |
| `Feature` interface | `Task` interface | Type rename |
| `featureId` | `taskId` | Parameter rename |

This change enables agent-foreman to handle:
- Software features (coding tasks)
- Operations automation (ops tasks)
- Marketing campaigns (manual tasks)
- Data processing (data tasks)
- Infrastructure provisioning (infra tasks)

## Problem Statement

The current system has significant limitations:

### 1. Feature-Centric Naming

The current naming (`features`, `feature_list.json`, `ai/features/`) implies this tool is only for software feature development. This creates cognitive friction when using it for:
- Operations tasks (backups, deployments, monitoring)
- Marketing tasks (campaigns, content, social media)
- Data tasks (ETL, reports, analysis)
- Administrative tasks (documentation, reviews)

### 2. Testing-Centric Verification

The `testRequirements` field only supports two verification types:

```typescript
interface TestRequirements {
  unit?: { required: boolean; pattern?: string; cases?: string[]; };
  e2e?: { required: boolean; pattern?: string; tags?: string[]; };
}
```

This excludes:
- Script execution verification
- HTTP/API endpoint verification
- File output verification
- External service verification
- Manual/human verification
- Custom command verification

### 3. Code-Centric Capability Detection

The capability detection system looks for development files:
- `package.json`, `Cargo.toml`, `pom.xml`, etc.
- Assumes projects have test frameworks, linters, type checkers

This fails for:
- Operations projects with only shell scripts
- Data pipelines with Python notebooks
- Ansible/Terraform infrastructure projects
- Marketing automation tasks

### 4. No Composite Verification

Cannot combine multiple verification methods:
- "Run tests AND check API endpoint"
- "Either manual approval OR automated script passes"

## Proposed Solution

### 1. Rename Features to Tasks

Complete terminology migration throughout the codebase:

```
ai/features/           → ai/tasks/
ai/features/index.json → ai/tasks/index.json
feature_list.json      → task_list.json (legacy, still supported)
Feature interface      → Task interface
FeatureStatus          → TaskStatus
FeatureIndex           → TaskIndex
```

### 2. Pluggable Verification Strategies

Introduce `verificationStrategies` array supporting multiple verification methods per task.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Primary term | `Task` (not Feature) | Universal applicability |
| Strategy storage | `verificationStrategies[]` on Task | Multiple strategies per task |
| Backward compatibility | Runtime alias: `Feature` = `Task` | Zero breaking changes |
| Composite logic | AND/OR with nested strategies | Complex verification needs |
| Default behavior | AI verification when no strategies | Maintains current behavior |

## Technical Design

### Task Type Definitions

Rename and extend in `src/types.ts`:

```typescript
// ============================================================================
// Task Types (formerly Feature Types)
// ============================================================================

/**
 * Task status values
 * - failing: Not yet completed
 * - passing: Acceptance criteria met
 * - blocked: External dependency blocking progress
 * - needs_review: Potentially affected by recent changes
 * - deprecated: No longer needed
 */
export type TaskStatus =
  | "failing"
  | "passing"
  | "blocked"
  | "needs_review"
  | "deprecated";

/**
 * How the task was created/discovered
 */
export type TaskOrigin =
  | "init-auto"
  | "init-from-routes"
  | "init-from-tests"
  | "manual"
  | "replan";

/**
 * Task type hint for appropriate verification defaults
 */
export type TaskType = "code" | "ops" | "data" | "infra" | "manual";

/**
 * Single task entry
 * Renamed from Feature for universal applicability
 */
export interface Task {
  /** Unique identifier, e.g., "auth.login" or "ops.backup.daily" */
  id: string;
  /** Human-readable description */
  description: string;
  /** Parent module/category */
  module: string;
  /** Priority (1 = highest) */
  priority: number;
  /** Current status */
  status: TaskStatus;
  /** List of acceptance criteria */
  acceptance: string[];
  /** Task IDs this task depends on */
  dependsOn: string[];
  /** Task IDs this task replaces */
  supersedes: string[];
  /** Categorization tags */
  tags: string[];
  /** Increments when description changes */
  version: number;
  /** How this task was created */
  origin: TaskOrigin;
  /** Additional context or notes */
  notes: string;
  /** Last verification result */
  verification?: TaskVerificationSummary;

  /**
   * Task type hint for appropriate verification defaults
   * - code: Software development tasks (default for backward compat)
   * - ops: Operations/automation tasks
   * - data: Data processing/pipeline tasks
   * - infra: Infrastructure/DevOps tasks
   * - manual: Tasks requiring human action
   */
  taskType?: TaskType;

  /**
   * Verification strategies for this task
   * When defined, replaces testRequirements and AI default
   */
  verificationStrategies?: VerificationStrategy[];

  // Legacy fields (backward compatibility)
  /** @deprecated Use verificationStrategies */
  testRequirements?: TestRequirements;
  /** E2E test tags (legacy, use verificationStrategies) */
  e2eTags?: string[];
  /** Test files (legacy) */
  testFiles?: string[];
  /** TDD guidance cache (legacy) */
  tddGuidance?: CachedTDDGuidance;
}

// Backward compatibility alias
export type Feature = Task;
export type FeatureStatus = TaskStatus;
export type FeatureOrigin = TaskOrigin;
```

### Verification Strategy Types

Add to `src/verification-types.ts`:

```typescript
// ============================================================================
// Verification Strategy Types
// ============================================================================

export type VerificationStrategyType =
  | "test"      // Unit/integration tests
  | "e2e"       // End-to-end tests
  | "script"    // Custom shell script
  | "http"      // HTTP endpoint verification
  | "file"      // File existence/content
  | "command"   // Command execution
  | "manual"    // Human review
  | "ai"        // AI-powered verification
  | "composite"; // Combination of strategies

export interface BaseVerificationStrategy {
  type: VerificationStrategyType;
  description?: string;
  required: boolean;
  timeout?: number;      // ms, default: 60000
  retries?: number;      // default: 0
  env?: Record<string, string>;
}

// Test verification (backward compat with testRequirements.unit)
export interface TestVerificationStrategy extends BaseVerificationStrategy {
  type: "test";
  pattern?: string;
  framework?: string;
  cases?: string[];
  tags?: string[];
}

// E2E verification (backward compat with testRequirements.e2e)
export interface E2EVerificationStrategy extends BaseVerificationStrategy {
  type: "e2e";
  pattern?: string;
  framework?: string;
  tags?: string[];
  scenarios?: string[];
}

// Script verification
export interface ScriptVerificationStrategy extends BaseVerificationStrategy {
  type: "script";
  script: string;              // Path to script
  args?: string[];
  expectedExitCode?: number;   // default: 0
  outputPattern?: string;      // Regex for stdout
}

// HTTP verification
export interface HttpVerificationStrategy extends BaseVerificationStrategy {
  type: "http";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  url: string;                 // Supports ${ENV_VAR}
  expectedStatus: number | number[];
  headers?: Record<string, string>;
  body?: string | Record<string, unknown>;
  responsePattern?: string;
  jsonAssertions?: Array<{ path: string; expected: unknown; }>;
}

// File verification
export interface FileVerificationStrategy extends BaseVerificationStrategy {
  type: "file";
  paths: string[];
  checks: Array<{
    type: "exists" | "not-exists" | "contains" | "matches" | "size" | "permissions";
    value?: string | number;
  }>;
}

// Command verification
export interface CommandVerificationStrategy extends BaseVerificationStrategy {
  type: "command";
  command: string;
  cwd?: string;
  expectedExitCode?: number | number[];
  stdoutPattern?: string;
  stderrPattern?: string;
  notPatterns?: string[];
}

// Manual verification
export interface ManualVerificationStrategy extends BaseVerificationStrategy {
  type: "manual";
  instructions: string;
  checklist?: string[];
  assignee?: string;
}

// AI verification
export interface AIVerificationStrategy extends BaseVerificationStrategy {
  type: "ai";
  mode?: "diff" | "autonomous";
  customPrompt?: string;
  minConfidence?: number;
}

// Composite verification (AND/OR logic)
export interface CompositeVerificationStrategy extends BaseVerificationStrategy {
  type: "composite";
  logic: "and" | "or";
  strategies: VerificationStrategy[];
}

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

### Directory Structure Migration

```
Before:                          After:
ai/                              ai/
├── features/                    ├── tasks/              (renamed)
│   ├── index.json              │   ├── index.json
│   ├── auth/                   │   ├── auth/           (code tasks)
│   │   └── login.md            │   │   └── login.md
│   └── chat/                   │   ├── ops/            (ops tasks)
│       └── message.edit.md     │   │   └── backup.daily.md
├── feature_list.json (legacy)  │   ├── marketing/      (manual tasks)
└── progress.log                │   │   └── twitter.campaign.md
                                │   └── data/           (data tasks)
                                │       └── etl.customers.md
                                ├── task_list.json      (legacy alias)
                                ├── feature_list.json   (legacy, auto-migrated)
                                └── progress.log
```

### Strategy Resolution Logic

```typescript
export function getVerificationStrategies(task: Task): VerificationStrategy[] {
  // 1. Explicit strategies
  if (task.verificationStrategies?.length > 0) {
    return task.verificationStrategies;
  }

  // 2. Convert legacy testRequirements
  if (task.testRequirements) {
    return convertTestRequirementsToStrategies(task.testRequirements);
  }

  // 3. TaskType defaults
  if (task.taskType) {
    return getDefaultStrategiesForTaskType(task.taskType);
  }

  // 4. Default to AI
  return [{ type: "ai", required: true, mode: "autonomous" }];
}

function getDefaultStrategiesForTaskType(taskType: TaskType): VerificationStrategy[] {
  switch (taskType) {
    case "code":
      return [
        { type: "test", required: false },
        { type: "ai", required: true, mode: "autonomous" }
      ];
    case "ops":
      return [
        { type: "script", required: false, script: "./verify.sh" },
        { type: "ai", required: true }
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
  }
}
```

## Implementation Plan

### Phase 1: Type System Rename + Extension

**Files:**
- `src/types.ts` - Rename Feature → Task, add aliases
- `src/verification-types.ts` - Add strategy type definitions

**Changes:**
- Add `Task` interface (copy of Feature with new fields)
- Add `TaskStatus`, `TaskOrigin`, `TaskType`
- Export `Feature` as alias: `export type Feature = Task`
- Add `verificationStrategies` and `taskType` fields

### Phase 2: Storage Layer Migration

**Files:**
- `src/feature-storage.ts` → `src/task-storage.ts`
- `src/feature-list.ts` → `src/task-list.ts`

**Changes:**
- Support both `ai/features/` and `ai/tasks/` directories
- Auto-migrate `ai/features/` to `ai/tasks/` on first access
- Support `feature_list.json` and `task_list.json` (legacy)

### Phase 3: Strategy Executor Framework

**New files:**
- `src/strategy-executor.ts` - Executor framework
- `src/strategies/index.ts` - Registry
- `src/strategies/*.ts` - Individual executors

### Phase 4: Verifier Integration

**File:** `src/verifier.ts`

**Changes:**
- Integrate strategy executor framework
- Add `getVerificationStrategies()`
- Support composite AND/OR logic

### Phase 5: CLI Updates

**File:** `src/index.ts`

**Changes:**
- Update help text (feature → task)
- Add `--task-type` flag for init
- Update progress log format

### Phase 6: Documentation

**Files:**
- `CLAUDE.md` - Update terminology
- `README.md` - Update examples
- `docs/USAGE.md` - Update guides

## Example Configurations

### 1. Code Task (Software Feature)

```yaml
---
id: auth.login
module: auth
taskType: code
priority: 1
status: failing
---
# User Authentication Login

## Acceptance Criteria

1. User can login with email/password
2. Invalid credentials show error
3. Session persists across refreshes
```

### 2. Ops Task (Database Backup)

```yaml
---
id: ops.backup.daily
module: ops
taskType: ops
priority: 1
status: failing
verificationStrategies:
  - type: composite
    logic: and
    required: true
    strategies:
      - type: script
        script: "./scripts/verify-backup.sh"
        timeout: 300000
      - type: file
        paths: ["/backups/db-*.sql.gz"]
        checks:
          - type: exists
          - type: size
            value: 1000000
---
# Daily Database Backup

## Acceptance Criteria

1. Backup file created in /backups/
2. Backup file > 1MB (not empty)
3. Backup can be restored successfully
```

### 3. Marketing Task (Twitter Campaign)

```yaml
---
id: marketing.twitter.product_launch
module: marketing
taskType: manual
priority: 2
status: failing
verificationStrategies:
  - type: manual
    required: true
    instructions: |
      Verify the product launch tweet:
      1. Posted to @company account
      2. Includes product image
      3. Has correct hashtags
      4. Link works with UTM tracking
    checklist:
      - "Tweet is live"
      - "Image displays correctly"
      - "#ProductLaunch #2025 hashtags present"
      - "UTM link tracks correctly"
    assignee: "marketing-team"
---
# Product Launch Twitter Campaign

## Acceptance Criteria

1. Tweet posted at scheduled time
2. Engagement > 100 interactions in 24h
3. Link click-through rate > 2%
```

### 4. Data Task (ETL Pipeline)

```yaml
---
id: data.etl.customer_sync
module: data
taskType: data
priority: 1
status: failing
verificationStrategies:
  - type: composite
    logic: and
    required: true
    strategies:
      - type: command
        command: "python -m pytest tests/etl/ -v"
      - type: file
        paths: ["output/customers_*.csv"]
        checks:
          - type: exists
          - type: contains
            value: "customer_id,name,email"
---
# Customer Data ETL Sync

## Acceptance Criteria

1. All customer records synced from source
2. Output CSV has correct schema
3. No duplicate records
4. Sync completes in < 30 minutes
```

### 5. Infrastructure Task (Terraform)

```yaml
---
id: infra.aws.vpc_setup
module: infra
taskType: infra
priority: 1
status: failing
verificationStrategies:
  - type: composite
    logic: and
    required: true
    strategies:
      - type: command
        command: "terraform validate"
        cwd: "infrastructure/aws"
      - type: command
        command: "terraform plan -detailed-exitcode"
        cwd: "infrastructure/aws"
        expectedExitCode: [0, 2]
---
# AWS VPC Infrastructure Setup

## Acceptance Criteria

1. VPC created with correct CIDR
2. Public/private subnets configured
3. NAT Gateway operational
4. Security groups properly configured
```

### 6. Backend API Task

```yaml
---
id: api.users.create
module: api
taskType: code
priority: 1
status: failing
verificationStrategies:
  - type: composite
    logic: and
    required: true
    strategies:
      - type: test
        pattern: "tests/api/users/**/*.test.ts"
      - type: http
        method: POST
        url: "http://localhost:3000/api/users"
        body:
          name: "Test User"
          email: "test@example.com"
        expectedStatus: 201
        jsonAssertions:
          - path: "$.id"
            expected: { "type": "string" }
---
# Create User API Endpoint

## Acceptance Criteria

1. POST /api/users creates user
2. Returns 201 with user object
3. Validates required fields
4. Handles duplicate email gracefully
```

## Migration Strategy

### Automatic Backward Compatibility

1. **Type aliases**: `Feature = Task`, `FeatureStatus = TaskStatus`
2. **Directory support**: Both `ai/features/` and `ai/tasks/` work
3. **File support**: Both `feature_list.json` and `task_list.json` work
4. **testRequirements**: Auto-converted to verificationStrategies at runtime

### Migration Command

```bash
# Preview migration
agent-foreman migrate --dry-run

# Execute migration
agent-foreman migrate

# Force re-migration
agent-foreman migrate --force
```

### CLI Aliases

```bash
# These all work:
agent-foreman next              # Next task
agent-foreman done <taskId>     # Complete task
agent-foreman done <featureId>  # Still works (alias)
```

## Security Considerations

### 1. Command Injection Prevention

```typescript
function sanitizeCommand(command: string, cwd: string): string {
  // Validate no shell metacharacters escape
  // Block dangerous patterns (rm -rf, etc.)
}
```

### 2. Path Traversal Prevention

```typescript
function validateFilePaths(paths: string[], cwd: string): boolean {
  return paths.every(p => isPathWithinRoot(p, cwd));
}
```

### 3. HTTP SSRF Prevention

```typescript
function validateUrl(url: string): boolean {
  // Only allow localhost or configured hosts
  const allowedHosts = ["localhost", "127.0.0.1", ...config.allowedHosts];
}
```

### 4. Environment Variable Safety

```typescript
const SENSITIVE_PATTERNS = [/password/i, /secret/i, /token/i, /key/i, /api_key/i];
// Redact in logs, never expose
```

## Testing Strategy

### Unit Tests
- Each strategy executor
- Composite AND/OR logic
- testRequirements conversion
- Task/Feature type compatibility

### Integration Tests
- Full verification flow
- Directory migration
- CLI commands with new terminology

### E2E Tests
- `agent-foreman done` with all strategy types
- Manual verification prompt flow

## Future Considerations

1. **Task templates** - Predefined task types with verification presets
2. **Task workflows** - Multi-stage tasks with dependencies
3. **Approval chains** - Multi-person manual verification
4. **Webhooks** - Wait for external callback
5. **Database verification** - Direct SQL assertions
6. **Cloud resource checks** - AWS/GCP/Azure state verification
7. **Custom strategy plugins** - User-defined executors

---

*This RFC documents a proposed enhancement to transform agent-foreman into a universal task framework.*
