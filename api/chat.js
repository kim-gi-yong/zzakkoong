// 짝꿍 2.0 말벗 — LG K-EXAONE 2.5 서버 함수 (Vercel Serverless, Node 18+)
// API 키는 Vercel 환경변수 EXAONE_API_KEY 로만 읽습니다. 절대 코드에 넣지 마세요.

const EXAONE_URL = 'https://api.exaone.ai/v1/chat/completions';
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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST 요청만 받습니다' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const message = body && typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return res.status(400).json({ error: '말씀을 입력해 주세요' });

  // 붙여넣기 때 섞인 줄바꿈(CR/LF)·공백 제거 — 남아 있으면 헤더가 깨져 fetch 가 TypeError 를 냅니다
  const apiKey = (process.env.EXAONE_API_KEY || '').trim();
  if (!apiKey) {
    console.error('[chat] EXAONE_API_KEY 미설정');
    return res.status(500).json(FAIL);
  }

  try {
    const r = await fetch(EXAONE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'k-exaone_v2.5',
        reasoning_effort: 'low',
        max_tokens: 512,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...cleanHistory(body.history),
          { role: 'user', content: message.slice(0, 1000) },
        ],
      }),
    });

    if (!r.ok) {
      console.error('[chat] EXAONE HTTP', r.status);
      return res.status(500).json(FAIL);
    }

    const data = await r.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '';
    const reply = typeof content === 'string' ? content.trim() : '';
    if (!reply) {
      console.error('[chat] EXAONE 빈 응답, finish_reason:', data?.choices?.[0]?.finish_reason);
      return res.status(500).json(FAIL);
    }

    return res.status(200).json({ reply });
  } catch (err) {
    // 에러 메시지에는 헤더(키)가 섞일 수 있으므로 이름·원인 코드만 남깁니다
    console.error('[chat] EXAONE 호출 실패:', err && err.name, err && err.cause && err.cause.code);
    return res.status(500).json(FAIL);
  }
};
