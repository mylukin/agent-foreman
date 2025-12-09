/**
 * Binary Self-Update Module
 *
 * Handles downloading and replacing the current executable from GitHub Releases.
 * Only used when running as a compiled Bun binary.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import chalk from "chalk";

const GITHUB_REPO = "mylukin/agent-foreman";
const GITHUB_API_BASE = "https://api.github.com/repos";

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface GitHubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

/**
 * Get platform-specific binary name
 */
export function getBinaryName(): string {
  const platform = os.platform(); // darwin, linux, win32
  const arch = os.arch(); // x64, arm64

  const platformMap: Record<string, string> = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  };

  const archMap: Record<string, string> = {
    x64: "x64",
    arm64: "arm64",
  };

  const platformStr = platformMap[platform] || platform;
  const archStr = archMap[arch] || "x64";

  const baseName = `agent-foreman-${platformStr}-${archStr}`;
  return platform === "win32" ? `${baseName}.exe` : baseName;
}

/**
 * Get current executable path
 * For Bun compiled binaries, process.execPath points to the binary itself
 */
export function getCurrentExecutablePath(): string {
  let execPath = process.execPath;

  // Resolve any symbolic links to get the actual file
  try {
    execPath = fs.realpathSync(execPath);
  } catch {
    // If realpath fails, use as-is
  }

  return execPath;
}

/**
 * Fetch latest release info from GitHub API
 */
export async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const url = `${GITHUB_API_BASE}/${GITHUB_REPO}/releases/latest`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "agent-foreman-updater",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as GitHubRelease;
  } catch {
    return null;
  }
}

/**
 * Fetch latest version from GitHub Releases
 */
export async function fetchLatestGitHubVersion(): Promise<string | null> {
  const release = await fetchLatestRelease();
  if (!release) return null;
  return parseVersionFromTag(release.tag_name);
}

/**
 * Parse version from tag (removes 'v' prefix)
 */
export function parseVersionFromTag(tag: string): string {
  return tag.replace(/^v/, "");
}

/**
 * Download file to temporary location
 */
async function downloadToTemp(url: string, fileName: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `agent-foreman-update-${Date.now()}-${fileName}`);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "agent-foreman-updater",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(tmpPath, Buffer.from(buffer));

  return tmpPath;
}

/**
 * Replace current executable with new version
 *
 * Strategy:
 * 1. Download new binary to temp location
 * 2. Backup current binary to .bak
 * 3. Move new binary to current location
 * 4. Set executable permissions
 * 5. Clean up backup on success
 */
export async function replaceBinary(downloadUrl: string, fileName: string): Promise<void> {
  const currentPath = getCurrentExecutablePath();
  const backupPath = `${currentPath}.bak`;

  console.log(chalk.gray(`  Downloading new binary...`));

  // Step 1: Download to temp
  const tmpPath = await downloadToTemp(downloadUrl, fileName);

  try {
    // Step 2: Backup current (if exists and writable)
    try {
      if (fs.existsSync(currentPath)) {
        fs.renameSync(currentPath, backupPath);
      }
    } catch {
      // On some systems, cannot rename running executable
      throw new Error(
        `Cannot backup current binary. Please download manually from:\n  https://github.com/${GITHUB_REPO}/releases/latest`
      );
    }

    // Step 3: Move new binary to current location
    fs.renameSync(tmpPath, currentPath);

    // Step 4: Set executable permissions (Unix only)
    if (os.platform() !== "win32") {
      fs.chmodSync(currentPath, 0o755);
    }

    // Step 5: Clean up backup
    try {
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  } catch (err) {
    // Rollback: restore backup if it exists
    try {
      if (fs.existsSync(backupPath) && !fs.existsSync(currentPath)) {
        fs.renameSync(backupPath, currentPath);
      }
    } catch {
      // Rollback failed
    }

    // Clean up temp file
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch {
      // Ignore
    }

    throw err;
  }
}

/**
 * Check if we can write to the current executable location
 */
export function canWriteToExecutable(): boolean {
  try {
    const execPath = getCurrentExecutablePath();
    fs.accessSync(path.dirname(execPath), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Perform binary upgrade from GitHub Releases
 */
export async function performBinaryUpgrade(
  currentVersion: string,
  targetVersion: string
): Promise<{ success: boolean; error?: string }> {
  console.log(chalk.blue("\n📦 Upgrading agent-foreman binary..."));

  try {
    // Fetch release info
    const release = await fetchLatestRelease();
    if (!release) {
      return { success: false, error: "Could not fetch release information from GitHub" };
    }

    // Find matching asset
    const binaryName = getBinaryName();
    const asset = release.assets.find((a) => a.name === binaryName);

    if (!asset) {
      return {
        success: false,
        error:
          `No binary available for your platform (${binaryName}).\n` +
          `  Available: ${release.assets.map((a) => a.name).join(", ")}\n` +
          `  Download manually: https://github.com/${GITHUB_REPO}/releases/latest`,
      };
    }

    console.log(chalk.gray(`  Binary: ${binaryName} (${(asset.size / 1024 / 1024).toFixed(1)} MB)`));

    // Download and replace
    await replaceBinary(asset.browser_download_url, binaryName);

    console.log(chalk.green(`\n✓ Upgraded from v${currentVersion} to v${targetVersion}`));

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error during binary upgrade",
    };
  }
}
