/* Bank hand-off: amounts and ownership are always loaded from D1. */
import { json, CURRENCY_NUM, nestpayHashVer3, siteOrigin, randHex } from './util.js';
import { safely, sameOrigin, bodyJSON, fail } from '../../_lib/security.js';
import { preparePayment } from '../../_lib/payments.js';
export async function onRequestPost({request,env}) { return safely(async()=>{
  if(env.ZIRAAT_VERIFIED!=='true')fail(503,'bank-contract-not-verified');
  sameOrigin(request);const body=await bodyJSON(request);
  if(body.provider!=='ziraat')fail(501,'provider-not-verified');
  if(!env.ZIRAAT_CLIENT_ID||!env.ZIRAAT_STORE_KEY)fail(503,'bank-not-configured');
  const attempt=await preparePayment(request,env,body),origin=siteOrigin(env,request);
  const fields={clientid:env.ZIRAAT_CLIENT_ID,storetype:'3d_pay_hosting',hashAlgorithm:'ver3',TranType:'Auth',
    amount:(attempt.amount_minor/100).toFixed(2),currency:CURRENCY_NUM[attempt.currency],oid:attempt.id,
    okUrl:origin+'/api/pay/return/ziraat',failUrl:origin+'/api/pay/return/ziraat',
    lang:['tr','ru'].includes(body.lang)?body.lang:'en',rnd:randHex(16),refreshtime:'5'};
  fields.hash=await nestpayHashVer3(fields,env.ZIRAAT_STORE_KEY);
  return json({mode:'form',action:env.ZIRAAT_GATE_URL||'https://sanalpos2.ziraatbank.com.tr/fim/est3Dgate',fields});
}); }
