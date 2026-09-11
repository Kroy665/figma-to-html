# Figma Email to HTML — AI Agent Plugin

A Figma plugin that uses Google's Gemini 3.5 Flash AI model (via the Interactions API) to convert email template designs into production-ready, table-based HTML email code.

## Features

- **Agentic Pipeline**: Uses stateful chained interactions with Gemini 3.5 Flash
- **Multimodal Analysis**: Processes both Figma node data and design screenshots
- **Structured Output**: Uses Zod schemas for type-safe AI responses
- **Production-Ready HTML**: Generates table-based email HTML with inline CSS
- **Email Client Compatible**: Includes MSO conditional comments, proper table attributes, and mobile responsive media queries

## Tech Stack

- **Language**: TypeScript
- **Plugin Bundler**: Vite
- **UI Framework**: React
- **AI Provider**: Gemini 3.5 Flash via `@google/genai` SDK v2.3.0+
- **Schema Validation**: Zod
- **CSS Inliner**: juice
- **Styling**: Tailwind CSS

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy the API key (starts with `AIza...`)

### 3. Build the Plugin

```bash
npm run build
```

Or for development with watch mode:

```bash
npm run dev
```

### 4. Load Plugin in Figma

1. Open Figma Desktop
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**
3. Select the `manifest.json` file from this project
4. The plugin will appear in **Plugins** → **Development** → **Email to HTML**

## Usage

### 1. Create an Email Design in Figma

- Create a **Frame** (not a Group) for your email template
- Design your email layout using standard Figma tools
- Recommended width: 600px (standard email width)

### 2. Run the Plugin

1. Select the Frame containing your email design
2. Go to **Plugins** → **Development** → **Email to HTML**
3. Enter your Gemini API key in the plugin UI
4. Click **Convert to HTML**

### 3. Watch the Pipeline

The plugin will run through 4 steps:

1. **Analyzing design...** — AI extracts design structure into an intermediate representation
2. **Generating HTML...** — AI converts the IR into table-based email HTML
3. **Inlining styles...** — Local CSS inlining using the juice library
4. **Validating output...** — AI performs final QA pass

### 4. Download the HTML

- Click **Download HTML** to save the generated file
- The HTML will include:
  - Table-based layout
  - Inline CSS
  - MSO conditional comments for Outlook
  - Responsive media queries
  - Proper email client attributes

## Project Structure

```
figma-email-agent/
├── src/
│   ├── main.ts                    # Figma sandbox: node extraction
│   ├── ui.tsx                     # React UI + agent orchestrator
│   ├── ui.html                    # HTML shell for iframe
│   │
│   ├── agent/
│   │   ├── orchestrator.ts        # Pipeline coordinator
│   │   └── tools/
│   │       ├── analyzer.ts        # Figma → DesignIR
│   │       ├── generator.ts       # DesignIR → HTML
│   │       ├── inliner.ts         # CSS inlining
│   │       └── validator.ts       # HTML QA
│   │
│   ├── prompts/
│   │   ├── analyze.ts             # Analysis system prompt
│   │   ├── generate.ts            # Generation system prompt
│   │   └── validate.ts            # Validation system prompt
│   │
│   ├── schemas/
│   │   └── ir.ts                  # Zod schema for DesignIR
│   │
│   ├── types/
│   │   ├── figma.ts               # Figma extraction types
│   │   └── messages.ts            # postMessage types
│   │
│   └── lib/
│       └── gemini.ts              # Gemini client singleton
│
├── manifest.json
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Architecture

### Figma Plugin Sandbox Split

The plugin runs in two isolated environments:

- **main.ts (sandbox)**: Has Figma API access, NO network calls
- **ui.tsx (iframe)**: Has network access for Gemini API calls, NO Figma API access

They communicate via `postMessage`.

### Agentic Pipeline with Stateful Interactions

The pipeline uses **stateful chained interactions** via `previous_interaction_id`:

1. **Extract** (Figma API) → Screenshot + Node tree
2. **Analyze** (Gemini) → Structured DesignIR JSON
3. **Generate** (Gemini, chains off step 2) → Raw HTML
4. **Inline** (Local) → CSS inlining
5. **Validate** (Gemini, chains off step 3) → Final HTML

Each AI step chains off the previous one, so Gemini carries context forward automatically without re-sending large payloads.

## Key 2026 API Changes

This project uses the **new Gemini Interactions API** (GA as of June 2026):

- ✅ `ai.interactions.create()` SDK (not legacy `generateContent`)
- ✅ `gemini-3.5-flash` model
- ✅ `thinking_level` instead of `temperature`
- ✅ `response_format` with Zod schemas for structured output
- ✅ `previous_interaction_id` for stateful multi-turn conversations
- ✅ Multimodal input with inline image data

## Development

### Watch Mode

```bash
npm run dev
```

This will rebuild the plugin automatically when you make changes.

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` folder.

## Troubleshooting

### "Please select a Frame to convert"

Make sure you've selected a **Frame** (not a Group or other layer type) before running the plugin.

### API Key Issues

- Make sure your API key starts with `AIza...`
- Check that you have API access enabled for Gemini 3.5 Flash
- Verify your API key has not expired

### Network Access Errors

The plugin requires network access to `https://generativelanguage.googleapis.com`. This is configured in `manifest.json` under `networkAccess.allowedDomains`.

## License

This is an R&D project for educational purposes.

## Credits

Built following the specifications in `Instructions.md` using:
- Google Gemini 3.5 Flash Interactions API
- Figma Plugin API
- React + TypeScript + Vite
