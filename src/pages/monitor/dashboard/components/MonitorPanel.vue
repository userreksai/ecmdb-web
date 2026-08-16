<template>
  <section class="monitor-panel" :class="`monitor-panel--${panel.type}`">
    <header class="panel-header">
      <div class="panel-heading">
        <div class="panel-title-row">
          <span class="panel-title">{{ panel.title }}</span>
          <el-tag v-if="state.error" type="danger" size="small" effect="plain">查询失败</el-tag>
          <el-tag v-else-if="!state.loading && !state.metrics.length" type="info" size="small" effect="plain">
            无数据
          </el-tag>
        </div>
        <span class="panel-description">{{ panel.description }}</span>
      </div>
      <el-button text circle aria-label="查看 PromQL" @click="$emit('inspect-query', panel)">
        <el-icon><Document /></el-icon>
      </el-button>
    </header>

    <div v-loading="state.loading" class="panel-content">
      <el-result v-if="state.error" icon="error" title="查询失败" :sub-title="state.error" />

      <el-empty
        v-else-if="!state.loading && !state.metrics.length"
        description="Prometheus 暂无返回数据"
        :image-size="72"
      />

      <div
        v-else-if="panel.type === 'timeseries'"
        ref="chartElement"
        class="timeseries-chart"
        role="img"
        :aria-label="`${panel.title}趋势图`"
      />

      <div v-else-if="panel.type === 'gauge'" class="gauge-list">
        <div v-for="row in latestRows" :key="row.key" class="gauge-row">
          <div class="gauge-meta">
            <span class="gauge-name" :title="row.name">{{ row.name }}</span>
            <span class="gauge-value">{{ formatValue(row.value) }}</span>
          </div>
          <el-progress
            :percentage="clampPercentage(row.value)"
            :show-text="false"
            :stroke-width="10"
            :color="thresholdFor(row.value).color"
          />
          <span class="threshold-label" :style="{ color: thresholdFor(row.value).color }">
            {{ thresholdFor(row.value).label }}
          </span>
        </div>
      </div>

      <div v-else-if="panel.type === 'table'" class="table-wrapper">
        <el-table :data="tableRows" height="286" stripe>
          <el-table-column prop="instance" label="实例" min-width="150" show-overflow-tooltip />
          <el-table-column prop="mountpoint" label="挂载点" min-width="140" show-overflow-tooltip />
          <el-table-column prop="device" label="设备" min-width="140" show-overflow-tooltip />
          <el-table-column label="使用率" width="170">
            <template #default="scope">
              <div class="table-value">
                <span>{{ formatValue(scope.row.value) }}</span>
                <span class="status-dot" :style="{ backgroundColor: thresholdFor(scope.row.value).color }" />
                <span :style="{ color: thresholdFor(scope.row.value).color }">
                  {{ thresholdFor(scope.row.value).label }}
                </span>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div v-else-if="panel.type === 'status'" class="status-grid">
        <article v-for="row in statusRows" :key="row.key" class="status-item" :class="`is-${row.status}`">
          <span class="status-indicator" aria-hidden="true" />
          <div class="status-content">
            <span class="status-name" :title="row.name">{{ row.name }}</span>
            <span class="status-label">{{ row.label }}</span>
          </div>
          <span class="status-value">{{ row.value }}</span>
        </article>
      </div>
    </div>

    <footer class="panel-footer">
      <span>类型：{{ panelTypeLabel }}</span>
      <span>{{ updatedAtLabel }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import { Document } from "@element-plus/icons-vue"
import * as echarts from "echarts"
import dayjs from "dayjs"
import type { Metric } from "@/api/monitor/prometheus/types"
import type { MonitorPanelConfig, MonitorPanelState, MonitorThreshold } from "../types"

const props = defineProps<{
  panel: MonitorPanelConfig
  state: MonitorPanelState
}>()

defineEmits<{
  "inspect-query": [panel: MonitorPanelConfig]
}>()

const chartElement = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const latestPoint = (metric: Metric) => metric.points.at(-1)

const renderLegend = (labels: Record<string, string>) => {
  const rendered = props.panel.legend.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, key: string) => labels[key] || "-")
  return rendered.replace(/(?:\s*[·/]\s*-)+$/g, "") || labels.instance || "未命名实例"
}

const latestRows = computed(() =>
  props.state.metrics
    .map((metric, index) => {
      const point = latestPoint(metric)
      return point
        ? {
            key: `${index}-${JSON.stringify(metric.labels)}`,
            name: renderLegend(metric.labels),
            value: Number(point.value),
            labels: metric.labels
          }
        : null
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.value - a.value)
)

const tableRows = computed(() =>
  latestRows.value.map((row) => ({
    ...row,
    instance: row.labels.instance || "-",
    mountpoint: row.labels.mountpoint || "-",
    device: row.labels.device || "-"
  }))
)

const statusRows = computed(() =>
  latestRows.value.map((row) => {
    const mapping = props.panel.valueMappings?.find((item) => item.value === row.value)
    return {
      ...row,
      label: mapping?.label || "未知",
      status: mapping?.status || "unknown"
    }
  })
)

const panelTypeLabel = computed(() => {
  const labels: Record<MonitorPanelConfig["type"], string> = {
    timeseries: "趋势图",
    gauge: "使用率",
    table: "明细表",
    status: "状态"
  }
  return labels[props.panel.type]
})

const updatedAtLabel = computed(() =>
  props.state.updatedAt ? `更新于 ${dayjs(props.state.updatedAt).format("HH:mm:ss")}` : "尚未更新"
)

const formatValue = (value: number) => {
  const formatted = Number.isFinite(value) ? value.toFixed(props.panel.decimals) : "-"
  return props.panel.unit === "percent" ? `${formatted}%` : formatted
}

const clampPercentage = (value: number) => Math.min(100, Math.max(0, value))

const thresholdFor = (value: number): MonitorThreshold => {
  const thresholds = [...props.panel.thresholds].sort((a, b) => a.value - b.value)
  return (
    thresholds.filter((threshold) => value >= threshold.value).at(-1) || {
      value: 0,
      color: "var(--el-color-info)",
      label: "未知"
    }
  )
}

const renderChart = () => {
  if (props.panel.type !== "timeseries" || !chartElement.value || !props.state.metrics.length) return

  if (!chart) {
    chart = echarts.init(chartElement.value)
    resizeObserver?.observe(chartElement.value)
  }

  const rootStyle = getComputedStyle(document.documentElement)
  const textColor = rootStyle.getPropertyValue("--el-text-color-regular").trim() || "#606266"
  const mutedColor = rootStyle.getPropertyValue("--el-text-color-secondary").trim() || "#909399"
  const borderColor = rootStyle.getPropertyValue("--el-border-color-lighter").trim() || "#ebeef5"
  const colors = ["#409eff", "#67c23a", "#e6a23c", "#f56c6c", "#909399", "#9b59b6"]

  chart.setOption(
    {
      animation: false,
      color: colors,
      grid: { left: 18, right: 20, top: 20, bottom: 52, containLabel: true },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: unknown) => formatValue(Number(value))
      },
      legend: {
        type: "scroll",
        bottom: 4,
        textStyle: { color: textColor }
      },
      xAxis: {
        type: "time",
        boundaryGap: false,
        axisLabel: { color: mutedColor },
        axisLine: { lineStyle: { color: borderColor } },
        splitLine: { show: false }
      },
      yAxis: {
        type: "value",
        min: props.panel.unit === "percent" ? 0 : undefined,
        max: props.panel.unit === "percent" ? 100 : undefined,
        axisLabel: {
          color: mutedColor,
          formatter: (value: number) => (props.panel.unit === "percent" ? `${value}%` : value)
        },
        splitLine: { lineStyle: { color: borderColor, type: "dashed" } }
      },
      series: props.state.metrics.map((metric) => ({
        name: renderLegend(metric.labels),
        type: "line",
        smooth: true,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 2 },
        data: metric.points.map((point) => [point.timestamp * 1000, point.value])
      }))
    },
    true
  )
}

watch(
  () => props.state.metrics,
  async () => {
    await nextTick()
    renderChart()
  }
)

onMounted(() => {
  resizeObserver = new ResizeObserver(() => chart?.resize())
  if (chartElement.value) resizeObserver.observe(chartElement.value)
  renderChart()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<style scoped lang="scss">
.monitor-panel {
  display: flex;
  min-width: 0;
  min-height: 390px;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-lighter);
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}

.panel-heading {
  min-width: 0;
}

.panel-title-row,
.gauge-meta,
.table-value {
  display: flex;
  align-items: center;
  gap: 8px;
}

.panel-title {
  color: var(--el-text-color-primary);
  font-size: 15px;
  font-weight: 600;
}

.panel-description {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-content {
  position: relative;
  min-height: 0;
  flex: 1;
  padding: 14px 18px;
}

.timeseries-chart {
  width: 100%;
  height: 300px;
}

.gauge-list {
  display: flex;
  max-height: 300px;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  padding: 4px 2px;
}

.gauge-row {
  position: relative;
  padding-right: 52px;
}

.gauge-meta {
  justify-content: space-between;
  margin-bottom: 8px;
}

.gauge-name,
.status-name {
  overflow: hidden;
  color: var(--el-text-color-regular);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gauge-value {
  color: var(--el-text-color-primary);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.threshold-label {
  position: absolute;
  right: 0;
  bottom: -4px;
  width: 44px;
  font-size: 12px;
  text-align: right;
}

.table-wrapper {
  margin: -8px -10px;
}

.table-value {
  font-variant-numeric: tabular-nums;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.status-grid {
  display: grid;
  max-height: 300px;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  overflow-y: auto;
}

.status-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-extra-light);
}

.status-indicator {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--el-color-info);
}

.status-item.is-normal {
  border-color: var(--el-color-success-light-7);
  background: var(--el-color-success-light-9);

  .status-indicator {
    background: var(--el-color-success);
  }

  .status-label {
    color: var(--el-color-success-dark-2);
  }
}

.status-item.is-abnormal {
  border-color: var(--el-color-danger-light-7);
  background: var(--el-color-danger-light-9);

  .status-indicator {
    background: var(--el-color-danger);
  }

  .status-label {
    color: var(--el-color-danger);
  }
}

.status-content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.status-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.status-value {
  color: var(--el-text-color-secondary);
  font-family: monospace;
  font-size: 12px;
}

.panel-footer {
  display: flex;
  justify-content: space-between;
  padding: 9px 18px;
  border-top: 1px solid var(--el-border-color-extra-light);
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}

:deep(.el-result) {
  padding: 28px 0;
}

@media (max-width: 768px) {
  .monitor-panel {
    min-height: 360px;
  }

  .panel-content {
    padding-right: 12px;
    padding-left: 12px;
  }
}
</style>
