#!/usr/bin/env node
// Convert the pinned Natural Earth topology to local display-only GeoJSON.
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const t=JSON.parse(await readFile(new URL('data/context/land-110m.json',root),'utf8'));
const arcs=t.arcs.map(a=>{let x=0,y=0;return a.map(([dx,dy])=>{x+=dx;y+=dy;return [x*t.transform.scale[0]+t.transform.translate[0],y*t.transform.scale[1]+t.transform.translate[1]];});});
const ring=ids=>ids.flatMap((id,i)=>{const a=id<0?[...arcs[~id]].reverse():arcs[id];return i?a.slice(1):a;});
const geometry=g=>g.type==='GeometryCollection'?{type:g.type,geometries:g.geometries.map(geometry)}:{type:g.type,coordinates:g.type==='MultiPolygon'?g.arcs.map(p=>p.map(ring)):g.arcs.map(ring)};
const data=JSON.stringify({type:'Feature',properties:{source:'Natural Earth 1:110m; world-atlas 2.0.2',purpose:'Display context only; never used for landfall or cohort calculations'},geometry:geometry(t.objects.land)})+'\n';
const out=new URL('docs/assets/terminal-land.json',root);
if(process.argv.includes('--check')){if(await readFile(out,'utf8')!==data)throw Error('Rebuild terminal-land.json');console.log('Terminal coastline matches pinned topology.');}
else{await writeFile(out,data);console.log(`Terminal coastline: ${Buffer.byteLength(data)} bytes.`);}
