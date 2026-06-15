/**
 * Global declaration for Angular's $localize tag function.
 * This allows TypeScript files to use $localize without per-file declarations.
 */
declare const $localize: (
  messageParts: TemplateStringsArray,
  ...expressions: readonly unknown[]
) => string;
