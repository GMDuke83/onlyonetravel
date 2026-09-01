/* ============================================================================
   Shared helpers for the payment functions.

   This file exports no onRequest — it is a module, not a route; a direct hit
   on /api/pay/util simply finds no handler.

   Model: both banks take the card on THEIR page (Ziraat via NestPay
   "3D Pay Hosting", VakıfBank via PayFlex "Ortak Ödeme"). This code only
   signs the hand-over and verifies the way back — no card number ever
   reaches it, which is what keeps the PCI scope at the questionnaire level
   (SAQ A) instead of an audit.

   Secrets live exclusively in Cloudflare Pages environment variables.
   ============================================================================ */

export const CURRENCY_NUM = { TRY: '949', EUR: '978', USD: '840', GBP: '826' };

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function sha512b64(s) {
  const d = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(s));
  let b = '';
  new Uint8Array(d).forEach(x => { b += String.fromCharCode(x); });
  return btoa(b);
}

/* NestPay "ver3": every parameter except hash/encoding, keys sorted
   case-insensitively, values joined with |, backslash and pipe escaped,
   store key appended, SHA-512, Base64. Same routine signs the outgoing
   form and verifies the bank's answer. */
export function nestpayEscape(v) {
  return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

export async function nestpayHashVer3(params, storeKey) {
  const keys = Object.keys(params)
    .filter(k => { const l = k.toLowerCase(); return l !== 'hash' && l !== 'encoding'; })
    .sort((a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; });
  const plain = keys.map(k => nestpayEscape(params[k])).join('|') + '|' + nestpayEscape(storeKey);
  return sha512b64(plain);
}

export function siteOrigin(env, request) {
  return String(env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}

/* The way back into the app. index.html stashes ?pay=… before it strips the
   query, and boot() applies it — so this must stay a plain query redirect. */
export function redirectToApp(origin, q) {
  const p = new URLSearchParams();
  Object.keys(q).forEach(k => { if (q[k] != null && q[k] !== '') p.set(k, q[k]); });
  return Response.redirect(origin + '/?' + p.toString(), 302);
}

export function randHex(bytes = 16) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}
