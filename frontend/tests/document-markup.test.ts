// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { extractText, readAttachment } from '../src/attachments'
import { File as NodeFile } from 'node:buffer'

it('extracts readable uploaded markup while excluding executable and style content', async () => {
  for (const name of ['notes.html', 'notes.htm', 'notes.xml', 'notes.svg']) {
    const markup = '<div>First paragraph</div><script>secretExecutableText()</script><style>secretStyleText{color:red}</style><noscript>secretFallbackText</noscript><p>Second paragraph</p>'
    const text = await extractText(name, new TextEncoder().encode(markup))
    expect(text).toBe('First paragraph Second paragraph')
  }
})
it('rejects empty and unreadable uploads instead of silently teaching from missing text', async () => {
  for (const content of ['', '\u0000binary']) {
    const file = new NodeFile([content], 'notes.txt', {type: 'text/plain'})
    await expect(readAttachment(file as unknown as File)).rejects.toThrow()
  }
})
it('keeps escaped markup literal instead of reinterpreting it as an executable document', async () => {
  const text = await extractText('notes.html', new TextEncoder().encode('<p>&lt;script&gt;literal example&lt;/script&gt;</p>'))
  expect(text).toBe('<script>literal example</script>')
})
