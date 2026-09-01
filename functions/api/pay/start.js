/* ============================================================================
   POST /api/pay/start — begin a payment at the chosen bank.

   Body: { provider: 'ziraat'|'vakif', oid, amount, currency, lang }
   Answer:
     { mode:'form',     action, fields }   → the browser posts this form to
                                             the bank's hosted payment page
     { mode:'redirect', url }              → the browser navigates there

   Ziraat  = NestPay (Asseco/EST) "3D Pay Hosting": we sign a form with the
             store key (hash ver3) and the customer types the card at the
             bank. Production gate: sanalpos2.ziraatbank.com.tr, test gate:
             entegrasyon.asseco-see.com.tr — set via ZIRAAT_GATE_URL.
   Vakıf   = PayFlex (İnnova) "Ortak Ödeme": we register the transaction
             server-to-server, receive a PaymentToken and send the customer
             to the bank's common payment page. Field names follow the
             public PayFlex-CP integrations; confirm them against the
             bank's own document when the merchant credentials arrive —
             they are isolated in vakifRegisterParams() below on purpose.

   Environment variables (Cloudflare Pages → Settings → Variables):
     SITE_URL             public origin for the return redirect
     ZIRAAT_CLIENT_ID     İşyeri/Client No from the bank
     ZIRAAT_STORE_KEY     3D store key (secret)
     ZIRAAT_GATE_URL      optional; defaults to the production gate
     VAKIF_MERCHANT_ID    HostMerchantId
     VAKIF_PASSWORD       MerchantPassword (secret)
     VAKIF_TERMINAL_NO    TerminalNo (e.g. VP000123)
     VAKIF_CP_BASE        optional; defaults to https://cpweb.vakifbank.com.tr
                          (test: https://cptest.vakifbank.com.tr)
   ============================================================================ */
import { json, CURRENCY_NUM, nestpayHashVer3, siteOrigin, randHex } from './util.js';

const ZIRAAT_GATE_PROD = 'https://sanalpos2.ziraatbank.com.tr/fim/est3Dgate';
const VAKIF_CP_PROD    = 'https://cpweb.vakifbank.com.tr';

function vakifRegisterParams(env, amt, curNum, oid, origin, lang) {
  /* One place to adjust when the bank's PayFlex-CP document arrives. */
  return {
    HostMerchantId:       env.VAKIF_MERCHANT_ID,
    MerchantPassword:     env.VAKIF_PASSWORD,
    TerminalNo:           env.VAKIF_TERMINAL_NO,
    TransactionType:      'Sale',
    Amount:               amt,
    Currency:             curNum,
    TransactionId:        oid,
    IsSecure:             'true',
    AllowNotEnrolledCard: 'false',
    TransactionDeviceSource: '0',
    SuccessUrl:           origin + '/api/pay/return/vakif',
    FailUrl:              origin + '/api/pay/return/vakif',
    RequestLanguage:      lang === 'tr' ? 'tr-TR' : 'en-US',
  };
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad-json' }, 400); }

  const provider = String(body.provider || '');
  const oid      = String(body.oid || '');
  const amount   = Number(body.amount);
  const currency = String(body.currency || 'EUR').toUpperCase();
  const lang     = String(body.lang || 'en').slice(0, 2);

  if (!/^[A-Za-z0-9_-]{3,40}$/.test(oid))            return json({ error: 'bad-oid' }, 400);
  if (!isFinite(amount) || amount <= 0 || amount > 9999999) return json({ error: 'bad-amount' }, 400);
  if (!CURRENCY_NUM[currency])                        return json({ error: 'bad-currency' }, 400);

  const origin = siteOrigin(env, request);
  const amt    = amount.toFixed(2);
  const curNum = CURRENCY_NUM[currency];

  if (provider === 'ziraat') {
    if (!env.ZIRAAT_CLIENT_ID || !env.ZIRAAT_STORE_KEY) return json({ error: 'not-configured' }, 501);
    const fields = {
      clientid:      env.ZIRAAT_CLIENT_ID,
      storetype:     '3d_pay_hosting',
      hashAlgorithm: 'ver3',
      TranType:      'Auth',
      amount:        amt,
      currency:      curNum,
      oid,
      okUrl:         origin + '/api/pay/return/ziraat',
      failUrl:       origin + '/api/pay/return/ziraat',
      lang:          lang === 'tr' ? 'tr' : lang === 'ru' ? 'ru' : 'en',
      rnd:           randHex(16),
      refreshtime:   '5',
    };
    fields.hash = await nestpayHashVer3(fields, env.ZIRAAT_STORE_KEY);
    return json({ mode: 'form', action: env.ZIRAAT_GATE_URL || ZIRAAT_GATE_PROD, fields });
  }

  if (provider === 'vakif') {
    if (!env.VAKIF_MERCHANT_ID || !env.VAKIF_PASSWORD || !env.VAKIF_TERMINAL_NO) {
      return json({ error: 'not-configured' }, 501);
    }
    const base = String(env.VAKIF_CP_BASE || VAKIF_CP_PROD).replace(/\/$/, '');
    const form = new URLSearchParams(vakifRegisterParams(env, amt, curNum, oid, origin, lang));
    let text = '';
    try {
      const res = await fetch(base + '/CommonPayment/api/RegisterTransaction', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      text = await res.text();
    } catch (e) {
      return json({ error: 'bank-unreachable' }, 502);
    }
    const code  = (text.match(/<(?:ResponseCode|Rc)>([^<]+)</i) || [])[1] || '';
    const token = (text.match(/<(?:PaymentToken|Token)>([^<]+)</i) || [])[1] || '';
    const url   = (text.match(/<CommonPaymentUrl>([^<]+)</i) || [])[1] || (base + '/CommonPayment/SecurePayment');
    if (code !== '0000' || !token) {
      const msg = (text.match(/<ResponseMessage>([^<]+)</i) || [])[1] || '';
      return json({ error: 'bank-rejected', code, message: msg.slice(0, 200) }, 502);
    }
    return json({ mode: 'redirect', url: url + (url.includes('?') ? '&' : '?') + 'Ptkn=' + encodeURIComponent(token) });
  }

  return json({ error: 'bad-provider' }, 400);
}
