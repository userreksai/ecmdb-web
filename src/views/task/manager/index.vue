<template>
  <PageContainer>
    <!-- 头部区域: 遵循标准 Search-in-Actions 模式 -->
    <ManagerHeader title="调度任务管理" subtitle="集中化配置与监控分布式的定时/单次触发业务任务" @refresh="refreshAll">
      <template #actions>
        <div class="header-actions-bar">
          <el-input
            v-model="searchQuery"
            placeholder="搜索任务名称..."
            class="search-input premium-input"
            clearable
            @clear="handleSearch"
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>

          <el-select v-model="typeFilter" placeholder="执行类型" clearable class="type-filter premium-input">
            <el-option label="定期执行" :value="TaskType.RECURRING" />
            <el-option label="单次触发" :value="TaskType.ONE_TIME" />
          </el-select>

          <el-button :type="showAll ? 'primary' : 'default'" :icon="Grid" @click="toggleDisplayMode">
            {{ showAll ? "分类展示" : "全部展示" }}
          </el-button>

          <el-button :icon="FolderOpened" @click="router.push('/task/categories')">分类管理</el-button>

          <el-button type="primary" :icon="Plus" class="action-btn" @click="handleAddClick"> 添加任务 </el-button>

          <el-button type="primary" :icon="RefreshRight" circle class="refresh-btn" @click="fetchTasksData" />
        </div>
      </template>
    </ManagerHeader>

    <div v-if="!showAll" v-loading="categoriesLoading" class="category-filter-panel">
      <div class="category-filter-heading">
        <div>
          <strong>按任务分类展示</strong>
          <span>选择分类查看对应的调度任务</span>
        </div>
        <span class="category-total">{{ categoryCards.length }} 个分组</span>
      </div>
      <div class="category-card-list">
        <button
          v-for="category in categoryCards"
          :key="category.id"
          type="button"
          class="category-card"
          :class="{ 'is-active': selectedCategoryId === category.id }"
          @click="selectCategory(category.id)"
        >
          <span class="category-card__icon"
            ><el-icon><FolderOpened /></el-icon
          ></span>
          <span class="category-card__content">
            <span class="category-card__name">{{ category.name }}</span>
            <span class="category-card__description">{{ category.description }}</span>
          </span>
          <span class="category-card__count">{{ category.task_count }}</span>
        </button>
      </div>
    </div>

    <!-- 数据列表 -->
    <DataTable
      v-loading="loading"
      :data="filteredTasks"
      :columns="tableColumns"
      :show-selection="false"
      :show-pagination="true"
      :total="paginationData.total"
      :page-size="paginationData.pageSize"
      :current-page="paginationData.currentPage"
      :page-sizes="paginationData.pageSizes"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    >
      <!-- 任务名称 -->
      <template #name="{ row }">
        <div class="minimal-name-info">
          <span class="main-title">{{ formatTaskName(row.name).title }}</span>
        </div>
      </template>

      <template #category_name="{ row }">
        <el-tag v-if="row.category_name" type="primary" effect="light" round>{{ row.category_name }}</el-tag>
        <el-tag v-else type="info" effect="plain" round>未分类</el-tag>
      </template>

      <!-- 类型 -->
      <template #type="{ row }">
        <el-tag :type="row.type === TaskType.RECURRING ? 'primary' : 'warning'" size="small">
          {{ row.type === TaskType.RECURRING ? "周期性任务" : "单次触发任务" }}
        </el-tag>
      </template>

      <!-- 下次运行 -->
      <template #next_time="{ row }">
        <span v-if="row.next_time" class="code-font next-time-text">
          {{ formatTimestamp(row.next_time) }}
        </span>
        <span v-else>-</span>
      </template>

      <!-- 状态列 -->
      <template #status="{ row }">
        <div class="minimal-status" :class="getStatusType(row.status)">
          <span class="dot" />
          <span class="text">{{ getStatusLabel(row.status) }}</span>
        </div>
      </template>

      <!-- 操作插槽 -->
      <template #actions="{ row }">
        <OperateBtn :items="getOperateItems(row)" :operate-item="row" :max-length="2" @route-event="handleAction" />
      </template>
    </DataTable>

    <!-- 核心表单抽屉 -->
    <TaskFormDrawer
      v-if="formVisible"
      v-model="formVisible"
      :is-edit="!!currentEditId"
      :initial-data="currentEditData"
      @save="handleFormSave"
    />

    <!-- 运行历史与日志弹窗 -->
    <TaskExecutionDialog v-if="logVisible" v-model="logVisible" :task-id="logTaskId" :task-name="logTaskName" />
  </PageContainer>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, markRaw } from "vue"
import { useRouter } from "vue-router"
import {
  Search,
  Plus,
  RefreshRight,
  VideoPause,
  VideoPlay,
  Monitor,
  Edit,
  Delete,
  FolderOpened,
  Grid
} from "@element-plus/icons-vue"
import PageContainer from "@@/components/PageContainer/index.vue"
import ManagerHeader from "@@/components/ManagerHeader/index.vue"
import DataTable from "@@/components/DataTable/index.vue"
import OperateBtn from "@@/components/OperateBtn/index.vue"
import TaskFormDrawer from "./components/TaskFormDrawer.vue"
import TaskExecutionDialog from "./components/TaskExecutionDialog.vue"
import {
  TaskType,
  TaskStatus,
  type TaskItem,
  type CreateTaskReq,
  type UpdateTaskReq,
  type TaskCategory
} from "@/api/etask/manager/type"
import { listTaskCategoriesApi } from "@/api/etask/manager"
import { useTaskManager } from "./composables/useTaskManager"
import type { Column } from "@@/components/DataTable/types"
import { formatTimestamp } from "@@/utils/day"

const {
  loading,
  tasksData,
  searchQuery,
  categoryFilter,
  paginationData,
  fetchTasksData,
  handleCreateTask,
  handleUpdateTask,
  handleDeleteTask,
  fetchTaskDetail,
  handleRunTask,
  handleStopTask,
  handleCurrentChange,
  handleSizeChange
} = useTaskManager()

const router = useRouter()

const typeFilter = ref<string | null>(null)
const categories = ref<TaskCategory[]>([])
const uncategorizedCount = ref(0)
const categoriesLoading = ref(false)
const showAll = ref(false)
const selectedCategoryId = ref(0)
const categoryInitialized = ref(false)

const categoryCards = computed(() => [
  ...categories.value,
  {
    id: 0,
    name: "未分类",
    description: "尚未划分项目的调度任务",
    task_count: uncategorizedCount.value,
    ctime: 0,
    utime: 0
  }
])

const fetchCategories = async () => {
  categoriesLoading.value = true
  try {
    const res = await listTaskCategoriesApi()
    categories.value = res.data.categories || []
    uncategorizedCount.value = res.data.uncategorized_count || 0
    const selectedStillExists =
      selectedCategoryId.value === 0 || categories.value.some((category) => category.id === selectedCategoryId.value)
    if (!categoryInitialized.value || !selectedStillExists) {
      selectedCategoryId.value =
        categories.value.find((category) => category.task_count > 0)?.id || categories.value[0]?.id || 0
    }
    categoryInitialized.value = true
    if (!showAll.value) categoryFilter.value = selectedCategoryId.value
  } finally {
    categoriesLoading.value = false
  }
}

const selectCategory = async (categoryId: number) => {
  selectedCategoryId.value = categoryId
  categoryFilter.value = categoryId
  paginationData.currentPage = 1
  await fetchTasksData()
}

const toggleDisplayMode = async () => {
  showAll.value = !showAll.value
  categoryFilter.value = showAll.value ? undefined : selectedCategoryId.value
  paginationData.currentPage = 1
  await fetchTasksData()
}

const handleSearch = async () => {
  paginationData.currentPage = 1
  await fetchTasksData()
}

const refreshAll = async () => {
  await fetchCategories()
  await fetchTasksData()
}

// 过滤后的数据逻辑 (前端组合过滤)
const filteredTasks = computed(() => {
  if (!typeFilter.value) return tasksData.value
  return tasksData.value.filter((t) => t.type === typeFilter.value)
})

const tableColumns: Column[] = [
  { prop: "name", label: "任务名称", slot: "name", align: "center" },
  { prop: "category_name", label: "任务分类", slot: "category_name", align: "center" },
  { prop: "status", label: "状态", slot: "status", align: "center" },
  { prop: "type", label: "类型", slot: "type", align: "center" },
  { prop: "cron_expr", label: "调度周期", align: "center" },
  { prop: "next_time", label: "下次运行时间", slot: "next_time", align: "center" }
]

// 格式化任务名称
const formatTaskName = (name: string) => {
  const parts = name.split("_")
  if (parts.length > 1) {
    return { title: parts[0], sub: parts.slice(1).join("_") }
  }
  return { title: name, sub: "" }
}

// --- 状态与语义化配置 ---
const STATUS_META: Record<TaskStatus, { label: string; type: string }> = {
  [TaskStatus.COMPLETED]: { label: "已完成", type: "success" },
  [TaskStatus.ACTIVE]: { label: "等待调度", type: "primary" },
  [TaskStatus.INACTIVE]: { label: "停止执行", type: "info" },
  [TaskStatus.PREEMPTED]: { label: "已抢占", type: "warning" }
}

const getStatusType = (status: TaskStatus) => STATUS_META[status]?.type || "info"
const getStatusLabel = (status: TaskStatus) => STATUS_META[status]?.label || status

const formVisible = ref(false)
const currentEditId = ref<number | null>(null)
const currentEditData = ref<TaskItem | null>(null)

const logVisible = ref(false)
const logTaskId = ref<number>(0)
const logTaskName = ref<string>("")

const getOperateItems = (row: TaskItem) => {
  const items = []
  if (row.status === TaskStatus.ACTIVE) {
    items.push({ name: "停止", code: "stop", type: "warning", icon: markRaw(VideoPause) })
  } else {
    items.push({ name: "执行", code: "run", type: "success", icon: markRaw(VideoPlay) })
  }
  items.push({ name: "记录", code: "logs", type: "info", icon: markRaw(Monitor) })
  items.push({ name: "编辑", code: "edit", type: "primary", icon: markRaw(Edit) })
  items.push({ name: "删除", code: "delete", type: "danger", icon: markRaw(Delete) })
  return items
}

const handleAddClick = () => {
  currentEditId.value = null
  currentEditData.value = null
  formVisible.value = true
}

const handleAction = async (row: TaskItem, code: string) => {
  if (code === "edit") {
    const detail = await fetchTaskDetail(row.id)
    if (detail) {
      currentEditId.value = row.id
      currentEditData.value = JSON.parse(JSON.stringify(detail))
      formVisible.value = true
    }
  } else if (code === "run") {
    handleRunTask(row.id)
  } else if (code === "stop") {
    handleStopTask(row.id)
  } else if (code === "logs") {
    logTaskId.value = row.id
    logTaskName.value = row.name
    logVisible.value = true
  } else if (code === "delete") {
    await handleDeleteTask(row.id)
    await fetchCategories()
  }
}

const handleFormSave = async (data: CreateTaskReq) => {
  let success = false
  if (currentEditId.value) {
    success = await handleUpdateTask({ ...data, id: currentEditId.value } as UpdateTaskReq)
  } else {
    success = await handleCreateTask(data)
  }
  if (success) {
    formVisible.value = false
    await fetchCategories()
  }
}

onMounted(async () => {
  await fetchCategories()
  await fetchTasksData()
})
</script>

<style scoped lang="scss">
.header-actions-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  .search-input {
    width: 220px;
  }
  .type-filter {
    width: 120px;
  }
}
.category-filter-panel {
  margin-bottom: 16px;
  padding: 18px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
}
.category-filter-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  color: #0f172a;

  > div {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }

  strong {
    font-size: 14px;
  }

  span {
    color: #94a3b8;
    font-size: 12px;
  }
}
.category-total {
  padding: 4px 9px;
  border-radius: 999px;
  background: #f1f5f9;
}
.category-card-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}
.category-card {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  color: inherit;
  text-align: left;
  background: #fff;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    border-color: #93c5fd;
    background: #f8fbff;
  }

  &.is-active {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgb(59 130 246 / 10%);
    background: #eff6ff;
  }
}
.category-card__icon {
  display: grid;
  flex: 0 0 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  color: #2563eb;
  background: #dbeafe;
}
.category-card__content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}
.category-card__name,
.category-card__description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.category-card__name {
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
}
.category-card__description {
  color: #94a3b8;
  font-size: 11px;
}
.category-card__count {
  display: grid;
  min-width: 28px;
  height: 24px;
  place-items: center;
  padding: 0 7px;
  border-radius: 999px;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 700;
  background: #dbeafe;
}
.minimal-name-info {
  display: flex;
  align-items: center;
  justify-content: center;
  .main-title {
    font-weight: 600;
    font-size: 14px;
    color: #0f172a;
  }
}
.next-time-text {
  font-size: 12px;
  color: #7c3aed;
  font-weight: 600;
}
.minimal-status {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: center;
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .text {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }
  &.success {
    .dot {
      background: #10b981;
    }
    .text {
      color: #059669;
    }
  }
  &.primary {
    .dot {
      background: #3b82f6;
    }
    .text {
      color: #2563eb;
    }
  }
  &.danger {
    .dot {
      background: #ef4444;
    }
    .text {
      color: #dc2626;
    }
  }
  &.warning {
    .dot {
      background: #f59e0b;
    }
    .text {
      color: #d97706;
    }
  }
  &.info {
    .dot {
      background: #94a3b8;
    }
    .text {
      color: #475569;
    }
  }
}
.code-font {
  font-family: var(--el-font-family-mono);
}
:deep(.el-table__row):hover {
  background: #f8fafc !important;
}
.premium-input :deep(.el-input__wrapper),
.premium-input :deep(.el-select__wrapper) {
  border-radius: 8px !important;
  border: 1px solid #d1d5db !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
  background: #fff;
  &:hover {
    border-color: #9ca3af !important;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08) !important;
  }
  &.is-focus {
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12) !important;
  }
}
</style>
