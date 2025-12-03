/**
 * Tests for gray-matter dependency import
 * Verifies that gray-matter is properly installed and can be imported
 */
import { describe, it, expect } from "vitest";
import matter from "gray-matter";

describe("gray-matter dependency", () => {
  it("should be importable", () => {
    expect(typeof matter).toBe("function");
  });

  it("should parse YAML frontmatter from markdown", () => {
    const content = `---
id: test.feature
status: passing
---

# Test Feature

Description here.
`;
    const result = matter(content);

    expect(result.data).toEqual({
      id: "test.feature",
      status: "passing",
    });
    expect(result.content).toContain("# Test Feature");
  });

  it("should stringify data to YAML frontmatter", () => {
    const data = { id: "new.feature", priority: 1 };
    const content = "# Feature Title\n\nBody content";

    const result = matter.stringify(content, data);

    expect(result).toContain("---");
    expect(result).toContain("id: new.feature");
    expect(result).toContain("priority: 1");
    expect(result).toContain("# Feature Title");
  });
});
