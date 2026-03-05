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

function geminiTranslateDevApi(geminiApiKeyFromEnv, googleTranslateKeyFromEnv) {
  return {
    name: 'gemini-translate-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/translate', async (req, res) => {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          return json(res, 405, { error: 'Method not allowed' })
        }

        const geminiApiKey = geminiApiKeyFromEnv || process.env.GEMINI_API_KEY
        const googleTranslateKey =
          googleTranslateKeyFromEnv || process.env.GOOGLE_TRANSLATE_KEY
        if (!geminiApiKey && !googleTranslateKey) {
          return json(res, 500, { error: 'Missing GEMINI_API_KEY or GOOGLE_TRANSLATE_KEY' })
        }

        try {
          const raw = await readBody(req)
          const parsed = raw ? JSON.parse(raw) : {}
          const text = typeof parsed?.text === 'string' ? parsed.text.trim() : ''
          if (!text) return json(res, 400, { error: 'text is required' })
          const hasKorean = (value) => /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(value)
          const cleanTranslation = (value) =>
            value.replace(/^["']|["']$/g, '').replace(/^translation\s*:\s*/i, '').trim()

          const translateWithGemini = async () => {
            if (!geminiApiKey) return null
            const geminiRes = await fetch(
              'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-goog-api-key': geminiApiKey,
                },
                body: JSON.stringify({
                  systemInstruction: {
                    parts: [
                      {
                        text:
                          'You are a translation engine. Translate Korean to natural English for image prompts. ' +
                          'Return only English translation text.',
                      },
                    ],
                  },
                  contents: [{ role: 'user', parts: [{ text }] }],
                  generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 256,
                  },
                }),
              },
            )
            const data = await geminiRes.json()
            if (!geminiRes.ok) {
              const message = data?.error?.message || 'Gemini API request failed'
              throw new Error(message)
            }
            const raw = data?.candidates?.[0]?.content?.parts
              ?.map((part) => part?.text || '')
              .join(' ')
              .trim()
            return raw ? cleanTranslation(raw) : null
          }

          const translateWithGoogle = async () => {
            if (!googleTranslateKey) return null
            const googleRes = await fetch(
              `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(
                googleTranslateKey,
              )}`,
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
              throw new Error(message)
            }
            return data?.data?.translations?.[0]?.translatedText?.trim() || null
          }

          let translatedText = null
          let lastError = null

          try {
            translatedText = await translateWithGemini()
            if (translatedText && hasKorean(translatedText) && googleTranslateKey) {
              translatedText = await translateWithGoogle()
            }
          } catch (error) {
            lastError = error
          }

          if (!translatedText && googleTranslateKey) {
            try {
              translatedText = await translateWithGoogle()
            } catch (error) {
              lastError = error
            }
          }

          if (!translatedText) {
            return json(res, 502, { error: lastError?.message || 'No translation returned' })
          }

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
  const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY
  const googleTranslateKey = env.GOOGLE_TRANSLATE_KEY || process.env.GOOGLE_TRANSLATE_KEY

  return {
    plugins: [react(), geminiTranslateDevApi(geminiApiKey, googleTranslateKey)],
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
