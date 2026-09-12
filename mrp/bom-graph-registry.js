import {buildBomGraph} from './bom-graph.js';

const registries=new WeakMap();
function hasEffectiveHistory(state){return Object.values(state.bomHistory||{}).some(history=>(history||[]).some(revision=>revision.effectiveDate))}
function registry(state){let value=registries.get(state);if(!value){value={version:Number(state.mrpGraphVersion)||0,graphs:new Map(),hits:0,misses:0};registries.set(state,value)}if(value.version!==(Number(state.mrpGraphVersion)||0)){value={version:Number(state.mrpGraphVersion)||0,graphs:new Map(),hits:0,misses:0};registries.set(state,value)}return value}

export function getBomGraph(state,{onDate=new Date().toISOString().slice(0,10)}={}){
  const value=registry(state),dateKey=hasEffectiveHistory(state)?String(onDate).slice(0,10):'CURRENT';
  if(value.graphs.has(dateKey)){value.hits++;return value.graphs.get(dateKey)}
  const graph=buildBomGraph(state,{onDate});value.graphs.set(dateKey,graph);value.misses++;return graph;
}
export function invalidateBomGraph(state){state.mrpGraphVersion=(Number(state.mrpGraphVersion)||0)+1;registries.delete(state);return state.mrpGraphVersion}
export function bomGraphCacheStats(state){const value=registry(state);return{version:value.version,entries:value.graphs.size,hits:value.hits,misses:value.misses}}
