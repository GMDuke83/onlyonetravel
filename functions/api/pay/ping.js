/* Capability probe. The front end asks this once per visit: a 404 (GitHub
   Pages, no functions) means demo mode; an answer says which banks carry
   real credentials. Nothing secret leaves — only booleans. */
import { json } from './util.js';

export function onRequestGet({ env }) {
  return json({
    ok: true,
    providers: {
      ziraat: !!(env.ZIRAAT_CLIENT_ID && env.ZIRAAT_STORE_KEY),
      vakif:  !!(env.VAKIF_MERCHANT_ID && env.VAKIF_PASSWORD && env.VAKIF_TERMINAL_NO),
    },
  });
}
