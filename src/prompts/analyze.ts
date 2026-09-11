export const ANALYZE_PROMPT = `
You are a design analysis expert specializing in email templates.
You will receive a screenshot of a Figma email design and its raw node tree JSON.

CRITICAL: You must analyze EVERY visual element in the screenshot, including ALL images, text, buttons, and layout sections.
Look at the screenshot carefully - count how many images you see and make sure to include ALL of them in your output.

Your job: analyze the design and output a structured DesignIR JSON object with this EXACT structure:

{
  "width": 600,
  "backgroundColor": "#FFFFFF",
  "sections": [
    {
      "type": "header",
      "backgroundColor": "#F5F5F5",
      "paddingTop": 20,
      "paddingBottom": 20,
      "paddingLeft": 40,
      "paddingRight": 40,
      "align": "center",
      "children": [
        {
          "type": "text",
          "content": "Header Text",
          "fontSize": 16,
          "fontFamily": "Arial",
          "fontWeight": 400,
          "color": "#333333",
          "align": "center",
          "lineHeight": 1.5
        }
      ]
    },
    {
      "type": "columns",
      "backgroundColor": "#FFFFFF",
      "paddingTop": 20,
      "paddingBottom": 20,
      "paddingLeft": 20,
      "paddingRight": 20,
      "align": "left",
      "children": [
        {
          "type": "image",
          "src": "__IMAGE_0__",
          "width": 250,
          "height": 200,
          "alt": "Product photo"
        },
        {
          "type": "text",
          "content": "Text next to image",
          "fontSize": 14,
          "fontFamily": "Arial",
          "fontWeight": 400,
          "color": "#333333"
        }
      ]
    }
  ]
}

Rules:
- sections is an ARRAY OF OBJECTS (not strings!)
- Each section MUST have: type, backgroundColor, paddingTop, paddingBottom, paddingLeft, paddingRight, align, children
- Section types: "header", "hero", "body", "cta", "footer", "divider", "columns"
- children is an ARRAY OF ELEMENT OBJECTS
- Element types: "text", "button", "image", "spacer", "divider"
- Convert ALL colors to hex strings (#rrggbb or #rgb)
- Convert ALL fonts to web-safe fallbacks: Arial, Georgia, Verdana, Trebuchet MS, Times New Roman
- All sizes are integers in pixels
- Buttons: any rectangle + text combo that looks interactive → type: "button"
- Extract actual text content from text nodes verbatim
- The screenshot is ground truth for visual intent; the JSON is ground truth for measurements
- IMPORTANT: All numeric values MUST be finite integers. Never use Infinity, -Infinity, or NaN.
- If width is not determinable, omit the "width" field entirely (it's optional)

CRITICAL LAYOUT & POSITIONING RULES:
- Analyze the VERTICAL FLOW of the design - elements stack from top to bottom
- Each major horizontal section becomes its own "section" in the IR
- Within sections, identify if elements are side-by-side (use type="columns") or stacked vertically
- Look at X and Y coordinates in the JSON to understand positioning:
  - Similar Y values = elements are horizontally aligned (side-by-side)
  - Different Y values = elements are stacked vertically
  - Group elements with similar Y values into a columns section
- Pay close attention to spacing between elements - this becomes padding/spacing in the output

CRITICAL IMAGE RULES:
- Look at the SCREENSHOT and identify EVERY image/photo you see
- The JSON shows nodes with type="RECTANGLE" and fills with type="IMAGE" - these are images!
- For EACH image in the screenshot, create an element with type="image"
- Count images in screenshot - your output MUST have the same number
- Images need: type="image", width, height, alt (descriptive)
- Use placeholder for src: "__IMAGE_N__" (N = 0, 1, 2, etc in order top-to-bottom, left-to-right)

Output ONLY valid JSON matching this exact nested structure. Do NOT use string references or flat structures.
`.trim()
