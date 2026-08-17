export interface MonitorDatasource {
  id: string
  name: string
  url: string
  enabled: boolean
  description: string
}

export interface QueryRangeParams {
  query: string
  start: number
  end: number
  step: number
}

export interface MetricPoint {
  timestamp: number
  value: number
}

export interface Metric {
  labels: Record<string, string>
  points: MetricPoint[]
}

export interface PrometheusMatrixItem {
  metric: Record<string, string>
  values: [number, string][]
}

export interface PrometheusVectorItem {
  metric: Record<string, string>
  value: [number, string]
}

export interface PrometheusResponse<T> {
  status: "success" | "error"
  data?: {
    resultType: "matrix" | "vector" | "scalar" | "string"
    result: T
  }
  errorType?: string
  error?: string
  warnings?: string[]
}

export interface PrometheusActiveTarget {
  discoveredLabels: Record<string, string>
  labels: Record<string, string>
  scrapePool: string
  scrapeUrl: string
  globalUrl: string
  lastError: string
  lastScrape: string
  lastScrapeDuration: number
  health: "up" | "down" | "unknown"
  scrapeInterval: string
  scrapeTimeout: string
}

export interface PrometheusTargetsResponse {
  status: "success" | "error"
  data?: {
    activeTargets: PrometheusActiveTarget[]
    droppedTargets: PrometheusActiveTarget[]
  }
  errorType?: string
  error?: string
  warnings?: string[]
}

export interface DatasourceTestResult {
  success: boolean
  message: string
  seriesCount: number
}
