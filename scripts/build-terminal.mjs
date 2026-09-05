#!/usr/bin/env node
// Precompile the legacy global modules together; keep their explicit window exports.
// React stays external because the shared design-system bundle consumes window.React.
import { transform } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const names = ['map','panels','analogs','drawer','main'];
const code = [];
for (const name of names) {
 const source = await readFile(new URL(`docs/app/${name}.jsx`,root),'utf8');
 const result = await transform(source,{loader:'jsx',target:'es2022',format:'iife',minify:true,legalComments:'none',jsx:'transform'});
 code.push(result.code);
}
const output = code.join('\n');
const dest = new URL('docs/app/dist/terminal.js',root);
if(process.argv.includes('--check')) {
 if(await readFile(dest,'utf8') !== output) throw new Error('Terminal bundle differs from source. Run node scripts/build-terminal.mjs.');
 console.log('Terminal bundle matches source.');
} else {
 await mkdir(new URL('docs/app/dist/',root),{recursive:true});
 await writeFile(dest,output);
 console.log(`Terminal: ${Buffer.byteLength(output).toLocaleString()} bytes, no browser JSX compilation.`);
}
