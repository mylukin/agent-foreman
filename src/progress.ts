/**
 * Progress indicators for long-running operations
 * Supports both TTY and non-TTY environments
 */

import chalk from "chalk";

/**
 * Check if output is a TTY (interactive terminal)
 */
export function isTTY(): boolean {
  return process.stdout.isTTY === true;
}

/**
 * Spinner characters for TTY output
 */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Spinner for showing activity during long operations
 */
export class Spinner {
  private message: string;
  private startTime: number;
  private intervalId: NodeJS.Timeout | null = null;
  private frameIndex = 0;
  private stopped = false;

  constructor(message: string) {
    this.message = message;
    this.startTime = Date.now();
  }

  /**
   * Start the spinner
   */
  start(): void {
    if (this.stopped) return;
    this.startTime = Date.now();

    if (isTTY()) {
      // In TTY mode, show animated spinner
      this.intervalId = setInterval(() => {
        this.render();
      }, 80);
      this.render();
    } else {
      // In non-TTY mode, just print the message once
      console.log(`${this.message}...`);
    }
  }

  /**
   * Render current spinner frame (TTY only)
   */
  private render(): void {
    if (!isTTY() || this.stopped) return;

    const elapsed = this.getElapsedTime();
    const frame = SPINNER_FRAMES[this.frameIndex];
    const output = `\r${chalk.cyan(frame)} ${this.message} ${chalk.gray(`(${elapsed})`)}`;

    process.stdout.write(output);
    this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
  }

  /**
   * Update the spinner message
   */
  update(message: string): void {
    this.message = message;
    if (!isTTY()) {
      console.log(`${message}...`);
    }
  }

  /**
   * Get formatted elapsed time
   */
  private getElapsedTime(): string {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    if (elapsed < 60) {
      return `${elapsed}s`;
    }
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    return `${minutes}m ${seconds}s`;
  }

  /**
   * Stop the spinner with success message
   */
  succeed(message?: string): void {
    this.stop();
    const elapsed = this.getElapsedTime();
    const finalMessage = message || this.message;

    if (isTTY()) {
      process.stdout.write(`\r${chalk.green("✓")} ${finalMessage} ${chalk.gray(`(${elapsed})`)}\n`);
    } else {
      console.log(`✓ ${finalMessage} (${elapsed})`);
    }
  }

  /**
   * Stop the spinner with failure message
   */
  fail(message?: string): void {
    this.stop();
    const elapsed = this.getElapsedTime();
    const finalMessage = message || this.message;

    if (isTTY()) {
      process.stdout.write(`\r${chalk.red("✗")} ${finalMessage} ${chalk.gray(`(${elapsed})`)}\n`);
    } else {
      console.log(`✗ ${finalMessage} (${elapsed})`);
    }
  }

  /**
   * Stop the spinner with warning message
   */
  warn(message?: string): void {
    this.stop();
    const elapsed = this.getElapsedTime();
    const finalMessage = message || this.message;

    if (isTTY()) {
      process.stdout.write(`\r${chalk.yellow("⚠")} ${finalMessage} ${chalk.gray(`(${elapsed})`)}\n`);
    } else {
      console.log(`⚠ ${finalMessage} (${elapsed})`);
    }
  }

  /**
   * Stop the spinner without status message
   */
  stop(): void {
    this.stopped = true;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Clear the line in TTY mode
    if (isTTY()) {
      process.stdout.write("\r" + " ".repeat(80) + "\r");
    }
  }
}

/**
 * Progress bar for showing completion of multi-step operations
 */
export class ProgressBar {
  private total: number;
  private current = 0;
  private message: string;
  private width: number;

  constructor(message: string, total: number, width: number = 30) {
    this.message = message;
    this.total = total;
    this.width = width;
  }

  /**
   * Start the progress bar
   */
  start(): void {
    this.current = 0;
    this.render();
  }

  /**
   * Update progress
   */
  update(current: number, message?: string): void {
    this.current = current;
    if (message) {
      this.message = message;
    }
    this.render();
  }

  /**
   * Increment progress by 1
   */
  increment(message?: string): void {
    this.update(this.current + 1, message);
  }

  /**
   * Render the progress bar
   */
  private render(): void {
    const percent = Math.min(100, Math.round((this.current / this.total) * 100));
    const filledWidth = Math.min(this.width, Math.round((this.current / this.total) * this.width));
    const emptyWidth = Math.max(0, this.width - filledWidth);

    const filled = chalk.green("█".repeat(filledWidth));
    const empty = chalk.gray("░".repeat(emptyWidth));
    const bar = `[${filled}${empty}]`;

    const stepInfo = chalk.gray(`(${this.current}/${this.total})`);
    const percentInfo = chalk.cyan(`${percent}%`);

    if (isTTY()) {
      process.stdout.write(`\r   ${bar} ${percentInfo} ${stepInfo} ${this.message}`);
    } else {
      console.log(`   [${this.current}/${this.total}] ${percent}% - ${this.message}`);
    }
  }

  /**
   * Complete the progress bar
   */
  complete(message?: string): void {
    this.current = this.total;
    const finalMessage = message || this.message;

    if (isTTY()) {
      const filled = chalk.green("█".repeat(this.width));
      const bar = `[${filled}]`;
      process.stdout.write(`\r   ${bar} ${chalk.green("100%")} ${chalk.gray(`(${this.total}/${this.total})`)} ${finalMessage}\n`);
    } else {
      console.log(`   [${this.total}/${this.total}] 100% - ${finalMessage} ✓`);
    }
  }
}

/**
 * Step progress indicator for verification workflow
 */
export class StepProgress {
  private steps: string[];
  private currentStep = 0;
  private stepSpinner: Spinner | null = null;

  constructor(steps: string[]) {
    this.steps = steps;
  }

  /**
   * Start showing progress
   */
  start(): void {
    this.showOverview();
    this.startStep(0);
  }

  /**
   * Show all steps overview
   */
  private showOverview(): void {
    if (!isTTY()) {
      console.log(`\n   Verification steps: ${this.steps.length}`);
      this.steps.forEach((step, i) => {
        console.log(`   ${i + 1}. ${step}`);
      });
      console.log("");
    }
  }

  /**
   * Start a specific step
   */
  startStep(index: number): void {
    if (index >= this.steps.length) return;

    this.currentStep = index;
    const stepLabel = `Step ${index + 1}/${this.steps.length}: ${this.steps[index]}`;

    if (isTTY()) {
      this.stepSpinner = new Spinner(stepLabel);
      this.stepSpinner.start();
    } else {
      console.log(`   [${index + 1}/${this.steps.length}] ${this.steps[index]}...`);
    }
  }

  /**
   * Complete current step and move to next
   */
  completeStep(success: boolean = true): void {
    if (this.stepSpinner) {
      if (success) {
        this.stepSpinner.succeed();
      } else {
        this.stepSpinner.fail();
      }
    }

    // Start next step if available
    if (this.currentStep + 1 < this.steps.length) {
      this.startStep(this.currentStep + 1);
    }
  }

  /**
   * Mark current step with a warning
   */
  warnStep(): void {
    if (this.stepSpinner) {
      this.stepSpinner.warn();
    }

    // Start next step if available
    if (this.currentStep + 1 < this.steps.length) {
      this.startStep(this.currentStep + 1);
    }
  }

  /**
   * Complete all remaining steps (for early termination)
   */
  complete(): void {
    if (this.stepSpinner) {
      this.stepSpinner.stop();
    }
  }

  /**
   * Get current step index
   */
  getCurrentStep(): number {
    return this.currentStep;
  }
}

/**
 * Create and start a spinner
 */
export function createSpinner(message: string): Spinner {
  const spinner = new Spinner(message);
  spinner.start();
  return spinner;
}

/**
 * Create a progress bar
 */
export function createProgressBar(
  message: string,
  total: number,
  width?: number
): ProgressBar {
  return new ProgressBar(message, total, width);
}

/**
 * Create step progress for verification
 */
export function createStepProgress(steps: string[]): StepProgress {
  return new StepProgress(steps);
}
