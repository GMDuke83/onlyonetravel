/* ============================================================================
   /api/pay/return/{ziraat|vakif} — the bank sends the customer back here.

   Ziraat (NestPay) POSTs the outcome with a ver3 hash; the hash is verified
   with the store key before anything counts as paid — a forged or tampered
   callback fails closed. Success means Response=Approved, ProcReturnCode=00
   and an mdStatus of 1–4 (full 3-D or attempt, per the usual merchant
   configuration; tighten to '1' alone if the bank advises).

   VakıfBank (PayFlex CP) returns Rc=0000 on success. The definitive
   confirmation lives in the bank's own panel; when the merchant document
   arrives, add the VposTransactionInquiry call here for a second factor.

   Either way the customer ends at /?pay=ok|fail&oid=… — index.html stashes
   that query before stripping it and the app opens the trip with its new
   state. No secret ever appears in the redirect.
   ============================================================================ */
import { nestpayHashVer3, siteOrigin, redirectToApp } from '../util.js';

export async function onRequest({ request, env, params }) {
  const provider = String(params.provider || '');
  const origin   = siteOrigin(env, request);

  const data = {};
  if (request.method === 'POST') {
    try { (await request.formData()).forEach((v, k) => { data[k] = String(v); }); } catch (e) {}
  }
  new URL(request.url).searchParams.forEach((v, k) => { if (!(k in data)) data[k] = v; });

  if (provider === 'ziraat') {
    let ok = false;
    const hash = data.HASH || data.hash || '';
    if (env.ZIRAAT_STORE_KEY && hash) {
      const calc = await nestpayHashVer3(data, env.ZIRAAT_STORE_KEY);
      ok = calc === hash
        && data.Response === 'Approved'
        && data.ProcReturnCode === '00'
        && ['1', '2', '3', '4'].indexOf(String(data.mdStatus)) > -1;
    }
    return redirectToApp(origin, {
      pay: ok ? 'ok' : 'fail',
      oid: data.oid || data.ReturnOid || '',
      provider: 'ziraat',
      code: data.ProcReturnCode || '',
    });
  }

  if (provider === 'vakif') {
    const ok = String(data.Rc || data.ResultCode || '') === '0000';
    return redirectToApp(origin, {
      pay: ok ? 'ok' : 'fail',
      oid: data.TransactionId || data.MerchantTransactionId || '',
      provider: 'vakif',
      code: data.Rc || data.ResultCode || '',
    });
  }

  return redirectToApp(origin, { pay: 'fail', provider });
}
