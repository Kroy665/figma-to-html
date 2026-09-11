import { ExtractedNode } from './figma'

export interface FigmaPayload {
  nodes: ExtractedNode
  screenshot: string
  childScreenshots: Record<string, string> // Map of child frame ID to base64 screenshot
  frameWidth: number
  frameName: string
  images: Record<string, string> // Map of node ID to base64 image data URI
}

export type MessageToUI =
  | { type: 'FIGMA_DATA'; payload: FigmaPayload }
  | { type: 'ERROR'; error: string }

export type MessageToPlugin =
  | { type: 'EXTRACT' }
  | { type: 'CLOSE' }
