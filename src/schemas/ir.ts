import { z } from 'zod'
import { zodToJsonSchema } from 'zod-to-json-schema'

const IRTextSchema = z.object({
  type: z.literal('text').describe('Must be the literal string "text"'),
  content: z.string().describe('The actual text content'),
  fontSize: z.number().int().optional().describe('Font size in pixels'),
  fontFamily: z.string().optional().describe('Web-safe font: Arial, Georgia, Verdana, Trebuchet MS, or Times New Roman'),
  fontWeight: z.number().int().optional().describe('Font weight: 400 (normal), 700 (bold)'),
  color: z.string().optional().describe('Hex color code like #333333'),
  textColor: z.string().optional().describe('Alternative field for text color'),
  align: z.enum(['left', 'center', 'right']).optional().describe('Text alignment'),
  lineHeight: z.number().optional().describe('Line height as a multiplier like 1.5'),
  width: z.number().int().finite().optional().describe('Text width in pixels'),
})

const IRButtonSchema = z.object({
  type: z.literal('button').describe('Must be the literal string "button"'),
  label: z.string().describe('Button text'),
  backgroundColor: z.string().optional().describe('Hex color code like #0066FF'),
  textColor: z.string().optional().describe('Hex color code like #FFFFFF'),
  fontSize: z.number().int().optional().describe('Font size in pixels'),
  borderRadius: z.number().int().optional().describe('Border radius in pixels'),
  paddingX: z.number().int().optional().describe('Horizontal padding in pixels'),
  paddingY: z.number().int().optional().describe('Vertical padding in pixels'),
  width: z.number().int().optional().describe('Button width in pixels'),
  height: z.number().int().optional().describe('Button height in pixels'),
})

const IRImageSchema = z.object({
  type: z.literal('image').describe('Must be the literal string "image"'),
  src: z.string().optional().describe('Image source URL or data URI'),
  alt: z.string().optional().describe('Alt text for the image'),
  width: z.number().int().optional().describe('Image width in pixels'),
  height: z.number().int().optional().describe('Image height in pixels'),
})

const IRSpacerSchema = z.object({
  type: z.literal('spacer').describe('Must be the literal string "spacer"'),
  height: z.number().int().optional().describe('Spacer height in pixels'),
})

const IRDividerSchema = z.object({
  type: z.literal('divider').describe('Must be the literal string "divider"'),
  color: z.string().optional().describe('Hex color code like #CCCCCC'),
  thickness: z.number().int().optional().describe('Line thickness in pixels'),
})

const IRElementSchema = z.discriminatedUnion('type', [
  IRTextSchema,
  IRButtonSchema,
  IRImageSchema,
  IRSpacerSchema,
  IRDividerSchema,
]).describe('A UI element within a section')

const IRSectionSchema = z.object({
  type: z.enum(['header', 'hero', 'body', 'cta', 'footer', 'divider', 'columns']).describe('Semantic section type'),
  backgroundColor: z.string().describe('Hex color code like #F5F5F5'),
  paddingTop: z.number().int().describe('Top padding in pixels'),
  paddingBottom: z.number().int().describe('Bottom padding in pixels'),
  paddingLeft: z.number().int().describe('Left padding in pixels'),
  paddingRight: z.number().int().describe('Right padding in pixels'),
  align: z.enum(['left', 'center', 'right']).describe('Horizontal alignment of content'),
  children: z.array(IRElementSchema).describe('Array of UI elements within this section'),
})

export const DesignIRSchema = z.object({
  width: z.number().int().describe('Email template width in pixels, typically 600'),
  backgroundColor: z.string().describe('Background hex color like #FFFFFF'),
  sections: z.array(IRSectionSchema).describe('Array of email sections from top to bottom'),
})

export type DesignIR = z.infer<typeof DesignIRSchema>

// Manually construct a simpler JSON schema to test
export const designIRJsonSchema = {
  type: 'object',
  required: ['width', 'backgroundColor', 'sections'],
  properties: {
    width: {
      type: 'integer',
      description: 'Email template width in pixels, typically 600'
    },
    backgroundColor: {
      type: 'string',
      description: 'Background hex color like #FFFFFF'
    },
    sections: {
      type: 'array',
      description: 'Array of email sections from top to bottom',
      items: {
        type: 'object',
        required: ['type', 'backgroundColor', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'align', 'children'],
        properties: {
          type: {
            type: 'string',
            enum: ['header', 'hero', 'body', 'cta', 'footer', 'divider', 'columns'],
            description: 'Semantic section type'
          },
          backgroundColor: {
            type: 'string',
            description: 'Hex color code like #F5F5F5'
          },
          paddingTop: { type: 'integer', description: 'Top padding in pixels' },
          paddingBottom: { type: 'integer', description: 'Bottom padding in pixels' },
          paddingLeft: { type: 'integer', description: 'Left padding in pixels' },
          paddingRight: { type: 'integer', description: 'Right padding in pixels' },
          align: {
            type: 'string',
            enum: ['left', 'center', 'right'],
            description: 'Horizontal alignment'
          },
          children: {
            type: 'array',
            description: 'Array of UI elements',
            items: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['text', 'button', 'image', 'spacer', 'divider']
                },
                content: { type: 'string' },
                fontSize: { type: 'integer' },
                fontFamily: { type: 'string' },
                fontWeight: { type: 'integer' },
                color: { type: 'string' },
                align: { type: 'string', enum: ['left', 'center', 'right'] },
                lineHeight: { type: 'number' },
                label: { type: 'string' },
                backgroundColor: { type: 'string' },
                textColor: { type: 'string' },
                borderRadius: { type: 'integer' },
                paddingX: { type: 'integer' },
                paddingY: { type: 'integer' },
                src: { type: 'string' },
                alt: { type: 'string' },
                width: { type: 'integer' },
                height: { type: 'integer' },
                thickness: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }
}
