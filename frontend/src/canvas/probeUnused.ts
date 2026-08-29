/*
 * TEMPORARY PROBE. Deliberately breaks ESLint and TypeScript so the fixer job
 * has something real to repair. Deleted the moment the answer is recorded.
 */
export function addNumbers(a: number, b: number): number {
  const unusedOnPurpose: string = 'this variable is never read'
  return a + b
}
