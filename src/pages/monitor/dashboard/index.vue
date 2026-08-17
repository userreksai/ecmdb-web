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
        <p>直接读取 Prometheus 时序数据；机器与标签从 up 指标实时发现。</p>
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
        <el-button type="primary" plain @click="addPanel">
          <el-icon><Plus /></el-icon>
          新增面板
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

    <section v-else class="variable-panel" aria-label="监控变量筛选">
      <div class="variable-heading">
        <div>
          <el-icon><Filter /></el-icon>
          <strong>监控变量</strong>
          <span>选择单机，或按 Prometheus 标签筛选一组机器</span>
        </div>
        <el-tag v-if="targetError" type="danger" size="small" effect="plain">目标发现失败</el-tag>
        <el-tag v-else type="info" size="small" effect="plain">
          当前范围 {{ activeTargetCount }} 台 / 已发现 {{ targets.length }} 个目标
        </el-tag>
      </div>

      <div v-loading="targetLoading" class="variable-grid">
        <label class="variable-field">
          <span>任务（job）</span>
          <el-select v-model="filterState.job" filterable placeholder="选择 job">
            <el-option v-for="job in jobOptions" :key="job" :label="job" :value="job" />
          </el-select>
        </label>
        <label class="variable-field">
          <span>筛选标签</span>
          <el-select v-model="filterState.labelName" clearable filterable placeholder="不按标签筛选">
            <el-option v-for="label in labelNameOptions" :key="label" :label="label" :value="label" />
          </el-select>
        </label>
        <label class="variable-field variable-field--wide">
          <span>标签值</span>
          <el-select
            v-model="filterState.labelValues"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            :disabled="!filterState.labelName"
            :placeholder="filterState.labelName ? '全部标签值' : '请先选择标签'"
          >
            <el-option v-for="value in labelValueOptions" :key="value" :label="value" :value="value" />
          </el-select>
        </label>
        <label class="variable-field">
          <span>分组显示</span>
          <el-select v-model="filterState.groupByLabel" clearable filterable placeholder="不分组">
            <el-option label="实例（instance）" value="instance" />
            <el-option v-for="label in labelNameOptions" :key="label" :label="label" :value="label" />
          </el-select>
        </label>
        <label class="variable-field variable-field--instances">
          <span>机器（instance）</span>
          <el-select
            v-model="filterState.instances"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            filterable
            :placeholder="`全部 ${instanceOptions.length} 台机器`"
          >
            <template v-if="filterState.groupByLabel && filterState.groupByLabel !== 'instance'">
              <el-option-group v-for="group in groupedInstanceOptions" :key="group.label" :label="group.label">
                <el-option
                  v-for="target in group.options"
                  :key="target.instance"
                  :label="target.up ? target.instance : `${target.instance}（不可达）`"
                  :value="target.instance"
                />
              </el-option-group>
            </template>
            <template v-else>
              <el-option
                v-for="target in instanceOptions"
                :key="target.instance"
                :label="target.up ? target.instance : `${target.instance}（不可达）`"
                :value="target.instance"
              />
            </template>
          </el-select>
        </label>
        <el-button class="clear-filter" :disabled="!hasNarrowingFilters" @click="clearNarrowingFilters">
          清除筛选
        </el-button>
      </div>
      <el-alert v-if="targetError" :title="targetError" type="error" show-icon :closable="false" />
    </section>

    <section class="summary-grid" aria-label="监控摘要">
      <article class="summary-card">
        <div class="summary-icon is-blue"><Monitor /></div>
        <div>
          <span class="summary-label">当前机器</span>
          <strong>{{ activeTargetCount }}</strong>
          <span class="summary-note">当前 job、标签与实例筛选范围</span>
        </div>
      </article>
      <article class="summary-card">
        <div class="summary-icon is-green"><Cpu /></div>
        <div>
          <span class="summary-label">平均 CPU</span>
          <strong>{{ formatSummaryPercent(summary.averageCpu) }}</strong>
          <span class="summary-note">筛选范围内实例的最新值</span>
        </div>
      </article>
      <article class="summary-card">
        <div class="summary-icon is-orange"><PieChart /></div>
        <div>
          <span class="summary-label">平均内存</span>
          <strong>{{ formatSummaryPercent(summary.averageMemory) }}</strong>
          <span class="summary-note">筛选范围内实例的最新平均值</span>
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
        :group-by-label="filterState.groupByLabel"
        :style="{ gridColumn: `span ${panel.span}` }"
        @inspect-query="openPanelEditor"
      />
    </main>
    <el-empty v-if="!dashboardConfig.panels.length" description="暂无面板，请新增一个 PromQL 面板" />

    <el-drawer v-model="panelDrawerVisible" :title="editingPanelId ? '编辑监控面板' : '新增监控面板'" size="600px">
      <el-form v-if="panelDraft" label-position="top" class="panel-form">
        <div class="form-grid">
          <el-form-item label="标题" required>
            <el-input v-model="panelDraft.title" placeholder="例如：CPU 使用率" />
          </el-form-item>
          <el-form-item label="面板类型">
            <el-select v-model="panelDraft.type">
              <el-option label="趋势图" value="timeseries" />
              <el-option label="使用率" value="gauge" />
              <el-option label="明细表" value="table" />
              <el-option label="状态" value="status" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="说明">
          <el-input v-model="panelDraft.description" placeholder="面板用途说明" />
        </el-form-item>
        <el-form-item label="PromQL" required>
          <el-input
            v-model="panelDraft.promql"
            type="textarea"
            :rows="7"
            resize="vertical"
            placeholder="输入可直接在 Prometheus 执行的 PromQL"
          />
          <div class="form-help">job、标签和 instance 变量会覆盖查询中同名的标签匹配器。</div>
        </el-form-item>
        <el-collapse>
          <el-collapse-item title="查看当前筛选后的实际查询" name="query-preview">
            <pre class="promql-block"><code>{{ panelDraftQuery }}</code></pre>
            <el-button text type="primary" @click="copyPromql">
              <el-icon><CopyDocument /></el-icon>
              复制实际 PromQL
            </el-button>
          </el-collapse-item>
        </el-collapse>
        <div class="form-grid form-grid--three">
          <el-form-item label="单位">
            <el-select v-model="panelDraft.unit">
              <el-option label="百分比（%）" value="percent" />
              <el-option label="数值" value="number" />
            </el-select>
          </el-form-item>
          <el-form-item label="小数位">
            <el-input-number v-model="panelDraft.decimals" :min="0" :max="6" controls-position="right" />
          </el-form-item>
          <el-form-item label="面板宽度">
            <el-select v-model="panelDraft.span">
              <el-option label="1/3" :value="8" />
              <el-option label="1/2" :value="12" />
              <el-option label="2/3" :value="16" />
              <el-option label="整行" :value="24" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="图例模板">
          <el-input v-model="panelDraft.legend" placeholder="例如：{{instance}} · {{mountpoint}}" />
          <div class="form-help" v-text="'使用 {{label}} 引用 Prometheus 标签。'" />
        </el-form-item>

        <template v-if="panelDraft.type !== 'status'">
          <div class="config-section-title">
            <strong>阈值与颜色</strong>
            <el-button text type="primary" @click="addThreshold">新增阈值</el-button>
          </div>
          <div v-for="(threshold, index) in panelDraft.thresholds" :key="index" class="config-row">
            <el-input-number v-model="threshold.value" controls-position="right" />
            <el-color-picker v-model="threshold.color" />
            <el-input v-model="threshold.label" placeholder="状态名称" />
            <el-button text type="danger" @click="panelDraft.thresholds.splice(index, 1)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </template>
        <template v-else>
          <div class="config-section-title">
            <strong>状态值映射</strong>
            <el-button text type="primary" @click="addValueMapping">新增映射</el-button>
          </div>
          <div v-for="(mapping, index) in panelDraft.valueMappings" :key="index" class="config-row mapping-row">
            <el-input-number v-model="mapping.value" controls-position="right" />
            <el-input v-model="mapping.label" placeholder="显示名称" />
            <el-select v-model="mapping.status">
              <el-option label="正常" value="normal" />
              <el-option label="异常" value="abnormal" />
              <el-option label="未知" value="unknown" />
            </el-select>
            <el-button text type="danger" @click="panelDraft.valueMappings?.splice(index, 1)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </template>
      </el-form>
      <template #footer>
        <div class="drawer-footer">
          <el-button v-if="editingPanelId" type="danger" plain @click="removePanel">删除面板</el-button>
          <span />
          <el-button @click="panelDrawerVisible = false">取消</el-button>
          <el-button type="primary" @click="savePanel">保存并查询</el-button>
        </div>
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
  Delete,
  Filter,
  FullScreen,
  Monitor,
  PieChart,
  Plus,
  Refresh,
  Setting,
  Warning
} from "@element-plus/icons-vue"
import { ElMessage, ElMessageBox } from "element-plus"
import { queryPrometheusInstant, queryPrometheusRange } from "@/api/monitor/prometheus"
import dashboardConfigJson from "./dashboard.config.json"
import MonitorPanel from "./components/MonitorPanel.vue"
import { useMonitorDatasources } from "../composables/useMonitorDatasources"
import { applyPromqlMatchers, valuesToPromqlRegex } from "./promql"
import type {
  MonitorDashboardConfig,
  MonitorFilterState,
  MonitorPanelConfig,
  MonitorPanelState,
  MonitorTarget
} from "./types"

const DASHBOARD_STORAGE_KEY = "ecmdb-monitor-dashboard-v2"
const FILTER_STORAGE_KEY = "ecmdb-monitor-filters-v2"
const DATASOURCE_STORAGE_KEY = "ecmdb-monitor-selected-datasource-v1"
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const readDashboardConfig = (): MonitorDashboardConfig => {
  try {
    const stored = localStorage.getItem(DASHBOARD_STORAGE_KEY)
    return stored
      ? (JSON.parse(stored) as MonitorDashboardConfig)
      : clone(dashboardConfigJson as MonitorDashboardConfig)
  } catch {
    return clone(dashboardConfigJson as MonitorDashboardConfig)
  }
}

const defaultFilterState = (): MonitorFilterState => ({
  job: "linux-node",
  labelName: "",
  labelValues: [],
  instances: [],
  groupByLabel: "instance"
})

const readFilterState = (): MonitorFilterState => {
  try {
    const stored = localStorage.getItem(FILTER_STORAGE_KEY)
    return stored ? { ...defaultFilterState(), ...(JSON.parse(stored) as MonitorFilterState) } : defaultFilterState()
  } catch {
    return defaultFilterState()
  }
}

const router = useRouter()
const { datasources, reload: reloadDatasources } = useMonitorDatasources()
const dashboardConfig = ref<MonitorDashboardConfig>(readDashboardConfig())
const filterState = reactive<MonitorFilterState>(readFilterState())
const datasourceId = ref<string>()
const rangeSeconds = ref(dashboardConfig.value.defaultRangeSeconds)
const refreshSeconds = ref(dashboardConfig.value.defaultRefreshSeconds)
const refreshing = ref(false)
const targetLoading = ref(false)
const targetError = ref("")
const targets = ref<MonitorTarget[]>([])
const pageElement = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const panelDrawerVisible = ref(false)
const panelDraft = ref<MonitorPanelConfig | null>(null)
const editingPanelId = ref<string | null>(null)

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

const createPanelState = (): MonitorPanelState => ({ loading: false, error: "", metrics: [], updatedAt: null })
const panelStates = reactive<Record<string, MonitorPanelState>>({})
const syncPanelStates = () => {
  const panelIds = new Set(dashboardConfig.value.panels.map((panel) => panel.id))
  dashboardConfig.value.panels.forEach((panel) => {
    if (!panelStates[panel.id]) panelStates[panel.id] = createPanelState()
  })
  Object.keys(panelStates).forEach((id) => {
    if (!panelIds.has(id)) delete panelStates[id]
  })
}
syncPanelStates()

const enabledDatasources = computed(() => datasources.value.filter((item) => item.enabled))
const selectedDatasource = computed(() => enabledDatasources.value.find((item) => item.id === datasourceId.value))
const jobOptions = computed(() => [...new Set(targets.value.map((target) => target.job).filter(Boolean))].sort())
const jobTargets = computed(() => targets.value.filter((target) => target.job === filterState.job))
const labelNameOptions = computed(() => {
  const labels = new Set<string>()
  jobTargets.value.forEach((target) => {
    Object.keys(target.labels).forEach((label) => {
      if (!["__name__", "instance", "job"].includes(label)) labels.add(label)
    })
  })
  return [...labels].sort()
})
const labelValueOptions = computed(() => {
  if (!filterState.labelName) return []
  return [...new Set(jobTargets.value.map((target) => target.labels[filterState.labelName]).filter(Boolean))].sort()
})
const labelFilteredTargets = computed(() => {
  if (!filterState.labelName || !filterState.labelValues.length) return jobTargets.value
  const values = new Set(filterState.labelValues)
  return jobTargets.value.filter((target) => values.has(target.labels[filterState.labelName]))
})
const instanceOptions = computed(() => {
  const byInstance = new Map<string, MonitorTarget>()
  labelFilteredTargets.value.forEach((target) => {
    const existing = byInstance.get(target.instance)
    if (!existing || (!existing.up && target.up)) byInstance.set(target.instance, target)
  })
  return [...byInstance.values()].sort((left, right) => left.instance.localeCompare(right.instance))
})
const groupedInstanceOptions = computed(() => {
  const groups = new Map<string, MonitorTarget[]>()
  instanceOptions.value.forEach((target) => {
    const group = target.labels[filterState.groupByLabel] || "未设置标签"
    groups.set(group, [...(groups.get(group) || []), target])
  })
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([label, options]) => ({ label, options }))
})
const activeTargetCount = computed(() =>
  filterState.instances.length ? filterState.instances.length : instanceOptions.value.length
)
const hasNarrowingFilters = computed(() =>
  Boolean(filterState.labelName || filterState.labelValues.length || filterState.instances.length)
)

const currentMatchers = computed(() => {
  const matchers: Array<{ label: string; operator: "=" | "=~"; value: string }> = []
  if (filterState.job) matchers.push({ label: "job", operator: "=", value: filterState.job })
  if (filterState.labelName && filterState.labelValues.length) {
    matchers.push({ label: filterState.labelName, operator: "=~", value: valuesToPromqlRegex(filterState.labelValues) })
  }
  if (filterState.instances.length) {
    matchers.push({ label: "instance", operator: "=~", value: valuesToPromqlRegex(filterState.instances) })
  }
  return matchers
})
const filteredPromql = (promql: string) => applyPromqlMatchers(promql, currentMatchers.value)
const panelDraftQuery = computed(() => (panelDraft.value ? filteredPromql(panelDraft.value.promql) : ""))

const latestValues = (panelId: string) =>
  (panelStates[panelId]?.metrics || [])
    .map((metric) => metric.points.at(-1)?.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
const average = (values: number[]) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : null
const summary = computed(() => {
  const statusState = panelStates["process-status"]
  return {
    averageCpu: average(latestValues("cpu-usage")),
    averageMemory: average(latestValues("memory-usage")),
    abnormalCount:
      !statusState || statusState.error || !statusState.metrics.length
        ? null
        : latestValues("process-status").filter((value) => value === 1).length
  }
})

let refreshTimer: number | undefined
let requestGeneration = 0
let targetGeneration = 0

const sanitizeFilters = () => {
  if (!jobOptions.value.includes(filterState.job)) {
    filterState.job = jobOptions.value.includes("linux-node") ? "linux-node" : jobOptions.value[0] || ""
  }
  if (filterState.labelName && !labelNameOptions.value.includes(filterState.labelName)) {
    filterState.labelName = ""
    filterState.labelValues = []
  }
  const availableValues = new Set(labelValueOptions.value)
  filterState.labelValues = filterState.labelValues.filter((value) => availableValues.has(value))
  const availableInstances = new Set(instanceOptions.value.map((target) => target.instance))
  filterState.instances = filterState.instances.filter((instance) => availableInstances.has(instance))
  if (
    filterState.groupByLabel !== "instance" &&
    filterState.groupByLabel &&
    !labelNameOptions.value.includes(filterState.groupByLabel)
  ) {
    filterState.groupByLabel = "instance"
  }
}

const loadTargets = async () => {
  const datasource = selectedDatasource.value
  const generation = ++targetGeneration
  if (!datasource) {
    targets.value = []
    return
  }
  targetLoading.value = true
  targetError.value = ""
  try {
    const metrics = await queryPrometheusInstant(datasource, "up")
    if (generation !== targetGeneration) return
    targets.value = metrics
      .map((metric) => ({
        instance: metric.labels.instance || "",
        job: metric.labels.job || "",
        labels: metric.labels,
        up: metric.points.at(-1)?.value === 1
      }))
      .filter((target) => target.instance && target.job)
    sanitizeFilters()
  } catch (error) {
    if (generation !== targetGeneration) return
    targets.value = []
    targetError.value = error instanceof Error ? error.message : "无法从 Prometheus 获取目标与标签"
  } finally {
    if (generation === targetGeneration) targetLoading.value = false
  }
}

const queryPanel = async (panel: MonitorPanelConfig, generation: number) => {
  const state = panelStates[panel.id]
  if (!state) return
  state.loading = true
  state.error = ""
  try {
    const datasource = selectedDatasource.value
    if (!datasource) throw new Error("请选择可用的 Prometheus 数据源")
    const query = filteredPromql(panel.promql)
    const end = Math.floor(Date.now() / 1000)
    const metrics =
      panel.type === "timeseries"
        ? await queryPrometheusRange(datasource, {
            query,
            start: end - rangeSeconds.value,
            end,
            step: Math.max(1, Math.floor(rangeSeconds.value / 400))
          })
        : await queryPrometheusInstant(datasource, query)
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

const refreshPanels = async () => {
  if (!selectedDatasource.value) return
  const generation = ++requestGeneration
  refreshing.value = true
  await Promise.allSettled(dashboardConfig.value.panels.map((panel) => queryPanel(panel, generation)))
  if (generation === requestGeneration) refreshing.value = false
}
const refreshAll = async () => {
  if (!selectedDatasource.value) return
  await loadTargets()
  await refreshPanels()
}
const resetRefreshTimer = () => {
  if (refreshTimer) window.clearInterval(refreshTimer)
  refreshTimer = undefined
  if (refreshSeconds.value > 0) refreshTimer = window.setInterval(refreshAll, refreshSeconds.value * 1000)
}

const clearNarrowingFilters = () => {
  filterState.labelName = ""
  filterState.labelValues = []
  filterState.instances = []
}
const newPanel = (): MonitorPanelConfig => ({
  id: `panel-${Date.now()}`,
  title: "新监控面板",
  description: "使用 PromQL 直接查询 Prometheus",
  type: "timeseries",
  promql: 'up{job="linux-node"}',
  unit: "number",
  decimals: 0,
  span: 12,
  legend: "{{instance}}",
  thresholds: [{ value: 0, color: "#67c23a", label: "正常" }],
  valueMappings: [
    { value: 0, label: "正常", status: "normal" },
    { value: 1, label: "异常", status: "abnormal" }
  ]
})
const addPanel = () => {
  editingPanelId.value = null
  panelDraft.value = newPanel()
  panelDrawerVisible.value = true
}
const openPanelEditor = (panel: MonitorPanelConfig) => {
  editingPanelId.value = panel.id
  panelDraft.value = clone(panel)
  if (!panelDraft.value.valueMappings) panelDraft.value.valueMappings = []
  panelDrawerVisible.value = true
}
const persistDashboard = () => localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(dashboardConfig.value))
const savePanel = async () => {
  if (!panelDraft.value?.title.trim() || !panelDraft.value.promql.trim()) {
    ElMessage.warning("请填写面板标题和 PromQL")
    return
  }
  const savedPanel = clone(panelDraft.value)
  const index = dashboardConfig.value.panels.findIndex((panel) => panel.id === editingPanelId.value)
  if (index >= 0) dashboardConfig.value.panels[index] = savedPanel
  else dashboardConfig.value.panels.push(savedPanel)
  persistDashboard()
  syncPanelStates()
  panelDrawerVisible.value = false
  ElMessage.success("面板配置已保存")
  await refreshPanels()
}
const removePanel = async () => {
  if (!editingPanelId.value) return
  await ElMessageBox.confirm("删除后可通过清除浏览器中的监控面板配置恢复默认面板。", "确认删除面板", {
    type: "warning",
    confirmButtonText: "删除",
    cancelButtonText: "取消"
  })
  dashboardConfig.value.panels = dashboardConfig.value.panels.filter((panel) => panel.id !== editingPanelId.value)
  persistDashboard()
  syncPanelStates()
  panelDrawerVisible.value = false
  ElMessage.success("面板已删除")
}
const addThreshold = () => panelDraft.value?.thresholds.push({ value: 0, color: "#409eff", label: "新阈值" })
const addValueMapping = () => {
  if (!panelDraft.value) return
  if (!panelDraft.value.valueMappings) panelDraft.value.valueMappings = []
  panelDraft.value.valueMappings.push({ value: 0, label: "新状态", status: "unknown" })
}
const copyPromql = async () => {
  await navigator.clipboard.writeText(panelDraftQuery.value)
  ElMessage.success("当前实际 PromQL 已复制")
}
const formatSummaryPercent = (value: number | null) => (value === null ? "--" : `${value.toFixed(1)}%`)
const toggleFullscreen = async () => {
  if (!document.fullscreenElement) await pageElement.value?.requestFullscreen()
  else await document.exitFullscreen()
}
const handleFullscreenChange = () => {
  isFullscreen.value = Boolean(document.fullscreenElement)
}

watch(
  () => [filterState.job, filterState.labelName],
  ([job, labelName], [previousJob, previousLabelName]) => {
    if (job !== previousJob) {
      filterState.labelName = ""
      filterState.labelValues = []
      filterState.instances = []
    } else if (labelName !== previousLabelName) {
      filterState.labelValues = []
      filterState.instances = []
      if (labelName) filterState.groupByLabel = labelName
    }
  }
)
watch(
  () => filterState.labelValues.join("\u0000"),
  () => {
    const available = new Set(instanceOptions.value.map((target) => target.instance))
    filterState.instances = filterState.instances.filter((instance) => available.has(instance))
  }
)
watch(
  () => JSON.stringify(filterState),
  () => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filterState))
    refreshPanels()
  }
)
watch(rangeSeconds, refreshPanels)
watch(refreshSeconds, resetRefreshTimer)
watch(datasourceId, async (id) => {
  if (id) localStorage.setItem(DATASOURCE_STORAGE_KEY, id)
  await refreshAll()
})

onMounted(() => {
  document.addEventListener("fullscreenchange", handleFullscreenChange)
  reloadDatasources()
  const storedDatasourceId = localStorage.getItem(DATASOURCE_STORAGE_KEY)
  datasourceId.value = enabledDatasources.value.some((item) => item.id === storedDatasourceId)
    ? storedDatasourceId || undefined
    : enabledDatasources.value[0]?.id
  resetRefreshTimer()
})
onBeforeUnmount(() => {
  requestGeneration++
  targetGeneration++
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

.dashboard-toolbar,
.variable-panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.dashboard-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 14px;
  padding: 17px 20px;
}

.title-block {
  min-width: 240px;
}
.title-line,
.toolbar-controls,
.variable-heading > div,
.drawer-footer {
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
.range-select,
.refresh-select {
  width: 140px;
}

.variable-panel {
  padding: 15px 18px 17px;
}
.variable-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 13px;
  color: var(--el-text-color-primary);
  font-size: 13px;
}
.variable-heading span:not(.el-tag__content) {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.variable-grid {
  display: grid;
  align-items: end;
  grid-template-columns:
    minmax(140px, 0.8fr) minmax(140px, 0.8fr) minmax(190px, 1fr) minmax(150px, 0.8fr) minmax(260px, 1.5fr)
    auto;
  gap: 12px;
}
.variable-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.variable-field :deep(.el-select) {
  width: 100%;
}
.clear-filter {
  margin-bottom: 1px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin: 14px 0;
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

.panel-form :deep(.el-select),
.panel-form :deep(.el-input-number) {
  width: 100%;
}
.form-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}
.form-grid--three {
  grid-template-columns: repeat(3, 1fr);
}
.form-help {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.promql-block {
  overflow-x: auto;
  margin: 0 0 8px;
  padding: 13px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.config-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 0 10px;
  color: var(--el-text-color-primary);
  font-size: 14px;
}
.config-row {
  display: grid;
  align-items: center;
  grid-template-columns: 145px 42px 1fr 34px;
  gap: 8px;
  margin-bottom: 9px;
}
.mapping-row {
  grid-template-columns: 130px 1fr 120px 34px;
}
.drawer-footer {
  width: 100%;
}
.drawer-footer span {
  flex: 1;
}

@media (max-width: 1500px) {
  .variable-grid {
    grid-template-columns: repeat(4, minmax(150px, 1fr));
  }
  .variable-field--instances {
    grid-column: span 3;
  }
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
@media (max-width: 768px) {
  .monitor-dashboard {
    padding: 10px;
  }
  .variable-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .variable-grid,
  .form-grid,
  .form-grid--three {
    grid-template-columns: 1fr;
  }
  .variable-field--instances {
    grid-column: auto;
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
