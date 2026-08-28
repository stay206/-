/**
 * Bangumi 保管库 - 自建 API/OAuth 反向代理（Cloudflare Worker）
 *
 * 作用：解决纯前端网页版的两个问题：
 *   1. bgm.tv 的 OAuth token 兑换接口不带 CORS 头，浏览器无法直接兑换授权码；
 *   2. api.bgm.tv 在部分网络环境下访问不稳定。
 *
 * 部署步骤（免费，约 5 分钟）：
 *   1. 注册/登录 https://dash.cloudflare.com ；
 *   2. 左侧菜单「Workers 和 Pages」→「创建应用程序」→「创建 Worker」；
 *   3. 随便取个名字（如 bgm-proxy），点「部署」，然后点「编辑代码」；
 *   4. 删除示例代码，把本文件全部内容粘贴进去，点右上角「部署」；
 *   5. 复制你的 Worker 地址，形如 https://bgm-proxy.你的子域.workers.dev ；
 *   6. 打开 Bangumi 保管库 → 设置 → 高级网络设置 → 「API 地址」填入该地址，
 *      并勾选「登录和收藏同步也使用自定义 API」，保存。
 *   之后 OAuth2 登录和收藏同步都会走你自己的代理，不再受公共中转限流影响。
 *
 * 免费额度：每天 100,000 次请求，个人使用绰绰有余。
 * 注意：请勿把该代理地址公开分享（它不带鉴权，Secret 也会经由它传输）。
 */

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
    // /oauth/* 走 bgm.tv 主站（授权码兑换、刷新），其余走 api.bgm.tv。
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
