const R=[];const ver=async p=>(await import(`./node_modules/${p}/package.json`,{with:{type:'json'}})).default.version;
async function T(id,pkg,fn){let v='?';try{v=await ver(pkg)}catch{}
 try{R.push({id,pkg,v,pass:true,d:await fn()})}catch(e){R.push({id,pkg,v,pass:false,d:String(e.message||e).split('\n')[0].slice(0,130)})}}
async function dom(){const {JSDOM}=await import('jsdom');const j=new JSDOM('<!doctype html><div id=r></div>',{pretendToBeVisual:true});
 for(const k of ['window','document','navigator','HTMLElement','Element','Node','Range','Text','DocumentFragment','MutationObserver','getComputedStyle','DOMParser','XMLSerializer','KeyboardEvent','InputEvent','Event','CustomEvent'])
   if(globalThis[k]===undefined) globalThis[k]=k==='window'?j.window:j.window[k];return j}

await T(227,'retext',async()=>{const {retext}=await import('retext');
  const f=await retext().process('The quick brown fox.');
  const s=String(f); if(!s.includes('fox'))throw new Error(s);
  return 'parse+stringify round-trip through retext-latin -> '+JSON.stringify(s)});

await T(263,'typescript',async()=>{const api=await import('typescript/unstable/sync');
  const {version}=await import('typescript');
  const fns=Object.keys(api).filter(k=>typeof api[k]==='function');
  const {execFileSync}=await import('node:child_process');
  const {writeFileSync,mkdirSync,readFileSync}=await import('node:fs');
  mkdirSync('ts-src',{recursive:true});
  writeFileSync('ts-src/a.ts','export const f=(x:number):string=>`${x}`;\n');
  execFileSync('./node_modules/.bin/tsc',['ts-src/a.ts','--target','es2020','--outDir','ts-out'],{stdio:'pipe'});
  const out=readFileSync('ts-out/a.js','utf8');
  if(out.includes(': number'))throw new Error('types not stripped');
  return `tsc ${version.version} (Go port) compiled TS->JS via CLI -> ${JSON.stringify(out.trim())}; `+
         `note: default export now only exposes {version,versionMajorMinor}, programmatic API moved to typescript/unstable/* (sync API exposes ${fns.length} fns)`});

await T(218,'rdflib',async()=>{const $rdf=await import('rdflib');
  const s=$rdf.graph();
  $rdf.parse('@prefix e: <http://a/> . e:s e:p "v" .',s,'http://a/','text/turtle');
  if(s.statements.length!==1)throw new Error('stmts '+s.statements.length);
  const ser=$rdf.serialize(null,s,'http://a/','text/turtle');
  return 'parsed Turtle -> object='+s.statements[0].object.value+', re-serialised ('+ser.trim().length+' chars). '+
         'NOTE: this build rejects mediaType "application/n-triples" ("Don\'t know how to parse ... yet"); use "text/turtle" or "application/n-quads"'});

await T(240,'@tiptap/core',async()=>{await dom();const {Editor}=await import('@tiptap/core');
  const Doc=(await import('@tiptap/extension-document')).default||(await import('@tiptap/extension-document')).Document;
  const Para=(await import('@tiptap/extension-paragraph')).default||(await import('@tiptap/extension-paragraph')).Paragraph;
  const Txt=(await import('@tiptap/extension-text')).default||(await import('@tiptap/extension-text')).Text;
  const e=new Editor({extensions:[Doc,Para,Txt],content:'<p>tt</p>'});
  const t=e.getText(); if(t!=='tt')throw new Error(JSON.stringify(t));
  return 'editor constructed in jsdom, getText -> '+JSON.stringify(t)});

for(const r of R) console.log(`${r.pass?'PASS':'FAIL'} id=${r.id} ${r.pkg}@${r.v} :: ${r.d}`);
console.log(`\nRETRY: ${R.filter(r=>r.pass).length}/${R.length} passed`);
