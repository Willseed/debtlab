const MAX_SAFE_LOG_MESSAGE_LENGTH = 200;
const SENSITIVE_LOG_MESSAGE_PATTERN =
  /\b(?:authorization|cookie|credential|password|token|secret)\b|authorization[_ -]?code|client[_ -]?secret|private[_ -]?key|session[_ -]?token|access[_ -]?token|refresh[_ -]?token|id[_ -]?token/iu;

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

  if (SENSITIVE_LOG_MESSAGE_PATTERN.test(message)) {
    return 'Redacted sensitive error message.';
  }

  if (message.length > MAX_SAFE_LOG_MESSAGE_LENGTH) {
    return `${message.slice(0, MAX_SAFE_LOG_MESSAGE_LENGTH)}…`;
  }

  return message;
}
