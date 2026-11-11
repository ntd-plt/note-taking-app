// The message to show for a caught error, or '' when it isn't an Error.
export const errorMessage = (err: unknown): string =>
  err instanceof Error ? err.message : ''
