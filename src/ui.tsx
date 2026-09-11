import './lib/proxy-fetch' // MUST be first - patches fetch for CORS proxy
import React, { useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { runParallelPipeline, PipelineStep } from './agent/parallel-orchestrator'
import { FigmaPayload } from './types/messages'
import './styles.css'

function App() {
  const [apiKey, setApiKey]       = useState('AIzaSyD648ldi-K4o2Fk2UkEWGwYHBIrod94KdA')
  const [figmaData, setFigmaData] = useState<FigmaPayload | null>(null)
  const [steps, setSteps]         = useState<PipelineStep[]>([])
  const [outputHTML, setOutput]   = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError]         = useState<string | null>(null)

  // Trigger extraction on mount and listen for messages
  useEffect(() => {
    // Listen for messages from main.ts
    window.onmessage = (event) => {
      const msg = event.data.pluginMessage
      if (!msg) return
      if (msg.type === 'FIGMA_DATA') {
        setFigmaData(msg.payload)
        console.log("msg.payload::", msg.payload)
      }
      
      if (msg.type === 'ERROR') setError(msg.error)
    }

    // Trigger initial extraction
    parent.postMessage({ pluginMessage: { type: 'EXTRACT' } }, '*')
  }, [])

  const handleRefresh = () => {
    setError(null)
    setFigmaData(null)
    parent.postMessage({ pluginMessage: { type: 'EXTRACT' } }, '*')
  }

  const handleConvert = async () => {
    if (!figmaData || !apiKey.trim()) return
    setIsRunning(true)
    setError(null)
    setOutput(null)
    setSteps([])

    try {
      const html = await runParallelPipeline(figmaData, apiKey, {
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
      <div className="flex items-center gap-2">
        {figmaData ? (
          <div className="text-xs text-gray-600 flex-1">
            Selected: <strong>{figmaData.frameName}</strong> ({figmaData.frameWidth}px)
          </div>
        ) : (
          <div className="text-xs text-orange-500 flex-1">Select a Frame in Figma</div>
        )}
        <button
          onClick={handleRefresh}
          className="text-xs border rounded px-2 py-1 text-gray-600 border-gray-300"
        >
          Refresh
        </button>
      </div>

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

// Wait for DOM to be ready before mounting React
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp)
} else {
  initApp()
}

function initApp() {
  const rootElement = document.getElementById('root')
  if (rootElement) {
    const root = createRoot(rootElement)
    root.render(<App />)
  }
}
