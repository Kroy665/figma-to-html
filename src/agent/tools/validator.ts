import { getGeminiClient, MODEL } from '../../lib/gemini'
import { VALIDATE_PROMPT } from '../../prompts/validate'

export async function validateHTML(
  inlinedHTML: string,
  generatorInteractionId: string,
  apiKey: string
): Promise<string> {
  const ai = getGeminiClient(apiKey)

  const interaction = await ai.interactions.create({
    model: MODEL,
    system_instruction: VALIDATE_PROMPT,
    input: `Here is the inlined HTML to review and fix:\n\n${inlinedHTML}`,
    previous_interaction_id: generatorInteractionId,
  })

  if (!interaction.output_text) {
    throw new Error('Validator API returned empty output_text')
  }

  return interaction.output_text
}
