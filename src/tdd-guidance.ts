/**
 * TDD Guidance Generator
 * Converts acceptance criteria to test case suggestions for TDD workflow
 */

import type { Feature } from "./types.js";
import type { ExtendedCapabilities } from "./verification-types.js";

/**
 * TDD guidance for a feature
 */
export interface TDDGuidance {
  /** Feature ID this guidance is for */
  featureId: string;
  /** Suggested test file paths */
  suggestedTestFiles: {
    unit: string[];
    e2e: string[];
  };
  /** Test case stubs for each type */
  testCaseStubs: {
    unit: string[];
    e2e: string[];
  };
  /** Mapping from acceptance criteria to test cases */
  acceptanceMapping: AcceptanceTestMapping[];
}

/**
 * Maps an acceptance criterion to corresponding test cases
 */
export interface AcceptanceTestMapping {
  /** Original acceptance criterion */
  criterion: string;
  /** Suggested unit test case name */
  unitTestCase: string;
  /** Suggested E2E scenario name (if applicable) */
  e2eScenario?: string;
}

/**
 * Convert an acceptance criterion to a unit test case name
 * Uses "should" prefix for standard test naming convention
 *
 * @example
 * criterionToTestCase("User can submit the form")
 * // Returns: "should allow user to submit the form"
 *
 * criterionToTestCase("API returns 201 status with created resource")
 * // Returns: "should return 201 status with created resource"
 */
export function criterionToTestCase(criterion: string): string {
  // Normalize the criterion
  let normalized = criterion.trim().toLowerCase();

  // Remove common prefixes
  const prefixPatterns = [
    /^the\s+/i,
    /^a\s+/i,
    /^an\s+/i,
  ];

  for (const pattern of prefixPatterns) {
    normalized = normalized.replace(pattern, "");
  }

  // Handle imperative patterns first (Verify, Check, Ensure, Test, etc.)
  // These should be matched before other patterns
  const imperativePatterns = [
    { pattern: /^verify\s+(.+)$/i, format: "should verify $1" },
    { pattern: /^check\s+(.+)$/i, format: "should check $1" },
    { pattern: /^ensure\s+(.+)$/i, format: "should ensure $1" },
    { pattern: /^test\s+(.+)$/i, format: "should $1" },
  ];

  for (const { pattern, format } of imperativePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return format.replace("$1", match[1]);
    }
  }

  // Handle "X can Y" pattern -> "should allow X to Y"
  const canMatch = normalized.match(/^(.+?)\s+can\s+(.+)$/i);
  if (canMatch) {
    return `should allow ${canMatch[1]} to ${canMatch[2]}`;
  }

  // Handle "X should Y" pattern -> "should Y" (already in test format)
  const shouldMatch = normalized.match(/^.+?\s+should\s+(.+)$/i);
  if (shouldMatch) {
    return `should ${shouldMatch[1]}`;
  }

  // Handle verb patterns (returns, displays, shows, etc.)
  const verbPatterns = [
    { pattern: /^(.+?)\s+returns?\s+(.+)$/i, format: "should return $2" },
    { pattern: /^(.+?)\s+displays?\s+(.+)$/i, format: "should display $2" },
    { pattern: /^(.+?)\s+shows?\s+(.+)$/i, format: "should show $2" },
    { pattern: /^(.+?)\s+validates?\s+(.+)$/i, format: "should validate $2" },
    { pattern: /^(.+?)\s+creates?\s+(.+)$/i, format: "should create $2" },
    { pattern: /^(.+?)\s+updates?\s+(.+)$/i, format: "should update $2" },
    { pattern: /^(.+?)\s+deletes?\s+(.+)$/i, format: "should delete $2" },
    { pattern: /^(.+?)\s+sends?\s+(.+)$/i, format: "should send $2" },
    { pattern: /^(.+?)\s+receives?\s+(.+)$/i, format: "should receive $2" },
    { pattern: /^(.+?)\s+handles?\s+(.+)$/i, format: "should handle $2" },
    { pattern: /^(.+?)\s+supports?\s+(.+)$/i, format: "should support $2" },
    { pattern: /^(.+?)\s+is\s+(.+)$/i, format: "should be $2" },
    { pattern: /^(.+?)\s+are\s+(.+)$/i, format: "should be $2" },
    { pattern: /^(.+?)\s+has\s+(.+)$/i, format: "should have $2" },
    { pattern: /^(.+?)\s+have\s+(.+)$/i, format: "should have $2" },
  ];

  for (const { pattern, format } of verbPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      return format.replace("$2", match[2]);
    }
  }

  // Default: prefix with "should" if not already present
  if (normalized.startsWith("should ")) {
    return normalized;
  }

  return `should ${normalized}`;
}

/**
 * Convert an acceptance criterion to an E2E scenario name
 * Uses more user-focused language suitable for Playwright tests
 *
 * @example
 * criterionToE2EScenario("User can submit the form and see a success message")
 * // Returns: "user submits form and sees success message"
 */
export function criterionToE2EScenario(criterion: string): string {
  // Normalize the criterion
  let normalized = criterion.trim().toLowerCase();

  // Remove common prefixes
  const prefixPatterns = [
    /^the\s+/i,
    /^a\s+/i,
    /^an\s+/i,
  ];

  for (const pattern of prefixPatterns) {
    normalized = normalized.replace(pattern, "");
  }

  // Handle "X can Y" pattern -> "X does Y"
  const canMatch = normalized.match(/^(.+?)\s+can\s+(.+)$/i);
  if (canMatch) {
    // Convert "can verb" to just the verb in present tense
    const subject = canMatch[1];
    const action = canMatch[2];

    // Try to convert to present tense action
    const presentAction = action
      .replace(/\bsubmit\b/gi, "submits")
      .replace(/\blogin\b/gi, "logs in")
      .replace(/\blogout\b/gi, "logs out")
      .replace(/\bsee\b/gi, "sees")
      .replace(/\benter\b/gi, "enters")
      .replace(/\bclick\b/gi, "clicks")
      .replace(/\bnavigate\b/gi, "navigates")
      .replace(/\bview\b/gi, "views")
      .replace(/\bedit\b/gi, "edits")
      .replace(/\bdelete\b/gi, "deletes")
      .replace(/\bcreate\b/gi, "creates")
      .replace(/\bsave\b/gi, "saves")
      .replace(/\bupload\b/gi, "uploads")
      .replace(/\bdownload\b/gi, "downloads");

    return `${subject} ${presentAction}`;
  }

  // Handle "X should Y" pattern -> "X does Y"
  const shouldMatch = normalized.match(/^(.+?)\s+should\s+(.+)$/i);
  if (shouldMatch) {
    return `${shouldMatch[1]} ${shouldMatch[2]}`;
  }

  // Remove "should" prefix if present
  if (normalized.startsWith("should ")) {
    normalized = normalized.substring(7);
  }

  return normalized;
}

/**
 * Sanitize a module name to be filesystem-safe
 */
function sanitizeModuleName(module: string): string {
  return module
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Generate suggested test file paths based on feature and project structure
 */
function generateTestFilePaths(
  feature: Feature,
  capabilities: ExtendedCapabilities | null,
  projectRoot: string
): { unit: string[]; e2e: string[] } {
  const sanitizedModule = sanitizeModuleName(feature.module);
  const featureSlug = feature.id.split(".").pop() || feature.id;

  // Determine test file extension based on framework
  const testExt = getTestExtension(capabilities?.testFramework);
  const e2eExt = ".spec.ts"; // Playwright convention

  // Generate unit test paths
  const unitPaths: string[] = [];

  // Primary path based on module
  unitPaths.push(`tests/${sanitizedModule}/${featureSlug}.test${testExt}`);

  // Alternative flat structure
  unitPaths.push(`tests/${sanitizedModule}.${featureSlug}.test${testExt}`);

  // Generate E2E test paths
  const e2ePaths: string[] = [];

  // Primary Playwright structure
  e2ePaths.push(`e2e/${sanitizedModule}/${featureSlug}${e2eExt}`);

  // Alternative flat structure
  e2ePaths.push(`e2e/${featureSlug}${e2eExt}`);

  return { unit: unitPaths, e2e: e2ePaths };
}

/**
 * Get test file extension based on test framework
 */
function getTestExtension(testFramework: string | undefined): string {
  switch (testFramework?.toLowerCase()) {
    case "vitest":
    case "jest":
      return ".ts";
    case "mocha":
      return ".ts";
    case "pytest":
      return ".py";
    case "go":
      return "_test.go";
    case "cargo":
      return ".rs";
    default:
      return ".ts"; // Default to TypeScript
  }
}

/**
 * Generate TDD guidance for a feature
 *
 * @param feature - The feature to generate guidance for
 * @param capabilities - Detected project capabilities (or null if unknown)
 * @param projectRoot - Root directory of the project
 * @returns TDD guidance with suggested test files and case names
 */
export function generateTDDGuidance(
  feature: Feature,
  capabilities: ExtendedCapabilities | null,
  projectRoot: string
): TDDGuidance {
  // Generate suggested test file paths
  const suggestedTestFiles = generateTestFilePaths(feature, capabilities, projectRoot);

  // Map acceptance criteria to test cases
  const acceptanceMapping: AcceptanceTestMapping[] = feature.acceptance.map((criterion) => {
    const unitTestCase = criterionToTestCase(criterion);

    // Determine if this criterion needs an E2E test
    // UI-related keywords suggest E2E testing
    const uiKeywords = [
      "user",
      "display",
      "show",
      "click",
      "navigate",
      "redirect",
      "form",
      "page",
      "button",
      "input",
      "message",
      "modal",
      "dialog",
      "toast",
      "notification",
      "error",
      "success",
    ];

    const needsE2E = uiKeywords.some((keyword) =>
      criterion.toLowerCase().includes(keyword)
    );

    return {
      criterion,
      unitTestCase,
      e2eScenario: needsE2E ? criterionToE2EScenario(criterion) : undefined,
    };
  });

  // Generate test case stubs
  const testCaseStubs = {
    unit: acceptanceMapping.map((m) => m.unitTestCase),
    e2e: acceptanceMapping
      .filter((m) => m.e2eScenario)
      .map((m) => m.e2eScenario as string),
  };

  return {
    featureId: feature.id,
    suggestedTestFiles,
    testCaseStubs,
    acceptanceMapping,
  };
}

/**
 * Supported test frameworks for unit test skeleton generation
 */
export type TestFramework = "vitest" | "jest" | "mocha" | "pytest" | "go" | "cargo";

/**
 * Generate a unit test file skeleton for a feature
 *
 * @param feature - The feature to generate tests for
 * @param testCases - Array of test case names
 * @param framework - Test framework to use
 * @returns String containing the test file skeleton
 */
export function generateUnitTestSkeleton(
  feature: Feature,
  testCases: string[],
  framework: TestFramework
): string {
  switch (framework) {
    case "vitest":
      return generateVitestSkeleton(feature, testCases);
    case "jest":
      return generateJestSkeleton(feature, testCases);
    case "mocha":
      return generateMochaSkeleton(feature, testCases);
    case "pytest":
      return generatePytestSkeleton(feature, testCases);
    case "go":
      return generateGoTestSkeleton(feature, testCases);
    case "cargo":
      return generateCargoTestSkeleton(feature, testCases);
    default:
      return generateVitestSkeleton(feature, testCases);
  }
}

/**
 * Generate Vitest test skeleton
 */
function generateVitestSkeleton(feature: Feature, testCases: string[]): string {
  const featureName = feature.id.split(".").pop() || feature.id;
  const modulePath = `../src/${feature.module}/${featureName}.js`;

  const imports = `import { describe, it, expect, beforeEach, afterEach } from "vitest";
// import { ... } from "${modulePath}";
`;

  const testBlocks = testCases
    .map(
      (testCase) => `  it("${testCase}", () => {
    // Arrange
    // TODO: Set up test data and mocks

    // Act
    // TODO: Call the function/method under test

    // Assert
    // TODO: Verify the expected outcome
    expect(true).toBe(true); // Replace with actual assertion
  });`
    )
    .join("\n\n");

  return `${imports}
describe("${featureName}", () => {
  beforeEach(() => {
    // TODO: Set up before each test
  });

  afterEach(() => {
    // TODO: Clean up after each test
  });

${testBlocks}
});
`;
}

/**
 * Generate Jest test skeleton
 */
function generateJestSkeleton(feature: Feature, testCases: string[]): string {
  const featureName = feature.id.split(".").pop() || feature.id;
  const modulePath = `../src/${feature.module}/${featureName}`;

  const imports = `// import { ... } from "${modulePath}";
`;

  const testBlocks = testCases
    .map(
      (testCase) => `  it("${testCase}", () => {
    // Arrange
    // TODO: Set up test data and mocks

    // Act
    // TODO: Call the function/method under test

    // Assert
    // TODO: Verify the expected outcome
    expect(true).toBe(true); // Replace with actual assertion
  });`
    )
    .join("\n\n");

  return `${imports}
describe("${featureName}", () => {
  beforeEach(() => {
    // TODO: Set up before each test
  });

  afterEach(() => {
    // TODO: Clean up after each test
  });

${testBlocks}
});
`;
}

/**
 * Generate Mocha test skeleton
 */
function generateMochaSkeleton(feature: Feature, testCases: string[]): string {
  const featureName = feature.id.split(".").pop() || feature.id;
  const modulePath = `../src/${feature.module}/${featureName}`;

  const imports = `import { expect } from "chai";
// import { ... } from "${modulePath}";
`;

  const testBlocks = testCases
    .map(
      (testCase) => `  it("${testCase}", () => {
    // Arrange
    // TODO: Set up test data and mocks

    // Act
    // TODO: Call the function/method under test

    // Assert
    // TODO: Verify the expected outcome
    expect(true).to.be.true; // Replace with actual assertion
  });`
    )
    .join("\n\n");

  return `${imports}
describe("${featureName}", () => {
  beforeEach(() => {
    // TODO: Set up before each test
  });

  afterEach(() => {
    // TODO: Clean up after each test
  });

${testBlocks}
});
`;
}

/**
 * Generate pytest test skeleton
 */
function generatePytestSkeleton(feature: Feature, testCases: string[]): string {
  const featureName = feature.id.split(".").pop() || feature.id;
  const className = featureName
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  const imports = `import pytest
# from ${feature.module}.${featureName} import ...
`;

  const testFunctions = testCases
    .map((testCase) => {
      const funcName = testCase
        .replace(/^should\s+/i, "test_")
        .replace(/\s+/g, "_")
        .toLowerCase();
      return `    def ${funcName}(self):
        """${testCase}"""
        # Arrange
        # TODO: Set up test data

        # Act
        # TODO: Call the function under test

        # Assert
        # TODO: Verify the expected outcome
        assert True  # Replace with actual assertion`;
    })
    .join("\n\n");

  return `${imports}

class Test${className}:
    @pytest.fixture(autouse=True)
    def setup(self):
        """Set up test fixtures"""
        # TODO: Set up before each test
        yield
        # TODO: Clean up after each test

${testFunctions}
`;
}

/**
 * Generate Go test skeleton
 */
function generateGoTestSkeleton(feature: Feature, testCases: string[]): string {
  const featureName = feature.id.split(".").pop() || feature.id;
  const packageName = feature.module.toLowerCase().replace(/[^a-z0-9]/g, "");

  const testFunctions = testCases
    .map((testCase) => {
      const funcName =
        "Test" +
        testCase
          .replace(/^should\s+/i, "")
          .split(/\s+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join("");
      return `func ${funcName}(t *testing.T) {
\t// ${testCase}
\t// Arrange
\t// TODO: Set up test data

\t// Act
\t// TODO: Call the function under test

\t// Assert
\t// TODO: Verify the expected outcome
\tif false {
\t\tt.Error("Test not implemented")
\t}
}`;
    })
    .join("\n\n");

  return `package ${packageName}

import (
\t"testing"
)

${testFunctions}
`;
}

/**
 * Generate Rust/Cargo test skeleton
 */
function generateCargoTestSkeleton(feature: Feature, testCases: string[]): string {
  const featureName = feature.id.split(".").pop() || feature.id;

  const testFunctions = testCases
    .map((testCase) => {
      const funcName = testCase
        .replace(/^should\s+/i, "test_")
        .replace(/\s+/g, "_")
        .toLowerCase();
      return `    #[test]
    fn ${funcName}() {
        // ${testCase}
        // Arrange
        // TODO: Set up test data

        // Act
        // TODO: Call the function under test

        // Assert
        // TODO: Verify the expected outcome
        assert!(true); // Replace with actual assertion
    }`;
    })
    .join("\n\n");

  return `#[cfg(test)]
mod ${featureName.replace(/-/g, "_")}_tests {
    use super::*;

${testFunctions}
}
`;
}

/**
 * Generate a Playwright E2E test skeleton for a feature
 *
 * @param feature - The feature to generate E2E tests for
 * @param scenarios - Array of E2E scenario names
 * @param tags - Array of Playwright tags (e.g., ["@smoke", "@feature-auth"])
 * @returns String containing the Playwright test file skeleton
 */
export function generateE2ETestSkeleton(
  feature: Feature,
  scenarios: string[],
  tags: string[] = []
): string {
  const featureName = feature.id.split(".").pop() || feature.id;
  const className = featureName
    .split(/[-_.]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");

  const tagAnnotations = tags.length > 0 ? ` ${tags.join(" ")}` : "";

  const pageObjectClass = `/**
 * Page Object for ${featureName}
 * Encapsulates page interactions and locators
 */
class ${className}Page {
  readonly page: Page;

  // Locators
  // TODO: Add your locators here
  // readonly submitButton: Locator;
  // readonly emailInput: Locator;

  constructor(page: Page) {
    this.page = page;
    // Initialize locators
    // this.submitButton = page.getByRole("button", { name: "Submit" });
    // this.emailInput = page.getByLabel("Email");
  }

  async goto() {
    // TODO: Navigate to the page
    await this.page.goto("/${feature.module}/${featureName}");
  }

  // Page actions
  // TODO: Add your page actions here
  // async fillEmail(email: string) {
  //   await this.emailInput.fill(email);
  // }
  //
  // async submit() {
  //   await this.submitButton.click();
  // }
}`;

  const testBlocks = scenarios
    .map(
      (scenario) => `  test("${scenario}",${tagAnnotations} async ({ page }) => {
    const ${featureName}Page = new ${className}Page(page);

    // Arrange
    await ${featureName}Page.goto();

    // Act
    // TODO: Perform user actions

    // Assert
    // TODO: Verify the expected UI state
    await expect(page).toHaveTitle(/.*/); // Replace with actual assertion
  });`
    )
    .join("\n\n");

  return `import { test, expect, type Page, type Locator } from "@playwright/test";

${pageObjectClass}

test.describe("${featureName}", () => {
  test.beforeEach(async ({ page }) => {
    // TODO: Set up before each test (e.g., login, seed data)
  });

${testBlocks}
});
`;
}
