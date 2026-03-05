import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function json(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      resolve(body)
    })
    req.on('error', reject)
  })
}

function googleTranslateDevApi(apiKeyFromEnv) {
  return {
    name: 'google-translate-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/translate', async (req, res) => {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          return json(res, 405, { error: 'Method not allowed' })
        }

        const apiKey = apiKeyFromEnv || process.env.GOOGLE_TRANSLATE_KEY
        if (!apiKey) {
          return json(res, 500, { error: 'Missing GOOGLE_TRANSLATE_KEY' })
        }

        try {
          const raw = await readBody(req)
          const parsed = raw ? JSON.parse(raw) : {}
          const text = typeof parsed?.text === 'string' ? parsed.text.trim() : ''
          if (!text) return json(res, 400, { error: 'text is required' })

          const googleRes = await fetch(
            `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                q: text,
                source: 'ko',
                target: 'en',
                format: 'text',
              }),
            },
          )

          const data = await googleRes.json()
          if (!googleRes.ok) {
            const message = data?.error?.message || 'Google Translate API request failed'
            return json(res, googleRes.status, { error: message })
          }

          const translatedText = data?.data?.translations?.[0]?.translatedText?.trim()
          if (!translatedText) return json(res, 502, { error: 'No translation returned' })

          return json(res, 200, { translatedText })
        } catch (error) {
          return json(res, 500, { error: error?.message || 'Unexpected translation error' })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const googleTranslateKey = env.GOOGLE_TRANSLATE_KEY || process.env.GOOGLE_TRANSLATE_KEY

  return {
    plugins: [react(), googleTranslateDevApi(googleTranslateKey)],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            three: ['three'],
          },
        },
      },
    },
  }
})
