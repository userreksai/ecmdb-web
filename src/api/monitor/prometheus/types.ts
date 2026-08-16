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

export interface DatasourceTestResult {
  success: boolean
  message: string
  seriesCount: number
}
