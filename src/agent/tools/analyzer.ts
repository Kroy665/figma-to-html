import { getGeminiClient, MODEL } from '../../lib/gemini'
import { DesignIRSchema, designIRJsonSchema, DesignIR } from '../../schemas/ir'
import { ANALYZE_PROMPT } from '../../prompts/analyze'
import { ExtractedNode } from '../../types/figma'

export async function analyzeDesign(
  nodes: ExtractedNode,
  screenshotBase64: string,
  apiKey: string
): Promise<{ ir: DesignIR; interactionId: string }> {
  console.log('[Analyzer] API Key length:', apiKey?.length);
  console.log('[Analyzer] API Key prefix:', apiKey?.substring(0, 10));

  // Log the JSON schema being sent
  console.log('[Analyzer] JSON Schema:', JSON.stringify(designIRJsonSchema, null, 2).substring(0, 2000));

  const ai = getGeminiClient(apiKey)
  console.log('[Analyzer] Client created:', !!ai);

  // Strip data URI prefix if present
  const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '')
  console.log('[Analyzer] Screenshot base64 length:', base64Data.length)

  let interaction;
  try {
    interaction = await ai.interactions.create({
      model: MODEL,
      system_instruction: ANALYZE_PROMPT,
      input: [
        {
          type: 'image',
          data: base64Data,
          mime_type: 'image/png',
        },
        {
          type: 'text',
          text: `Here is the Figma node tree JSON:\n${JSON.stringify(nodes, null, 2)}`,
        },
      ],
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: designIRJsonSchema,
      },
    })
  } catch (error: any) {
    console.error('[Analyzer] API call failed:', error);
    console.error('[Analyzer] Error details:', JSON.stringify(error, null, 2));
    throw new Error(`Analyzer API failed: ${error.message || String(error)}`)
  }

  if (!interaction.output_text) {
    throw new Error('Analyzer API returned empty output_text')
  }

  console.log('[Analyzer] Raw response:', interaction.output_text.substring(0, 500));

  let parsedData;
  try {
    parsedData = JSON.parse(interaction.output_text);
    console.log('[Analyzer] Parsed data keys:', Object.keys(parsedData));
    console.log('[Analyzer] Parsed data:', JSON.stringify(parsedData, null, 2).substring(0, 1000));
  } catch (e) {
    console.error('[Analyzer] JSON parse error:', e);
    throw new Error('Failed to parse AI response as JSON');
  }

  // Clean up invalid numeric values (Infinity, NaN)
  function cleanNumericValues(obj: any): any {
    if (obj === null || obj === undefined) return obj
    if (typeof obj === 'number') {
      if (!isFinite(obj)) return undefined
      return obj
    }
    if (Array.isArray(obj)) {
      return obj.map(cleanNumericValues)
    }
    if (typeof obj === 'object') {
      const cleaned: any = {}
      for (const key in obj) {
        const value = cleanNumericValues(obj[key])
        if (value !== undefined) {
          cleaned[key] = value
        }
      }
      return cleaned
    }
    return obj
  }

  const cleanedData = cleanNumericValues(parsedData)
  console.log('[Analyzer] Cleaned data:', JSON.stringify(cleanedData, null, 2).substring(0, 1000));

  const ir = DesignIRSchema.parse(cleanedData);
  return { ir, interactionId: interaction.id }
}
