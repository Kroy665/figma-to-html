// The AI is already instructed to generate all CSS as inline styles
// This step is a pass-through since juice requires DOM APIs not available in Figma
export function inlineStyles(html: string): string {
  // Return as-is since the AI already generates inline styles
  // The generate prompt explicitly requires: "ALL CSS must be inline styles"
  return html
}
