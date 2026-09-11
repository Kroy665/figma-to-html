import { GoogleGenAI } from '@google/genai'

// Singleton — create once, reuse across all tool calls
let _client: GoogleGenAI | null = null

export function getGeminiClient(apiKey: string): GoogleGenAI {
  if (!_client || _client === null) {
    console.log('[Gemini] Creating new client with API key:', apiKey?.substring(0, 10))
    _client = new GoogleGenAI({ apiKey })
  }
  return _client
}

// Gemini 3.5 Flash - GA, stable, optimized for coding and agentic workflows
export const MODEL = 'gemini-3.5-flash'
