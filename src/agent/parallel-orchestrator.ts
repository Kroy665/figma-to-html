import { analyzeDesign } from './tools/analyzer'
import { generateHTML } from './tools/generator'
import { inlineStyles } from './tools/inliner'
import { validateHTML } from './tools/validator'
import { FigmaPayload } from '../types/messages'
import { ExtractedNode } from '../types/figma'

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

interface FrameSection {
  node: ExtractedNode
  screenshot: string
  images: Record<string, string>
  yStart: number
  yEnd: number
}

interface ProcessedSection {
  html: string
  isImage: boolean // true if section was too complex and returned as image
}

/**
 * Analyze section complexity to determine if it's too hard to convert to HTML
 * Returns true if section should be rendered as PNG image instead
 */
function isComplexSection(node: ExtractedNode): boolean {
  let complexity = 0

  function analyzeNode(n: ExtractedNode, depth: number = 0): void {
    // Deep nesting increases complexity
    if (depth > 5) complexity += 10

    // Certain node types are complex
    if (n.type === 'VECTOR' || n.type === 'STAR' || n.type === 'POLYGON') {
      complexity += 5
    }

    // Complex effects
    if (n.effects && n.effects.length > 0) {
      for (const effect of n.effects) {
        if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
          complexity += 2
        }
        if (effect.type === 'LAYER_BLUR' || effect.type === 'BACKGROUND_BLUR') {
          complexity += 5 // Blur effects are very hard in email
        }
      }
    }

    // Blend modes
    if (n.blendMode && n.blendMode !== 'NORMAL' && n.blendMode !== 'PASS_THROUGH') {
      complexity += 5
    }

    // Rotation/transforms
    if (n.rotation && Math.abs(n.rotation) > 1) {
      complexity += 10 // Rotation is nearly impossible in email HTML
    }

    // Absolute positioning (lots of overlapping elements)
    if (n.children) {
      let hasAbsolutePositioning = false
      const childPositions = n.children.map(c => ({ x: c.x || 0, y: c.y || 0 }))

      // Check if children overlap significantly
      for (let i = 0; i < childPositions.length; i++) {
        for (let j = i + 1; j < childPositions.length; j++) {
          const dx = Math.abs(childPositions[i].x - childPositions[j].x)
          const dy = Math.abs(childPositions[i].y - childPositions[j].y)
          if (dx < 50 && dy < 50) {
            hasAbsolutePositioning = true
            break
          }
        }
      }
      if (hasAbsolutePositioning) complexity += 8

      // Recurse into children
      for (const child of n.children) {
        analyzeNode(child, depth + 1)
      }
    }

    // Too many children at one level
    if (n.children && n.children.length > 20) {
      complexity += 5
    }
  }

  analyzeNode(node)

  // Threshold: complexity > 30 means use PNG fallback
  const isComplex = complexity > 30

  if (isComplex) {
    console.log(`[Complexity] Section ${node.id} is complex (score: ${complexity}) - will use PNG fallback`)
  } else {
    console.log(`[Complexity] Section ${node.id} is simple (score: ${complexity}) - will convert to HTML`)
  }

  return isComplex
}

/**
 * Recursively collect all child frames (including nested)
 */
function collectAllFrames(node: ExtractedNode): ExtractedNode[] {
  const frames: ExtractedNode[] = []

  if (node.type === 'FRAME' && node.children && node.children.length > 0) {
    // Add this frame
    frames.push(node)

    // Recursively collect frames from children
    for (const child of node.children) {
      frames.push(...collectAllFrames(child))
    }
  } else if (node.children) {
    // Not a frame but has children - check children
    for (const child of node.children) {
      frames.push(...collectAllFrames(child))
    }
  }

  return frames
}

/**
 * Split the design into horizontal sections based on child frames or layout
 */
function splitIntoSections(figmaData: FigmaPayload): FrameSection[] {
  const sections: FrameSection[] = []
  const rootNode = figmaData.nodes

  // Collect all frames (including nested ones)
  const allFrames = collectAllFrames(rootNode)

  // If we found frames, use direct children of root as sections
  if (rootNode.children && rootNode.children.length > 0) {
    // Only use direct children of root as main sections
    for (const child of rootNode.children) {
      // Consider frames or significant elements
      if (child.type === 'FRAME' || child.height > 100) {
        // Use child-specific screenshot if available, otherwise fall back to main screenshot
        const childScreenshot = figmaData.childScreenshots[child.id] || figmaData.screenshot

        sections.push({
          node: child,
          screenshot: childScreenshot, // Use pre-exported child screenshot from Figma
          images: {}, // Will be filtered by node tree traversal
          yStart: child.y || 0,
          yEnd: (child.y || 0) + child.height
        })

        console.log(`[Split] Section for child ${child.id}: screenshot=${childScreenshot ? 'child-specific' : 'fallback'}`)
      }
    }
  }

  // If no sections found, treat entire design as one section
  if (sections.length === 0) {
    sections.push({
      node: rootNode,
      screenshot: figmaData.screenshot,
      images: figmaData.images,
      yStart: 0,
      yEnd: rootNode.height
    })
  }

  return sections
}

/**
 * Filter images that belong to a specific section node tree
 * This recursively traverses the node and its children to find all images
 */
function filterImagesForSection(
  allImages: Record<string, string>,
  sectionNode: ExtractedNode
): Record<string, string> {
  const sectionImages: Record<string, string> = {}

  function traverseNode(node: ExtractedNode) {
    // Check if this node has an image
    if (node.id in allImages) {
      sectionImages[node.id] = allImages[node.id]
    }

    // Recursively check all children
    if (node.children) {
      for (const child of node.children) {
        traverseNode(child)
      }
    }
  }

  // Start traversal from the section node
  traverseNode(sectionNode)

  console.log(`[Filter] Found ${Object.keys(sectionImages).length} images in section node ${sectionNode.id}`)
  return sectionImages
}

/**
 * Process a single section
 */
async function processSection(
  section: FrameSection,
  sectionIndex: number,
  apiKey: string
): Promise<ProcessedSection> {
  console.log(`[Section ${sectionIndex}] Processing section from Y=${section.yStart} to Y=${section.yEnd}`)

  // Step 0: Check complexity - if too complex, return as PNG image
  if (isComplexSection(section.node)) {
    console.log(`[Section ${sectionIndex}] Using PNG fallback for complex section`)

    // Create HTML wrapper for the image
    const imageHTML = `
      <tr>
        <td align="center" style="padding: 0;">
          <img src="${section.screenshot}"
               alt="Section ${sectionIndex}"
               width="${section.node.width}"
               height="${section.node.height}"
               border="0"
               style="display: block; width: 100%; max-width: ${section.node.width}px; height: auto; border: 0;" />
        </td>
      </tr>
    `

    return {
      html: imageHTML,
      isImage: true
    }
  }

  // Section is simple enough - proceed with AI conversion
  console.log(`[Section ${sectionIndex}] Converting to HTML (simple section)`)

  // Step 1: Analyze this section with its pre-exported screenshot from Figma
  const { ir, interactionId: analyzeId } = await analyzeDesign(
    section.node,
    section.screenshot, // Already exported directly from Figma for this specific node
    apiKey
  )

  // Step 2: Inject image placeholders
  const imageUrls = Object.values(section.images)
  const imageReferences: string[] = []
  let imageIndex = 0

  for (const sec of ir.sections) {
    for (const child of sec.children) {
      if (child.type === 'image') {
        const placeholder = `__IMAGE_${sectionIndex}_${imageIndex}__`
        child.src = placeholder
        imageReferences.push(placeholder)
        imageIndex++
      }
    }
  }

  console.log(`[Section ${sectionIndex}] Found ${imageIndex} images`)

  // Step 3: Generate HTML for this section
  const { html: rawHTML, interactionId: generateId } = await generateHTML(
    analyzeId,
    apiKey,
    ir
  )

  // Step 4: Inline styles
  const inlinedHTML = inlineStyles(rawHTML)

  // Step 5: Validate
  const validatedHTML = await validateHTML(inlinedHTML, generateId, apiKey)

  // Step 6: Replace image placeholders
  let htmlWithImages = validatedHTML
  for (let i = 0; i < imageReferences.length && i < imageUrls.length; i++) {
    const placeholder = imageReferences[i]
    const actualImageData = imageUrls[i]
    htmlWithImages = htmlWithImages.split(placeholder).join(actualImageData)
  }

  console.log(`[Section ${sectionIndex}] Complete`)
  return {
    html: htmlWithImages,
    isImage: false
  }
}

/**
 * Stitch multiple sections together (mix of HTML and PNG images)
 */
function stitchHTMLSections(processedSections: ProcessedSection[]): string {
  if (processedSections.length === 1) {
    return processedSections[0].html
  }

  // Extract <body> content from each section
  const bodyContents: string[] = []

  for (const section of processedSections) {
    if (section.isImage) {
      // Section is already a <tr> with image - add directly
      bodyContents.push(section.html)
    } else {
      // Section is full HTML - extract body content
      const bodyMatch = section.html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
      if (bodyMatch) {
        bodyContents.push(bodyMatch[1])
      }
    }
  }

  // Use the header from the first non-image section
  let header = ''
  let footer = '</body></html>'

  for (const section of processedSections) {
    if (!section.isImage) {
      const headerMatch = section.html.match(/([\s\S]*<body[^>]*>)/i)
      const footerMatch = section.html.match(/(<\/body>[\s\S]*)/i)

      if (headerMatch) header = headerMatch[1]
      if (footerMatch) footer = footerMatch[1]
      break
    }
  }

  // If all sections are images, create a basic HTML wrapper
  if (!header) {
    header = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email</title>
</head>
<body style="margin: 0; padding: 0;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" role="presentation">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="600" role="presentation">`
    footer = `
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
  }

  return header + bodyContents.join('\n') + footer
}

/**
 * Run pipeline with parallel processing
 */
export async function runParallelPipeline(
  figmaData: FigmaPayload,
  apiKey: string,
  callbacks: OrchestratorCallbacks
): Promise<string> {

  const steps: PipelineStep[] = [
    { id: 'split',     label: 'Splitting design...',    status: 'pending' },
    { id: 'analyze',   label: 'Analyzing sections...',  status: 'pending' },
    { id: 'generate',  label: 'Generating HTML...',     status: 'pending' },
    { id: 'stitch',    label: 'Stitching sections...',  status: 'pending' },
  ]

  const update = (id: string, status: StepStatus, error?: string) => {
    const s = steps.find(s => s.id === id)
    if (s) { s.status = status; s.error = error }
    callbacks.onStepUpdate([...steps])
  }

  try {
    // Step 1: Split into sections
    update('split', 'running')
    const sections = splitIntoSections(figmaData)
    console.log(`[Orchestrator] Split into ${sections.length} sections`)

    // Filter images for each section by traversing the node tree
    for (let i = 0; i < sections.length; i++) {
      sections[i].images = filterImagesForSection(
        figmaData.images,
        sections[i].node
      )
    }
    update('split', 'done')

    // Step 2 & 3: Process all sections in parallel
    update('analyze', 'running')
    update('generate', 'running')

    const htmlSections = await Promise.all(
      sections.map((section, index) =>
        processSection(section, index, apiKey)
      )
    )

    update('analyze', 'done')
    update('generate', 'done')

    // Step 4: Stitch sections together
    update('stitch', 'running')
    const finalHTML = stitchHTMLSections(htmlSections)
    update('stitch', 'done')

    console.log('[Orchestrator] Pipeline complete')
    return finalHTML

  } catch (err: any) {
    const running = steps.find(s => s.status === 'running')
    if (running) update(running.id, 'error', err.message)
    throw err
  }
}
