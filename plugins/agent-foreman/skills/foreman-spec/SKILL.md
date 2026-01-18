---
name: foreman-spec
description: Multi-role requirement analysis and task breakdown workflow using 4 specialized AI agents (PM, UX, Tech, QA). Each agent conducts web research before analysis to gather industry best practices, case studies, and current trends. Supports Quick Mode (parallel, ~3 min, one Q&A session) and Deep Mode (serial, ~8 min, Q&A after EACH agent so answers inform subsequent analysis). Triggers on 'foreman-spec', 'spec feature', 'break down requirement', 'define tasks', 'spec this'.
allowed-tools: [Read, Write, Glob, Grep, AskUserQuestion, Bash, Task]
user-invocable: true
---

# Spec Workflow (V8 - Research-Enhanced)

Multi-role requirement analysis using 4 specialized AI agents, each equipped with web research capabilities.

## Overview

Transform a high-level requirement into fine-grained, implementable tasks through multi-perspective analysis.

**Key Feature: Research-First Approach**

Each agent conducts web research BEFORE analysis to:
- Gather industry best practices and standards
- Find case studies and competitor implementations
- Discover current trends and proven patterns
- Ground recommendations in real-world data

**Agents** (all equipped with WebSearch):
- agent-foreman:pm (Product Manager) - Clarifies WHAT and WHY, researches market/industry
- agent-foreman:ux (UX/UI Designer) - Designs HOW users interact, researches UX patterns
- agent-foreman:tech (Technical Architect) - Architects HOW to build, researches frameworks/security
- agent-foreman:qa (QA Manager) - Plans HOW to verify, researches testing strategies

**Modes**:
- Quick Mode (parallel) - ~3-4 min, includes research, one combined Q&A session at the end
- Deep Mode (serial) - ~8-10 min, comprehensive research, Q&A after EACH agent (4 sessions, each answer informs subsequent agents)

---

## Phase 0: Mode Selection

Before any analysis, detect project state and ask user to choose mode.

### Step 1: Scan Codebase

Use Glob to detect project state:

```
Check if ai/tasks/ exists → EXISTING_PROJECT
Check if package.json or pyproject.toml exists → EXISTING_PROJECT
Otherwise → NEW_PROJECT
```

### Step 2: Analyze Requirement Complexity

- Count features mentioned in requirement
- Detect uncertainty words ("maybe", "or", "not sure", "possibly")
- If >3 features OR uncertainty words → COMPLEX
- Otherwise → SIMPLE

### Step 3: Determine Recommendation

```
IF NEW_PROJECT OR COMPLEX:
  recommendation = "Deep Mode"
ELSE:
  recommendation = "Quick Mode"
```

### Step 4: Ask User

Use AskUserQuestion tool:

```json
{
  "question": "How would you like to analyze this requirement?",
  "header": "Mode",
  "options": [
    {
      "label": "Quick Mode (Recommended)" or "Quick Mode",
      "description": "4 experts analyze in parallel, ~3 min, one combined Q&A at the end. Best for clear requirements."
    },
    {
      "label": "Deep Mode (Recommended)" or "Deep Mode",
      "description": "4 experts analyze sequentially, ~8 min, Q&A after EACH expert (answers inform next expert). Best for complex/new projects."
    }
  ],
  "multiSelect": false
}
```

Place "(Recommended)" on the recommended mode based on Step 3.

---

## Phase 1: Codebase Scan

Scan the project to understand existing patterns.

### Actions

1. Use Glob to find key files:
   - `README.md`, `ARCHITECTURE.md`, `CLAUDE.md`
   - `package.json`, `pyproject.toml`, `go.mod`
   - `src/**/*.ts`, `src/**/*.py`, `src/**/*.go` (sample files)

2. Read project configuration to detect:
   - Language and framework
   - Testing patterns
   - Existing conventions

3. Create context summary for agents:
   - Project type (web app, CLI, API, etc.)
   - Tech stack (language, framework, database)
   - Existing patterns to follow

---

## Phase 1.5: Research Context (NEW)

Before launching agents, prepare research context based on the requirement.

### Research Domains

Identify which areas need research based on the requirement:

| Requirement Type | Research Focus |
|-----------------|----------------|
| New product | Market analysis, competitor products, industry trends |
| New feature | Similar implementations, UX patterns, technical approaches |
| Integration | API documentation, security best practices, compatibility |
| Performance | Benchmarks, optimization techniques, scalability patterns |

### Generate Research Keywords

Extract keywords from the requirement for targeted searches:

```
Requirement: "Build a real-time chat application with end-to-end encryption"

Research keywords:
- "real-time chat architecture 2024 2025"
- "WebSocket vs Server-Sent Events comparison"
- "end-to-end encryption implementation best practices"
- "chat application UX patterns"
- "Signal Protocol implementation guide"
```

### Pass Research Context to Agents

Include research keywords in agent prompts:

```
research_context = {
  "domain": "[product domain]",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "tech_stack": "[detected or proposed stack]",
  "competitors": ["competitor1", "competitor2"]
}
```

**IMPORTANT**: Each agent will conduct its own targeted research using these keywords. The research phase is built into each agent's workflow, not a separate step.

---

## Phase 2: Analysis (Mode-Dependent)

### Quick Mode (Parallel)

Launch all 4 agents IN PARALLEL using Task tool. Each agent will conduct web research before analysis:

```
Task(subagent_type="agent-foreman:pm", prompt="Analyze requirement: {requirement}. Project context: {codebase_context}. Research context: {research_context}. IMPORTANT: Use WebSearch to research industry best practices before analysis.")

Task(subagent_type="agent-foreman:ux", prompt="Design UX for: {requirement}. Project context: {codebase_context}. Research context: {research_context}. IMPORTANT: Use WebSearch to research UX patterns before design.")

Task(subagent_type="agent-foreman:tech", prompt="Design architecture for: {requirement}. Project context: {codebase_context}. Research context: {research_context}. IMPORTANT: Use WebSearch to research framework best practices before architecture.")

Task(subagent_type="agent-foreman:qa", prompt="Define QA strategy for: {requirement}. Project context: {codebase_context}. Research context: {research_context}. IMPORTANT: Use WebSearch to research testing strategies before planning.")
```

Wait for all to complete (~30-60 seconds).

**Then**: Merge questions from all 4 agents:
- Remove duplicates (similar questions from different roles)
- Group by topic
- Prioritize: blocking questions first
- Limit: max 10-12 questions total

**Then**: Present merged questions to user in one AskUserQuestion call.

### Deep Mode (Serial with Immediate Q&A)

Launch agents ONE AT A TIME. **CRITICAL: After each agent completes, immediately collect their questions, ask the user, and write answers to the spec file BEFORE launching the next agent.**

This ensures:
- Each agent's questions are answered immediately
- Subsequent agents can see previous answers in the spec files
- User maintains focus on one perspective at a time

**Step 2A: Product Manager**

```
Task(subagent_type="agent-foreman:pm", prompt="Analyze requirement: {requirement}. Project context: {codebase_context}. Research context: {research_context}. CRITICAL: Use WebSearch FIRST to research industry best practices, market trends, and competitor approaches before starting your analysis.")
```

Wait for completion. PM will:
1. Conduct web research on industry/market
2. Write analysis to `ai/tasks/spec/PM.md`
3. Output questions using `---QUESTIONS FOR USER---` format

**→ SKILL Orchestrator Actions (MANDATORY):**
1. Parse PM's `---QUESTIONS FOR USER---` output
2. Use AskUserQuestion to present PM's questions to user
3. Write Q&A section to `ai/tasks/spec/PM.md`
4. **Only then proceed to Step 2B**

**Step 2B: UX Designer**

```
Task(subagent_type="agent-foreman:ux", prompt="Design UX for: {requirement}. IMPORTANT: First read ai/tasks/spec/PM.md to see PM's analysis AND user's answers to PM questions. Research context: {research_context}. CRITICAL: Use WebSearch FIRST to research UX patterns before starting your design.")
```

Wait for completion. UX will:
1. Read PM.md (including Q&A section with user answers)
2. Conduct UX-specific research
3. Write analysis to `ai/tasks/spec/UX.md`
4. Output questions using `---QUESTIONS FOR USER---` format

**→ SKILL Orchestrator Actions (MANDATORY):**
1. Parse UX's `---QUESTIONS FOR USER---` output
2. Use AskUserQuestion to present UX's questions to user
3. Write Q&A section to `ai/tasks/spec/UX.md`
4. **Only then proceed to Step 2C**

**Step 2C: Technical Architect**

```
Task(subagent_type="agent-foreman:tech", prompt="Design architecture for: {requirement}. IMPORTANT: First read ai/tasks/spec/PM.md and ai/tasks/spec/UX.md to see previous analyses AND user's answers. Research context: {research_context}. CRITICAL: Use WebSearch FIRST to research framework best practices before starting your design.")
```

Wait for completion. Tech will:
1. Read PM.md and UX.md (including Q&A sections)
2. Conduct tech-specific research
3. Write analysis to `ai/tasks/spec/TECH.md`
4. Output questions using `---QUESTIONS FOR USER---` format

**→ SKILL Orchestrator Actions (MANDATORY):**
1. Parse Tech's `---QUESTIONS FOR USER---` output
2. Use AskUserQuestion to present Tech's questions to user
3. Write Q&A section to `ai/tasks/spec/TECH.md`
4. **Only then proceed to Step 2D**

**Step 2D: QA Manager**

```
Task(subagent_type="agent-foreman:qa", prompt="Define QA strategy for: {requirement}. IMPORTANT: First read all spec files (PM.md, UX.md, TECH.md) including their Q&A sections. Research context: {research_context}. CRITICAL: Use WebSearch FIRST to research testing strategies before defining your strategy.")
```

Wait for completion. QA will:
1. Read all previous spec files (including Q&A sections)
2. Conduct QA-specific research
3. Write analysis to `ai/tasks/spec/QA.md`
4. Output questions using `---QUESTIONS FOR USER---` format

**→ SKILL Orchestrator Actions (MANDATORY):**
1. Parse QA's `---QUESTIONS FOR USER---` output
2. Use AskUserQuestion to present QA's questions to user (if any)
3. Write Q&A section to `ai/tasks/spec/QA.md`
4. **Proceed to Phase 3 (Create Overview)**

---

## Phase 2.5: Question Collection & User Interaction

**This phase applies ONLY to Quick Mode.** In Deep Mode, questions are handled inline after each agent (see above).

### Quick Mode Question Flow

After all 4 agents complete in parallel, handle questions:

### Step 1: Extract Questions

Each agent outputs questions using this format (NOT written to file):

```
---QUESTIONS FOR USER---
1. **[Question text]**
   - Why: [reason]
   - Options: A) ... B) ... C) ...
   - Recommend: [option] because [rationale]
---END QUESTIONS---
```

Parse each agent's output and extract questions from the `---QUESTIONS FOR USER---` section.

### Step 2: Merge and Deduplicate

1. **Remove duplicates** - Similar questions from different roles (e.g., both PM and Tech asking about auth method)
2. **Group by topic** - Organize related questions together
3. **Prioritize blocking questions first** - Questions that block other roles' work
4. **Limit total** - Max 10-12 questions to avoid overwhelming user

### Step 3: Ask User

Use `AskUserQuestion` tool to present merged questions interactively:

```json
{
  "questions": [
    {
      "question": "[Merged question text]",
      "header": "[Topic - max 12 chars]",
      "options": [
        {"label": "[Option A] (Recommended)", "description": "[Why recommended]"},
        {"label": "[Option B]", "description": "[What this means]"}
      ],
      "multiSelect": false
    }
  ]
}
```

### Step 4: Write Answers to Files

After user answers, append Q&A section to EACH relevant spec file:

```markdown
## Questions & Answers

### Q1: [Question text]
**Answer**: [User's selected option]
**Impact**: [How this affects this role's analysis]

### Q2: [Question text]
**Answer**: [User's selected option]
**Impact**: [How this affects this role's analysis]
```

For each file, only include questions relevant to that role:
- `PM.md`: Business/scope questions
- `UX.md`: Design/flow questions
- `TECH.md`: Architecture/implementation questions
- `QA.md`: Testing/quality questions

---

## Phase 3: Create Overview & Breakdown Tasks (DELEGATED)

**After Phase 2.5 (Q&A) completes, delegate to breakdown-writer agent.**

Phase 3 requires significant context (reading 4 spec files, creating N+2 task files). Delegating to a subagent preserves main session context for subsequent interactions.

### Step 1: Compile Q&A Decisions

Collect all Q&A from Phase 2/2.5 into a formatted summary:

```
qa_decisions = """
### Scope Decisions
- Q: [Question from PM] → A: [User answer]
- Q: [Question from PM] → A: [User answer]

### UX Decisions
- Q: [Question from UX] → A: [User answer]

### Technical Decisions
- Q: [Question from Tech] → A: [User answer]

### Quality Decisions
- Q: [Question from QA] → A: [User answer]
"""
```

### Step 2: Delegate to Breakdown Writer

Launch the breakdown-writer agent:

```
Task(
  subagent_type="agent-foreman:breakdown-writer",
  prompt="""
SPEC BREAKDOWN TASK

## Context
- Requirement: {requirement}
- Mode: {quick|deep}
- Date: {YYYY-MM-DD}
- Project: {codebase_context}

## Q&A Decisions
{qa_decisions}

## Your Mission
1. Read all spec files (PM.md, UX.md, TECH.md, QA.md)
2. Create OVERVIEW.md with executive summaries
3. Create BREAKDOWN tasks for all modules (devops first, integration last)
4. Run `agent-foreman status` to verify index update
5. Return structured result

## Output Format
Return result block at END:
---BREAKDOWN RESULT---
overview_created: true|false
modules_created: [devops, module1, ..., integration]
tasks_created: N
index_updated: true|false
status: success|partial|failed
errors: []
notes: "summary"
---END BREAKDOWN RESULT---
"""
)
```

### Step 3: Parse Result

Parse `---BREAKDOWN RESULT---` from agent output:

```
If status == "success":
  → Display success message with modules_created
  → Continue to Phase 4

If status == "partial":
  → Display warning with errors
  → Continue to Phase 4 (partial results may be usable)

If status == "failed":
  → Display error message
  → Show errors list
  → Stop workflow, user must investigate
```

### Step 4: Confirm to User

After successful delegation, output:

```
Spec breakdown complete!

Created:
- ai/tasks/spec/OVERVIEW.md (executive summaries)
- ai/tasks/devops/BREAKDOWN.md (priority: 0)
- ai/tasks/{module}/BREAKDOWN.md (priority: N)
- ...
- ai/tasks/integration/BREAKDOWN.md (priority: 999999)

Total: {tasks_created} BREAKDOWN tasks registered.
```

### Why Delegate?

1. **Context preservation** - Main session only sees prompt + result (~1.5KB vs ~20KB)
2. **File reading isolated** - Agent reads 4 large spec files in its own context
3. **Error handling** - Agent handles errors autonomously, returns structured result
4. **Files are persistent** - Agent writes directly, files survive context limits

### Fallback: Manual Execution

If delegation fails, you can manually execute Phase 3 by:
1. Reading spec files (PM.md, UX.md, TECH.md, QA.md)
2. Creating OVERVIEW.md with the template from breakdown-writer agent
3. Creating BREAKDOWN files for each module
4. Running `agent-foreman status` to verify index update

---

## Phase 4: Module Breakdown (User-Driven)

After spec generation, guide the user to process all BREAKDOWN tasks.

### Next Steps Output (CONSOLE ONLY - NOT IN OVERVIEW.md)

**⚠️ IMPORTANT: This output is displayed to the user in the console/terminal. It is NOT written to any file.**

Display the following guidance to the user:

```markdown
## Next Steps

To process all BREAKDOWN tasks and create fine-grained implementation tasks:

/agent-foreman:run

Alternatively, to process a specific module:

/agent-foreman:run {module}.BREAKDOWN
```

### What Happens During Run

The `/agent-foreman:run` command uses the standard Bash workflow for each task:

```bash
# For each BREAKDOWN task, executes:
agent-foreman next <task_id>    # 1. Get task details
# ... implement task ...         # 2. Create implementation tasks
agent-foreman check <task_id>   # 3. Verify
agent-foreman done <task_id>    # 4. Complete + commit
# Loop to next BREAKDOWN
```

For each BREAKDOWN task, the AI will:
1. Run `agent-foreman next` to get task details and spec context
2. Read all spec documents from `ai/tasks/spec/` (PM.md, UX.md, TECH.md, QA.md, OVERVIEW.md)
3. Create fine-grained implementation tasks in `ai/tasks/{module}/`
4. Run `agent-foreman check` and `agent-foreman done` to verify and complete
5. Automatically continue to the next BREAKDOWN

---

## Phase 5: Validation

> **Note**: The `done` command automatically triggers validation instructions when all BREAKDOWNs complete.

After all BREAKDOWN tasks are complete, run validation:

```bash
agent-foreman validate
```

This spawns 4 validators in parallel to check task quality.

---

## Task Output Conventions

All generated tasks MUST follow agent-foreman format.

### Task ID Patterns

- BREAKDOWN tasks: `{module}.BREAKDOWN` (e.g., `auth.BREAKDOWN`)
- Implementation tasks: `{module}.{task-name}` (e.g., `auth.oauth-google`)

### Task Markdown Format

```markdown
---
id: module.task-name
module: module-name
priority: N
status: failing
version: 1
origin: spec-workflow
dependsOn: []
tags: []
testRequirements:
  unit:
    required: false
    pattern: "tests/{module}/**/*.test.*"
---
# Task Title

## Context
[Brief context from spec documents]

## Acceptance Criteria
1. [Specific, testable criterion]
2. [Specific, testable criterion]
3. [Error handling criterion]

## Technical Notes
- Reference: [From spec/OVERVIEW.md]
- UX: [From spec/UX.md]
- Test: [From spec/QA.md]
```

### Markdown Formatting Rules

**CRITICAL**: Always include blank lines:
- Before EVERY `##` heading (blank line required)
- After EVERY `##` heading (blank line required)
- Between list items and headings

### Granularity

Break into SMALLEST implementable units. Each task should be:
- **Atomic**: One focused piece of work
- **Independent**: Can be implemented without waiting (except explicit deps)
- **Testable**: Has clear, verifiable acceptance criteria
- **Completable**: 1-3 hours of work

---

## Rules

1. **Agents write their own files** - Each agent writes directly to `ai/tasks/spec/{ROLE}.md`
2. **Agents read previous files** - UX reads PM.md, Tech reads PM.md+UX.md, QA reads all
3. **No conversation context reliance** - Always read files explicitly
4. **Research first** - Every agent conducts web research before analysis
5. **Mode first** - Ask user to choose Quick/Deep mode
6. **Bookend modules** - Always create `devops` (first) and `integration` (last)
7. **OVERVIEW is summary only** - Don't duplicate detailed analysis in OVERVIEW.md
8. **Questions output separately** - Agents write analysis to file, but output questions directly using `---QUESTIONS FOR USER---` format
9. **Q&A timing differs by mode**:
   - **Quick Mode**: Collect all questions after all agents complete, merge duplicates, ask once
   - **Deep Mode**: Ask questions IMMEDIATELY after each agent completes (PM→Q&A→UX→Q&A→Tech→Q&A→QA→Q&A), so subsequent agents can use answers
10. **Deep Mode sequential dependency** - In Deep Mode, NEVER launch the next agent until the previous agent's Q&A is complete and written to file
11. **No "Next Steps" in OVERVIEW.md** - OVERVIEW.md is a reference document that ends with "Module Roadmap". The "Next Steps" guidance is console output ONLY (Phase 4), never written to OVERVIEW.md or any spec file

---

## Research Best Practices

### Effective Search Queries

Use specific, targeted queries:

| Agent | Good Query Examples |
|-------|---------------------|
| PM | `"[industry] product metrics KPIs 2024"`, `"[product type] market size trends"` |
| UX | `"[component] UX pattern best practices"`, `"WCAG 2.2 [element] accessibility"` |
| Tech | `"[framework] architecture patterns"`, `"OWASP [vulnerability] prevention"` |
| QA | `"[framework] testing best practices"`, `"[tool] performance benchmarks"` |

### Research Synthesis

Each agent should:
1. Conduct 2-4 targeted web searches
2. Extract key findings with sources
3. Apply findings to the specific requirement
4. Include citations in the Research Findings section

### When to Research More

- New/unfamiliar domain → More PM research
- Complex UI requirements → More UX research
- Novel tech stack → More Tech research
- High-risk project → More QA research
