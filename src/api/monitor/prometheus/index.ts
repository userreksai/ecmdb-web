import axios from "axios"
import type {
  DatasourceTestResult,
  Metric,
  MonitorDatasource,
  PrometheusActiveTarget,
  PrometheusMatrixItem,
  PrometheusResponse,
  PrometheusTargetsResponse,
  PrometheusVectorItem,
  QueryRangeParams
} from "./types"

const normalizeBaseUrl = (url: string) => url.trim().replace(/\/+$/, "")

const prometheusError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data?.error
    if (typeof responseError === "string" && responseError) return responseError

    if (error.code === "ECONNABORTED") return "连接超时，请检查 Prometheus 地址和网络"
    if (!error.response) return "无法连接 Prometheus，请检查地址、反向代理或 CORS 配置"
    return `Prometheus 请求失败（HTTP ${error.response.status}）`
  }

  return error instanceof Error ? error.message : "Prometheus 请求失败"
}

const ensureSuccess = <T>(response: PrometheusResponse<T>) => {
  if (response.status !== "success" || !response.data) {
    throw new Error(response.error || "Prometheus 返回了无效响应")
  }
  return response.data.result
}

export async function queryPrometheusRange(datasource: MonitorDatasource, params: QueryRangeParams): Promise<Metric[]> {
  try {
    const response = await axios.get<PrometheusResponse<PrometheusMatrixItem[]>>(
      `${normalizeBaseUrl(datasource.url)}/api/v1/query_range`,
      {
        params,
        timeout: 30000
      }
    )

    return ensureSuccess(response.data).map((item) => ({
      labels: item.metric,
      points: item.values
        .map(([timestamp, value]) => ({ timestamp, value: Number(value) }))
        .filter((point) => Number.isFinite(point.value))
    }))
  } catch (error) {
    throw new Error(prometheusError(error))
  }
}

export async function queryPrometheusInstant(
  datasource: MonitorDatasource,
  query: string,
  time?: number
): Promise<Metric[]> {
  try {
    const response = await axios.get<PrometheusResponse<PrometheusVectorItem[]>>(
      `${normalizeBaseUrl(datasource.url)}/api/v1/query`,
      {
        params: { query, time },
        timeout: 30000
      }
    )

    return ensureSuccess(response.data).map((item) => ({
      labels: item.metric,
      points: [{ timestamp: item.value[0], value: Number(item.value[1]) }]
    }))
  } catch (error) {
    throw new Error(prometheusError(error))
  }
}

export async function queryPrometheusActiveTargets(datasource: MonitorDatasource): Promise<PrometheusActiveTarget[]> {
  try {
    const response = await axios.get<PrometheusTargetsResponse>(`${normalizeBaseUrl(datasource.url)}/api/v1/targets`, {
      params: { state: "active" },
      timeout: 30000
    })

    if (response.data.status !== "success" || !response.data.data) {
      throw new Error(response.data.error || "Prometheus 返回了无效的活动目标响应")
    }
    return response.data.data.activeTargets
  } catch (error) {
    throw new Error(prometheusError(error))
  }
}

export async function testPrometheusDatasource(datasource: MonitorDatasource): Promise<DatasourceTestResult> {
  try {
    const response = await axios.get<PrometheusResponse<PrometheusVectorItem[]>>(
      `${normalizeBaseUrl(datasource.url)}/api/v1/query`,
      {
        params: { query: "up" },
        timeout: 10000
      }
    )
    const result = ensureSuccess(response.data)

    return {
      success: true,
      message: `连接成功，查询到 ${result.length} 个目标`,
      seriesCount: result.length
    }
  } catch (error) {
    return {
      success: false,
      message: prometheusError(error),
      seriesCount: 0
    }
  }
}
