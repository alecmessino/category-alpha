import React from 'react';
import { INTENSITY_FILTERS, LANDFALL_FILTERS } from '../engine/query.js';
/** Controls describe a draft. The parent owns the single publish action. */
export function ClauseEditor({draft, setDraft, children}) {
 const set = patch => setDraft({...draft,...patch});
 const number = value => value === '' ? null : Number(value);
 return <>
  <div className="at-editor-fields">
   <fieldset><legend>GENESIS · WHERE</legend>
    <label>Genesis basin<select aria-label="Genesis basin" value={draft.basins?.length === 1 ? draft.basins[0] : ''} onChange={e=>set({basins:e.target.value?[e.target.value]:null})}><option value="">All basins</option><option value="NA">North Atlantic</option><option value="EP">East Pacific</option><option value="WP">West Pacific</option></select></label>
    {draft.where ? <><span className="at-location-value">{draft.where.lat.toFixed(1)}° · {draft.where.lon.toFixed(1)}°</span><label>Radius (km)<input aria-label="Genesis radius in kilometres" type="number" min="1" step="50" value={draft.where.radiusKm} onChange={e=>set({where:{...draft.where,radiusKm:Number(e.target.value)}})}/></label><button type="button" onClick={()=>set({where:null})}>CLEAR LOCATION</button></> : <p>Choose an ocean point on the plate to set a genesis radius.</p>}
   </fieldset>
   <fieldset><legend>GENESIS · WHEN</legend>
    <label>First season<input type="number" aria-label="First season" placeholder="Any" min="1851" max="2100" value={draft.seasonFrom ?? ''} onChange={e=>set({seasonFrom:number(e.target.value)})}/></label>
    <label>Last season<input type="number" aria-label="Last season" placeholder="Any" min="1851" max="2100" value={draft.seasonTo ?? ''} onChange={e=>set({seasonTo:number(e.target.value)})}/></label>
    <button type="button" onClick={()=>set({seasonFrom:1971})}>1971 ONWARD</button>
   </fieldset>
   <fieldset><legend>OUTCOME</legend>
    <label>Reached intensity<select aria-label="Reached intensity" value={draft.intensity} onChange={e=>set({intensity:e.target.value})}>{INTENSITY_FILTERS.map(x=><option key={x.key} value={x.key}>{x.key==='all'?'Any outcome':x.label}</option>)}</select></label>
    <label>Made landfall<select aria-label="Made landfall" value={draft.landfall || ''} onChange={e=>set({landfall:e.target.value || null})}><option value="">No landfall condition</option>{LANDFALL_FILTERS.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label>
    <p>A condition is not reported as an outcome of itself.</p>
   </fieldset>
  </div>
  <details className="at-editor-advanced"><summary>MONTHS, RECORD SCOPE & ALL CONDITIONS</summary><div className="at-draft-controls">{children}</div></details>
 </>;
}
