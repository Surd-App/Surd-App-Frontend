import katex from 'katex'
const renderLatex = (text: string): string => {
  if (!text) return ''
  let result = text
  
  result = result.replace(/\$\$([\s\S]+?)\$\$/g, (_, formula) => {
    try {
      return katex.renderToString(formula, { displayMode: true, throwOnError: false })
    } catch {
      return `$$${formula}$$`
    }
  })
  
  result = result.replace(/\\\[([\s\S]+?)\\\]/g, (_, formula) => {
    try {
      return katex.renderToString(formula, { displayMode: true, throwOnError: false })
    } catch {
      return `\\[${formula}\\]`
    }
  })
  
  result = result.replace(/\$([^\$]+?)\$/g, (_, formula) => {
    try {
      return katex.renderToString(formula, { displayMode: false, throwOnError: false })
    } catch {
      return `$${formula}$`
    }
  })
  
  result = result.replace(/\\\(([\s\S]+?)\\\)/g, (_, formula) => {
    try {
      return katex.renderToString(formula, { displayMode: false, throwOnError: false })
    } catch {
      return `\\(${formula}\\)`
    }
  })
  
  return result
}


const cache = new Map<string, string>()
let size = 0
export function cachedQuestionContent(text: string): string {
  const hit = cache.get(text)
  if (hit !== undefined) return hit
  const html = renderLatex(text)
  if (html.length > 2000000) return html
  while (cache.size && size + html.length > 24000000) {
    const key = cache.keys().next().value!
    size -= cache.get(key)!.length
    cache.delete(key)
  }
  cache.set(text, html)
  size += html.length
  return html
}
