/**
 * Tests for AI call merge optimization
 * Covers buildCombinedMergePrompt and parseCombinedMergeResponse functions
 */
import { describe, it, expect } from "vitest";
import { buildCombinedMergePrompt, parseCombinedMergeResponse } from "../../src/init-helpers.js";

describe("Combined AI Merge Optimization", () => {
  describe("buildCombinedMergePrompt", () => {
    it("generates correct prompt structure with all inputs", () => {
      const existingInitScript = `#!/usr/bin/env bash
bootstrap() {
  npm install
}`;
      const newInitScript = `#!/usr/bin/env bash
bootstrap() {
  npm install
}
check() {
  npm test
}`;
      const existingClaudeMd = `# My Project
Some content here.`;
      const harnessSection = `## Long-Task Harness
New harness content.`;

      const prompt = buildCombinedMergePrompt(
        existingInitScript,
        newInitScript,
        existingClaudeMd,
        harnessSection
      );

      // Check prompt contains all required sections
      expect(prompt).toContain("Task 1: Merge ai/init.sh");
      expect(prompt).toContain("Task 2: Merge CLAUDE.md");
      expect(prompt).toContain("Existing ai/init.sh");
      expect(prompt).toContain("New template ai/init.sh");
      expect(prompt).toContain("Existing CLAUDE.md");
      expect(prompt).toContain("New harness section");

      // Check content is embedded
      expect(prompt).toContain("npm install");
      expect(prompt).toContain("npm test");
      expect(prompt).toContain("My Project");
      expect(prompt).toContain("Long-Task Harness");

      // Check JSON output format is specified
      expect(prompt).toContain("initScript");
      expect(prompt).toContain("claudeMd");
      expect(prompt).toContain("#!/usr/bin/env bash");
    });

    it("includes all merge rules for init.sh", () => {
      const prompt = buildCombinedMergePrompt("#!/usr/bin/env bash", "#!/usr/bin/env bash", "# MD", "## Harness");

      expect(prompt).toContain("PRESERVE all user customizations");
      expect(prompt).toContain("ADD new functions");
      expect(prompt).toContain("ADD new case statements");
      expect(prompt).toContain("PRESERVE user's custom commands");
      expect(prompt).toContain("UPDATE help text");
    });

    it("includes all merge rules for CLAUDE.md", () => {
      const prompt = buildCombinedMergePrompt("#!/usr/bin/env bash", "#!/usr/bin/env bash", "# MD", "## Harness");

      expect(prompt).toContain("Long-Task Harness");
      expect(prompt).toContain("replace it with new section");
      expect(prompt).toContain("append at the END");
      expect(prompt).toContain("PRESERVE all existing non-harness content");
    });
  });

  describe("parseCombinedMergeResponse", () => {
    it("parses valid JSON response with both outputs", () => {
      const response = JSON.stringify({
        initScript: "#!/usr/bin/env bash\nbootstrap() { npm install; }",
        claudeMd: "# Project\n## Long-Task Harness\nContent here.",
      });

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBe("#!/usr/bin/env bash\nbootstrap() { npm install; }");
      expect(result.claudeMd).toBe("# Project\n## Long-Task Harness\nContent here.");
    });

    it("parses JSON wrapped in markdown code blocks", () => {
      const response = `Here's the merged output:
\`\`\`json
{
  "initScript": "#!/usr/bin/env bash\\necho hello",
  "claudeMd": "# Merged Content"
}
\`\`\``;

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBe("#!/usr/bin/env bash\necho hello");
      expect(result.claudeMd).toBe("# Merged Content");
    });

    it("returns null for initScript when missing shebang", () => {
      const response = JSON.stringify({
        initScript: "echo 'no shebang'",
        claudeMd: "# Valid content",
      });

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBeNull();
      expect(result.claudeMd).toBe("# Valid content");
    });

    it("accepts #!/bin/bash shebang", () => {
      const response = JSON.stringify({
        initScript: "#!/bin/bash\necho hello",
        claudeMd: "# Content",
      });

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBe("#!/bin/bash\necho hello");
    });

    it("returns null for claudeMd when empty", () => {
      const response = JSON.stringify({
        initScript: "#!/usr/bin/env bash\necho hello",
        claudeMd: "",
      });

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBe("#!/usr/bin/env bash\necho hello");
      expect(result.claudeMd).toBeNull();
    });

    it("returns null for claudeMd when only whitespace", () => {
      const response = JSON.stringify({
        initScript: "#!/usr/bin/env bash\necho hello",
        claudeMd: "   \n\t  ",
      });

      const result = parseCombinedMergeResponse(response);

      expect(result.claudeMd).toBeNull();
    });

    it("returns null for both when JSON is invalid", () => {
      const response = "This is not valid JSON { broken";

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBeNull();
      expect(result.claudeMd).toBeNull();
    });

    it("returns null for both when response is empty", () => {
      const result = parseCombinedMergeResponse("");

      expect(result.initScript).toBeNull();
      expect(result.claudeMd).toBeNull();
    });

    it("returns null for missing fields", () => {
      const response = JSON.stringify({
        someOtherField: "value",
      });

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBeNull();
      expect(result.claudeMd).toBeNull();
    });

    it("handles claudeMd being a non-string type", () => {
      const response = JSON.stringify({
        initScript: "#!/usr/bin/env bash\necho hello",
        claudeMd: 12345,
      });

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBe("#!/usr/bin/env bash\necho hello");
      expect(result.claudeMd).toBeNull();
    });

    it("handles response with extra whitespace", () => {
      const response = `

  {
    "initScript": "#!/usr/bin/env bash\\ntest",
    "claudeMd": "# Content"
  }

`;

      const result = parseCombinedMergeResponse(response);

      expect(result.initScript).toBe("#!/usr/bin/env bash\ntest");
      expect(result.claudeMd).toBe("# Content");
    });
  });
});
