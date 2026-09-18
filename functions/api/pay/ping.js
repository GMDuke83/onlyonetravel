import { json } from './util.js';
export function onRequestGet({env}) { return json({ok:!!env.DB,providers:{ziraat:!!(env.ZIRAAT_VERIFIED==='true'&&env.DB&&env.ZIRAAT_CLIENT_ID&&env.ZIRAAT_STORE_KEY),vakif:false}}); }
