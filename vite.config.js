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

function geminiTranslateDevApi(apiKeyFromEnv) {
  return {
    name: 'gemini-translate-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/translate', async (req, res) => {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          return json(res, 405, { error: 'Method not allowed' })
        }

        const apiKey =
          apiKeyFromEnv || process.env.GEMINI_API_KEY || process.env.GOOGLE_TRANSLATE_KEY
        if (!apiKey) {
          return json(res, 500, { error: 'Missing GEMINI_API_KEY' })
        }

        try {
          const raw = await readBody(req)
          const parsed = raw ? JSON.parse(raw) : {}
          const text = typeof parsed?.text === 'string' ? parsed.text.trim() : ''
          if (!text) return json(res, 400, { error: 'text is required' })

          const geminiRes = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey,
              },
              body: JSON.stringify({
                contents: [
                  {
                    role: 'user',
                    parts: [
                      {
                        text:
                          'Translate Korean text to natural English for an image prompt. ' +
                          'Return only translated English text without quotes.\n\n' +
                          `Input: ${text}`,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 256,
                },
              }),
            },
          )

          const data = await geminiRes.json()
          if (!geminiRes.ok) {
            const message = data?.error?.message || 'Gemini API request failed'
            return json(res, geminiRes.status, { error: message })
          }

          const translatedText = data?.candidates?.[0]?.content?.parts
            ?.map((part) => part?.text || '')
            .join(' ')
            .trim()

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
  const geminiApiKey =
    env.GEMINI_API_KEY || env.GOOGLE_TRANSLATE_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_TRANSLATE_KEY

  return {
    plugins: [react(), geminiTranslateDevApi(geminiApiKey)],
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
