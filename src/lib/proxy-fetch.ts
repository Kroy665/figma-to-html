// Proxy fetch wrapper to bypass CORS in Figma plugin
const PROXY_URL = 'http://localhost:3000/proxy';

export async function proxyFetch(url: string, options: RequestInit): Promise<Response> {
  console.log('[ProxyFetch] Original options.headers:', options.headers);
  console.log('[ProxyFetch] Headers type:', options.headers?.constructor?.name);

  // Convert Headers object to plain object
  const headers: Record<string, string> = {};
  if (options.headers) {
    if (options.headers instanceof Headers) {
      console.log('[ProxyFetch] Converting Headers object');
      options.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(options.headers)) {
      console.log('[ProxyFetch] Converting array headers');
      options.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      console.log('[ProxyFetch] Using plain object headers');
      Object.assign(headers, options.headers);
    }
  }

  console.log('[ProxyFetch] Final headers:', headers);
  console.log('[ProxyFetch] Request body type:', options.body?.constructor?.name);

  // Handle ReadableStream body
  let bodyContent = '';
  if (options.body) {
    if (options.body instanceof ReadableStream) {
      console.log('[ProxyFetch] Reading ReadableStream...');
      const reader = options.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      bodyContent = new TextDecoder().decode(combined);
      console.log('[ProxyFetch] Stream read, length:', bodyContent.length);
    } else if (typeof options.body === 'string') {
      bodyContent = options.body;
    } else {
      bodyContent = String(options.body);
    }
  }

  let response;
  try {
    response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        headers,
        body: bodyContent,
      }),
    });
  } catch (err: any) {
    console.error('[ProxyFetch] Network error:', err);
    throw new Error(`Proxy connection failed: ${err.message || String(err)}. Make sure the proxy server is running (npm run proxy)`);
  }

  if (!response.ok) {
    let errorText;
    try {
      const error = await response.json();
      errorText = error.error || JSON.stringify(error);
    } catch {
      errorText = await response.text();
    }
    console.error('[ProxyFetch] Response error:', response.status, errorText);
    throw new Error(`Proxy request failed (${response.status}): ${errorText}`);
  }

  return response;
}

// Monkey-patch global fetch for Gemini SDK
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = ((url: string | URL | Request, options?: RequestInit) => {
    let urlString: string;
    let fetchOptions: RequestInit = {};

    // Handle Request object
    if (url instanceof Request) {
      console.log('[Fetch] Request object detected');
      urlString = url.url;
      fetchOptions = {
        method: url.method,
        headers: url.headers,
        body: url.body,
        ...options,
      };
    } else {
      urlString = typeof url === 'string' ? url : url.toString();
      fetchOptions = options || {};
    }

    console.log('[Fetch] URL:', urlString);
    console.log('[Fetch] Options:', fetchOptions);

    // Only proxy Gemini API calls
    if (urlString.includes('generativelanguage.googleapis.com')) {
      return proxyFetch(urlString, fetchOptions);
    }

    return originalFetch(url, options);
  }) as typeof fetch;
}
