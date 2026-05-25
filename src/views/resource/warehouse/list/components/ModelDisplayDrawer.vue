<template>
  <el-drawer
    v-model="visible"
    :title="drawerTitle"
    size="88%"
    direction="rtl"
    class="model-display-drawer"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <div class="display-list">
      <div class="display-toolbar">
        <div class="model-summary">
          <div class="model-title">{{ modelName || modelUid }}</div>
          <div class="model-subtitle">
            <span>{{ modelUid }}</span>
            <span>{{ paginationData.total }} 条数据</span>
            <span>已展示 {{ visibleColumns.length }} / {{ sortedFields.length }} 列</span>
          </div>
        </div>
        <div class="toolbar-actions">
          <el-input
            v-model="searchKeyword"
            clearable
            class="display-search"
            placeholder="搜索当前模型"
            :prefix-icon="Search"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
          <el-button type="primary" :icon="Search" :loading="loading" @click="handleSearch">查询</el-button>
          <el-button :icon="Setting" @click="openColumnDialog">展示列</el-button>
          <el-button :icon="RefreshRight" :loading="loading" @click="fetchResources">刷新</el-button>
        </div>
      </div>

      <el-table
        v-loading="loading"
        :data="resources"
        stripe
        border
        height="calc(100vh - 270px)"
        :fit="false"
        class="display-table"
        empty-text="暂无数据"
      >
        <el-table-column type="index" label="#" width="64" fixed align="center" />
        <el-table-column
          v-for="field in visibleColumns"
          :key="field.field_uid"
          :prop="`data.${field.field_uid}`"
          :label="field.field_name || field.field_uid"
          :width="getColumnWidth(field)"
          align="left"
        >
          <template #default="{ row }">
            <div class="cell-content" :class="{ expanded: isCellExpanded(row, field) }">
              <span class="cell-text">{{ getCellText(row, field) }}</span>
              <el-button
                v-if="isLongCell(row, field)"
                text
                size="small"
                class="cell-toggle"
                @click.stop="toggleCell(row, field)"
              >
                <el-icon>
                  <component :is="isCellExpanded(row, field) ? ArrowUp : ArrowDown" />
                </el-icon>
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="display-pagination">
        <el-pagination
          background
          :layout="paginationData.layout"
          :page-sizes="paginationData.pageSizes"
          :total="paginationData.total"
          :page-size="paginationData.pageSize"
          :current-page="paginationData.currentPage"
          @size-change="handleDisplaySizeChange"
          @current-change="handleDisplayCurrentChange"
        />
      </div>
    </div>

    <el-dialog v-model="columnDialogVisible" title="展示列" width="560px" append-to-body>
      <div class="column-dialog">
        <div class="column-dialog-header">
          <el-checkbox
            v-model="checkAll"
            :indeterminate="isIndeterminate"
            @change="(value) => handleCheckAllChange(Boolean(value))"
          >
            全选
          </el-checkbox>
          <span>{{ draftColumnUids.length }} / {{ sortedFields.length }}</span>
        </div>
        <el-checkbox-group v-model="draftColumnUids" class="column-options" @change="handleColumnDraftChange">
          <el-checkbox v-for="field in sortedFields" :key="field.field_uid" :value="field.field_uid">
            <span class="column-name">{{ field.field_name || field.field_uid }}</span>
            <code>{{ field.field_uid }}</code>
          </el-checkbox>
        </el-checkbox-group>
      </div>
      <template #footer>
        <el-button @click="columnDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmColumns">确定</el-button>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, watch } from "vue"
import { ArrowDown, ArrowUp, RefreshRight, Search, Setting } from "@element-plus/icons-vue"
import { ElMessage } from "element-plus"
import { listResourceApi, searchModelResourceApi } from "@/api/resource"
import type { Resource } from "@/api/resource/types/resource"
import type { Attribute } from "@/api/attribute/types/attribute"

const props = defineProps<{
  modelValue: boolean
  modelUid: string
  modelName: string
  modelFields: Attribute[]
}>()

const emit = defineEmits<{
  "update:modelValue": [value: boolean]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit("update:modelValue", value)
})

const loading = ref(false)
const resources = ref<Resource[]>([])
const selectedColumnUids = ref<string[]>([])
const draftColumnUids = ref<string[]>([])
const columnDialogVisible = ref(false)
const expandedCells = ref<Set<string>>(new Set())
const checkAll = ref(false)
const isIndeterminate = ref(false)
const searchKeyword = ref("")

const paginationData = reactive({
  total: 0,
  currentPage: 1,
  pageSizes: [20, 30, 50, 100],
  pageSize: 20,
  layout: "total, sizes, prev, pager, next, jumper"
})

const drawerTitle = computed(() => `展示列表 - ${props.modelName || props.modelUid}`)

const sortedFields = computed(() => {
  return [...props.modelFields].sort((a, b) => {
    const indexA = a.index ?? 100
    const indexB = b.index ?? 100
    if (indexA !== indexB) return indexA - indexB
    return a.id - b.id
  })
})

const visibleColumns = computed(() => {
  const selected = new Set(selectedColumnUids.value)
  return sortedFields.value.filter((field) => selected.has(field.field_uid))
})

const storageKey = computed(() => `ecmdb:model-display-columns:${props.modelUid}`)

const initializeColumns = () => {
  const allFieldUids = sortedFields.value.map((field) => field.field_uid).filter(Boolean)
  if (allFieldUids.length === 0) {
    selectedColumnUids.value = []
    return
  }

  let stored: string[] = []
  try {
    stored = JSON.parse(localStorage.getItem(storageKey.value) || "[]")
  } catch {
    stored = []
  }

  const usableStored = stored.filter((fieldUid) => allFieldUids.includes(fieldUid))
  selectedColumnUids.value = usableStored.length > 0 ? usableStored : allFieldUids
  syncDraftState()
}

const syncDraftState = () => {
  draftColumnUids.value = [...selectedColumnUids.value]
  syncCheckState()
}

const syncCheckState = () => {
  const checkedCount = draftColumnUids.value.length
  checkAll.value = sortedFields.value.length > 0 && checkedCount === sortedFields.value.length
  isIndeterminate.value = checkedCount > 0 && checkedCount < sortedFields.value.length
}

const openColumnDialog = () => {
  syncDraftState()
  columnDialogVisible.value = true
}

const handleColumnDraftChange = () => {
  syncCheckState()
}

const handleCheckAllChange = (value: boolean) => {
  draftColumnUids.value = value ? sortedFields.value.map((field) => field.field_uid) : []
  syncCheckState()
}

const confirmColumns = () => {
  if (draftColumnUids.value.length === 0) {
    ElMessage.warning("至少选择一列")
    return
  }

  selectedColumnUids.value = [...draftColumnUids.value]
  localStorage.setItem(storageKey.value, JSON.stringify(selectedColumnUids.value))
  paginationData.currentPage = 1
  expandedCells.value = new Set()
  columnDialogVisible.value = false
  fetchResources()
}

const fetchResources = async () => {
  if (!props.modelUid) return

  loading.value = true
  try {
    const requestFields = selectedColumnUids.value.length > 0 ? selectedColumnUids.value : undefined
    const params = {
      model_uid: props.modelUid,
      offset: (paginationData.currentPage - 1) * paginationData.pageSize,
      limit: paginationData.pageSize,
      fields: requestFields
    }
    const keyword = searchKeyword.value.trim()
    const { data } = keyword
      ? await searchModelResourceApi({
          ...params,
          keyword
        })
      : await listResourceApi(params)
    resources.value = data.resources || []
    paginationData.total = data.total || 0
  } catch (error) {
    resources.value = []
    ElMessage.error("获取展示列表失败")
    console.error("fetch display resources failed:", error)
  } finally {
    loading.value = false
  }
}

const handleOpened = () => {
  initializeColumns()
  fetchResources()
}

const handleClosed = () => {
  expandedCells.value = new Set()
}

const handleSearch = () => {
  paginationData.currentPage = 1
  expandedCells.value = new Set()
  fetchResources()
}

const handleDisplaySizeChange = (size: number) => {
  paginationData.pageSize = size
  paginationData.currentPage = 1
  expandedCells.value = new Set()
  fetchResources()
}

const handleDisplayCurrentChange = (page: number) => {
  paginationData.currentPage = page
  expandedCells.value = new Set()
  fetchResources()
}

const getColumnWidth = (field: Attribute) => {
  const nameLength = (field.field_name || field.field_uid).length
  return Math.max(160, Math.min(280, nameLength * 18 + 96))
}

const getCellKey = (row: Resource, field: Attribute) => `${row.id}:${field.field_uid}`

const getRawCellValue = (row: Resource, field: Attribute) => {
  if (field.field_uid === "name") {
    return row.data?.name ?? row.name
  }
  return row.data?.[field.field_uid]
}

const getCellText = (row: Resource, field: Attribute) => {
  const value = getRawCellValue(row, field)
  if (value === undefined || value === null || value === "") return "-"

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          return item.name || item.url || JSON.stringify(item)
        }
        return String(item)
      })
      .join("，")
  }

  if (typeof value === "object") {
    return JSON.stringify(value)
  }

  return String(value)
}

const isLongCell = (row: Resource, field: Attribute) => {
  const text = getCellText(row, field)
  return text.length > 72 || text.includes("\n")
}

const isCellExpanded = (row: Resource, field: Attribute) => {
  return expandedCells.value.has(getCellKey(row, field))
}

const toggleCell = (row: Resource, field: Attribute) => {
  const next = new Set(expandedCells.value)
  const key = getCellKey(row, field)
  if (next.has(key)) {
    next.delete(key)
  } else {
    next.add(key)
  }
  expandedCells.value = next
}

watch(
  () => props.modelUid,
  () => {
    paginationData.currentPage = 1
    resources.value = []
    expandedCells.value = new Set()
    searchKeyword.value = ""
    initializeColumns()
    if (visible.value) fetchResources()
  }
)

watch(
  () => props.modelFields,
  () => {
    initializeColumns()
    if (visible.value) fetchResources()
  },
  { deep: true }
)
</script>

<style lang="scss" scoped>
.display-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.display-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 0 14px;
}

.model-summary {
  min-width: 0;
}

.model-title {
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  line-height: 1.4;
}

.model-subtitle {
  margin-top: 4px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: #6b7280;
  font-size: 12px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.display-search {
  width: 260px;
}

.display-table {
  flex: 1;
  min-height: 0;
  width: 100%;

  :deep(.el-table__body-wrapper) {
    overflow-x: auto;
  }

  :deep(.cell) {
    line-height: 1.5;
  }
}

.cell-content {
  position: relative;
  min-height: 22px;
  color: #374151;
}

.cell-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
  white-space: pre-wrap;
}

.cell-content.expanded .cell-text {
  display: block;
  max-height: none;
}

.cell-toggle {
  margin-top: 2px;
  padding: 0;
  height: 18px;
}

.display-pagination {
  padding-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.column-dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.column-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #6b7280;
  font-size: 13px;
}

.column-options {
  max-height: 360px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 12px;
}

.column-options :deep(.el-checkbox) {
  height: auto;
  margin-right: 0;
  align-items: flex-start;
}

.column-name {
  display: inline-block;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}

code {
  margin-left: 6px;
  font-size: 11px;
  color: #64748b;
}

@media (max-width: 900px) {
  .display-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .toolbar-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .display-search {
    width: min(100%, 320px);
  }

  .column-options {
    grid-template-columns: 1fr;
  }
}
</style>
