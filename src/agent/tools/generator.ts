import { getGeminiClient, MODEL } from '../../lib/gemini'
import { GENERATE_PROMPT } from '../../prompts/generate'
import { DesignIR } from '../../schemas/ir'

export async function generateHTML(
  analyzerInteractionId: string,
  apiKey: string,
  ir?: DesignIR
): Promise<{ html: string; interactionId: string }> {
  const ai = getGeminiClient(apiKey)

  // If we have an updated IR (with injected image URLs), include it in the prompt
  const inputText = ir
    ? `Generate the complete email HTML from this updated design IR (with real image URLs):\n\n${JSON.stringify(ir, null, 2)}\n\nOutput only the HTML, nothing else.`
    : 'Generate the complete email HTML from the design IR you just analyzed. Output only the HTML, nothing else.'

  const interaction = await ai.interactions.create({
    model: MODEL,
    system_instruction: GENERATE_PROMPT,
    input: inputText,
    previous_interaction_id: analyzerInteractionId,  // KEY: chains context
  })

  if (!interaction.output_text) {
    throw new Error('Generator API returned empty output_text')
  }

  return { html: interaction.output_text, interactionId: interaction.id }
}
