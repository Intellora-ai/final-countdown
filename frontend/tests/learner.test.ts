// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { retrieve, mergeMemory } from '../src/learner'
import { extractText, passages } from '../src/attachments'
import { strToU8, zipSync } from 'fflate'
it('retrieves older learning without unrelated answers', () => {
 const entries = Array.from({length:300},(_,i)=>({id:String(i),question:i===0?'photosynthesis chlorophyll':`Topic ${i}`,lesson:{explanation:i===0?'I confuse chlorophyll with chloroplasts.':'Unrelated',blocks:[]}}))
 expect(retrieve(entries,'chlorophyll',new Set())).toContain('chloroplasts');expect(retrieve(entries,'chlorophyll',new Set())).not.toContain('Unrelated');expect(retrieve(entries,'zzzz',new Set())).toBe('')
})
it('replaces compact memory instead of growing another transcript',()=>{expect(mergeMemory('old','new')).toBe('new');expect(mergeMemory('keep',undefined)).toBe('keep');expect(mergeMemory('keep','')).toBe('')})
it('selects relevant passages for diverse vocabulary within budget',()=>{for(const topic of ['mitochondria','renaissance','recursion','गणित']){const text=Array.from({length:40},(_,i)=>i===30?`${topic}: relevant evidence`:'Unrelated '.repeat(100)).join('\n\n');const result=passages(text,topic,500);expect(result).toContain('relevant evidence');expect(result.length).toBeLessThanOrEqual(500)}})
it('reads EPUB spine order without executable markup',async()=>{const archive=zipSync({'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book/package.opf"/></rootfiles></container>'),'book/package.opf':strToU8('<package><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>'),'book/a.xhtml':strToU8('<html><body>Second<script>bad()</script></body></html>'),'book/b.xhtml':strToU8('<html><body>First</body></html>')});const result=await extractText('book.epub',archive);expect(result.indexOf('First')).toBeLessThan(result.indexOf('Second'));expect(result).not.toContain('bad')})
it('rejects binary files instead of inventing contents',async()=>{await expect(extractText('unknown.bin',new Uint8Array([0,255,1]))).rejects.toThrow()})
it('accepts UTF-8 text regardless of extension',async()=>{expect(await extractText('notes.custom',strToU8('你好 — learner notes'))).toContain('你好')})
it('separates paragraph text while removing scripts from HTML documents',async()=>{expect(await extractText('notes.html',strToU8('<p>First</p><p>Second</p><script>ignore this</script>'))).toBe('First Second')})
it('does not confuse common archive vocabulary with relevant learning',()=>{
 const entries=Array.from({length:100},(_,i)=>({id:String(i),question:i===73?'Explain chlorophyll':'Explain unrelated topic',lesson:{explanation:i===73?'Relevant learning':'Unrelated answer',blocks:[]}}))
 expect(retrieve(entries,'Explain chlorophyll',new Set())).toContain('Relevant learning');expect(retrieve(entries,'Explain chlorophyll',new Set())).not.toContain('Unrelated answer');expect(retrieve(entries,'Explain',new Set())).toBe('')
})
