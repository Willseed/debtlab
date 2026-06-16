import assert from 'node:assert/strict';

const INTERNAL_CONFIGURATION_PATTERN =
  /Session secret is not configured|Google OAuth is not configured|Apple OAuth is not configured|Static asset binding is not configured|SESSION_SECRET|GOOGLE_CLIENT|APPLE_|ASSETS/u;

export function assertNoInternalConfigurationLeak(bodyText: string): void {
  assert.doesNotMatch(bodyText, INTERNAL_CONFIGURATION_PATTERN);
}

export async function captureConsoleError<T>(
  operation: () => Promise<T>,
): Promise<{ readonly result: T; readonly output: string }> {
  const originalConsoleError = console.error;
  const entries: string[] = [];

  console.error = (...values: unknown[]) => {
    entries.push(values.map(formatConsoleValue).join(' '));
  };

  try {
    return {
      result: await operation(),
      output: entries.join('\n'),
    };
  } finally {
    console.error = originalConsoleError;
  }
}

function formatConsoleValue(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`;
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
