/* The redirect is presentation only. Only a verified, amount-matched bank
   callback may write the ledger. Vakif remains disabled pending bank inquiry. */
import { nestpayHashVer3, siteOrigin, redirectToApp, CURRENCY_NUM } from '../util.js';
import { safely, fail } from '../../../_lib/security.js';
import { settlePayment } from '../../../_lib/payments.js';
export async function onRequest({request,env,params}) { return safely(async()=>{
  if(env.ZIRAAT_VERIFIED!=='true')fail(503,'bank-contract-not-verified');
  if(params.provider!=='ziraat'||request.method!=='POST')fail(405,'verified-post-required');
  if(!env.DB||!env.ZIRAAT_STORE_KEY)fail(503,'bank-not-configured');
  if(Number(request.headers.get('content-length'))>32768)fail(413,'body-too-large');
  const raw=await request.text();if(raw.length>32768)fail(413,'body-too-large');
  const form=new URLSearchParams(raw),data={};for(const [k,v] of form){if(k in data)fail(400,'duplicate-field');data[k]=v;}
  const hash=data.HASH||data.hash;
  if(!hash||await nestpayHashVer3(data,env.ZIRAAT_STORE_KEY)!==hash)fail(400,'invalid-bank-signature');
  const attempt=await env.DB.prepare('SELECT * FROM payment_attempts WHERE id=? AND provider=\'ziraat\'').bind(data.oid||'').first();
  if(!attempt)fail(404,'unknown-payment');
  if(data.clientid!==env.ZIRAAT_CLIENT_ID||!/^\d+(\.\d{1,2})?$/.test(data.amount||'')||Math.round(Number(data.amount)*100)!==attempt.amount_minor||data.currency!==CURRENCY_NUM[attempt.currency])fail(400,'bank-payment-mismatch');
  const approved=data.Response==='Approved'&&data.ProcReturnCode==='00'&&String(data.mdStatus)==='1';
  const ok=await settlePayment(env,attempt,approved);
  return redirectToApp(siteOrigin(env,request),{pay:ok?'ok':'fail',oid:attempt.request_id,provider:'ziraat'});
}); }
