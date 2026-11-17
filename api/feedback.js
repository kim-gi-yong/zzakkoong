export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { author = '사용자', category = '불편사항', text = '' } = req.body || {};
  if (!String(text).trim()) return res.status(400).json({ error: '내용을 입력해 주세요' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  let telegramSent = false;

  if (token && chatId) {
    try {
      const msg = `[짝꿍 2.0 불편·건의 접수]\n• 종류: ${category}\n• 보낸분: ${author}\n• 내용: ${text}`;
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msg })
      });
      telegramSent = r.ok;
    } catch {}
  }

  return res.status(200).json({ ok: true, telegramSent });
}
