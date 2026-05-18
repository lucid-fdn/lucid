/**
 * Assembles skill fragments into a single skill prompt.
 * Filters empty fragments, trims whitespace, joins with double newline.
 *
 * @example
 * const skill = composeSkill([
 *   readFragment,      // rules/read-before-act.md content
 *   simulateFragment,  // rules/simulation-first.md content
 *   swapWorkflow,      // workflows/swap-flow.md content
 * ])
 */
export function composeSkill(fragments: string[]): string {
  return fragments
    .map((f) => f.trim())
    .filter(Boolean)
    .join('\n\n')
}
