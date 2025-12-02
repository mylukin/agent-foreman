import { describe, it, expect } from "vitest";
import {
  appendPreviousFailureContextToPrompt,
  type PreviousAttemptFailureContext,
} from "../src/run.js";

describe("appendPreviousFailureContextToPrompt", () => {
  it("appends unit test failure summary with command and key output", () => {
    const basePrompt = "BASE PROMPT";

    const context: PreviousAttemptFailureContext = {
      attempt: 1,
      maxAttempts: 5,
      fromStatus: "🔴 待完成",
      toStatus: "🔴 待完成",
      unitTestCommand: "npm test -- tests/run-command.test.ts",
      unitTestOutputSnippet:
        "FAIL  tests/run-command.test.ts > run.ts > retries implementation up to MAX_ATTEMPTS\nError: expected 5 to be 3",
    };

    const prompt = appendPreviousFailureContextToPrompt({
      basePrompt,
      context,
    });

    expect(prompt).toContain(basePrompt);
    expect(prompt).toContain("上一轮尝试失败原因摘要");
    expect(prompt).toContain("npm test -- tests/run-command.test.ts");
    expect(prompt).toContain("FAIL  tests/run-command.test.ts");
    expect(prompt).toContain("Error: expected 5 to be 3");
  });

  it("appends verification failure summary with error message", () => {
    const basePrompt = "BASE PROMPT";

    const context: PreviousAttemptFailureContext = {
      attempt: 2,
      maxAttempts: 5,
      fromStatus: "🟡 进行中",
      toStatus: "🔴 待完成",
      verificationError: "verification failed: regression detected in API tests",
    };

    const prompt = appendPreviousFailureContextToPrompt({
      basePrompt,
      context,
    });

    expect(prompt).toContain("上一轮尝试失败原因摘要");
    expect(prompt).toContain("verification 阶段的错误信息");
    expect(prompt).toContain("verification failed: regression detected in API tests");
  });
});

