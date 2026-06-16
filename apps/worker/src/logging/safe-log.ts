const MAX_SAFE_LOG_MESSAGE_LENGTH = 200;
const SENSITIVE_LOG_MESSAGE_PATTERNS = [
  /\bauthorization\b/iu,
  /\bcookie\b/iu,
  /\bcredential\b/iu,
  /\bpassword\b/iu,
  /\btoken\b/iu,
  /\bsecret\b/iu,
  /authorization[_ -]?code/iu,
  /client[_ -]?secret/iu,
  /private[_ -]?key/iu,
  /session[_ -]?token/iu,
  /access[_ -]?token/iu,
  /refresh[_ -]?token/iu,
  /id[_ -]?token/iu,
] as const;

export type SafeLogError = {
  readonly name: string;
  readonly message: string;
};

export function logWorkerError(context: string, error: unknown): void {
  console.error(context, toSafeLogError(error));
}

export function toSafeLogError(error: unknown): SafeLogError {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError', message: 'Non-Error thrown.' };
  }

  return {
    name: error.name || 'Error',
    message: sanitizeErrorMessage(error.message),
  };
}

function sanitizeErrorMessage(message: string): string {
  if (!message) {
    return 'No error message.';
  }

  if (SENSITIVE_LOG_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))) {
    return 'Redacted sensitive error message.';
  }

  if (message.length > MAX_SAFE_LOG_MESSAGE_LENGTH) {
    return `${message.slice(0, MAX_SAFE_LOG_MESSAGE_LENGTH)}…`;
  }

  return message;
}
