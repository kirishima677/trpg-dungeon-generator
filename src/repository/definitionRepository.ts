import {v4 as uuid} from 'uuid';
import type Dexie from 'dexie';
import type {Table} from 'dexie';

export type DefinitionCollisionPolicy='skip'|'new-id';
export interface DefinitionImportReport {added:number;reused:number;skipped:number;reidentified:number}
interface TimestampedDefinition {id:string;createdAt:string;updatedAt:string}
export interface DefinitionRepository<D,T> {
 list():Promise<T[]>;get(id:string):Promise<T|undefined>;
 save(draft:D,expectedUpdatedAt:string|null):Promise<T>;
 delete(id:string,expectedUpdatedAt:string):Promise<void>;
 saveMany(values:T[],policy:DefinitionCollisionPolicy):Promise<DefinitionImportReport>;
}
const conflict=()=>new Error('別ウィンドウで更新または削除されています。編集中の内容を保持しました。一覧から開き直して確認してください。');
/** Persisted monotonic timestamps are CAS tokens, not generation randomness. */
function nextTimestamp(previous?:string){return new Date(Math.max(Date.now(),previous?Date.parse(previous)+1:0)).toISOString();}

/** Shared transaction mechanics only. Every domain retains its schema and identity rules. */
export function createDefinitionRepository<D extends {id:string},T extends D & TimestampedDefinition>(config:{
 database:Dexie;table:Table<T,string>;normalizeDraft:(value:unknown)=>D;normalize:(value:unknown)=>T;
 same:(a:T,b:T)=>boolean;checkedBatch:(value:unknown)=>T[];notify:()=>void;
}):DefinitionRepository<D,T> {
 const {database,table,normalizeDraft,normalize,same,checkedBatch,notify}=config;
 return {
  async list(){return (await table.orderBy('name').toArray()).map(normalize);},
  async get(id){const value=await table.get(id);return value?normalize(value):undefined;},
  async save(value,expectedUpdatedAt){
   const draft=normalizeDraft(value);
   const saved=await database.transaction('rw',table,async()=>{
    const existing=await table.get(draft.id);if((existing?.updatedAt??null)!==expectedUpdatedAt)throw conflict();
    const now=nextTimestamp(existing?.updatedAt),definition=normalize({...draft,createdAt:existing?.createdAt??now,updatedAt:now});
    await table.put(definition);return definition;
   });notify();return saved;
  },
  async delete(id,expectedUpdatedAt){
   await database.transaction('rw',table,async()=>{const existing=await table.get(id);if(!existing||existing.updatedAt!==expectedUpdatedAt)throw conflict();await table.delete(id);});notify();
  },
  async saveMany(values,policy){
   const definitions=checkedBatch(values);if(policy!=='skip'&&policy!=='new-id')throw new Error('ID衝突時の処理を選択してください。');
   const report=await database.transaction('rw',table,async()=>{
    const report:DefinitionImportReport={added:0,reused:0,skipped:0,reidentified:0},reserved=new Set(definitions.map(d=>d.id));
    for(const definition of definitions){
     const existing=await table.get(definition.id);
     if(!existing){await table.add(definition);report.added++;}
     else if(same(existing,definition))report.reused++;
     else if(policy==='skip')report.skipped++;
     else{let id:string;do{id=uuid();}while(reserved.has(id)||await table.get(id));reserved.add(id);const now=nextTimestamp();await table.add({...definition,id,createdAt:now,updatedAt:now});report.added++;report.reidentified++;}
    }return report;
   });if(report.added)notify();return report;
  },
 };
}
