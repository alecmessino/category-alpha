// Release contract: published fixtures, viewport invariance, draft/commit and refusals.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const docs=fileURLToPath(new URL('../docs/',import.meta.url));
const fixtures=JSON.parse(await readFile(new URL('fixtures/atlas-published-values.json',import.meta.url),'utf8'));
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';res.setHeader('Content-Type',types[extname(p)]||'application/octet-stream');res.end(await readFile(join(docs,p)));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
try {
 const page=await browser.newPage({serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
 const read=()=>({url:location.href,plate:document.querySelector('.at-plate').getBoundingClientRect().toJSON(),aperture:document.querySelector('[data-plate-aperture]').textContent,rows:[...document.querySelectorAll('.at-deck-data')].map(e=>e.textContent)});
 const open=async(q)=>{await page.goto(origin+'/storm-atlas/'+q);await page.waitForSelector('.at-deck-data');await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>document.querySelector('[data-plate-aperture]')?.textContent.includes('°'));};
 for(const width of [1440,1100,900,390]){
  await page.setViewportSize({width,height:900});
  for(const [name,f] of Object.entries(fixtures)){
   await open(f.url);
   const rows=await page.locator('.at-deck-data').evaluateAll(els=>els.map(e=>{
    const txt=s=>e.querySelector(s)?.textContent.trim()||null;
    const nums=s=>txt(s)?.match(/\d[\d,]*(?:\.\d+)?/g)||null;
    return {contract:e.getAttribute('data-contract-row'),count:nums('.at-dc-count .at-val'),rate:txt('.at-dc-rate .at-val'),interval:nums('.at-dc-interval .at-val'),status:txt('.at-dc-status')};
   }));
   assert.deepEqual(rows,f.rows.map(r=>({contract:r.contract,count:r.count,rate:r.rate,interval:r.interval,status:r.status})),`${width}: ${name} published values`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: page overflow`);
   assert.equal(await page.locator('.at-deck-data[data-refusal-state]').evaluateAll(els=>els.every(e=>{
    const status=e.querySelector('.at-dc-status'),b=status.getBoundingClientRect();
    return status.textContent.trim()&&b.width>0&&b.right<=innerWidth&&e.querySelector('.at-dc-rate').textContent.trim()==='—'&&e.querySelector('.at-dc-interval').textContent.trim()==='—';
   })),true,`${width}: refusal visibility`);
  }
 }
 await page.setViewportSize({width:1100,height:900});await open('?v=1&m=1.1.0');
 assert.ok(await page.locator('[data-evidence-row]').evaluate(e=>e.getBoundingClientRect().top>=innerHeight));
 const before=await page.evaluate(read);
 await page.getByRole('button',{name:'went on to any outcome',exact:true}).click();
 await page.getByRole('combobox',{name:'Reached intensity',exact:true}).selectOption('cat4');
 const draft=await page.evaluate(read);
 assert.equal(draft.url,before.url);assert.deepEqual(draft.rows,before.rows);assert.equal(draft.aperture,before.aperture);
 assert.equal(draft.plate.width,before.plate.width);assert.equal(draft.plate.height,before.plate.height);
 await page.getByRole('button',{name:'COMMIT',exact:true}).click();
 const committed=await page.evaluate(read);
 assert.ok(Math.abs(committed.plate.top-draft.plate.top)<=1);assert.equal(committed.aperture,draft.aperture);
 assert.equal(await page.locator('[data-principal-rate]').innerText(),'26.2%');assert.ok(committed.url.includes('i=cat4'));
 await page.getByRole('button',{name:'DISMISS · ESC',exact:true}).click();
 await page.getByRole('button',{name:'EAST PACIFIC',exact:true}).click();
 assert.equal((await page.evaluate(read)).url,committed.url);
 await page.getByRole('button',{name:'reached Category 4',exact:true}).click();
 await page.getByRole('combobox',{name:'Reached intensity',exact:true}).selectOption('cat5');
 await page.getByRole('button',{name:'CANCEL · ESC',exact:true}).click();
 assert.equal(await page.locator('[data-principal-rate]').innerText(),'26.2%');
 await open('?v=1&i=cat5&m=1.1.0');assert.equal(await page.locator('[data-principal-rate]').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Drafting release: four fixtures at four widths, visible refusals, frozen preview, stable commit, principal and camera gates passed.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
