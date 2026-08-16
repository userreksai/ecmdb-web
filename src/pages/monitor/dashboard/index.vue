<template>
  <div ref="pageElement" class="monitor-dashboard">
    <header class="dashboard-toolbar">
      <div class="title-block">
        <div class="title-line">
          <el-icon class="title-icon"><DataLine /></el-icon>
          <h1>{{ dashboardConfig.title }}</h1>
          <el-tag :type="selectedDatasource?.enabled ? 'success' : 'info'" size="small" effect="plain">
            {{ selectedDatasource?.enabled ? "数据源已启用" : "未选择" }}
          </el-tag>
        </div>
        <p>直接读取 Prometheus 时序数据，不在业务数据库保存监控采样。</p>
      </div>

      <div class="toolbar-controls">
        <el-select v-model="datasourceId" class="datasource-select" placeholder="选择 Prometheus 数据源">
          <el-option
            v-for="datasource in enabledDatasources"
            :key="datasource.id"
            :label="datasource.name"
            :value="datasource.id"
          />
        </el-select>

        <el-button @click="router.push('/monitor/datasource')">
          <el-icon><Setting /></el-icon>
          数据源配置
        </el-button>

        <el-select v-model="rangeSeconds" class="range-select" aria-label="时间范围">
          <el-option v-for="option in rangeOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>

        <el-select v-model="refreshSeconds" class="refresh-select" aria-label="自动刷新间隔">
          <el-option v-for="option in refreshOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>

        <el-button :loading="refreshing" :disabled="!datasourceId" @click="refreshAll">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button circle :aria-label="isFullscreen ? '退出全屏' : '全屏展示'" @click="toggleFullscreen">
          <el-icon><Close v-if="isFullscreen" /><FullScreen v-else /></el-icon>
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="!enabledDatasources.length"
      title="没有可用的 Prometheus 数据源"
      description="请进入数据源配置，添加并启用 Prometheus 数据源。"
      type="warning"
      show-icon
      :closable="false"
    />

    <section class="summary-grid" aria-label="监控摘要">
      <article class="summary-card">
        <div class="summary-icon is-blue"><Monitor /></div>
        <div>
          <span class="summary-label">监控实例</span>
          <strong>{{ summary.instanceCount }}</strong>
          <span class="summary-note">Prometheus 返回的唯一实例</span>
        </div>
      </article>
      <article class="summary-card">
        <div class="summary-icon is-green"><Cpu /></div>
        <div>
          <span class="summary-label">平均 CPU</span>
          <strong>{{ formatSummaryPercent(summary.averageCpu) }}</strong>
          <span class="summary-note">当前查询范围的最新值</span>
        </div>
      </article>
      <article class="summary-card">
        <div class="summary-icon is-orange"><PieChart /></div>
        <div>
          <span class="summary-label">平均内存</span>
          <strong>{{ formatSummaryPercent(summary.averageMemory) }}</strong>
          <span class="summary-note">所有实例的最新平均值</span>
        </div>
      </article>
      <article class="summary-card" :class="{ 'has-abnormal': (summary.abnormalCount ?? 0) > 0 }">
        <div class="summary-icon is-red"><Warning /></div>
        <div>
          <span class="summary-label">异常状态</span>
          <strong>{{ summary.abnormalCount ?? "--" }}</strong>
          <span class="summary-note">值为 1 的状态指标</span>
        </div>
      </article>
    </section>

    <main class="panel-grid">
      <MonitorPanel
        v-for="panel in dashboardConfig.panels"
        :key="panel.id"
        :panel="panel"
        :state="panelStates[panel.id]"
        :style="{ gridColumn: `span ${panel.span}` }"
        @inspect-query="openQueryDrawer"
      />
    </main>

    <el-drawer v-model="queryDrawerVisible" title="面板查询配置" size="520px">
      <template v-if="activePanel">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="面板">{{ activePanel.title }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ activePanel.type }}</el-descriptions-item>
          <el-descriptions-item label="单位">{{ activePanel.unit }}</el-descriptions-item>
          <el-descriptions-item label="图例">{{ activePanel.legend }}</el-descriptions-item>
        </el-descriptions>

        <div class="query-section-title">
          <span>PromQL</span>
          <el-button text type="primary" @click="copyPromql">
            <el-icon><CopyDocument /></el-icon>
            复制
          </el-button>
        </div>
        <pre class="promql-block"><code>{{ activePanel.promql }}</code></pre>

        <template v-if="activePanel.thresholds.length">
          <div class="query-section-title"><span>阈值</span></div>
          <div class="threshold-list">
            <div v-for="threshold in activePanel.thresholds" :key="threshold.value" class="threshold-item">
              <span class="threshold-color" :style="{ backgroundColor: threshold.color }" />
              <span>≥ {{ threshold.value }}：{{ threshold.label }}</span>
            </div>
          </div>
        </template>

        <template v-if="activePanel.valueMappings?.length">
          <div class="query-section-title"><span>状态映射</span></div>
          <div class="threshold-list">
            <div v-for="mapping in activePanel.valueMappings" :key="mapping.value" class="threshold-item">
              <el-tag :type="mapping.status === 'normal' ? 'success' : 'danger'" size="small">
                {{ mapping.value }}
              </el-tag>
              <span>{{ mapping.label }}</span>
            </div>
            <div class="threshold-item">
              <el-tag type="info" size="small">无数据</el-tag>
              <span>未知，不按正常处理</span>
            </div>
          </div>
        </template>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
import { useRouter } from "vue-router"
import {
  Close,
  CopyDocument,
  Cpu,
  DataLine,
  FullScreen,
  Monitor,
  PieChart,
  Refresh,
  Setting,
  Warning
} from "@element-plus/icons-vue"
import { ElMessage } from "element-plus"
import { queryPrometheusRange } from "@/api/monitor/prometheus"
import dashboardConfigJson from "./dashboard.config.json"
import MonitorPanel from "./components/MonitorPanel.vue"
import { useMonitorDatasources } from "../composables/useMonitorDatasources"
import type { MonitorDashboardConfig, MonitorPanelConfig, MonitorPanelState } from "./types"

const dashboardConfig = dashboardConfigJson as MonitorDashboardConfig
const router = useRouter()
const { datasources, reload: reloadDatasources } = useMonitorDatasources()
const datasourceId = ref<string>()
const rangeSeconds = ref(dashboardConfig.defaultRangeSeconds)
const refreshSeconds = ref(dashboardConfig.defaultRefreshSeconds)
const refreshing = ref(false)
const pageElement = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const queryDrawerVisible = ref(false)
const activePanel = ref<MonitorPanelConfig | null>(null)

const rangeOptions = [
  { label: "最近 15 分钟", value: 15 * 60 },
  { label: "最近 1 小时", value: 60 * 60 },
  { label: "最近 6 小时", value: 6 * 60 * 60 },
  { label: "最近 24 小时", value: 24 * 60 * 60 }
]

const refreshOptions = [
  { label: "关闭自动刷新", value: 0 },
  { label: "每 15 秒", value: 15 },
  { label: "每 30 秒", value: 30 },
  { label: "每 1 分钟", value: 60 }
]

const panelStates = reactive<Record<string, MonitorPanelState>>(
  Object.fromEntries(
    dashboardConfig.panels.map((panel) => [
      panel.id,
      {
        loading: false,
        error: "",
        metrics: [],
        updatedAt: null
      }
    ])
  )
)

const enabledDatasources = computed(() => datasources.value.filter((item) => item.enabled))
const selectedDatasource = computed(() => enabledDatasources.value.find((item) => item.id === datasourceId.value))

const latestValues = (panelId: string) =>
  panelStates[panelId].metrics
    .map((metric) => metric.points.at(-1)?.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

const average = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : null

const summary = computed(() => {
  const instances = new Set<string>()
  Object.values(panelStates).forEach((state) => {
    state.metrics.forEach((metric) => {
      if (metric.labels.instance) instances.add(metric.labels.instance)
    })
  })

  const statusState = panelStates["process-status"]

  return {
    instanceCount: instances.size,
    averageCpu: average(latestValues("cpu-usage")),
    averageMemory: average(latestValues("memory-usage")),
    abnormalCount:
      statusState.error || !statusState.metrics.length
        ? null
        : latestValues("process-status").filter((value) => value === 1).length
  }
})

let refreshTimer: number | undefined
let requestGeneration = 0

const queryPanel = async (panel: MonitorPanelConfig, generation: number) => {
  const state = panelStates[panel.id]
  state.loading = true
  state.error = ""

  try {
    const end = Math.floor(Date.now() / 1000)
    const start = end - rangeSeconds.value
    const step = Math.max(1, Math.floor(rangeSeconds.value / 400))
    const datasource = selectedDatasource.value
    if (!datasource) throw new Error("请选择可用的 Prometheus 数据源")

    const metrics = await queryPrometheusRange(datasource, {
      query: panel.promql,
      start,
      end,
      step
    })

    if (generation !== requestGeneration) return
    state.metrics = metrics
    state.updatedAt = Date.now()
  } catch (error) {
    if (generation !== requestGeneration) return
    state.metrics = []
    state.error = error instanceof Error ? error.message : "Prometheus 查询请求失败"
  } finally {
    if (generation === requestGeneration) state.loading = false
  }
}

const refreshAll = async () => {
  if (!datasourceId.value) return

  const generation = ++requestGeneration
  refreshing.value = true
  await Promise.allSettled(dashboardConfig.panels.map((panel) => queryPanel(panel, generation)))
  if (generation === requestGeneration) refreshing.value = false
}

const resetRefreshTimer = () => {
  if (refreshTimer) window.clearInterval(refreshTimer)
  refreshTimer = undefined
  if (refreshSeconds.value > 0) {
    refreshTimer = window.setInterval(refreshAll, refreshSeconds.value * 1000)
  }
}

const openQueryDrawer = (panel: MonitorPanelConfig) => {
  activePanel.value = panel
  queryDrawerVisible.value = true
}

const copyPromql = async () => {
  if (!activePanel.value) return
  await navigator.clipboard.writeText(activePanel.value.promql)
  ElMessage.success("PromQL 已复制")
}

const formatSummaryPercent = (value: number | null) => (value === null ? "--" : `${value.toFixed(1)}%`)

const toggleFullscreen = async () => {
  if (!document.fullscreenElement) {
    await pageElement.value?.requestFullscreen()
  } else {
    await document.exitFullscreen()
  }
}

const handleFullscreenChange = () => {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

watch(datasourceId, () => refreshAll())
watch(rangeSeconds, () => refreshAll())
watch(refreshSeconds, resetRefreshTimer)

onMounted(() => {
  document.addEventListener("fullscreenchange", handleFullscreenChange)
  reloadDatasources()
  datasourceId.value = enabledDatasources.value[0]?.id
  resetRefreshTimer()
})

onBeforeUnmount(() => {
  requestGeneration++
  if (refreshTimer) window.clearInterval(refreshTimer)
  document.removeEventListener("fullscreenchange", handleFullscreenChange)
})
</script>

<style scoped lang="scss">
.monitor-dashboard {
  min-height: 100%;
  padding: 18px;
  overflow-y: auto;
  background: var(--el-fill-color-extra-light);
}

.monitor-dashboard:fullscreen {
  overflow-y: auto;
  background: var(--el-fill-color-extra-light);
}

.dashboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
  padding: 17px 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.title-block {
  min-width: 240px;
}

.title-line,
.toolbar-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-line h1 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 20px;
  font-weight: 600;
}

.title-icon {
  color: var(--el-color-primary);
  font-size: 22px;
}

.title-block p {
  margin: 6px 0 0 32px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.toolbar-controls {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.datasource-select {
  width: 190px;
}

.range-select {
  width: 140px;
}

.refresh-select {
  width: 140px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 16px 0;
}

.summary-card {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow-lighter);
}

.summary-card.has-abnormal {
  border-color: var(--el-color-danger-light-5);
}

.summary-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  font-size: 21px;
}

.summary-icon.is-blue {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}

.summary-icon.is-green {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
}

.summary-icon.is-orange {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}

.summary-icon.is-red {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

.summary-card > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.summary-label,
.summary-note {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-card strong {
  margin: 3px 0;
  color: var(--el-text-color-primary);
  font-size: 24px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.summary-note {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}

.panel-grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 14px;
}

.query-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 22px 0 10px;
  color: var(--el-text-color-primary);
  font-weight: 600;
}

.promql-block {
  overflow-x: auto;
  margin: 0;
  padding: 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.threshold-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.threshold-item {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--el-text-color-regular);
  font-size: 13px;
}

.threshold-color {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

@media (max-width: 1200px) {
  .dashboard-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-controls {
    width: 100%;
    justify-content: flex-start;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .panel-grid > :deep(*) {
    grid-column: span 24 !important;
  }
}

@media (max-width: 640px) {
  .monitor-dashboard {
    padding: 10px;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .toolbar-controls > * {
    flex: 1 1 140px;
  }

  .title-block p {
    margin-left: 0;
  }
}
</style>
