import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import ts from 'typescript';
const root=resolve(import.meta.dirname,'../src');
function files(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(resolve(path,e.name)):/\.tsx?$/.test(e.name)?[resolve(path,e.name)]:[]);}
const graph=new Map<string,string[]>(),forbidden:string[]=[];
for(const file of files(root)){
 const tree=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),dependencies:string[]=[];
 for(const node of tree.statements){
  if(!ts.isImportDeclaration(node)&&!ts.isExportDeclaration(node))continue;
  if(!node.moduleSpecifier||!ts.isStringLiteral(node.moduleSpecifier)||('isTypeOnly'in node&&node.isTypeOnly))continue;
  if(ts.isImportDeclaration(node)){
   const clause=node.importClause;if(clause?.isTypeOnly)continue;
   if(clause&&!clause.name&&clause.namedBindings&&ts.isNamedImports(clause.namedBindings)&&clause.namedBindings.elements.every(e=>e.isTypeOnly))continue;
  }
  const specifier=node.moduleSpecifier.text;
  if(file.startsWith(resolve(root,'model')+'/')&&/^(react|react-dom|zustand)$|(?:^|\/)(components|repository|db|store)(?:\/|$)/.test(specifier))forbidden.push(`${file}: ${specifier}`);
  if(file.startsWith(resolve(root,'publishing')+'/')&&/(?:^|\/)(repository|db|store)(?:\/|$)/.test(specifier))forbidden.push(`${file}: ${specifier}`);
  if(specifier.startsWith('.')){const base=resolve(dirname(file),specifier),target=[base+'.ts',base+'.tsx',resolve(base,'index.ts')].find(existsSync);if(target)dependencies.push(target);}
 }
 graph.set(file,dependencies);
}
test('domain and Publisher boundaries exclude editor state and persistence dependencies',()=>assert.deepEqual(forbidden,[]));
test('static runtime imports have no dependency cycles',()=>{
 const visited=new Set<string>(),active:string[]=[],cycles:string[]=[];
 const visit=(file:string)=>{if(active.includes(file)){cycles.push([...active.slice(active.indexOf(file)),file].map(p=>p.slice(root.length+1)).join(' -> '));return;}if(visited.has(file))return;active.push(file);for(const next of graph.get(file)??[])visit(next);active.pop();visited.add(file);};
 for(const file of graph.keys())visit(file);assert.deepEqual(cycles,[]);
});
