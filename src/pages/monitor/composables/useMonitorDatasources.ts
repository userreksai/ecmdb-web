import { ref } from "vue"
import type { MonitorDatasource } from "@/api/monitor/prometheus/types"

const STORAGE_KEY = "ecmdb-monitor-datasources-v1"

const defaultDatasource = (): MonitorDatasource => ({
  id: "prometheus-local",
  name: "本机 Prometheus",
  url: "/prometheus",
  enabled: true,
  description: "通过 ECMDB Web 反向代理访问本机 Prometheus"
})

const readDatasources = (): MonitorDatasource[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return [defaultDatasource()]
    const parsed = JSON.parse(stored) as MonitorDatasource[]
    return Array.isArray(parsed) ? parsed : [defaultDatasource()]
  } catch {
    return [defaultDatasource()]
  }
}

export function useMonitorDatasources() {
  const datasources = ref<MonitorDatasource[]>(readDatasources())

  const reload = () => {
    datasources.value = readDatasources()
  }

  const persist = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(datasources.value))
  }

  const save = (datasource: MonitorDatasource) => {
    const index = datasources.value.findIndex((item) => item.id === datasource.id)
    if (index >= 0) {
      datasources.value[index] = { ...datasource }
    } else {
      datasources.value.push({ ...datasource })
    }
    persist()
  }

  const remove = (id: string) => {
    datasources.value = datasources.value.filter((item) => item.id !== id)
    persist()
  }

  return {
    datasources,
    reload,
    save,
    remove
  }
}
