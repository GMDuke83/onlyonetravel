// Browser-compatible fallback for Workers' native PBKDF2 iteration cap.
// The demo copies Functions as ESM; the bundle and its license are checked in.
const {buildSync}=require('esbuild');
const {copyFileSync}=require('node:fs');
buildSync({stdin:{contents:"export {pbkdf2Async} from '@noble/hashes/pbkdf2.js'; export {sha256} from '@noble/hashes/sha2.js';",resolveDir:process.cwd()},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'functions/_lib/vendor/password-kdf.js',legalComments:'inline'});
copyFileSync('node_modules/@noble/hashes/LICENSE','functions/_lib/vendor/noble-hashes-LICENSE.txt');
