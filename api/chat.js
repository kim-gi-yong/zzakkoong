// 짝꿍 2.0 말벗 — 1순위 LG K-EXAONE 2.5 + 2순위 무료 Gemini 예비 엔진 (Vercel Serverless)
// API 키는 Vercel 환경변수(EXAONE_API_KEY, GEMINI_API_KEY)로만 읽습니다.

const EXAONE_URL = 'https://api.exaone.ai/v1/chat/completions';
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const SYSTEM_PROMPT =
  "너는 어르신의 다정한 시니어 돌봄 말벗 '짝꿍'이야. 항상 존댓말로, 따뜻하고 쉬운 말로 2~3문장 이내로 대답해. 어르신을 '어르신'이라고 부르고, 안부와 위로를 먼저 건네.";
const FAIL = { error: '잠시 후 다시 시도해 주세요' };

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (m) =>
        m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim() !== ''
    )
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
}

async function askExaone(apiKey, history, message) {
  if (!apiKey) return null;
  const payload = JSON.stringify({
    model: 'k-exaone_v2.5',
    reasoning_effort: 'low',
    max_tokens: 512,
    stream: false,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message },
    ],
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(EXAONE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
        signal: AbortSignal.timeout(5500),
      });
      if (r.ok) {
        const data = await r.json();
        const content = data?.choices?.[0]?.message?.content;
        const reply = typeof content === 'string' ? content.trim() : '';
        if (reply) return reply;
      } else {
        console.error('[chat] EXAONE HTTP', r.status);
        if (r.status !== 429 && r.status < 500) return null;
      }
    } catch (err) {
      console.error('[chat] EXAONE 호출 실패:', err && err.name, err && err.cause && err.cause.code);
      return null;
    }
    if (attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }
  return null;
}

async function askGemini(geminiKey, history, message) {
  if (!geminiKey) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const contents = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(5500),
    });
    if (!r.ok) {
      console.error('[chat] Gemini HTTP', r.status);
      return null;
    }
    const data = await r.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const reply = Array.isArray(parts) ? parts.map((p) => p.text || '').join('').trim() : '';
    return reply || null;
  } catch (err) {
    console.error('[chat] Gemini 호출 실패:', err && err.name);
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 받습니다' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const message = body && typeof body.message === 'string' ? body.message.trim().slice(0, 1000) : '';
  if (!message) return res.status(400).json({ error: '말씀을 입력해 주세요' });

  const history = cleanHistory(body.history);
  const exaoneKey = (process.env.EXAONE_API_KEY || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (!exaoneKey && !geminiKey) {
    console.error('[chat] API 키 미설정');
    return res.status(500).json(FAIL);
  }

  let reply = await askExaone(exaoneKey, history, message);
  if (!reply) {
    reply = await askGemini(geminiKey, history, message);
  }

  if (!reply) {
    return res.status(500).json(FAIL);
  }
  return res.status(200).json({ reply });
};
