/**
 * Bangumi 保管库 - 自建 OAuth 回调 + API 反向代理（Cloudflare Worker）
 *
 * 采用与 fankuhub.com 相同的「服务端回调兑换」模式：
 *   1. 应用跳转 bgm.tv 授权页时，redirect_uri 指向本 Worker 的 /oauth/callback；
 *   2. 用户授权后，bgm.tv 把授权码回调到本 Worker；
 *   3. Worker 在服务端用 App Secret 兑换 Access Token（无跨域问题，Secret 不暴露给前端）；
 *   4. Worker 把 token 通过 URL fragment（#）302 回传给应用页面；
 *   5. 应用读取 fragment 完成登录。
 *
 * 部署步骤（免费，约 5 分钟）：
 *   1. 注册/登录 https://dash.cloudflare.com ；
 *   2. 「Workers 和 Pages」→「创建应用程序」→「创建 Worker」；
 *   3. 点「编辑代码」，用本文件全部内容替换示例代码，点「部署」；
 *   4. 复制 Worker 地址，形如 https://bgm-proxy.你的子域.workers.dev ；
 *   5. 到 bgm.tv 应用管理（https://bgm.tv/dev/app ）把应用的「回调地址」改为：
 *      https://你的worker地址/oauth/callback
 *   6. 打开 Bangumi 保管库 → 设置 → 高级网络设置 → 「API 地址」填入 Worker 地址，
 *      勾选「登录和收藏同步也使用自定义 API」，保存；
 *   7. 强刷应用页面，点击「通过 OAuth2 登录」。
 *
 * 免费额度：每天 100,000 次请求。请勿把 Worker 地址公开分享（无鉴权）。
 */

// ===== 按需修改以下常量 =====
// 授权成功后重定向回的应用页面地址
const APP_URL = 'https://stay206.github.io/-/app/BangumiVault.html';
// bgm.tv 应用的凭据（建议替换为你自己的；部署后 Secret 只存在于本 Worker 中）
const OAUTH_CLIENT_ID = 'bgm70046a91ac9e5f951';
const OAUTH_CLIENT_SECRET = 'aa3dbf03b6675fc558089605a24d5baa';
// ===========================

const UPSTREAM_API = 'https://api.bgm.tv';
const UPSTREAM_OAUTH = 'https://bgm.tv';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-Requested-With',
  'Access-Control-Max-Age': '86400',
};

// bangumi API 要求请求携带可识别的 User-Agent。
const USER_AGENT = 'BangumiVault/1.0 (+https://github.com/stay206/-)';

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

async function handleOAuthCallback(url) {
  const code = url.searchParams.get('code') || '';
  const state = url.searchParams.get('state') || '';
  const oauthError = url.searchParams.get('error') || '';

  if (oauthError || !code) {
    const reason = oauthError || 'missing_code';
    return redirect(APP_URL + '?oauth_error=' + encodeURIComponent(reason));
  }

  try {
    const response = await fetch(UPSTREAM_OAUTH + '/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: OAUTH_CLIENT_ID,
        client_secret: OAUTH_CLIENT_SECRET,
        code,
        // OAuth 规范：兑换时的 redirect_uri 必须与授权时完全一致（即本 Worker 的回调地址）。
        redirect_uri: 'https://' + url.host + '/oauth/callback',
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.access_token) {
      const reason = String(payload.error || payload.message || ('HTTP ' + response.status));
      return redirect(APP_URL + '?oauth_error=' + encodeURIComponent(reason));
    }
    // token 通过 URL fragment 回传（fragment 不会发送到服务器，也不会进入浏览记录）。
    const fragment = new URLSearchParams({
      access_token: payload.access_token,
      refresh_token: payload.refresh_token || '',
      expires_in: String(payload.expires_in || 604800),
      token_type: payload.token_type || 'Bearer',
      user_id: String(payload.user_id || ''),
      state,
    });
    return redirect(APP_URL + '#' + fragment.toString());
  } catch (error) {
    return redirect(APP_URL + '?oauth_error=' + encodeURIComponent('proxy_exchange_failed: ' + error));
  }
}

function filterRequestHeaders(headers) {
  const out = new Headers();
  for (const [key, value] of headers.entries()) {
    const name = key.toLowerCase();
    if (['host', 'origin', 'referer', 'cookie', 'connection', 'user-agent', 'accept-encoding'].includes(name)) continue;
    out.set(key, value);
  }
  out.set('User-Agent', USER_AGENT);
  return out;
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // fankuhub 模式：服务端承接 OAuth 回调并兑换授权码。
    if (url.pathname === '/oauth/callback') {
      return handleOAuthCallback(url);
    }

    // 其余路径：通用反向代理（/oauth/* 走 bgm.tv 主站，其他走 api.bgm.tv）。
    const upstreamUrl = url.pathname.startsWith('/oauth/')
      ? UPSTREAM_OAUTH + url.pathname
      : UPSTREAM_API + url.pathname + url.search;

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(upstreamUrl, {
        method: request.method,
        headers: filterRequestHeaders(request.headers),
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow',
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'proxy_upstream_failed', message: String(error) }), {
        status: 502,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers(upstreamResponse.headers);
    headers.delete('content-security-policy');
    headers.delete('x-frame-options');
    for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers,
    });
  },
};
