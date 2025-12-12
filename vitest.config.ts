import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Global setup file for cleanup hooks
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/index.ts",
        // Type-only files (no executable code)
        "src/types.ts",
        "src/verification-types.ts",
        // Re-export wrapper files (backward compatibility)
        "src/verifier.ts",
        "src/project-capabilities.ts",
        "src/tdd-guidance.ts",
        "src/verification-store.ts",
        // Module index files (re-exports only)
        "src/verifier/index.ts",
        "src/verifier/types.ts",
        "src/verifier/verification-types.ts",
        "src/capabilities/index.ts",
        "src/gitignore/index.ts",
        "src/tdd-guidance/index.ts",
        "src/tdd-guidance/types.ts",
        "src/verification-store/index.ts",
        "src/verification-store/constants.ts",
        // CLI command handlers (tested through integration tests)
        "src/commands/**/*.ts",
      ],
      reportsDirectory: "./coverage",
    },
    testTimeout: 30000,
    // Use 'forks' pool for better process isolation and cleanup
    // This ensures child processes spawned by tests are properly terminated
    pool: "forks",
    poolOptions: {
      forks: {
        // Isolate each test file in its own process
        isolate: true,
        // Single fork for sequential execution (prevents resource contention)
        singleFork: false,
      },
    },
    // Timeout for cleanup when Vitest shuts down
    teardownTimeout: 5000,
    // Hook timeout for setup/teardown hooks
    hookTimeout: 30000,
  },
});
