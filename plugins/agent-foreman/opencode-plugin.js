/**
 * Agent Foreman OpenCode Plugin
 *
 * Exposes agent-foreman CLI commands as OpenCode tools and slash commands.
 */
export const AgentForemanPlugin = async ({ client, $ }) => {
  // Helper to run agent-foreman commands
  const runForeman = async (args) => {
    try {
      const result = await $`agent-foreman ${args}`;
      return {
        output: result.stdout,
        error: result.stderr,
        exitCode: result.exitCode
      };
    } catch (error) {
       return {
        output: error.stdout,
        error: error.stderr || error.message,
        exitCode: error.exitCode || 1
       };
    }
  };

  // Register foreman_status
  await client.registerTool({
    name: "foreman_status",
    description: "Show current project status with feature completion and recent activity",
    parameters: {
      type: "object",
      properties: {
        json: { type: "boolean", description: "Output as JSON" },
        quiet: { type: "boolean", description: "Minimal output" }
      }
    },
    handler: async ({ json, quiet }) => {
      const args = ["status"];
      if (json) args.push("--json");
      if (quiet) args.push("--quiet");
      return await runForeman(args);
    }
  });

  // Register foreman_next
  await client.registerTool({
    name: "foreman_next",
    description: "Get next/specific feature to work on",
    parameters: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Specific feature ID to work on" },
        check: { type: "boolean", description: "Run tests before showing feature" },
        dryRun: { type: "boolean", description: "Preview without changes" },
        json: { type: "boolean", description: "Output as JSON" },
        allowDirty: { type: "boolean", description: "Allow with uncommitted changes" }
      }
    },
    handler: async ({ featureId, check, dryRun, json, allowDirty }) => {
      const args = ["next"];
      if (featureId) args.push(featureId);
      if (check) args.push("--check");
      if (dryRun) args.push("--dry-run");
      if (json) args.push("--json");
      if (allowDirty) args.push("--allow-dirty");
      return await runForeman(args);
    }
  });

  // Register foreman_check
  await client.registerTool({
    name: "foreman_check",
    description: "Verify implementation of a feature",
    parameters: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Feature ID to check" },
        verbose: { type: "boolean", description: "Show detailed output" },
        ai: { type: "boolean", description: "Enable AI autonomous exploration" },
        full: { type: "boolean", description: "Run full verification" }
      }
    },
    handler: async ({ featureId, verbose, ai, full }) => {
      const args = ["check"];
      if (featureId) args.push(featureId);
      if (verbose) args.push("--verbose");
      if (ai) args.push("--ai");
      if (full) args.push("--full");
      return await runForeman(args);
    }
  });

  // Register foreman_done
  await client.registerTool({
    name: "foreman_done",
    description: "Mark complete + auto-commit",
    parameters: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Feature ID to mark as done" },
        notes: { type: "string", description: "Additional notes" },
        noCommit: { type: "boolean", description: "Skip auto-commit" },
        skipCheck: { type: "boolean", description: "Skip verification" }
      },
      required: ["featureId"]
    },
    handler: async ({ featureId, notes, noCommit, skipCheck }) => {
      const args = ["done", featureId];
      if (notes) args.push("-m", notes);
      if (noCommit) args.push("--no-commit");
      if (skipCheck) args.push("--skip-check");
      return await runForeman(args);
    }
  });

  // Register foreman_fail
  await client.registerTool({
    name: "foreman_fail",
    description: "Mark as failed and continue to next",
    parameters: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Feature ID to mark as failed" },
        reason: { type: "string", description: "Reason for failure" }
      },
      required: ["featureId", "reason"]
    },
    handler: async ({ featureId, reason }) => {
      const args = ["fail", featureId, "-r", reason];
      return await runForeman(args);
    }
  });

  // Register foreman_impact
  await client.registerTool({
    name: "foreman_impact",
    description: "Analyze impact of changes",
    parameters: {
      type: "object",
      properties: {
        featureId: { type: "string", description: "Feature ID" }
      },
      required: ["featureId"]
    },
    handler: async ({ featureId }) => {
      const args = ["impact", featureId];
      return await runForeman(args);
    }
  });

  // Register foreman_init
  await client.registerTool({
    name: "foreman_init",
    description: "Initialize harness",
    parameters: {
      type: "object",
      properties: {
        goal: { type: "string", description: "Project goal" }
      }
    },
    handler: async ({ goal }) => {
      const args = ["init"];
      if (goal) args.push(goal);
      return await runForeman(args);
    }
  });

  // Register foreman_analyze
  await client.registerTool({
    name: "foreman_analyze",
    description: "Generate AI-powered project analysis",
    parameters: {
      type: "object",
      properties: {
        output: { type: "string", description: "Output file path" }
      }
    },
    handler: async ({ output }) => {
      const args = ["analyze"];
      if (output) args.push(output);
      return await runForeman(args);
    }
  });
  
  // Register foreman_scan
  await client.registerTool({
    name: "foreman_scan",
    description: "Scan project verification capabilities",
    parameters: {
      type: "object",
      properties: {}
    },
    handler: async () => {
      return await runForeman(["scan"]);
    }
  });

  // Register foreman_run (unattended mode)
  await client.registerTool({
    name: "foreman_run",
    description: "Enter unattended mode to run all features. This tool returns the strict system prompt for autonomous execution.",
    parameters: {
      type: "object",
      properties: {}
    },
    handler: async () => {
       // Return the content of SKILL.md as tool output
       return `
# Feature Run Mode - SYSTEM INSTRUCTION

⚡ **UNATTENDED MODE ACTIVE**
- NO questions allowed
- NO stopping for errors
- MUST complete all features

## Loop Enforcement (MUST FOLLOW)

1. **CHECK**: Run 'foreman_status' - note pending count
2. **LOOP**: While pending count > 0:
   a. Run 'foreman_next' - get feature details
   b. Implement feature - satisfy ALL criteria
   c. Run 'foreman_check <id>' - verify
   d. Run 'foreman_done <id>' - complete
   e. Handle result:
      - Pass? → Continue to step 2
      - Fail? → Run 'foreman_fail <id> -r "reason"', continue to step 2
3. **EXIT**: Only when pending count = 0

### Never Stop For:
- Questions
- Errors
- Failures
- Ambiguity
- Missing files
- Test failures

### Forbidden phrases - NEVER output:
- "Should I...?"
- "Do you want me to...?"
- "Which approach would you prefer?"

**CRITICAL: NEVER stop due to verification failure - always use 'foreman_fail' and continue!**
`;
    }
  });

  return {
    event: async ({ event }) => {
      // Handle slash commands via TUI events
      if (event.type === 'tui.command.execute') {
        const { command, args } = event.data;
        
        // Handle /foreman command
        if (command === 'foreman') {
          const subCommand = args && args.length > 0 ? args[0] : null;
          
          if (!subCommand) {
            console.log("Usage: /foreman <command> [args]");
            console.log("Commands: status, next, check, done, fail, init, analyze, scan, run");
            return;
          }

          // Handle special "run" command by instructing user to call the tool
          if (subCommand === 'run') {
             console.log("To enter Run Mode, please tell the agent:");
             console.log('"Call foreman_run to start autonomous batch processing."');
             return;
          }
          
          // Pass through to CLI
          console.log(`Executing: agent-foreman ${args.join(' ')}`);
          const result = await runForeman(args);
          
          if (result.output) console.log(result.output);
          if (result.error) console.error(result.error);
        }
      }
    }
  };
};
