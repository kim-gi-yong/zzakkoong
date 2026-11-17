// 짝꿍 2.0 말벗 — 1순위 LG K-EXAONE 2.5 + 2순위 무료 Gemini + 실시간 무료 기상 데이터(Open-Meteo)
// API 키는 Vercel 환경변수(EXAONE_API_KEY, GEMINI_API_KEY)로만 읽습니다.

const EXAONE_URL = 'https://api.exaone.ai/v1/chat/completions';
const GEMINI_MODEL = 'gemini-flash-lite-latest';
const SEOUL_WEATHER_URL =
  'https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current=temperature_2m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=Asia%2FSeoul&forecast_days=2';

const BASE_SYSTEM_PROMPT =
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

function wmoToKorean(code) {
  if (code === 0) return '맑음';
  if (code <= 3) return '구름 조금 또는 흐림';
  if (code <= 48) return '안개';
  if (code <= 67 || (code >= 80 && code <= 82)) return '비';
  if (code <= 77 || (code >= 85 && code <= 86)) return '눈';
  if (code >= 95) return '천둥번개·비';
  return '흐림';
}

function needsWeather(message) {
  return /(날씨|기온|온도|비\s|비와|비오|눈\s|눈와|눈오|우산|추워|춥|더워|덥|외출|나가|산책|미끄|영하)/.test(
    message
  );
}

async function fetchSeoulWeather() {
  try {
    const r = await fetch(SEOUL_WEATHER_URL, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const d = await r.json();
    const curTemp = d?.current?.temperature_2m;
    const curSky = wmoToKorean(d?.current?.weather_code);
    const todayMin = d?.daily?.temperature_2m_min?.[0];
    const todayMax = d?.daily?.temperature_2m_max?.[0];
    const todayRain = d?.daily?.precipitation_probability_max?.[0];
    const todaySky = wmoToKorean(d?.daily?.weather_code?.[0]);
    const tmrMin = d?.daily?.temperature_2m_min?.[1];
    const tmrMax = d?.daily?.temperature_2m_max?.[1];
    const tmrRain = d?.daily?.precipitation_probability_max?.[1];
    const tmrSky = wmoToKorean(d?.daily?.weather_code?.[1]);

    return {
      summary: `서울 기준 현재 ${curTemp}℃(${curSky}). 오늘 최저 ${todayMin}℃/최고 ${todayMax}℃, 강수확률 ${todayRain}%(${todaySky}). 내일 최저 ${tmrMin}℃/최고 ${tmrMax}℃, 강수확률 ${tmrRain}%(${tmrSky}).`,
      fallbackText:
        `어르신, 서울 기준 오늘 기온은 ${todayMin}도에서 ${todayMax}도(${todaySky}, 비 확률 ${todayRain}%)이고, 내일은 ${tmrMin}도에서 ${tmrMax}도(${tmrSky})예요. ` +
        (todayRain >= 50 || tmrMin <= 0
          ? '빗길이나 추운 길에 미끄러지지 않게 미끄럼 방지 신발과 따뜻한 겉옷 꼭 챙기세요!'
          : '외출하실 때 일교차에 감기 들지 않도록 겉옷을 꼭 챙겨 입으세요!'),
    };
  } catch {
    return null;
  }
}

async function askExaone(apiKey, systemPrompt, history, message) {
  if (!apiKey) return null;
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
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: message },
        ],
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) {
      console.error('[chat] EXAONE HTTP', r.status);
      return null;
    }
    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content;
    const reply = typeof content === 'string' ? content.trim() : '';
    return reply || null;
  } catch (err) {
    console.error('[chat] EXAONE 호출 실패:', err && err.name);
    return null;
  }
}

async function askGemini(geminiKey, systemPrompt, history, message) {
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
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 300, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(6500),
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

  const weather = needsWeather(message) ? await fetchSeoulWeather() : null;
  const systemPrompt = weather
    ? `${BASE_SYSTEM_PROMPT} 참고할 실시간 기상 정보: [${weather.summary}] 이 수치를 바탕으로 오늘/내일 날씨를 정확히 알려드리고, 어르신이 외출 시 다치지 않게 옷차림·우산·빗길/빙판길 조심 안내를 꼭 덧붙여.`
    : BASE_SYSTEM_PROMPT;

  if (!exaoneKey && !geminiKey) {
    if (weather) return res.status(200).json({ reply: weather.fallbackText });
    console.error('[chat] API 키 미설정');
    return res.status(500).json(FAIL);
  }

  let reply = await askExaone(exaoneKey, systemPrompt, history, message);
  if (!reply) {
    reply = await askGemini(geminiKey, systemPrompt, history, message);
  }
  if (!reply && weather) {
    reply = weather.fallbackText;
  }

  if (!reply) {
    return res.status(500).json(FAIL);
  }
  return res.status(200).json({ reply });
};
