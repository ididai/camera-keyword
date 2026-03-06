import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const ANALYTICS_EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeAnalyticsString(value, maxLength = 200) {
  const clean = String(value || '').trim().replace(ANALYTICS_EMAIL_REGEX, '[redacted-email]')
  if (!clean) return ''
  return clean.length <= maxLength ? clean : clean.slice(0, maxLength)
}

function sanitizeAnalyticsValue(value, depth = 0) {
  if (value == null) return undefined
  if (typeof value === 'string') return sanitizeAnalyticsString(value)
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(3)) : undefined
  if (depth > 1) return undefined

  if (Array.isArray(value)) {
    const cleaned = value
      .slice(0, 12)
      .map((item) => sanitizeAnalyticsValue(item, depth + 1))
      .filter((item) => item !== undefined)
    return cleaned.length ? cleaned : undefined
  }

  if (isPlainObject(value)) {
    const out = {}
    Object.entries(value)
      .slice(0, 24)
      .forEach(([key, item]) => {
        const safeKey = String(key || '')
          .trim()
          .replace(/[^a-zA-Z0-9_.-]/g, '_')
          .slice(0, 40)
        if (!safeKey) return
        const safeValue = sanitizeAnalyticsValue(item, depth + 1)
        if (safeValue !== undefined) out[safeKey] = safeValue
      })
    return Object.keys(out).length ? out : undefined
  }

  return undefined
}

function normalizeAnalyticsEvent(raw) {
  if (!isPlainObject(raw)) return null

  const name = sanitizeAnalyticsString(raw.name || '', 64)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '_')
  if (!name) return null

  const ts = Number(raw.ts)
  const event = {
    name,
    ts: Number.isFinite(ts) ? Math.round(ts) : Date.now(),
  }

  const path = sanitizeAnalyticsString(raw.path || '', 120)
  if (path) event.path = path

  const anonymousId = sanitizeAnalyticsString(raw.anonymousId || '', 80)
  if (anonymousId) event.anonymousId = anonymousId

  const sessionId = sanitizeAnalyticsString(raw.sessionId || '', 80)
  if (sessionId) event.sessionId = sessionId

  const props = sanitizeAnalyticsValue(raw.props, 0)
  if (props && isPlainObject(props) && Object.keys(props).length) {
    event.props = props
  }

  return event
}

function extractAnalyticsEvents(body) {
  if (Array.isArray(body)) return body
  if (isPlainObject(body)) {
    if (Array.isArray(body.events)) return body.events
    if (isPlainObject(body.event)) return [body.event]
  }
  return []
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

function analyticsDevApi(analyticsWebhookUrlFromEnv, analyticsWebhookTokenFromEnv) {
  return {
    name: 'analytics-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/analytics', async (req, res) => {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST')
          return json(res, 405, { error: 'Method not allowed' })
        }

        try {
          const raw = await readBody(req)
          const parsed = raw ? JSON.parse(raw) : {}
          const events = extractAnalyticsEvents(parsed)
            .map(normalizeAnalyticsEvent)
            .filter(Boolean)
            .slice(0, 50)

          if (!events.length) {
            return json(res, 400, { error: 'events are required' })
          }

          const payload = {
            receivedAt: new Date().toISOString(),
            source: 'camera-keyword-dev',
            request: {
              ip: String(req.headers['x-forwarded-for'] || '')
                .split(',')[0]
                .trim() || null,
              userAgent: sanitizeAnalyticsString(req.headers['user-agent'] || '', 180) || null,
            },
            events,
          }

          const analyticsWebhookUrl =
            analyticsWebhookUrlFromEnv || process.env.ANALYTICS_WEBHOOK_URL
          const analyticsWebhookToken =
            analyticsWebhookTokenFromEnv || process.env.ANALYTICS_WEBHOOK_TOKEN

          if (analyticsWebhookUrl) {
            try {
              const headers = { 'Content-Type': 'application/json' }
              if (analyticsWebhookToken) {
                headers.Authorization = `Bearer ${analyticsWebhookToken}`
              }

              const forwarded = await fetch(analyticsWebhookUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
              })

              if (!forwarded.ok) {
                return json(res, 202, { accepted: events.length, forwarded: false })
              }
            } catch {
              return json(res, 202, { accepted: events.length, forwarded: false })
            }
          } else {
            // eslint-disable-next-line no-console
            console.log('[analytics-dev]', JSON.stringify(payload))
          }

          return json(res, 200, { accepted: events.length, forwarded: Boolean(analyticsWebhookUrl) })
        } catch (error) {
          return json(res, 500, { error: error?.message || 'Unexpected analytics error' })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY
  const googleTranslateKey = env.GOOGLE_TRANSLATE_KEY || process.env.GOOGLE_TRANSLATE_KEY
  const analyticsWebhookUrl = env.ANALYTICS_WEBHOOK_URL || process.env.ANALYTICS_WEBHOOK_URL
  const analyticsWebhookToken = env.ANALYTICS_WEBHOOK_TOKEN || process.env.ANALYTICS_WEBHOOK_TOKEN

  return {
    plugins: [
      react(),
      geminiTranslateDevApi(geminiApiKey, googleTranslateKey),
      analyticsDevApi(analyticsWebhookUrl, analyticsWebhookToken),
    ],
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
