/**
 * Conditional class names.
 *
 * Deliberately not `clsx` + `tailwind-merge`. Those exist to resolve conflicts
 * between utilities that arrive from different places — a component's own class
 * versus one passed down as a prop. Nothing here does that: every call site
 * below picks one class per branch of a condition, so the branches are already
 * mutually exclusive and a plain join is the whole job.
 *
 * Two fewer dependencies in a workspace whose point is to stay small.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
