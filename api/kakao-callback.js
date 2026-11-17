export default async function handler(req, res) {
  const { code, error, error_description } = req.query;
  if (error || !code) {
    return res.redirect('/?kakao_error=' + encodeURIComponent(error_description || error || 'cancelled'));
  }

  const clientId = '3fd063a11398b5d3713614debec0dd6c';
  const clientSecret = 'Ft7jJlKE9zIS5KxQlXN48PsSHStmU6O4';
  const redirectUri = 'https://zzakkoong.vercel.app/api/kakao-callback';

  try {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: String(code)
      }).toString()
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.redirect('/?kakao_error=' + encodeURIComponent(tokenData.error_description || 'token_failed'));
    }

    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json();
    const nick = userData?.kakao_account?.profile?.nickname || userData?.properties?.nickname || '카카오이웃';
    const uid = String(userData?.id || '');

    return res.redirect(`/?kakao_nick=${encodeURIComponent(nick)}&kakao_uid=${encodeURIComponent(uid)}`);
  } catch (e) {
    return res.redirect('/?kakao_error=' + encodeURIComponent(e.message || 'server_error'));
  }
}
