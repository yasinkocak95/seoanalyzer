import fs from 'node:fs';
import ts from 'typescript';
const roots=['apps/web/src','apps/worker/src','packages/shared/src','packages/rules/src','packages/db/src'];
let errors=[];
for(const root of roots) for(const relative of fs.readdirSync(root,{recursive:true})){
 const path=root+'/'+relative;if(!/\.tsx?$/.test(path)||path.includes('/components/homepage/'))continue;
 const text=fs.readFileSync(path,'utf8'),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,path.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 for(const d of ast.parseDiagnostics)errors.push(path+': '+ts.flattenDiagnosticMessageText(d.messageText,' '));
 if(path.includes('apps/web/src')&&!path.includes('.test.')){
  function check(node){
   if((ts.isStringLiteral(node)||ts.isJsxText(node))&&/[çğıöşüÇĞİÖŞÜ]/.test(node.text))errors.push(path+': uncentralized UI text: '+node.text);
   ts.forEachChild(node,check);
  }check(ast);
 }
 if(text.includes("'use client';")&&!text.trimStart().startsWith("'use client';"))errors.push(path+': misplaced client directive');
}
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
console.log('Source syntax, client directives and centralized UI text checks passed.');
