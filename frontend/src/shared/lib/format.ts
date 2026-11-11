// A date like "Nov 11, 2026", or "Nov 11, 2026, 01:13 PM" with time.
export function formatDate(s: string, { time = false } = {}): string {
  return new Date(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(time && { hour: '2-digit', minute: '2-digit' }),
  })
}
