const R = [];
const ok  = (id,n,v,d)=>R.push({id,n,v,pass:true,d});
const bad = (id,n,v,e)=>R.push({id,n,v,pass:false,d:String(e).split('\n')[0]});
const ver = async p => (await import(`./node_modules/${p}/package.json`,{with:{type:'json'}})).default.version;

try{const p='markdown-it';const v=await ver(p);const M=(await import(p)).default;const h=new M().render('# hi');
  if(!h.includes('<h1>hi</h1>'))throw new Error('bad html '+h); ok(223,p,v,'render("# hi") -> '+h.trim());}catch(e){bad(223,'markdown-it','',e)}

try{const v=await ver('unified');const {unified}=await import('unified');
  const {default:rp}=await import('remark-parse');const {default:rr}=await import('remark-rehype');const {default:rs}=await import('rehype-stringify');
  const f=await unified().use(rp).use(rr).use(rs).process('**b**');
  if(!String(f).includes('<strong>b</strong>'))throw new Error(String(f)); ok(224,'unified',v,'md->html pipeline -> '+String(f).trim());}catch(e){bad(224,'unified','',e)}

try{const v=await ver('remark');const {remark}=await import('remark');const f=await remark().process('#  x');
  ok(225,'remark',v,'normalised markdown -> '+JSON.stringify(String(f).trim()));}catch(e){bad(225,'remark','',e)}

try{const v=await ver('rehype');const {rehype}=await import('rehype');const f=await rehype().process('<p>hi');
  if(!String(f).includes('<p>hi</p>'))throw new Error(String(f)); ok(226,'rehype',v,'repaired html -> contains <p>hi</p>');}catch(e){bad(226,'rehype','',e)}

try{const v=await ver('micromark');const {micromark}=await import('micromark');const h=micromark('*i*');
  if(!h.includes('<em>i</em>'))throw new Error(h); ok(228,'micromark',v,'tokenise+render -> '+h.trim());}catch(e){bad(228,'micromark','',e)}

try{const v=await ver('mdast-util-from-markdown');const {fromMarkdown}=await import('mdast-util-from-markdown');
  const t=fromMarkdown('# h');if(t.children[0].type!=='heading')throw new Error('no heading');
  ok('229*','mdast-util-from-markdown',v,'mdast root->heading depth '+t.children[0].depth);}catch(e){bad('229*','mdast-util-from-markdown','',e)}

try{const v=await ver('hast-util-to-html');const {toHtml}=await import('hast-util-to-html');
  const h=toHtml({type:'element',tagName:'b',properties:{},children:[{type:'text',value:'z'}]});
  if(h!=='<b>z</b>')throw new Error(h); ok('230*','hast-util-to-html',v,'hast->html -> '+h);}catch(e){bad('230*','hast-util-to-html','',e)}

try{const p='gray-matter';const v=await ver(p);const m=(await import(p)).default;
  const r=m('---\ntitle: T\n---\nbody');if(r.data.title!=='T')throw new Error(JSON.stringify(r.data));
  ok(231,p,v,'front-matter parsed -> title='+r.data.title);}catch(e){bad(231,'gray-matter','',e)}

try{const v=await ver('react-markdown');const React=(await import('react')).default;
  const {renderToStaticMarkup}=await import('react-dom/server');const Md=(await import('react-markdown')).default;
  const h=renderToStaticMarkup(React.createElement(Md,null,'# rm'));
  if(!h.includes('<h1>rm</h1>'))throw new Error(h); ok(234,'react-markdown',v,'SSR -> '+h);}catch(e){bad(234,'react-markdown','',e)}

try{const p='marked';const v=await ver(p);const {marked}=await import(p);const h=await marked.parse('# m');
  if(!h.includes('<h1>m</h1>'))throw new Error(h); ok(235,p,v,'parse -> '+h.trim());}catch(e){bad(235,'marked','',e)}

try{const p='dompurify';const v=await ver(p);const {JSDOM}=await import('jsdom');const DP=(await import(p)).default;
  const w=new JSDOM('').window;const pure=DP(w);
  const dirty='<img src=x onerror=alert(1)><script>alert(2)</script><b>keep</b>';const c=pure.sanitize(dirty);
  if(c.includes('onerror')||c.includes('script'))throw new Error('XSS survived: '+c);
  if(!c.includes('<b>keep</b>'))throw new Error('stripped too much: '+c);
  ok(237,p,v,'XSS stripped, safe markup kept -> '+c);}catch(e){bad(237,'dompurify','',e)}

try{const p='shiki';const v=await ver(p);const {codeToHtml}=await import(p);
  const h=await codeToHtml('const a=1',{lang:'js',theme:'nord'});
  if(!h.includes('<pre'))throw new Error(h.slice(0,80)); ok(252,p,v,'highlighted js/nord, '+h.length+' bytes of html');}catch(e){bad(252,'shiki','',e)}

try{const p='prismjs';const v=await ver(p);const P=(await import(p)).default;
  const h=P.highlight('var a=1',P.languages.javascript,'javascript');
  if(!h.includes('token'))throw new Error(h); ok(254,p,v,'highlight -> '+h.slice(0,60));}catch(e){bad(254,'prismjs','',e)}

try{const p='acorn';const v=await ver(p);const A=await import(p);
  const t=A.parse('let x = 1 + 2',{ecmaVersion:2023});
  if(t.type!=='Program')throw new Error(t.type); ok(257,p,v,'ESTree Program, '+t.body.length+' stmt');}catch(e){bad(257,'acorn','',e)}

try{const p='esbuild';const v=await ver(p);const eb=await import(p);
  const r=await eb.transform('const f=(x:number):number=>x*2',{loader:'ts',minify:true});
  if(!r.code.includes('=>'))throw new Error(r.code); ok(260,p,v,'ts->js minified -> '+r.code.trim());}catch(e){bad(260,'esbuild','',e)}

try{const p='rollup';const v=await ver(p);const {rollup}=await import(p);
  const b=await rollup({input:'v',plugins:[{name:'m',resolveId:i=>i,load:()=>'export const n=41+1;console.log(n)'}],onwarn(){}});
  const {output}=await b.generate({format:'esm'});await b.close();
  if(!output[0].code.includes('41'))throw new Error(output[0].code); ok(261,p,v,'bundled esm, '+output[0].code.trim().length+' bytes');}catch(e){bad(261,'rollup','',e)}

try{const p='@codemirror/state';const v=await ver(p);const {EditorState}=await import(p);
  const s=EditorState.create({doc:'a\nb'});if(s.doc.lines!==2)throw new Error('lines '+s.doc.lines);
  const t=s.update({changes:{from:0,insert:'X'}});
  if(t.state.doc.toString()!=='Xa\nb')throw new Error(t.state.doc.toString());
  ok(250,p,v,'doc 2 lines, transaction applied -> '+JSON.stringify(t.state.doc.toString()));}catch(e){bad(250,'@codemirror/state','',e)}

try{const p='@lezer/common';const v=await ver(p);const L=await import(p);
  if(typeof L.NodeType?.define!=='function')throw new Error('no NodeType.define');
  const nt=L.NodeType.define({id:0,name:'Doc',top:true});
  ok(256,p,v,'NodeType.define -> '+nt.name);}catch(e){bad(256,'@lezer/common','',e)}

try{const p='pdf-lib';const v=await ver(p);const {PDFDocument,StandardFonts}=await import(p);
  const d=await PDFDocument.create();const f=await d.embedFont(StandardFonts.Helvetica);
  const pg=d.addPage([200,100]);pg.drawText('PDFLIB OK',{x:10,y:40,size:14,font:f});
  const b=await d.save();if(b[0]!==0x25||b[1]!==0x50)throw new Error('not a PDF header');
  const {writeFileSync}=await import('node:fs');writeFileSync('pdflib-out.pdf',b);
  ok(267,p,v,'wrote valid PDF, '+b.length+' bytes');}catch(e){bad(267,'pdf-lib','',e)}

try{const p='sharp';const v=await ver(p);const sh=(await import(p)).default;
  const png=await sh({create:{width:120,height:80,channels:3,background:{r:200,g:10,b:10}}}).png().toBuffer();
  const out=await sh(png).resize(30,20).jpeg().toBuffer();const md=await sh(out).metadata();
  if(md.width!==30||md.height!==20||md.format!=='jpeg')throw new Error(JSON.stringify(md));
  ok(277,p,v,'create->resize->jpeg -> '+md.width+'x'+md.height+' '+md.format);}catch(e){bad(277,'sharp','',e)}

const P=R.filter(r=>r.pass).length;
for(const r of R) console.log(`${r.pass?'PASS':'FAIL'} id=${r.id} ${r.n}@${r.v} :: ${r.d}`);
console.log(`\nJS SMOKE: ${P}/${R.length} passed`);
