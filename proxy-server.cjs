// Simple CORS proxy for Gemini API calls from Figma plugin
const http = require('http');
const https = require('https');

const PORT = 3000;

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-goog-api-key');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/proxy') {
    console.log('📥 Received proxy request');
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const { url, headers, body: requestBody } = JSON.parse(body);
        console.log('🔗 Full URL:', url);
        console.log('📋 Headers:', JSON.stringify(headers, null, 2));
        console.log('📦 Body type:', typeof requestBody);
        console.log('📦 Body length:', typeof requestBody === 'string' ? requestBody.length : JSON.stringify(requestBody).length);
        if (requestBody && typeof requestBody === 'string' && requestBody.length > 0) {
          console.log('📦 Body preview:', requestBody.substring(0, 200));
        }

        const urlObj = new URL(url);
        const options = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
        };

        const proxyReq = https.request(options, proxyRes => {
          let responseBody = '';

          proxyRes.on('data', chunk => {
            responseBody += chunk.toString();
          });

          proxyRes.on('end', () => {
            console.log('✅ Response:', proxyRes.statusCode);
            if (proxyRes.statusCode >= 400) {
              console.log('❌ Error response:', responseBody.substring(0, 500));
            }
            res.writeHead(proxyRes.statusCode, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(responseBody);
          });
        });

        proxyReq.on('error', error => {
          console.error('❌ Proxy error:', error.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        });

        // Ensure requestBody is a string
        const bodyToSend = typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody);
        proxyReq.write(bodyToSend);
        proxyReq.end();
      } catch (error) {
        console.error('❌ Parse error:', error.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`🔄 CORS Proxy running on http://localhost:${PORT}`);
  console.log(`📝 Proxying requests to Gemini API`);
});
