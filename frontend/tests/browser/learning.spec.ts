import { test, expect } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'
function pdf(text: string) {
 const stream=`BT /F1 12 Tf 40 180 Td (${text}) Tj ET`
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]
 let content='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(content));content+=`${i+1} 0 obj\n${o}\nendobj\n`});const start=Buffer.byteLength(content);content+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(content)
}
test('learner memory survives reload and files feed the same canvas request',async({page})=>{
 await page.route('**/api/health',r=>r.fulfill({json:{modelConfigured:true}}))
 const requests:any[]=[]
 await page.route('**/api/lesson',async r=>{requests.push(r.request().postDataJSON());await r.fulfill({json:{lesson:{explanation:'Let us work from your notes.',learner:'Prefers visual examples; studying energy.',blocks:[]}}})})
 await page.goto('/');await page.getByLabel('Your question').fill('I prefer visual examples.');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>requests.length).toBe(1)
 await page.reload();await page.getByRole('button',{name:'Saved lessons',exact:true}).click();await page.getByText('Learning memory',{exact:true}).click();await expect(page.getByLabel('Learning memory',{exact:true})).toHaveValue('Prefers visual examples; studying energy.')
 await page.getByRole('button',{name:'+ New topic'}).click()
 const epub=zipSync({'META-INF/container.xml':strToU8('<container><rootfile full-path="book.opf"/></container>'),'book.opf':strToU8('<package><manifest><item id="one" href="one.xhtml"/></manifest><spine><itemref idref="one"/></spine></package>'),'one.xhtml':strToU8('<html><body>Energy EPUB evidence</body></html>')})
 await page.getByLabel('Attach files or photos').setInputFiles([{name:'notes.custom',mimeType:'text/plain',buffer:Buffer.from('Energy text evidence')},{name:'book.epub',mimeType:'application/epub+zip',buffer:Buffer.from(epub)},{name:'notes.pdf',mimeType:'application/pdf',buffer:pdf('Energy PDF evidence')}])
 await expect(page.getByRole('button',{name:'Remove notes.pdf'})).toBeVisible()
 await page.getByLabel('Your question').fill('Explain energy from these files');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>requests.length).toBe(2)
 expect(requests[1].learner).toContain('Prefers visual examples');expect(requests[1].attachments.map((a:any)=>a.text).join(' ')).toContain('Energy PDF evidence');expect(requests[1].attachments.map((a:any)=>a.text).join(' ')).toContain('Energy EPUB evidence')
 await page.getByRole('button',{name:'Remove notes.pdf'}).click();await page.getByRole('button',{name:'Remove book.epub'}).click();await page.getByRole('button',{name:'Remove notes.custom'}).click()
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;c.getContext('2d')!.fillRect(0,0,100,100);return c.toDataURL('image/png').split(',')[1]})
 await page.getByLabel('Attach files or photos').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});await expect(page.getByRole('button',{name:'Remove photo.png'})).toBeVisible();await page.getByLabel('Your question').fill('Describe this photo');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>requests.length).toBe(3);expect(requests[2].attachments[0].image).toMatch(/^data:image\/jpeg;base64,/)
 await page.getByRole('button',{name:'Saved lessons',exact:true}).click();await page.getByLabel('Use and update memory').uncheck();await page.getByLabel('Your question').fill('Start fresh');await page.getByRole('button',{name:'Send',exact:true}).click();await expect.poll(()=>requests.length).toBe(4);expect(requests[3].learner).toBe('');expect(requests[3].recall).toBe('');expect(requests[3].remember).toBe(false)
 const downloadPromise = page.waitForEvent('download');await page.getByRole('button',{name:'Export learning'}).click();const download = await downloadPromise;const path = await download.path();expect(path).toBeTruthy()
 await page.getByRole('button',{name:'Erase all learning'}).click();await expect(page.getByLabel('Learning memory',{exact:true})).toHaveValue('')
 await page.getByLabel('Restore learning').setInputFiles(path!);await expect(page.getByLabel('Learning memory',{exact:true})).toHaveValue('Prefers visual examples; studying energy.')
 await page.reload();await page.getByRole('button',{name:'Saved lessons',exact:true}).click();await page.getByText('Learning memory',{exact:true}).click();await expect(page.getByLabel('Use and update memory')).not.toBeChecked()

})
