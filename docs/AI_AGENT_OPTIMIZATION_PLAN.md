# AI Agent Call Optimization Plan

## Summary

Optimize AI agent invocations in agent-foreman by merging redundant calls and parallelizing independent operations.

> 通过合并冗余调用和并行化独立操作来优化 agent-foreman 中的 AI agent 调用。

---

## Current State: 11 AI Agent Calls

| Location | Function | Purpose |
|----------|----------|---------|
| `init-helpers.ts:293` | `callAnyAvailableAgent()` | Merge init.sh |
| `init-helpers.ts:364` | `callAnyAvailableAgent()` | Merge CLAUDE.md |
| `ai-scanner.ts:199` | `aiScanProject()` | Full codebase scan |
| `ai-scanner.ts:285` | `generateFeaturesFromSurvey()` | Features from ARCHITECTURE.md |
| `ai-scanner.ts:377` | `generateFeaturesFromGoal()` | Features for empty project |
| `verifier.ts:585` | `analyzeWithAI()` | Verify feature completion |
| `verifier.ts:1153` | `verifyFeatureAutonomous()` | Autonomous verification |
| `tdd-ai-generator.ts:175` | `generateTDDGuidanceWithAI()` | TDD test guidance |
| `project-capabilities.ts:547` | `detectCapabilitiesWithAI()` | Detect test/lint/build commands |

---

## Optimization 1: Merge init.sh + CLAUDE.md AI Calls (HIGH IMPACT)

### Problem

Two sequential AI calls in `generateHarnessFiles()` for related merge operations:
- Line 293: Merge init.sh script
- Line 364: Merge CLAUDE.md

> 问题：在 `generateHarnessFiles()` 中为相关合并操作进行了两次顺序 AI 调用。

### Solution

Combine into single prompt returning JSON with both outputs.

### Files to Modify

1. **`src/init-helpers.ts`**
   - Add `buildCombinedMergePrompt()` function
   - Add `parseCombinedMergeResponse()` function
   - Refactor `generateHarnessFiles()` to use combined call
   - Keep individual merges as fallback

2. **`src/timeout-config.ts`**
   - Add `AI_MERGE_COMBINED: 360000` (6 minutes)

### Implementation Details

```typescript
// New function: buildCombinedMergePrompt()
function buildCombinedMergePrompt(
  existingInitScript: string,
  newInitScript: string,
  existingClaudeMd: string,
  harnessSection: string
): string {
  return `You are merging two pairs of files. Return a JSON object with both merged outputs.

## Task 1: Merge ai/init.sh
### Existing ai/init.sh (USER'S VERSION - PRESERVE CUSTOMIZATIONS):
\`\`\`bash
${existingInitScript}
\`\`\`

### New template ai/init.sh:
\`\`\`bash
${newInitScript}
\`\`\`

Merge Rules for init.sh:
1. PRESERVE all user customizations in existing functions
2. ADD new functions from the template that don't exist
3. ADD new case statements for new functions
4. PRESERVE user's custom commands
5. UPDATE help text to include all commands

## Task 2: Merge CLAUDE.md
### Existing CLAUDE.md:
\`\`\`markdown
${existingClaudeMd}
\`\`\`

### New harness section to add:
\`\`\`markdown
${harnessSection}
\`\`\`

Merge Rules for CLAUDE.md:
1. If "Long-Task Harness" section exists, replace it with new section
2. If not, append at the END of the file
3. PRESERVE all existing non-harness content

## Output Format
Return ONLY a JSON object (no markdown code blocks):

{
  "initScript": "<merged bash script starting with #!/usr/bin/env bash>",
  "claudeMd": "<complete merged CLAUDE.md content>"
}`;
}

// New function: parseCombinedMergeResponse()
function parseCombinedMergeResponse(response: string): {
  initScript: string | null;
  claudeMd: string | null;
} {
  try {
    let jsonStr = response.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    const parsed = JSON.parse(jsonStr);

    return {
      initScript: parsed.initScript && parsed.initScript.startsWith("#!/")
        ? parsed.initScript
        : null,
      claudeMd: parsed.claudeMd || null,
    };
  } catch {
    return { initScript: null, claudeMd: null };
  }
}
```

### Expected Impact

- **AI calls reduced**: 2 calls → 1 call in merge mode
- **Time saved**: ~500ms-2s (subprocess spawn overhead)

---

## Optimization 2: Parallel Automated Checks (MEDIUM IMPACT)

### Problem

`runAutomatedChecks()` in `verifier.ts` (lines 408-425) runs checks sequentially:
```typescript
for (let i = 0; i < checks.length; i++) {
  const result = await runCheckWithEnv(cwd, check.type, check.command, ciEnv);
  results.push(result);
}
```

Example timing:
- Tests: 30s
- Typecheck: 10s
- Lint: 5s
- Build: 20s
- **Total sequential: 65s** vs **~35s parallel**

> 问题：`runAutomatedChecks()` 按顺序运行 test→typecheck→lint→build。

### Solution

Run independent checks in parallel with `Promise.allSettled()`.

### Files to Modify

1. **`src/verifier.ts`**
   - Add `runChecksInParallel()` function
   - Add `parallel?: boolean` option to `AutomatedCheckOptions`
   - E2E runs after unit tests pass (conditional)

### Implementation Details

```typescript
// New interface option
export interface AutomatedCheckOptions {
  // ... existing options ...
  /** Run checks in parallel (default: false for backward compatibility) */
  parallel?: boolean;
}

// New function: runChecksInParallel()
async function runChecksInParallel(
  cwd: string,
  checks: Array<{ type: AutomatedCheckResult["type"]; command: string; name: string }>,
  env: Record<string, string> = {}
): Promise<AutomatedCheckResult[]> {
  // Separate E2E from other checks (E2E should run after unit tests pass)
  const unitChecks = checks.filter(c => c.type !== "e2e");
  const e2eChecks = checks.filter(c => c.type === "e2e");

  // Run unit, typecheck, lint, build in parallel
  const parallelPromises = unitChecks.map(check =>
    runCheckWithEnv(cwd, check.type, check.command, env)
  );

  const parallelResults = await Promise.allSettled(parallelPromises);

  const results: AutomatedCheckResult[] = parallelResults.map((result, idx) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      type: unitChecks[idx].type,
      success: false,
      output: `Check failed: ${result.reason}`,
      duration: 0,
    };
  });

  // Only run E2E if unit tests passed
  const unitTestResult = results.find(r => r.type === "test");
  if (e2eChecks.length > 0 && (!unitTestResult || unitTestResult.success)) {
    for (const e2eCheck of e2eChecks) {
      const e2eResult = await runCheckWithEnv(cwd, e2eCheck.type, e2eCheck.command, env);
      results.push(e2eResult);
    }
  }

  return results;
}
```

### Expected Impact

- **Time saved**: 30-50% reduction in verification time
- **Backward compatible**: Parallel mode is opt-in

---

## Optimization 3: Parallel Context Gathering (MEDIUM IMPACT)

### Problem

Sequential I/O operations in `verifyFeature()`:
1. `getGitDiffForFeature()` - Get git diff
2. `detectCapabilities()` - Load/detect project capabilities
3. `readRelatedFiles()` - Read changed source files

> 问题：`verifyFeature()` 中的顺序 I/O 操作。

### Solution

Parallelize independent read operations using `Promise.all()`.

### Files to Modify

1. **`src/verifier.ts`**
   - Parallelize `getGitDiffForFeature()` + `detectCapabilities()`
   - Parallelize file reads in `readRelatedFiles()`

### Implementation Details

```typescript
// In verifyFeature() - parallelize initial context gathering
const [gitInfo, capabilities] = await Promise.all([
  getGitDiffForFeature(cwd),
  skipChecks ? Promise.resolve(null) : detectCapabilities(cwd, { verbose })
]);

const { diff, files: changedFiles, commitHash } = gitInfo;

// In readRelatedFiles() - parallelize file reads
export async function readRelatedFiles(
  cwd: string,
  changedFiles: string[]
): Promise<Map<string, string>> {
  const sourceFiles = changedFiles.filter(f =>
    /\.(ts|tsx|js|jsx|py|go|rs)$/.test(f)
  );

  // Parallel file reads
  const fileContents = await Promise.all(
    sourceFiles.map(async file => {
      if (!isPathWithinRoot(cwd, file)) return { file, content: null };
      const content = await safeReadFile(cwd, file);
      return { file, content };
    })
  );

  const relatedFiles = new Map<string, string>();
  for (const { file, content } of fileContents) {
    if (content !== null) {
      relatedFiles.set(file, content);
    }
  }

  return relatedFiles;
}
```

### Expected Impact

- **Time saved**: 200-500ms per verification
- **Better resource utilization**: Concurrent I/O operations

---

## Optimization 4: Memory Cache for Capabilities (LOW IMPACT)

### Problem

Repeated disk reads for cached capabilities in same session.

### Solution

Add in-memory cache layer in `detectCapabilities()`.

### Files to Modify

1. **`src/project-capabilities.ts`**
   - Add module-level memory cache
   - Check memory cache before disk cache

### Implementation Details

```typescript
// Module-level memory cache
let memoryCache: {
  cwd: string;
  capabilities: ExtendedCapabilities;
  timestamp: number;
} | null = null;

const MEMORY_CACHE_TTL = 60000; // 1 minute

export async function detectCapabilities(
  cwd: string,
  options: DetectCapabilitiesOptions = {}
): Promise<ExtendedCapabilities> {
  const { force = false, verbose = false } = options;

  // Check memory cache first (faster than disk)
  if (!force && memoryCache?.cwd === cwd) {
    const age = Date.now() - memoryCache.timestamp;
    if (age < MEMORY_CACHE_TTL) {
      if (verbose) {
        console.log(chalk.gray("   Using memory-cached capabilities"));
      }
      return memoryCache.capabilities;
    }
  }

  // ... existing disk cache and detection logic ...

  // Update memory cache
  memoryCache = {
    cwd,
    capabilities,
    timestamp: Date.now()
  };

  return capabilities;
}

// Export function to clear cache (useful for testing)
export function clearCapabilitiesCache(): void {
  memoryCache = null;
}
```

### Expected Impact

- **Time saved**: Avoids repeated disk reads in same session
- **Minimal overhead**: Simple object lookup

---

## Implementation Order

| Step | Optimization | Files | Priority |
|------|--------------|-------|----------|
| 1 | Merge init.sh + CLAUDE.md calls | `init-helpers.ts`, `timeout-config.ts` | HIGH |
| 2 | Parallel automated checks | `verifier.ts` | MEDIUM |
| 3 | Parallel context gathering | `verifier.ts` | MEDIUM |
| 4 | Memory cache for capabilities | `project-capabilities.ts` | LOW |

---

## Expected Results Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| AI calls in init merge | 2 | 1 | 50% reduction |
| Verification time (example) | 65s | ~40s | ~38% faster |
| Context gathering | Sequential | Parallel | 200-500ms saved |
| Capability lookups | Disk every time | Memory cached | ~10-50ms saved |

---

## Testing Strategy

1. **Unit Tests**
   - Test `parseCombinedMergeResponse()` with valid/invalid JSON
   - Test `runChecksInParallel()` with various check combinations
   - Test memory cache TTL behavior

2. **Integration Tests**
   - Verify combined merge produces valid init.sh and CLAUDE.md
   - Verify parallel checks produce same results as sequential
   - Verify fallback to individual merges when combined fails

3. **Performance Tests**
   - Measure before/after timing for `agent-foreman init --mode merge`
   - Measure before/after timing for `agent-foreman done`

---

## Rollback Plan

All optimizations are designed with backward compatibility:

1. **Optimization 1**: Falls back to individual merges if combined fails
2. **Optimization 2**: `parallel: false` by default
3. **Optimization 3**: Pure refactoring, same behavior
4. **Optimization 4**: Memory cache has TTL, falls back to disk

---

## Critical Files Reference

| File | Purpose | Changes |
|------|---------|---------|
| `src/init-helpers.ts` | Init workflow | Add combined merge logic |
| `src/verifier.ts` | Feature verification | Add parallel checks + context |
| `src/timeout-config.ts` | Timeout settings | Add `AI_MERGE_COMBINED` |
| `src/project-capabilities.ts` | Capability detection | Add memory cache |

---

*Generated by agent-foreman optimization analysis*
