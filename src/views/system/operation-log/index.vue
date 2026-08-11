<template>
  <PageContainer>
    <ManagerHeader
      title="操作日志"
      subtitle="审计账号对模型数据的新增、修改、删除和导入操作，记录默认保留一个月"
      :show-add-button="false"
      @refresh="loadLogs"
    />

    <div class="filter-card">
      <el-form inline @submit.prevent>
        <el-form-item label="账号">
          <el-input v-model="filters.account" clearable placeholder="请输入账号" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="操作模型">
          <el-input
            v-model="filters.operationModel"
            clearable
            placeholder="请输入模型标识"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="filters.operationType" clearable placeholder="全部" style="width: 130px">
            <el-option v-for="item in operationOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="filters.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            :shortcuts="dateShortcuts"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="RefreshLeft" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>

    <DataTable
      v-loading="loading"
      :data="logs"
      :columns="columns"
      :show-pagination="true"
      :total="paginationData.total"
      :page-size="paginationData.pageSize"
      :current-page="paginationData.currentPage"
      :page-sizes="paginationData.pageSizes"
      :pagination-layout="paginationData.layout"
      :action-column-width="110"
      :table-props="{ height: '100%' }"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    >
      <template #operationType="{ row }">
        <el-tag :type="getOperationTag(row.operation_type).type" effect="plain">
          {{ getOperationTag(row.operation_type).label }}
        </el-tag>
      </template>
      <template #operationTime="{ row }">{{ formatDateTime(row.operation_time) }}</template>
      <template #originalData="{ row }">
        <span class="json-cell">{{ compactJson(row.original_data) }}</span>
      </template>
      <template #modifiedData="{ row }">
        <span class="json-cell">{{ compactJson(row.modified_data) }}</span>
      </template>
      <template #actions="{ row }">
        <el-button link type="primary" :icon="View" @click="showDetail(row)">查看数据</el-button>
      </template>
    </DataTable>

    <el-dialog v-model="detailVisible" title="操作数据详情" width="760px" destroy-on-close>
      <el-descriptions v-if="selectedLog" :column="2" border class="detail-summary">
        <el-descriptions-item label="账号">{{ selectedLog.account }}</el-descriptions-item>
        <el-descriptions-item label="操作模型">{{ selectedLog.operation_model }}</el-descriptions-item>
        <el-descriptions-item label="操作类型">
          {{ operationTag[selectedLog.operation_type]?.label || selectedLog.operation_type }}
        </el-descriptions-item>
        <el-descriptions-item label="修改条数">{{ selectedLog.modified_count }}</el-descriptions-item>
      </el-descriptions>
      <el-tabs>
        <el-tab-pane label="原数据">
          <pre>{{ prettyJson(selectedLog?.original_data) }}</pre>
        </el-tab-pane>
        <el-tab-pane label="修改后数据">
          <pre>{{ prettyJson(selectedLog?.modified_data) }}</pre>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </PageContainer>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue"
import { RefreshLeft, Search, View } from "@element-plus/icons-vue"
import { listOperationLogsApi } from "@/api/operation-log"
import type { OperationLog, OperationType } from "@/api/operation-log/types"
import { usePagination } from "@/common/composables/usePagination"
import type { Column } from "@@/components/DataTable/types"
import DataTable from "@@/components/DataTable/index.vue"
import ManagerHeader from "@@/components/ManagerHeader/index.vue"
import PageContainer from "@@/components/PageContainer/index.vue"

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination()
const loading = ref(false)
const logs = ref<OperationLog[]>([])
const detailVisible = ref(false)
const selectedLog = ref<OperationLog>()

const filters = reactive<{
  account: string
  operationModel: string
  operationType: OperationType | ""
  dateRange: [Date, Date] | null
}>({
  account: "",
  operationModel: "",
  operationType: "",
  dateRange: null
})

const operationOptions: Array<{ label: string; value: OperationType }> = [
  { label: "新增", value: "CREATE" },
  { label: "修改", value: "UPDATE" },
  { label: "删除", value: "DELETE" },
  { label: "导入", value: "IMPORT" }
]

const operationTag: Record<OperationType, { label: string; type: "success" | "warning" | "danger" | "primary" }> = {
  CREATE: { label: "新增", type: "success" },
  UPDATE: { label: "修改", type: "warning" },
  DELETE: { label: "删除", type: "danger" },
  IMPORT: { label: "导入", type: "primary" }
}
const getOperationTag = (operationType: OperationType) =>
  operationTag[operationType] || { label: operationType, type: "primary" as const }

const columns: Column[] = [
  { prop: "account", label: "账号", minWidth: 130 },
  { prop: "operation_model", label: "操作模型", minWidth: 140 },
  { prop: "operation_type", label: "操作类型", width: 110, slot: "operationType" },
  { prop: "modified_count", label: "修改条数", width: 110 },
  { prop: "original_data", label: "原数据", minWidth: 220, slot: "originalData", showOverflowTooltip: true },
  { prop: "modified_data", label: "修改后数据", minWidth: 220, slot: "modifiedData", showOverflowTooltip: true },
  { prop: "operation_time", label: "日期", minWidth: 180, slot: "operationTime" }
]

const dateShortcuts = [
  { text: "最近 7 天", value: () => [new Date(Date.now() - 7 * 86400000), new Date()] },
  { text: "最近 30 天", value: () => [new Date(Date.now() - 30 * 86400000), new Date()] }
]

const loadLogs = async () => {
  loading.value = true
  try {
    const { data } = await listOperationLogsApi({
      offset: (paginationData.currentPage - 1) * paginationData.pageSize,
      limit: paginationData.pageSize,
      account: filters.account.trim() || undefined,
      operation_model: filters.operationModel.trim() || undefined,
      operation_type: filters.operationType,
      start_time: filters.dateRange?.[0].toISOString(),
      end_time: filters.dateRange?.[1].toISOString()
    })
    logs.value = data.logs || []
    paginationData.total = data.total
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  if (paginationData.currentPage === 1) loadLogs()
  else paginationData.currentPage = 1
}

const handleReset = () => {
  filters.account = ""
  filters.operationModel = ""
  filters.operationType = ""
  filters.dateRange = null
  handleSearch()
}

const showDetail = (row: OperationLog) => {
  selectedLog.value = row
  detailVisible.value = true
}

const formatDateTime = (value: string) => (value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-")
const compactJson = (value: unknown) => (value == null ? "-" : JSON.stringify(value))
const prettyJson = (value: unknown) => (value == null ? "-" : JSON.stringify(value, null, 2))

watch([() => paginationData.currentPage, () => paginationData.pageSize], loadLogs)
onMounted(loadLogs)
</script>

<style scoped lang="scss">
.filter-card {
  flex-shrink: 0;
  padding: 16px 18px 0;
  margin-bottom: 14px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgb(15 23 42 / 5%);
}

.detail-summary {
  margin-bottom: 16px;
}

pre {
  max-height: 420px;
  padding: 16px;
  margin: 0;
  overflow: auto;
  color: #dbeafe;
  background: #0f172a;
  border-radius: 8px;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.json-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  font-family: Consolas, "Courier New", monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
