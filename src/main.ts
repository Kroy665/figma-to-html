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

    // Extract images from the frame
    const imageMap: Record<string, string> = {}
    await extractImages(frame, imageMap)
    console.log('[Main] Extracted images:', Object.keys(imageMap).length, 'images')
    console.log('[Main] Image IDs:', Object.keys(imageMap))

    const nodes = extractNode(frame)

    // Export screenshot for the main frame
    const bytes = await frame.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 }
    })

    // Convert bytes to base64 in chunks to avoid "too many arguments" error
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize)
      binary += String.fromCharCode.apply(null, Array.from(chunk))
    }
    const base64 = btoa(binary)

    // Export screenshots for each direct child frame
    const childScreenshots: Record<string, string> = {}
    if ('children' in frame) {
      for (const child of frame.children) {
        if (child.type === 'FRAME') {
          try {
            const childBytes = await child.exportAsync({
              format: 'PNG',
              constraint: { type: 'SCALE', value: 2 }
            })
            let childBinary = ''
            for (let i = 0; i < childBytes.length; i += chunkSize) {
              const chunk = childBytes.slice(i, i + chunkSize)
              childBinary += String.fromCharCode.apply(null, Array.from(chunk))
            }
            const childBase64 = btoa(childBinary)
            childScreenshots[child.id] = `data:image/png;base64,${childBase64}`
            console.log(`[Main] Exported screenshot for child frame: ${child.id}`)
          } catch (e) {
            console.error(`[Main] Failed to export child frame ${child.id}:`, e)
          }
        }
      }
    }
    console.log('[Main] Exported child screenshots:', Object.keys(childScreenshots).length)

    // Deep serialize the entire payload to ensure no symbols remain
    const payload = {
      nodes: deepSerialize(nodes),
      screenshot: base64,
      childScreenshots: childScreenshots,
      frameWidth: frame.width,
      frameName: frame.name,
      images: imageMap,
    }

    figma.ui.postMessage({
      type: 'FIGMA_DATA',
      payload: payload
    })
  }

  if (msg.type === 'CLOSE') {
    figma.closePlugin()
  }
}

async function extractImages(node: SceneNode, imageMap: Record<string, string>) {
  // Check if node has image fills
  if ('fills' in node && Array.isArray(node.fills)) {
    for (const fill of node.fills) {
      if (fill.type === 'IMAGE' && fill.imageHash) {
        const image = figma.getImageByHash(fill.imageHash)
        if (image) {
          try {
            const bytes = await image.getBytesAsync()
            let binary = ''
            const chunkSize = 8192
            for (let i = 0; i < bytes.length; i += chunkSize) {
              const chunk = bytes.slice(i, i + chunkSize)
              binary += String.fromCharCode.apply(null, Array.from(chunk))
            }
            const base64 = btoa(binary)
            imageMap[node.id] = `data:image/png;base64,${base64}`
          } catch (e) {
            console.error('Failed to extract image:', e)
          }
        }
      }
    }
  }

  // Recursively extract from children
  if ('children' in node) {
    for (const child of node.children) {
      await extractImages(child, imageMap)
    }
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
      fontSize: typeof node.fontSize === 'symbol' ? 0 : node.fontSize,
      fontName: serializeFontName(node.fontName),
      fills: serializePaints(node.fills),
      lineHeight: serializeLineHeight(node.lineHeight),
      letterSpacing: serializeLetterSpacing(node.letterSpacing),
      textAlignHorizontal: node.textAlignHorizontal,
    }
  }

  if ('fills' in node) {
    const withFills: any = {
      ...base,
      fills: serializePaints((node as GeometryMixin).fills)
    }
    if ('strokes' in node) withFills.strokes = serializePaints((node as GeometryMixin).strokes)
    if ('cornerRadius' in node) {
      const radius = (node as any).cornerRadius
      withFills.cornerRadius = typeof radius === 'symbol' ? 0 : radius
    }
    if ('opacity' in node) {
      const opacity = (node as any).opacity
      withFills.opacity = typeof opacity === 'symbol' ? 1 : opacity
    }
    // Extract effects for complexity analysis
    if ('effects' in node) {
      withFills.effects = (node as any).effects || []
    }
    // Extract blend mode for complexity analysis
    if ('blendMode' in node) {
      withFills.blendMode = (node as any).blendMode
    }
    // Extract rotation for complexity analysis
    if ('rotation' in node) {
      withFills.rotation = (node as any).rotation || 0
    }
    // Auto Layout
    if ('layoutMode' in node) {
      const frameNode = node as FrameNode
      withFills.layoutMode = frameNode.layoutMode
      withFills.paddingTop = typeof frameNode.paddingTop === 'symbol' ? 0 : frameNode.paddingTop
      withFills.paddingBottom = typeof frameNode.paddingBottom === 'symbol' ? 0 : frameNode.paddingBottom
      withFills.paddingLeft = typeof frameNode.paddingLeft === 'symbol' ? 0 : frameNode.paddingLeft
      withFills.paddingRight = typeof frameNode.paddingRight === 'symbol' ? 0 : frameNode.paddingRight
      withFills.itemSpacing = typeof frameNode.itemSpacing === 'symbol' ? 0 : frameNode.itemSpacing
      withFills.primaryAxisAlignItems = frameNode.primaryAxisAlignItems
      withFills.counterAxisAlignItems = frameNode.counterAxisAlignItems
    }
    if ('children' in node) {
      withFills.children = (node as ChildrenMixin).children.map(extractNode)
    }
    return withFills
  }

  return base
}

// Deep serialization to remove all symbols and non-serializable objects
function deepSerialize(value: any): any {
  // Handle symbols - replace with null
  if (typeof value === 'symbol') {
    return null
  }

  // Handle primitives
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(deepSerialize)
  }

  // Handle objects
  if (typeof value === 'object') {
    const serialized: any = {}
    for (const key in value) {
      if (value.hasOwnProperty(key)) {
        const serializedValue = deepSerialize(value[key])
        // Only include if not a symbol
        if (serializedValue !== null || value[key] === null) {
          serialized[key] = serializedValue
        }
      }
    }
    return serialized
  }

  // Unknown type - return null
  return null
}

// Serialize functions to handle non-serializable Figma types
function serializeFontName(fontName: FontName | symbol): any {
  if (typeof fontName === 'symbol') return { family: 'Arial', style: 'Regular' }
  return deepSerialize({ family: fontName.family, style: fontName.style })
}

function serializeLineHeight(lineHeight: LineHeight | symbol): any {
  if (typeof lineHeight === 'symbol') return { value: 1.2, unit: 'AUTO' }
  if (lineHeight.unit === 'AUTO') {
    return { value: 1.2, unit: 'AUTO' }
  }
  return deepSerialize({
    value: lineHeight.value,
    unit: lineHeight.unit
  })
}

function serializeLetterSpacing(letterSpacing: LetterSpacing | symbol): any {
  if (typeof letterSpacing === 'symbol') return { value: 0, unit: 'PIXELS' }
  return deepSerialize({
    value: letterSpacing.value,
    unit: letterSpacing.unit
  })
}

function serializePaints(paints: readonly Paint[] | symbol): any[] {
  if (typeof paints === 'symbol' || !Array.isArray(paints)) return []

  return paints.map(paint => {
    if (paint.type === 'SOLID') {
      return deepSerialize({
        type: 'SOLID',
        color: {
          r: paint.color.r,
          g: paint.color.g,
          b: paint.color.b
        },
        opacity: paint.opacity
      })
    }
    if (paint.type === 'IMAGE') {
      return deepSerialize({
        type: 'IMAGE',
        imageHash: paint.imageHash || null,
        scaleMode: paint.scaleMode
      })
    }
    // Add other paint types as needed
    return { type: paint.type }
  })
}
