// Gom log của Nest THEO TỪNG MỨC (captureNestLogger của A2 gộp mọi mức vào một mảng nên không kiểm được "lượt rỗng chỉ ghi ở mức debug").
import { Logger } from '@nestjs/common';
import { vi } from 'vitest';

export interface LogsByLevel {
  log: string[];
  warn: string[];
  error: string[];
  debug: string[];
  verbose: string[];
  fatal: string[];
}

const LEVELS = ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const;

const describeArg = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value instanceof Error
      ? `${value.name}: ${value.message}\n${value.stack ?? ''}`
      : JSON.stringify(value);

/** Mọi lời gọi Logger của Nest, không in ra màn hình, chia theo mức. Gọi `vi.restoreAllMocks()` ở afterEach để trả lại. */
export function captureLogsByLevel(): LogsByLevel {
  const logs: LogsByLevel = {
    log: [],
    warn: [],
    error: [],
    debug: [],
    verbose: [],
    fatal: [],
  };
  for (const level of LEVELS) {
    vi.spyOn(Logger.prototype, level).mockImplementation(
      (message: unknown, ...rest: unknown[]) => {
        logs[level].push([message, ...rest].map(describeArg).join(' '));
      },
    );
  }
  return logs;
}

export const allLines = (logs: LogsByLevel): string[] =>
  LEVELS.flatMap((level) => logs[level]);
