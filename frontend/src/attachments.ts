import { tokens } from './learner'
import DOMPurify from 'dompurify'
export type Attachment = { name: string; text?: string; image?: string }
const MAX_FILE = 20 * 1024 * 1024
export function passages(text: string, question: string, budget = 6000) {
 if (!Number.isFinite(budget) || budget <= 0) return ''
 budget = Math.floor(budget)
 const terms = tokens(question)
 const hits = [...text.matchAll(/[\p{L}\p{N}]{2,}/gu)].filter(match => terms.has(match[0].toLocaleLowerCase()))
 if (!hits.length) return text.slice(0, budget)
 const frequency = new Map<string, number>()
 hits.forEach(hit => { const word = hit[0].toLocaleLowerCase(); frequency.set(word, (frequency.get(word) ?? 0) + 1) })
 const width = Math.min(1000, budget)
 // Center windows on evidence before applying the size limit. Prioritize rare
 // query terms and cap work on repetitive books; never clip a leading chunk
 // and assume the evidence survived.
 const candidates = hits.sort((a,b) => frequency.get(a[0].toLocaleLowerCase())! - frequency.get(b[0].toLocaleLowerCase())!)
   .slice(0, 200).map(hit => {
     const start = Math.max(0, hit.index! - Math.floor(width / 3))
     const end = Math.min(text.length, start + width)
     const excerpt = text.slice(start, end)
     const score = [...tokens(excerpt)].reduce((sum, word) => sum + (terms.has(word) ? 1 / (frequency.get(word) ?? 1) : 0), 0)
     return { start, end, excerpt, score }
   }).sort((a,b) => b.score - a.score || a.start - b.start)
 const selected: typeof candidates = []
 let used = 0
 for (const candidate of candidates) {
   if (selected.some(other => candidate.start < other.end && candidate.end > other.start)) continue
   const cost = candidate.excerpt.length + (selected.length ? 1 : 0)
   if (used + cost > budget) continue
   selected.push(candidate); used += cost
 }
 return selected.sort((a,b) => a.start - b.start).map(c => c.excerpt).join('\n')
}
function plain(markup:string, mime:DOMParserSupportedType='text/html') {
 const doc=new DOMParser().parseFromString(DOMPurify.sanitize(markup, { FORBID_TAGS: ['style', 'noscript'] }),mime)
 doc.querySelectorAll('p,div,h1,h2,h3,h4,li,tr,br,text').forEach(e=>e.appendChild(doc.createTextNode(' ')))
 return (doc.body?.textContent??doc.documentElement.textContent??'').replace(/\s+/g,' ').trim()
}
export async function extractText(name:string, bytes:Uint8Array):Promise<string> {
 if(bytes.length>MAX_FILE) throw new Error('File exceeds the 20 MB local processing limit.')
 const lower=name.toLowerCase()
 if(lower.endsWith('.pdf')) {
  const pdf=await import('pdfjs-dist')
  pdf.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const task=pdf.getDocument({data:bytes})
  try {const doc=await task.promise;if(doc.numPages>500)throw new Error('PDF exceeds 500 pages. Attach the chapter you want to study.');const pages:string[]=[];for(let i=1;i<=Math.min(doc.numPages,500);i++){const page=await doc.getPage(i);const content=await page.getTextContent();pages.push(content.items.map(item=>'str' in item?item.str:'').join(' '));if(pages.join('\n').length>500000)break}return pages.join('\n\n')}finally{await task.destroy()}
 }
 if(lower.endsWith('.epub')) {
  const {unzipSync,strFromU8}=await import('fflate')
  let total=0
  const files=unzipSync(bytes,{filter:file=>{total+=file.originalSize;if(total>40*1024*1024)throw new Error('Expanded EPUB exceeds 40 MB.');return /\.(xml|opf|xhtml|html)$/i.test(file.name)}})
  const get=(path:string)=>{if(!files[path])throw new Error('Incomplete EPUB package.');return strFromU8(files[path])}
  const xml=(s:string)=>new DOMParser().parseFromString(s,'application/xml')
  const path=xml(get('META-INF/container.xml')).querySelector('rootfile')?.getAttribute('full-path');if(!path)throw new Error('Invalid EPUB container.')
  const doc=xml(get(path)),base=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):''
  return [...doc.querySelectorAll('spine itemref')].map(ref=>{const id=ref.getAttribute('idref');const item=[...doc.querySelectorAll('manifest item')].find(e=>e.getAttribute('id')===id);const href=item?.getAttribute('href');if(!href)throw new Error('Invalid EPUB reading order.');const target=new URL(href,'https://epub.local/'+base).pathname.slice(1);return plain(get(decodeURIComponent(target)))}).join('\n\n').slice(0,500000)
 }
 const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
 if(/[\x00-\x08\x0e-\x1f]/.test(text))throw new Error('This binary format cannot be read. Export it as PDF, EPUB or text.')
 return (/\.(html?|xml|svg)$/i.test(lower)?plain(text):text).slice(0,500000)
}
export async function readAttachment(file:File):Promise<Attachment> {
 if(file.size>MAX_FILE)throw new Error('File exceeds the 20 MB local processing limit.')
 if(file.type.startsWith('image/')) {
  const bitmap=await createImageBitmap(file)
  try{const scale=Math.min(1,1024/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',0.8);if(image.length>500000)throw new Error('Image is too detailed; use a smaller crop.');return{name:file.name.slice(0,200),image}}finally{bitmap.close()}
 }
 const text=await extractText(file.name,new Uint8Array(await file.arrayBuffer()))
 if(!text.trim())throw new Error('No readable text found. Scanned PDFs need OCR; attach the page as a photo instead.')
 return {name:file.name.slice(0,200),text}
}
