import type { LogicFlow } from "@/api/workflow/types/workflow"

type GraphNode = {
  id?: string
  type?: string
  text?: string | { value?: string }
  properties?: Record<string, any>
}

type GraphEdge = {
  id?: string
  sourceNodeId?: string
  targetNodeId?: string
  properties?: Record<string, any>
}

const SUPPORTED_NODE_TYPES = new Set([
  "start",
  "end",
  "user",
  "condition",
  "parallel",
  "inclusion",
  "selective",
  "automation",
  "chat"
])

const DYNAMIC_ASSIGNEE_RULES = new Set(["founder", "leaders", "main_leader"])

export function validateWorkflowGraph(flowData?: LogicFlow): string[] {
  const nodes = Array.isArray(flowData?.nodes) ? (flowData.nodes as GraphNode[]) : []
  const edges = Array.isArray(flowData?.edges) ? (flowData.edges as GraphEdge[]) : []
  const problems: string[] = []

  if (nodes.length === 0) return ["流程至少需要一个开始节点和一个结束节点"]

  const nodeById = new Map<string, GraphNode>()
  const starts: string[] = []
  const ends: string[] = []

  for (const node of nodes) {
    const id = node.id?.trim()
    if (!id) {
      problems.push("存在 ID 为空的节点")
      continue
    }
    if (nodeById.has(id)) {
      problems.push(`节点 ID 重复：${id}`)
      continue
    }
    nodeById.set(id, node)
    if (!node.type || !SUPPORTED_NODE_TYPES.has(node.type)) problems.push(`${nodeLabel(node)} 的节点类型不受支持`)
    if (node.type === "start") starts.push(id)
    if (node.type === "end") ends.push(id)
  }

  if (starts.length !== 1) problems.push(`流程必须且只能有一个开始节点，当前为 ${starts.length} 个`)
  if (ends.length !== 1) problems.push(`流程必须且只能有一个结束节点，当前为 ${ends.length} 个`)

  const adjacency = new Map<string, string[]>()
  const reverse = new Map<string, string[]>()
  const outgoingEdges = new Map<string, GraphEdge[]>()
  const edgeIds = new Set<string>()
  const edgePairs = new Set<string>()

  for (const edge of edges) {
    const edgeId = edge.id?.trim()
    if (!edgeId) problems.push("存在 ID 为空的连线")
    else if (edgeIds.has(edgeId)) problems.push(`连线 ID 重复：${edgeId}`)
    else edgeIds.add(edgeId)

    const sourceId = edge.sourceNodeId?.trim() || ""
    const targetId = edge.targetNodeId?.trim() || ""
    const source = nodeById.get(sourceId)
    const target = nodeById.get(targetId)
    if (!source || !target) {
      problems.push(`连线 ${edgeId || "(无 ID)"} 引用了不存在的节点`)
      continue
    }
    if (sourceId === targetId) {
      problems.push(`${nodeLabel(source)} 不能连接自身`)
      continue
    }
    if (source.type === "end") problems.push(`结束节点 ${nodeLabel(source)} 不能连接下级节点`)
    if (target.type === "start") problems.push(`开始节点 ${nodeLabel(target)} 不能连接上级节点`)

    const pair = `${sourceId}\u0000${targetId}`
    if (edgePairs.has(pair)) {
      problems.push(`${nodeLabel(source)} 到 ${nodeLabel(target)} 存在重复连线`)
      continue
    }
    edgePairs.add(pair)
    pushMap(adjacency, sourceId, targetId)
    pushMap(reverse, targetId, sourceId)
    pushMap(outgoingEdges, sourceId, edge)
  }

  for (const [id, node] of nodeById) {
    if (node.type !== "start" && !reverse.get(id)?.length) problems.push(`${nodeLabel(node)} 没有上级连线`)
    if (node.type !== "end" && !adjacency.get(id)?.length) problems.push(`${nodeLabel(node)} 没有下级连线`)
  }

  if (starts.length === 1) {
    const reachable = walkGraph(starts[0], adjacency)
    for (const [id, node] of nodeById) {
      if (!reachable.has(id)) problems.push(`${nodeLabel(node)} 无法从开始节点到达`)
    }
  }
  if (ends.length === 1) {
    const canReachEnd = walkGraph(ends[0], reverse)
    for (const [id, node] of nodeById) {
      if (!canReachEnd.has(id)) problems.push(`${nodeLabel(node)} 无法到达结束节点`)
    }
  }
  if (hasCycle(nodeById.keys(), adjacency)) problems.push("流程中存在循环连线")

  for (const [id, node] of nodeById) {
    if (node.type === "condition") validateConditionNode(node, outgoingEdges.get(id) || [], problems)
    if (node.type === "selective") {
      for (const targetId of adjacency.get(id) || []) {
        const target = nodeById.get(targetId)
        if (target?.type !== "condition") problems.push(`${nodeLabel(node)} 只能连接条件节点`)
      }
    }
    if (node.type === "user" && !hasUsableAssignee(node.properties || {})) {
      problems.push(`人工节点 ${nodeLabel(node)} 未配置审批人策略`)
    }
    if (node.type === "automation") validateAutomationNode(node, problems)
  }

  return [...new Set(problems)]
}

export function validateConditionExpression(expression: string): string | undefined {
  if (!expression.trim()) return "表达式不能为空"
  if (expression.length > 4096) return "表达式长度不能超过 4096"
  const parser = new ExpressionParser(expression)
  try {
    parser.parse()
  } catch (error) {
    return error instanceof Error ? error.message : "表达式语法无效"
  }
}

function validateConditionNode(node: GraphNode, edges: GraphEdge[], problems: string[]) {
  let defaultBranches = 0
  for (const edge of edges) {
    const expression = String(edge.properties?.expression || "").trim()
    if (!expression) {
      defaultBranches++
      continue
    }
    const error = validateConditionExpression(expression)
    if (error) problems.push(`${nodeLabel(node)} 的连线 ${edge.id || "(无 ID)"} 表达式无效：${error}`)
  }
  if (defaultBranches > 1) problems.push(`${nodeLabel(node)} 最多只能配置一条无条件分支`)
}

function hasUsableAssignee(properties: Record<string, any>): boolean {
  const assignees = Array.isArray(properties.assignees) ? properties.assignees : []
  if (assignees.length > 0) {
    return assignees.some((item: any) => {
      if (DYNAMIC_ASSIGNEE_RULES.has(item?.rule)) return true
      return Array.isArray(item?.values) && item.values.some((value: unknown) => String(value || "").trim())
    })
  }
  const rule = properties.rule || properties.type
  if (DYNAMIC_ASSIGNEE_RULES.has(rule)) return true
  if (rule === "template") return Boolean(String(properties.template_field || "").trim())
  return Array.isArray(properties.approved) && properties.approved.some((value: unknown) => String(value || "").trim())
}

function validateAutomationNode(node: GraphNode, problems: string[]) {
  const properties = node.properties || {}
  if (!String(properties.codebook_uid || "").trim()) problems.push(`${nodeLabel(node)} 未配置代码模板`)
  if (!String(properties.tag || "").trim()) problems.push(`${nodeLabel(node)} 未配置执行标签`)
  if (!properties.is_timing) return

  if (properties.exec_method === "hand") {
    const unit = Number(properties.unit)
    const quantity = Number(properties.quantity)
    if (![1, 2, 3].includes(unit) || !Number.isFinite(quantity) || quantity <= 0) {
      problems.push(`${nodeLabel(node)} 的定时参数无效`)
    }
  } else if (properties.exec_method === "template") {
    if (Number(properties.template_id) <= 0 || !String(properties.template_field || "").trim()) {
      problems.push(`${nodeLabel(node)} 的定时模板配置无效`)
    }
  } else {
    problems.push(`${nodeLabel(node)} 未配置定时方式`)
  }
}

function nodeLabel(node: GraphNode): string {
  const text = typeof node.text === "string" ? node.text : node.text?.value
  return String(node.properties?.name || text || node.id || "(无 ID 节点)")
}

function pushMap<T>(map: Map<string, T[]>, key: string, value: T) {
  const values = map.get(key) || []
  values.push(value)
  map.set(key, values)
}

function walkGraph(start: string, graph: Map<string, string[]>): Set<string> {
  const visited = new Set([start])
  const queue = [start]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const next of graph.get(current) || []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }
  return visited
}

function hasCycle(nodeIds: IterableIterator<string>, graph: Map<string, string[]>): boolean {
  const state = new Map<string, number>()
  const visit = (id: string): boolean => {
    state.set(id, 1)
    for (const next of graph.get(id) || []) {
      if (state.get(next) === 1 || (!state.has(next) && visit(next))) return true
    }
    state.set(id, 2)
    return false
  }
  for (const id of nodeIds) {
    if (!state.has(id) && visit(id)) return true
  }
  return false
}

class ExpressionParser {
  private position = 0

  constructor(private readonly input: string) {}

  parse() {
    this.parseOr()
    this.skipSpaces()
    if (!this.eof()) this.fail("存在不支持的语法")
  }

  private parseOr() {
    this.parseAnd()
    for (;;) {
      this.skipSpaces()
      if (!this.consume("||")) return
      this.parseAnd()
    }
  }

  private parseAnd() {
    this.parsePrimary()
    for (;;) {
      this.skipSpaces()
      if (!this.consume("&&")) return
      this.parsePrimary()
    }
  }

  private parsePrimary() {
    this.skipSpaces()
    if (this.consume("(")) {
      this.parseOr()
      this.skipSpaces()
      if (!this.consume(")")) this.fail("缺少右括号")
      return
    }
    this.parseComparison()
  }

  private parseComparison() {
    this.skipSpaces()
    if (!this.consume("$") || !this.consumeIdentifier()) this.fail("必须使用 $变量名")
    this.skipSpaces()
    if (this.consumeWord("not")) {
      this.skipSpaces()
      if (!this.consumeWord("in")) this.fail("缺少 in")
      this.parseStringList()
      return
    }
    if (this.consumeWord("in")) {
      this.parseStringList()
      return
    }
    if (!(this.consume("!=") || this.consume("=") || this.consume(">") || this.consume("<"))) {
      this.fail("使用了不支持的比较符")
    }
    this.parseQuotedString()
  }

  private parseStringList() {
    this.skipSpaces()
    if (!this.consume("(")) this.fail("in 条件必须使用值列表")
    this.parseQuotedString()
    for (;;) {
      this.skipSpaces()
      if (!this.consume(",")) break
      this.parseQuotedString()
    }
    this.skipSpaces()
    if (!this.consume(")")) this.fail("值列表缺少右括号")
  }

  private parseQuotedString() {
    this.skipSpaces()
    if (!this.consume("'")) this.fail("比较值必须使用单引号")
    while (!this.eof()) {
      const character = this.input[this.position]
      if (character === "'") {
        this.position++
        return
      }
      if (character === "\\" || character === "\r" || character === "\n" || character === "\0") {
        this.fail("比较值包含不安全字符")
      }
      this.position++
    }
    this.fail("比较值缺少结束单引号")
  }

  private consumeIdentifier(): boolean {
    const start = this.position
    while (!this.eof() && /[a-zA-Z0-9_]/.test(this.input[this.position])) this.position++
    return this.position > start
  }

  private consumeWord(word: string): boolean {
    this.skipSpaces()
    const candidate = this.input.slice(this.position, this.position + word.length)
    if (candidate.toLowerCase() !== word) return false
    const next = this.input[this.position + word.length]
    if (next && /[a-zA-Z0-9_]/.test(next)) return false
    this.position += word.length
    return true
  }

  private consume(token: string): boolean {
    if (!this.input.startsWith(token, this.position)) return false
    this.position += token.length
    return true
  }

  private skipSpaces() {
    while (!this.eof() && /\s/.test(this.input[this.position])) this.position++
  }

  private eof(): boolean {
    return this.position >= this.input.length
  }

  private fail(message: string): never {
    throw new Error(`位置 ${this.position + 1} ${message}`)
  }
}
