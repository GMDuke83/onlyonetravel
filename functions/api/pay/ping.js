import { json } from './util.js';
export function onRequestGet({env}) { return json({ok:!!env.DB,providers:{ziraat:!!(env.DB&&env.ZIRAAT_CLIENT_ID&&env.ZIRAAT_STORE_KEY),vakif:false}}); }
