import { analyzeDesign } from './tools/analyzer'
import { generateHTML } from './tools/generator'
import { inlineStyles } from './tools/inliner'
import { validateHTML } from './tools/validator'
import { FigmaPayload } from '../types/messages'

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export interface PipelineStep {
  id: string
  label: string
  status: StepStatus
  error?: string
}

export interface OrchestratorCallbacks {
  onStepUpdate: (steps: PipelineStep[]) => void
}

export async function runPipeline(
  figmaData: FigmaPayload,
  apiKey: string,
  callbacks: OrchestratorCallbacks
): Promise<string> {

  const steps: PipelineStep[] = [
    { id: 'analyze',  label: 'Analyzing design...',   status: 'pending' },
    { id: 'generate', label: 'Generating HTML...',    status: 'pending' },
    { id: 'inline',   label: 'Inlining styles...',   status: 'pending' },
    { id: 'validate', label: 'Validating output...',  status: 'pending' },
  ]

  const update = (id: string, status: StepStatus, error?: string) => {
    const s = steps.find(s => s.id === id)
    if (s) { s.status = status; s.error = error }
    callbacks.onStepUpdate([...steps])
  }

  try {
    // Step 1: Analyze — multimodal, structured output
    update('analyze', 'running')
    console.log('[Orchestrator] Images available:', Object.keys(figmaData.images).length)
    console.log('[Orchestrator] Image IDs:', Object.keys(figmaData.images))

    const { ir, interactionId: analyzeId } = await analyzeDesign(
      figmaData.nodes,
      figmaData.screenshot,
      apiKey
    )

    // Inject image references (placeholders) instead of actual blob data
    // We'll replace these with real data URIs after HTML generation
    const imageUrls = Object.values(figmaData.images)
    const imageReferences: string[] = []
    let imageIndex = 0

    console.log('[Orchestrator] Total images available:', imageUrls.length)

    for (const section of ir.sections) {
      for (const child of section.children) {
        if (child.type === 'image') {
          // Use a placeholder reference instead of actual blob
          const placeholder = `__IMAGE_${imageIndex}__`
          child.src = placeholder
          imageReferences.push(placeholder)
          console.log('[Orchestrator] Added image reference:', placeholder)
          imageIndex++
        }
      }
    }

    console.log('[Orchestrator] Total image references added:', imageReferences.length)
    console.log('[Orchestrator] IR sections count:', ir.sections.length)

    update('analyze', 'done')

    // Step 2: Generate — pass the updated IR with image URLs
    update('generate', 'running')

    // issue is here
    const { html: rawHTML, interactionId: generateId } = await generateHTML(
      analyzeId,
      apiKey,
      ir  // Pass the updated IR with injected image URLs
    )
    update('generate', 'done')

    // Step 3: Inline — local, no API
    update('inline', 'running')
    const inlinedHTML = inlineStyles(rawHTML)
    update('inline', 'done')

    // Step 4: Validate — chains off generate interaction
    update('validate', 'running')
    const finalHTML = await validateHTML(inlinedHTML, generateId, apiKey)
    update('validate', 'done')

    // Step 5: Replace image placeholders with actual data URIs
    console.log('[Orchestrator] Replacing image placeholders with actual data...')
    let htmlWithImages = finalHTML

    for (let i = 0; i < imageReferences.length && i < imageUrls.length; i++) {
      const placeholder = imageReferences[i]
      const actualImageData = imageUrls[i]

      // Replace all occurrences of the placeholder
      htmlWithImages = htmlWithImages.split(placeholder).join(actualImageData)
      console.log(`[Orchestrator] Replaced ${placeholder} with image data (${actualImageData.substring(0, 50)}...)`)
    }

    console.log('[Orchestrator] Image replacement complete')
    return htmlWithImages

  } catch (err: any) {
    const running = steps.find(s => s.status === 'running')
    if (running) update(running.id, 'error', err.message)
    throw err
  }
}
