import { calculate } from './calculator'

export type SearchResult = { title: string; url: string; snippet: string }

export async function searchWeb(query: string, send: typeof fetch = fetch): Promise<SearchResult[]> {
  const endpoint = process.env.SEARCH_API_URL
  if (!endpoint) throw new Error('SEARCH_NOT_CONFIGURED')
  const url = new URL(endpoint)
  url.searchParams.set('q', query)
  const response = await send(url, { headers: { Accept: 'application/json', ...(process.env.SEARCH_API_KEY ? { Authorization: `Bearer ${process.env.SEARCH_API_KEY}` } : {}) }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`SEARCH_HTTP_${response.status}`)
  const data = await response.json() as { results?: SearchResult[] }
  return (data.results ?? []).filter(item => item && typeof item.title === 'string' && typeof item.url === 'string' && typeof item.snippet === 'string').slice(0, 8)
}

export function runTool(name: string, input: unknown) {
  if (name === 'calculator' && typeof input === 'string') return { result: calculate(input) }
  throw new Error('TOOL_NOT_AVAILABLE')
}
