# Claude Code Prompt — Figma Email-to-HTML Agentic Plugin (2026 Edition)

---

## Reference Documentation — Read These First

Before writing any code, fetch and read these URLs:

- **Figma Plugin API** → https://developers.figma.com/docs/plugins/
- **Figma Plugin Quickstart (TypeScript)** → https://www.figma.com/plugin-docs/plugin-quickstart-guide/
- **Figma Plugin API Updates (latest)** → https://developers.figma.com/docs/plugins/updates/
- **Gemini API Home (2026)** → https://ai.google.dev/gemini-api/docs
- **Gemini Interactions API Overview** → https://ai.google.dev/gemini-api/docs/interactions-overview
- **Gemini Interactions API Quickstart** → https://ai.google.dev/gemini-api/docs/get-started
- **Gemini 3.5 Flash — What's New** → https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5
- **Gemini Structured Output (Interactions API)** → https://ai.google.dev/gemini-api/docs/structured-output
- **Gemini Function Calling** → https://ai.google.dev/gemini-api/docs/function-calling
- **@google/genai JS SDK** → https://github.com/googleapis/js-genai
- **Interactions API Getting Started Guide (Philipp Schmid)** → https://www.philschmid.de/interactions-api-developer-guide
- **Building Agentic AI Systems (2025/26 guide)** → https://adspyder.io/blog/building-agentic-ai-systems/
- **OpenAI Practical Guide to Building Agents** → https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf

---

## Critical 2026 API Changes — Read Before Writing Any Code

These are **breaking changes** from the old `generateContent` API used in earlier versions of this project:

### 1. Use the Interactions API, not generateContent
As of June 2026, the **Interactions API is GA and the recommended interface for all new projects.**
The old `generateContent` REST endpoint still works but is now legacy. All new agentic features launch exclusively on the Interactions API.

```typescript
// OLD (legacy — do NOT use for new code)
fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', ...)

// NEW (correct — use this)
import { GoogleGenAI } from '@google/genai'  // version 2.3.0+
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY })
const interaction = await ai.interactions.create({
  model: 'gemini-3.5-flash',
  input: 'Your prompt here',
})
console.log(interaction.output_text)
```

### 2. Model name is `gemini-3.5-flash`
The model ID is `gemini-3.5-flash` (GA, stable, released May 19 2026).
Do NOT use `gemini-2.0-flash` or `gemini-3-flash-preview` — those are outdated.

### 3. Do NOT set temperature or top_p
For all Gemini 3.x models, Google **strongly recommends not changing** `temperature`, `top_p`, or `top_k`.
The reasoning capabilities are optimized for default settings. Remove any temperature configuration.

### 4. thinking_level replaces thinking_budget
The old integer `thinking_budget` parameter is gone. Use the string enum `thinking_level`:
- `"minimal"` — fastest, cheapest
- `"low"`
- `"medium"` — **default** (changed from `high` in 3 Flash Preview — silent regression risk)
- `"high"` — best quality, slowest

For code generation tasks like this project, use `thinking_level: "high"` explicitly.

### 5. Structured output via response_format + Zod schema
The new way to get reliable JSON output is `response_format` with a JSON schema. No more prompting "output only JSON":

```typescript
import * as z from 'zod'

const MySchema = z.object({ ... })
const myJsonSchema = z.toJSONSchema(MySchema)

const interaction = await ai.interactions.create({
  model: 'gemini-3.5-flash',
  input: userPrompt,
  system_instruction: systemPrompt,
  response_format: {
    type: 'text',
    mime_type: 'application/json',
    schema: myJsonSchema,
  },
  thinking_level: 'high',
})

const result = MySchema.parse(JSON.parse(interaction.output_text))
```

### 6. Stateful multi-turn via previous_interaction_id
No need to re-send full conversation history. The server stores it:

```typescript
// Turn 1
const turn1 = await ai.interactions.create({
  model: 'gemini-3.5-flash',
  input: 'Analyze this design...',
})

// Turn 2 — server remembers turn 1
const turn2 = await ai.interactions.create({
  model: 'gemini-3.5-flash',
  input: 'Now generate HTML from that analysis',
  previous_interaction_id: turn1.id,
})
```

This is a major architectural upgrade — use it for the analyze → generate → validate pipeline.

### 7. Multimodal input format changed
Images are now sent inline in the `input` array:

```typescript
const interaction = await ai.interactions.create({
  model: 'gemini-3.5-flash',
  input: [
    { type: 'image', data: base64PNG, mime_type: 'image/png' },
    { type: 'text', text: 'Analyze this email design...' }
  ],
  thinking_level: 'high',
})
```

---

## Project Overview

Build a **Figma plugin** that uses an **agentic pipeline** powered by **Gemini 3.5 Flash** (via the new Interactions API) to convert email template designs in Figma into production-ready **table-based HTML email code**.

This is an **RnD project** — focus on a clean, working pipeline. Not production-level.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript throughout |
| Plugin bundler | Vite + `@figma/plugin-typings` |
| UI framework | React (inside the plugin iframe) |
| AI provider | Gemini 3.5 Flash via `@google/genai` SDK v2.3.0+ |
| Schema validation | Zod (for structured AI output) |
| CSS inliner | `juice` npm package |
| Styling | Tailwind CSS (plugin UI only) |

Install:
```bash
npm install @google/genai zod react react-dom juice
npm install -D @figma/plugin-typings @types/react @types/react-dom typescript tailwindcss vite
```

---

## Architecture

### Figma Plugin Sandbox Split

The plugin runs in two isolated environments:

```
┌─────────────────────────────────────────┐
│           Figma Plugin                  │
│                                         │
│  ┌──────────────┐    ┌───────────────┐  │
│  │  main.ts     │◄──►│   ui.tsx      │  │
│  │  (sandbox)   │    │   (iframe)    │  │
│  │              │    │               │  │
│  │ Figma API    │    │ React UI      │  │
│  │ Node reader  │    │ Agent runner  │  │
│  │ Screenshot   │    │ Gemini calls  │  │
│  └──────────────┘    └───────────────┘  │
└─────────────────────────────────────────┘
         postMessage ↕
```

**Constraints**:
- `main.ts` — Figma API access, NO network calls
- `ui.tsx` — network access (Gemini API), NO Figma API
- All `@google/genai` SDK calls happen in `ui.tsx`

### Agentic Pipeline (Stateful, using previous_interaction_id)

The key architectural upgrade in 2026: instead of isolated API calls per step, the pipeline uses **stateful chained interactions**. Each step chains off the previous one, so Gemini carries context forward automatically without re-sending large payloads.

```
User clicks Convert
        │
        ▼
[STEP 1] Extract Tool (main.ts)
  → Reads Figma nodes recursively
  → Exports PNG screenshot
  → Sends both to ui.tsx via postMessage
        │
        ▼
[STEP 2] Analyze Interaction (Gemini — thinking_level: high)
  → Input: Figma JSON + screenshot (multimodal)
  → response_format: DesignIR schema (Zod)
  → Outputs: structured DesignIR JSON
  → Saves: interaction1.id
        │
        ▼  (previous_interaction_id: interaction1.id)
[STEP 3] Generate Interaction (Gemini — thinking_level: high)
  → Input: "Now generate email HTML from the IR above"
  → Gemini already has context from step 2
  → Outputs: raw table-based HTML string
  → Saves: interaction2.id
        │
        ▼
[STEP 4] Inline Tool (local — juice library)
  → No API call — pure local transform
  → Inlines any remaining CSS, safety net
        │
        ▼  (previous_interaction_id: interaction2.id)
[STEP 5] Validate Interaction (Gemini — thinking_level: medium)
  → Input: inlined HTML for QA review
  → Outputs: corrected final HTML
        │
        ▼
Download .html file
```

---

## Project Structure

```
figma-email-agent/
├── src/
│   ├── main.ts                    # Sandbox: Figma API, node extraction
│   ├── ui.tsx                     # UI iframe: React + agent orchestrator
│   ├── ui.html                    # HTML shell for the iframe
│   │
│   ├── agent/
│   │   ├── orchestrator.ts        # Chains all steps, manages interaction IDs
│   │   └── tools/
│   │       ├── analyzer.ts        # Figma JSON + screenshot → DesignIR
│   │       ├── generator.ts       # DesignIR → HTML (chains off analyzer)
│   │       ├── inliner.ts         # Local CSS inlining via juice
│   │       └── validator.ts       # HTML QA pass (chains off generator)
│   │
│   ├── prompts/
│   │   ├── analyze.ts             # System prompt for IR extraction
│   │   ├── generate.ts            # System prompt for HTML generation
│   │   └── validate.ts            # System prompt for HTML QA
│   │
│   ├── schemas/
│   │   └── ir.ts                  # Zod schema for DesignIR (used for structured output)
│   │
│   ├── types/
│   │   ├── figma.ts               # Figma node extraction types
│   │   └── messages.ts            # postMessage payload types
│   │
│   └── lib/
│       └── gemini.ts              # GoogleGenAI client singleton
│
├── manifest.json
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## Implementation Details

### Gemini Client (`lib/gemini.ts`)

```typescript
import { GoogleGenAI } from '@google/genai'

// Singleton — create once, reuse across all tool calls
let _client: GoogleGenAI | null = null

export function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!_client) {
    _client = new GoogleGenAI({ apiKey })
  }
  return _client
}

export const MODEL = 'gemini-3.5-flash'
```

---

### DesignIR Zod Schema (`schemas/ir.ts`)

Define the Intermediate Representation using Zod. This schema is passed directly to the Interactions API `response_format` — no manual JSON parsing needed.

```typescript
import { z } from 'zod'

const IRTextSchema = z.object({
  type: z.literal('text'),
  content: z.string(),
  fontSize: z.number(),
  fontFamily: z.string(),  // web-safe fallbacks only
  fontWeight: z.number(),
  color: z.string(),        // hex #rrggbb
  align: z.enum(['left', 'center', 'right']),
  lineHeight: z.number(),
})

const IRButtonSchema = z.object({
  type: z.literal('button'),
  label: z.string(),
  backgroundColor: z.string(),
  textColor: z.string(),
  fontSize: z.number(),
  borderRadius: z.number(),
  paddingX: z.number(),
  paddingY: z.number(),
})

const IRImageSchema = z.object({
  type: z.literal('image'),
  alt: z.string(),
  width: z.number(),
  height: z.number(),
})

const IRSpacerSchema = z.object({
  type: z.literal('spacer'),
  height: z.number(),
})

const IRDividerSchema = z.object({
  type: z.literal('divider'),
  color: z.string(),
  thickness: z.number(),
})

const IRElementSchema = z.discriminatedUnion('type', [
  IRTextSchema,
  IRButtonSchema,
  IRImageSchema,
  IRSpacerSchema,
  IRDividerSchema,
])

const IRSectionSchema = z.object({
  type: z.enum(['header', 'hero', 'body', 'cta', 'footer', 'divider', 'columns']),
  backgroundColor: z.string(),
  paddingTop: z.number(),
  paddingBottom: z.number(),
  paddingLeft: z.number(),
  paddingRight: z.number(),
  align: z.enum(['left', 'center', 'right']),
  children: z.array(IRElementSchema),
})

export const DesignIRSchema = z.object({
  width: z.number(),
  backgroundColor: z.string(),
  sections: z.array(IRSectionSchema),
})

export type DesignIR = z.infer<typeof DesignIRSchema>

// Convert to JSON Schema for the Interactions API response_format
export const designIRJsonSchema = z.toJSONSchema(DesignIRSchema)
```

---

### Analyzer Tool (`tools/analyzer.ts`)

Uses multimodal input and structured output. Returns a typed DesignIR.

```typescript
import { getGeminiClient, MODEL } from '../lib/gemini'
import { DesignIRSchema, designIRJsonSchema, DesignIR } from '../schemas/ir'
import { ANALYZE_PROMPT } from '../prompts/analyze'
import { ExtractedNode } from '../types/figma'

export async function analyzeDesign(
  nodes: ExtractedNode,
  screenshotBase64: string,
  apiKey: string
): Promise<{ ir: DesignIR; interactionId: string }> {
  const ai = getGeminiClient(apiKey)

  const interaction = await ai.interactions.create({
    model: MODEL,
    system_instruction: ANALYZE_PROMPT,
    input: [
      {
        type: 'image',
        data: screenshotBase64,
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
    thinking_level: 'high',
  })

  const ir = DesignIRSchema.parse(JSON.parse(interaction.output_text))
  return { ir, interactionId: interaction.id }
}
```

---

### Generator Tool (`tools/generator.ts`)

Chains off the analyzer interaction — Gemini already has the DesignIR in context.

```typescript
import { getGeminiClient, MODEL } from '../lib/gemini'
import { GENERATE_PROMPT } from '../prompts/generate'

export async function generateHTML(
  analyzerInteractionId: string,
  apiKey: string
): Promise<{ html: string; interactionId: string }> {
  const ai = getGeminiClient(apiKey)

  const interaction = await ai.interactions.create({
    model: MODEL,
    system_instruction: GENERATE_PROMPT,
    input: 'Generate the complete email HTML from the design IR you just analyzed. Output only the HTML, nothing else.',
    previous_interaction_id: analyzerInteractionId,  // KEY: chains context
    thinking_level: 'high',
  })

  return { html: interaction.output_text, interactionId: interaction.id }
}
```

---

### Inliner Tool (`tools/inliner.ts`)

Local transform — no API call:

```typescript
import juice from 'juice'

export function inlineStyles(html: string): string {
  return juice(html, {
    removeStyleTags: true,
    applyStyleTags: true,
    preserveMediaQueries: true,
    preserveFontFaces: false,
  })
}
```

---

### Validator Tool (`tools/validator.ts`)

Chains off the generator. Sends the inlined HTML for a QA pass.

```typescript
import { getGeminiClient, MODEL } from '../lib/gemini'
import { VALIDATE_PROMPT } from '../prompts/validate'

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
    thinking_level: 'medium',  // QA pass doesn't need full reasoning depth
  })

  return interaction.output_text
}
```

---

### Orchestrator (`agent/orchestrator.ts`)

```typescript
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
    const { ir, interactionId: analyzeId } = await analyzeDesign(
      figmaData.nodes,
      figmaData.screenshot,
      apiKey
    )
    update('analyze', 'done')

    // Step 2: Generate — chains off analyze interaction
    update('generate', 'running')
    const { html: rawHTML, interactionId: generateId } = await generateHTML(
      analyzeId,
      apiKey
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

    return finalHTML

  } catch (err: any) {
    const running = steps.find(s => s.status === 'running')
    if (running) update(running.id, 'error', err.message)
    throw err
  }
}
```

---

### System Prompts (`prompts/`)

#### `prompts/analyze.ts`
```typescript
export const ANALYZE_PROMPT = `
You are a design analysis expert specializing in email templates.
You will receive a screenshot of a Figma email design and its raw node tree JSON.

Your job: analyze the design and output a structured DesignIR JSON object.

Rules:
- Identify logical email sections: header, hero, body, cta, footer, divider, columns
- Convert ALL colors to hex strings (#rrggbb)
- Convert ALL fonts to web-safe fallbacks: Arial, Georgia, Verdana, Trebuchet MS, Times New Roman
- All sizes are integers in pixels
- Buttons: any rectangle + text combo that looks interactive → IRButton
- Repeated column layouts → columns type with children arrays
- Extract actual text content from text nodes verbatim
- The screenshot is ground truth for visual intent; the JSON is ground truth for measurements
- When they conflict, prefer JSON measurements, screenshot intent

Output ONLY the JSON matching the schema. The response_format schema enforces the structure.
`.trim()
```

#### `prompts/generate.ts`
```typescript
export const GENERATE_PROMPT = `
You are an expert email HTML developer. You have already analyzed a Figma email design
and produced a DesignIR. Now generate the complete production email HTML.

STRICT EMAIL HTML RULES — never break these:
1. Table-based layout ONLY. Use <table>, <tr>, <td>. NEVER use <div> for layout.
2. ALL CSS must be inline styles. No <style> blocks except for a single media query block at the top.
3. Email max-width: 600px, centered. Use align="center" on the outer wrapper table.
4. Add MSO (Outlook) conditional comments:
   <!--[if mso]><table width="600" align="center"><tr><td><![endif]-->
   ...content...
   <!--[if mso]></td></tr></table><![endif]-->
5. All <img> tags MUST have: width, height, border="0", display:block, and a descriptive alt attribute.
6. No web fonts. Use font stacks: Arial, Helvetica, sans-serif OR Georgia, 'Times New Roman', serif.
7. No flexbox, no grid, no CSS variables, no calc(), no border-radius on Outlook-facing elements.
8. Buttons: use VML for Outlook AND standard <a> fallback wrapped in a conditional comment.
9. Add role="presentation" to ALL layout tables.
10. Add cellpadding="0" cellspacing="0" border="0" to ALL tables.
11. Images: use placeholder src="image-placeholder.jpg" with correct width and height.
12. Add a responsive media query block at the very top inside a <style> tag for mobile stacking.

Output ONLY the complete HTML document. No explanation, no markdown fences, no preamble.
`.trim()
```

#### `prompts/validate.ts`
```typescript
export const VALIDATE_PROMPT = `
You are a senior email QA engineer. Review the provided HTML email for email client issues.

Check for and fix ALL of these problems:
- Layout divs that should be tables
- Non-inline CSS (except the single media query <style> block at the top)
- Missing alt text on images
- Missing width or height attributes on images
- Outlook-incompatible CSS: border-radius, box-shadow, flexbox, grid, CSS variables
- Tables missing cellpadding="0" cellspacing="0" border="0"
- Tables missing role="presentation"
- Broken or missing MSO conditional comments
- Any external stylesheet links
- Empty alt attributes (should have descriptive text)

Return ONLY the corrected HTML. No explanation. No markdown fences.
`.trim()
```

---

### Figma Node Extractor (`main.ts`)

```typescript
figma.showUI(__html__, { width: 340, height: 540 })

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'EXTRACT') {
    const selection = figma.currentPage.selection

    if (selection.length === 0 || selection[0].type !== 'FRAME') {
      figma.ui.postMessage({
        type: 'ERROR',
        error: 'Please select a Frame to convert.'
      })
      return
    }

    const frame = selection[0] as FrameNode
    const nodes = extractNode(frame)

    // Export screenshot
    const bytes = await frame.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 }
    })
    const base64 = btoa(String.fromCharCode(...bytes))

    figma.ui.postMessage({
      type: 'FIGMA_DATA',
      payload: {
        nodes,
        screenshot: base64,
        frameWidth: frame.width,
        frameName: frame.name,
      }
    })
  }

  if (msg.type === 'CLOSE') {
    figma.closePlugin()
  }
}

function extractNode(node: SceneNode): any {
  const base = {
    id: node.id,
    type: node.type,
    name: node.name,
    x: 'x' in node ? node.x : 0,
    y: 'y' in node ? node.y : 0,
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
  }

  if (node.type === 'TEXT') {
    return {
      ...base,
      characters: node.characters,
      fontSize: node.fontSize,
      fontName: node.fontName,
      fills: node.fills,
      lineHeight: node.lineHeight,
      letterSpacing: node.letterSpacing,
      textAlignHorizontal: node.textAlignHorizontal,
    }
  }

  if ('fills' in node) {
    const withFills: any = { ...base, fills: node.fills }
    if ('strokes' in node) withFills.strokes = node.strokes
    if ('cornerRadius' in node) withFills.cornerRadius = node.cornerRadius
    if ('opacity' in node) withFills.opacity = node.opacity
    // Auto Layout
    if ('layoutMode' in node) {
      withFills.layoutMode = node.layoutMode
      withFills.paddingTop = (node as FrameNode).paddingTop
      withFills.paddingBottom = (node as FrameNode).paddingBottom
      withFills.paddingLeft = (node as FrameNode).paddingLeft
      withFills.paddingRight = (node as FrameNode).paddingRight
      withFills.itemSpacing = (node as FrameNode).itemSpacing
      withFills.primaryAxisAlignItems = (node as FrameNode).primaryAxisAlignItems
      withFills.counterAxisAlignItems = (node as FrameNode).counterAxisAlignItems
    }
    if ('children' in node) {
      withFills.children = node.children.map(extractNode)
    }
    return withFills
  }

  return base
}
```

---

### Plugin UI (`ui.tsx`)

```typescript
import { useState, useEffect } from 'react'
import { runPipeline, PipelineStep } from './agent/orchestrator'

export default function App() {
  const [apiKey, setApiKey]       = useState('')
  const [figmaData, setFigmaData] = useState<any>(null)
  const [steps, setSteps]         = useState<PipelineStep[]>([])
  const [outputHTML, setOutput]   = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Trigger extraction on mount
  useEffect(() => {
    parent.postMessage({ pluginMessage: { type: 'EXTRACT' } }, '*')

    // Listen for messages from main.ts
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage
      if (!msg) return
      if (msg.type === 'FIGMA_DATA') setFigmaData(msg.payload)
      if (msg.type === 'ERROR') setError(msg.error)
    }
  }, [])

  const handleConvert = async () => {
    if (!figmaData || !apiKey.trim()) return
    setIsRunning(true)
    setError(null)
    setOutput(null)
    setSteps([])
    try {
      const html = await runPipeline(figmaData, apiKey, {
        onStepUpdate: setSteps
      })
      setOutput(html)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsRunning(false)
    }
  }

  const handleDownload = () => {
    if (!outputHTML) return
    const blob = new Blob([outputHTML], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${figmaData?.frameName ?? 'email'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const stepIcon = (status: PipelineStep['status']) => {
    if (status === 'done')    return '✅'
    if (status === 'running') return '⏳'
    if (status === 'error')   return '❌'
    return '○'
  }

  return (
    <div className="p-4 flex flex-col gap-4 text-sm">
      <h1 className="font-bold text-base">📧 Email to HTML</h1>

      {/* API Key */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Gemini API Key</label>
        <input
          type="password"
          className="w-full border rounded px-2 py-1 text-xs"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="AIza..."
        />
      </div>

      {/* Frame Info */}
      {figmaData ? (
        <div className="text-xs text-gray-600">
          Selected: <strong>{figmaData.frameName}</strong> ({figmaData.frameWidth}px)
        </div>
      ) : (
        <div className="text-xs text-orange-500">Select a Frame in Figma</div>
      )}

      {/* Convert Button */}
      <button
        onClick={handleConvert}
        disabled={isRunning || !figmaData || !apiKey.trim()}
        className="bg-blue-600 text-white rounded py-2 px-4 disabled:opacity-40"
      >
        {isRunning ? 'Converting...' : 'Convert to HTML'}
      </button>

      {/* Pipeline Steps */}
      {steps.length > 0 && (
        <div className="flex flex-col gap-1">
          {steps.map(step => (
            <div key={step.id} className="flex items-center gap-2 text-xs">
              <span>{stepIcon(step.status)}</span>
              <span>{step.label}</span>
              {step.error && <span className="text-red-500 ml-1">{step.error}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-xs text-red-500 bg-red-50 p-2 rounded">{error}</div>
      )}

      {/* Output Actions */}
      {outputHTML && (
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="flex-1 border border-blue-600 text-blue-600 rounded py-1 px-2 text-xs"
          >
            Download HTML
          </button>
        </div>
      )}

      {/* HTML Preview */}
      {outputHTML && (
        <iframe
          srcDoc={outputHTML}
          className="w-full border rounded"
          style={{ height: 200 }}
          sandbox="allow-same-origin"
          title="Email Preview"
        />
      )}
    </div>
  )
}
```

---

## manifest.json

```json
{
  "name": "Email to HTML",
  "id": "email-to-html-agent",
  "api": "1.0.0",
  "main": "dist/main.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": ["https://generativelanguage.googleapis.com"]
  }
}
```

Note: `networkAccess.allowedDomains` is required for the plugin to make API calls to Gemini.

---

## Build Order

1. `manifest.json` + `vite.config.ts` + `tsconfig.json` — project setup
2. `lib/gemini.ts` — SDK singleton, verify Interactions API works with a simple test call
3. `schemas/ir.ts` — full Zod schema, export `designIRJsonSchema`
4. `prompts/analyze.ts`, `generate.ts`, `validate.ts`
5. `types/figma.ts` — node extraction types
6. `main.ts` — node extractor + postMessage bridge
7. `tools/analyzer.ts` — multimodal structured output test
8. `tools/generator.ts` — chained interaction test
9. `tools/inliner.ts` — juice wrapper
10. `tools/validator.ts` — final chained QA pass
11. `agent/orchestrator.ts` — wire all tools together
12. `ui.tsx` — React UI with step progress + preview + download

---

## Key 2026 Architecture Differences vs. Old Approach

| Old (2025) | New (2026) |
|---|---|
| `generateContent` REST API | `ai.interactions.create()` SDK |
| `gemini-2.0-flash` | `gemini-3.5-flash` |
| Manual JSON parsing (`JSON.parse`) | Zod schema in `response_format` — type-safe |
| Re-send full context each step | `previous_interaction_id` — server manages state |
| `temperature: 0.2` | No temperature — use `thinking_level` instead |
| Separate API calls per step | Chained stateful interactions |
| Manual `fetch()` calls | `@google/genai` SDK v2.3.0 |

---

## RnD Success Criteria

- [ ] Plugin loads in Figma desktop without errors
- [ ] Selecting a Frame + clicking Convert produces valid HTML file
- [ ] All styles are inline (validated by juice + validator step)
- [ ] HTML renders visually similar to Figma design in a browser
- [ ] Chained `previous_interaction_id` is used correctly (verify in API logs)
- [ ] Zod schema validation catches any malformed DesignIR before proceeding
- [ ] `thinking_level: 'high'` is set for analyze and generate steps
- [ ] Tables have `role="presentation"`, `cellpadding="0"`, `cellspacing="0"`
- [ ] Images have `width`, `height`, and `alt` attributes