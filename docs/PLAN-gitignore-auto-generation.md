# Plan: Automatic .gitignore Generation for agent-foreman

## Problem

When `agent-foreman init` creates a new Git repository in a non-git directory, no `.gitignore` file is created. This leads to:
1. Accidentally committing large/irrelevant files (`node_modules`, `dist`, etc.)
2. Committing sensitive credentials (`.env`, `*.pem`)
3. Bloating the repository with build artifacts

> 当 `agent-foreman init` 在非 git 目录中创建新的 Git 仓库时，不会创建 `.gitignore` 文件。这会导致意外提交大文件、敏感凭证等。

---

## Solution Overview

Two-phase protection approach:
1. **Immediate protection**: Minimal `.gitignore` created directly in `gitInit()`
2. **Comprehensive protection**: Full `.gitignore` generated in `generateHarnessFiles()` with language-specific patterns

> 双重保护：git init 时创建最小 .gitignore，初始化完成时生成完整的语言特定 .gitignore

---

## Implementation Steps

### Step 1: Create `src/gitignore-generator.ts`

New module with:
- `generateGitignoreContent(options)` - Generate content based on detected languages
- `ensureGitignore(cwd, capabilities)` - Create file if not exists
- `getMissingEssentialPatterns(cwd, capabilities)` - Check existing file for missing patterns
- `appendMissingPatterns(cwd, capabilities)` - Auto-append missing patterns to existing file

Template sections:
| Section | Languages | Key Patterns |
|---------|-----------|--------------|
| Base | All | `.DS_Store`, `.env`, `*.log`, IDE files, `ai/capabilities.json` |
| Node.js | JS/TS | `node_modules/`, `dist/`, `.next/`, `coverage/` |
| Python | Python | `__pycache__/`, `.venv/`, `.pytest_cache/` |
| Go | Go | `*.exe`, `vendor/`, `go.work` |
| Rust | Rust | `/target/`, `Cargo.lock` |
| Java | Java/Kotlin | `*.class`, `build/`, `.gradle/` |

### Step 2: Modify `src/git-utils.ts`

Add minimal `.gitignore` creation in `gitInit()`:
```typescript
// After successful git init, create minimal .gitignore if none exists
const gitignorePath = path.join(cwd, ".gitignore");
if (!existsSync(gitignorePath)) {
  writeFileSync(gitignorePath, MINIMAL_GITIGNORE);
}
```

### Step 3: Modify `src/init-helpers.ts`

Add to `generateHarnessFiles()` after capabilities detection:
```typescript
// Step 6b: Ensure .gitignore exists with appropriate patterns
const gitignoreResult = await ensureGitignore(cwd, capabilities);
if (gitignoreResult.created) {
  console.log(chalk.green(`✓ Generated .gitignore (${gitignoreResult.reason})`));
} else if (mode !== "scan") {
  // Auto-append missing essential patterns to existing .gitignore
  const appendResult = await appendMissingPatterns(cwd, capabilities);
  if (appendResult.added.length > 0) {
    console.log(chalk.green(`✓ Added to .gitignore: ${appendResult.added.join(", ")}`));
  }
}
```

### Step 4: Create `tests/gitignore-generator.test.ts`

Test cases:
- Base patterns included for all projects
- Language-specific patterns based on detection
- No overwrite of existing `.gitignore`
- Missing pattern detection
- Multi-language (polyglot) projects

### Step 5: Update `tests/git-utils.test.ts`

Add tests for minimal `.gitignore` creation in `gitInit()`

---

## Files to Modify

| File | Action |
|------|--------|
| `src/gitignore-generator.ts` | **Create** - Core generation logic |
| `src/git-utils.ts` | **Modify** - Add minimal gitignore in `gitInit()` |
| `src/init-helpers.ts` | **Modify** - Integrate `ensureGitignore()` |
| `tests/gitignore-generator.test.ts` | **Create** - Unit tests |
| `tests/git-utils.test.ts` | **Modify** - Add gitignore tests |

---

## Behavior by Init Mode

| Mode | Behavior |
|------|----------|
| `new` | Create `.gitignore` if missing |
| `merge` | Create if missing; **auto-append** missing essential patterns if exists |
| `scan` | No file changes |

### Auto-Append Logic

When `.gitignore` exists, automatically append missing essential patterns:
- `.env`, `.env.local` - Environment variables
- `ai/capabilities.json` - agent-foreman cache
- `node_modules/` - for Node.js projects
- `__pycache__/`, `.venv/` - for Python projects

Format for appended patterns:
```
# Added by agent-foreman
.env
node_modules/
```

---

## Key Design Decisions

1. **Never overwrite existing `.gitignore`** - Respect user customizations
2. **Use detected capabilities** - Already have `capabilities.languages` from AI discovery
3. **Two-phase protection** - Minimal protection immediately, comprehensive later
4. **Auto-append in merge mode** - Add missing essential patterns to existing files
