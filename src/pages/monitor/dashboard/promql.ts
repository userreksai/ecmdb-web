export interface PromqlLabelMatcher {
  label: string
  operator: "=" | "=~"
  value: string
}

const LABEL_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

const splitMatchers = (selector: string) => {
  const matchers: string[] = []
  let current = ""
  let escaped = false
  let quoted = false

  for (const character of selector) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === "\\" && quoted) {
      current += character
      escaped = true
      continue
    }
    if (character === '"') quoted = !quoted
    if (character === "," && !quoted) {
      if (current.trim()) matchers.push(current.trim())
      current = ""
      continue
    }
    current += character
  }

  if (current.trim()) matchers.push(current.trim())
  return matchers
}

const matcherLabel = (matcher: string) => matcher.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=~|!~|!=|=)/)?.[1]

const escapePromqlString = (value: string) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

export const escapePromqlRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export const valuesToPromqlRegex = (values: string[]) => values.map(escapePromqlRegex).join("|")

/**
 * Upserts dashboard variable matchers into every explicit PromQL selector.
 * Existing matchers with the same label are replaced, so a panel's default
 * job selector cannot conflict with the currently selected dashboard job.
 */
export const applyPromqlMatchers = (promql: string, matchers: PromqlLabelMatcher[]) => {
  const validMatchers = matchers.filter((matcher) => LABEL_NAME_PATTERN.test(matcher.label) && matcher.value)
  if (!validMatchers.length) return promql

  return promql.replace(/\{([^{}]*)\}/g, (_, selector: string) => {
    const existing = splitMatchers(selector)
    const replacedLabels = new Set(validMatchers.map((matcher) => matcher.label))
    const preserved = existing.filter((matcher) => {
      const label = matcherLabel(matcher)
      return !label || !replacedLabels.has(label)
    })
    const injected = validMatchers.map(
      (matcher) => `${matcher.label}${matcher.operator}"${escapePromqlString(matcher.value)}"`
    )
    return `{${[...preserved, ...injected].join(",")}}`
  })
}
