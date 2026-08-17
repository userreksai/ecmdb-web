import type { Metric } from "@/api/monitor/prometheus/types"

export type MonitorPanelType = "timeseries" | "gauge" | "table" | "status"

export interface MonitorThreshold {
  value: number
  color: string
  label: string
}

export interface MonitorValueMapping {
  value: number
  label: string
  status: "normal" | "abnormal" | "unknown"
}

export interface MonitorPanelConfig {
  id: string
  title: string
  description: string
  type: MonitorPanelType
  promql: string
  unit: "percent" | "number"
  decimals: number
  span: number
  legend: string
  thresholds: MonitorThreshold[]
  valueMappings?: MonitorValueMapping[]
}

export interface MonitorDashboardConfig {
  title: string
  defaultRangeSeconds: number
  defaultRefreshSeconds: number
  panels: MonitorPanelConfig[]
}

export interface MonitorPanelState {
  loading: boolean
  error: string
  metrics: Metric[]
  updatedAt: number | null
}

export interface MonitorTarget {
  instance: string
  job: string
  labels: Record<string, string>
  up: boolean
}

export interface MonitorFilterState {
  job: string
  labelName: string
  labelValues: string[]
  instances: string[]
  groupByLabel: string
}
