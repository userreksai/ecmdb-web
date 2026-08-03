<template>
  <div class="resource-list">
    <ManagerHeader
      title="资源管理"
      subtitle="管理仓库中的资源数据"
      add-button-text="新增资源"
      :show-back-button="true"
      :show-add-button="false"
      :show-refresh-button="false"
      @add="handlerCreate"
      @refresh="handleRefreshResources"
      @back="goBack"
    >
      <template #details>
        <div class="model-identity">
          <div class="identity-badge">
            <span class="badge-label">模型标识</span>
            <code class="identity-code">{{ modelUid }}</code>
          </div>
          <div class="model-name-section">
            <h2 class="model-name">{{ modelName }}</h2>
          </div>
        </div>
      </template>

      <!-- 自定义操作按钮 -->
      <template #actions>
        <div class="header-actions-bar">
          <el-input
            v-model="searchKeyword"
            clearable
            class="resource-search"
            placeholder="搜索当前模型"
            :prefix-icon="Search"
            @keyup.enter="handleSearch"
            @clear="handleSearch"
          />
          <el-button type="primary" :icon="Search" :loading="loading" class="action-btn" @click="handleSearch">
            查询
          </el-button>

          <el-button :icon="Download" :loading="exporting" class="action-btn" @click="handleExportTemplate">
            导出模板
          </el-button>
          <el-button type="success" :icon="Upload" class="action-btn" @click="handleShowImportDialog">
            导入数据
          </el-button>
          <el-button type="warning" :icon="Download" class="action-btn" @click="handleShowExportDialog">
            导出数据
          </el-button>

          <el-divider direction="vertical" />

          <el-button
            type="warning"
            :icon="Edit"
            :disabled="selectedResourceIds.length === 0"
            class="action-btn"
            @click="handleShowBatchUpdate"
          >
            批量修改
          </el-button>
          <el-button type="primary" :icon="CirclePlus" class="action-btn" @click="handlerCreate">新增资源</el-button>
          <el-button type="primary" :icon="View" class="action-btn" @click="handleShowDisplayList">展示列表</el-button>
          <el-button type="primary" :icon="RefreshRight" circle class="refresh-btn" @click="handleRefreshResources" />
        </div>
      </template>
    </ManagerHeader>

    <DataTable
      ref="dataTableRef"
      v-loading="loading"
      :data="resourcesData"
      :columns="tableColumns"
      :show-selection="true"
      :reserve-selection="true"
      :show-pagination="true"
      :total="paginationData.total"
      :page-size="paginationData.pageSize"
      :current-page="paginationData.currentPage"
      :page-sizes="paginationData.pageSizes"
      :pagination-layout="paginationData.layout"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
      @selection-change="handleSelectionChange"
    >
      <!-- 动态字段列插槽 -->
      <template v-for="item in displayFileds" :key="item.id" #[`data.${item.field_uid}`]="{ row }">
        <template v-if="item.secure">
          <SecureFieldView
            :content="row.data[item.field_uid]"
            :is-displaying="!!row.data[`${item.field_uid}_secure_display`]"
            :copy-only="true"
            @view-click="handleSecureClick(row, item)"
            @display-change="(isDisplaying) => handleSecureDisplayChange(row, item, isDisplaying)"
            @copy="(content) => handleCopySecureContent(content, row.id)"
          />
        </template>
        <template v-else-if="item.link">
          <el-button type="text" @click="openNewPage(row.data[item.field_uid])">
            {{ row.data[item.field_uid] }}
          </el-button>
        </template>
        <template v-else-if="item.field_type === 'file'">
          <TableFileUpload
            :model-value="Array.isArray(row.data[item.field_uid]) ? row.data[item.field_uid] : []"
            @update:model-value="(val) => (row.data[item.field_uid] = val)"
            :field-uid="item.field_uid"
            :row="row"
            :limit="5"
            @upload-success="handleUploadSuccess"
            @upload-error="handleUploadError"
            @remove-success="handleRemoveSuccess"
            @remove-error="handleRemoveError"
            @preview="handlePreview"
          />
        </template>
        <template v-else>
          {{ row.data[item.field_uid] }}
        </template>
      </template>

      <!-- 操作列插槽 -->
      <template #actions="{ row }">
        <OperateBtn :items="operateBtnItems" @routeEvent="handleOperateEvent" :operateItem="row" :maxLength="2" />
      </template>

      <template #pagination-left>
        <div class="selection-summary">
          <span>
            已选择
            <strong>{{ selectedResourceIds.length }}</strong>
            条
          </span>
          <el-tag v-if="allMatchingResourcesSelected" type="success" effect="light" round>
            已选择全部 {{ paginationData.total }} 条结果
          </el-tag>
          <el-button
            v-else-if="paginationData.total > selectedResourceIds.length"
            link
            type="primary"
            :loading="selectingAllResources"
            :disabled="loading"
            @click="selectAllMatchingResources"
          >
            选择全部 {{ paginationData.total }} 条
          </el-button>
          <el-button v-if="selectedResourceIds.length > 0" link type="primary" @click="clearResourceSelection">
            清空
          </el-button>
        </div>
      </template>
    </DataTable>
    <!-- 新增或编辑资源 -->
    <Drawer
      v-model="drawerVisible"
      :title="title"
      subtitle="配置资源的基本信息和属性"
      size="40%"
      direction="rtl"
      :header-icon="Setting"
      :show-footer="true"
      cancel-button-text="取消"
      confirm-button-text="保存"
      @cancel="onClosed"
      @confirm="handleCreate"
      @closed="onClosed"
    >
      <Form
        ref="apiRef"
        :attributeFiledsData="attributeFiledsData"
        :attributeGroupsData="attributeGroupsData"
        :modelUid="modelUid"
        @list="listResourceByModelUid"
        @closed="onClosed"
      />
    </Drawer>

    <!-- 导入数据抽屉 -->
    <DataImportDrawer
      v-model="importDialogVisible"
      :model-uid="modelUid"
      :model-name="modelName"
      @import-success="handleImportSuccess"
    />

    <!-- 导出数据抽屉 -->
    <DataExportDrawer
      v-model="exportDialogVisible"
      :model-uid="modelUid"
      :model-name="modelName"
      :model-fields="exportFields"
      :selected-ids="selectedResourceIds"
      :current-ids="currentResourceIds"
    />

    <ModelDisplayDrawer
      v-model="displayListVisible"
      :model-uid="modelUid"
      :model-name="modelName"
      :model-fields="attributeFiledsData"
    />

    <el-dialog
      v-model="batchDialogVisible"
      title="批量修改字段"
      width="520px"
      :close-on-click-modal="!batchSubmitting"
      :close-on-press-escape="!batchSubmitting"
      :show-close="!batchSubmitting"
      @closed="handleBatchDialogClosed"
    >
      <div class="batch-dialog-summary">
        本次将修改 <strong>{{ selectedResourceIds.length }}</strong> 条数据，每条数据只更新所选字段。
      </div>

      <el-alert
        title="为避免绕过后端加密和文件处理逻辑，加密字段与文件字段暂不支持批量修改。"
        type="warning"
        :closable="false"
        show-icon
        class="batch-field-alert"
      />

      <el-form ref="batchFormRef" :model="batchForm" :rules="batchFormRules" label-position="top">
        <el-form-item label="要修改的字段" prop="fieldUid">
          <el-select v-model="batchForm.fieldUid" placeholder="请选择模型字段" filterable class="batch-field-control">
            <el-option
              v-for="field in batchEditableFields"
              :key="field.field_uid"
              :label="field.field_name"
              :value="field.field_uid"
            >
              <span>{{ field.field_name }}</span>
              <span class="batch-field-meta">{{ field.field_uid }}</span>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="新的字段值" prop="value">
          <el-select
            v-if="selectedBatchField?.field_type === 'list'"
            v-model="batchForm.value"
            placeholder="请选择新的字段值"
            filterable
            class="batch-field-control"
          >
            <el-option
              v-for="option in selectedBatchField.option || []"
              :key="option"
              :label="option"
              :value="option"
            />
          </el-select>
          <el-input
            v-else
            v-model="batchForm.value"
            :type="selectedBatchField?.field_type === 'multiline' ? 'textarea' : 'text'"
            :rows="4"
            placeholder="请输入新的字段值"
            clearable
          />
        </el-form-item>
      </el-form>

      <div v-if="batchSubmitting" class="batch-progress">
        <el-progress :percentage="batchProgressPercent" :stroke-width="10" />
        <span>已处理 {{ batchProgressCompleted }} / {{ batchProgressTotal }} 条</span>
      </div>

      <template #footer>
        <el-button :disabled="batchSubmitting" @click="batchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="batchSubmitting" @click="handleBatchUpdate">确认修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref, watch, h, nextTick, computed, markRaw } from "vue"
import { useRoute } from "vue-router"
import { type Attribute } from "@/api/attribute/types/attribute"
import { getModelAttributesWithGroupsApi } from "@/api/attribute"
import {
  listResourceApi,
  searchModelResourceApi,
  deleteResourceApi,
  findSecureData,
  setCustomFieldApi
} from "@/api/resource"
import { type Resource } from "@/api/resource/types/resource"
import {
  CirclePlus,
  Edit,
  Delete,
  View,
  Setting,
  Download,
  Upload,
  RefreshRight,
  Search
} from "@element-plus/icons-vue"
import { usePagination } from "@/common/composables/usePagination"
import ManagerHeader from "@@/components/ManagerHeader/index.vue"
import DataTable from "@@/components/DataTable/index.vue"
import OperateBtn from "@@/components/OperateBtn/index.vue"
import { Drawer } from "@@/components/Dialogs"
import { ElMessage, ElMessageBox, type FormInstance, type FormRules, type UploadUserFile } from "element-plus"
import router from "@/router"

import Form from "./form.vue"
import TableFileUpload from "./components/TableFileUpload/index.vue"
import SecureFieldView from "@/common/components/SecureFieldView/index.vue"
import DataImportDrawer from "./components/DataImportDrawer.vue"
import DataExportDrawer from "./components/DataExportDrawer.vue"
import ModelDisplayDrawer from "./components/ModelDisplayDrawer.vue"
import { useDataIO } from "@/common/composables/useDataIO"

const { paginationData, handleCurrentChange, handleSizeChange } = usePagination()
const route = useRoute()
const modelUid = computed(() => (route.query.uid as string) || "")
const modelName = computed(() => (route.query.name as string) || "")
const attributeFiledsData = ref<Attribute[]>([])
const attributeGroupsData = ref<any[]>([]) // 存储分组数据
const displayFileds = ref<Attribute[]>([])
const drawerVisible = ref<boolean>(false)
const loading = ref(false)
const searchKeyword = ref("")
const activeSearchKeyword = ref("")

const title = ref<string>("")

// 导入导出功能
const { exporting, exportTemplate } = useDataIO()
const importDialogVisible = ref(false)
const exportDialogVisible = ref(false)
const displayListVisible = ref(false)
const dataTableRef = ref<InstanceType<typeof DataTable>>()

// 导出模板
const handleExportTemplate = async () => {
  await exportTemplate(modelUid.value, modelName.value)
}

// 显示导入对话框
const handleShowImportDialog = () => {
  importDialogVisible.value = true
}

// 显示导出对话框
const handleShowExportDialog = () => {
  exportDialogVisible.value = true
}

const handleShowDisplayList = async () => {
  await listAttributeFields()
  displayListVisible.value = true
}

const handleRefreshResources = () => {
  listAttributeFields()
  listResourceByModelUid()
}

// 导入成功后刷新列表
const handleImportSuccess = (_count: number) => {
  listResourceByModelUid()
}

// 导出字段列表 (转换为 DataExportDrawer 需要的格式)
const exportFields = computed(() => {
  return attributeFiledsData.value
    .filter((attr) => attr.field_type !== "file") // 过滤掉 file 类型
    .map((attr) => ({
      id: attr.field_uid,
      name: attr.field_name,
      type: attr.field_type,
      options: attr.option // 传递 options 数据(用于 list 类型)
    }))
})

// 跨页保存已选 ID，避免服务端分页时切页丢失勾选状态
const selectedResourceIdSet = ref<Set<number>>(new Set())
const selectedResourceIds = computed(() => Array.from(selectedResourceIdSet.value))
const selectingAllResources = ref(false)
const syncingTableSelection = ref(false)
const allMatchingResourcesSelected = computed(
  () => paginationData.total > 0 && selectedResourceIds.value.length === paginationData.total
)
// 当前页数据 ID 列表
const currentResourceIds = computed(() => resourcesData.value.map((r) => r.id))

// 处理选择变化
const handleSelectionChange = (selection: Resource[]) => {
  if (syncingTableSelection.value) return

  const nextSelectedIds = new Set(selectedResourceIdSet.value)
  resourcesData.value.forEach((resource) => nextSelectedIds.delete(resource.id))
  selection.forEach((resource) => nextSelectedIds.add(resource.id))
  selectedResourceIdSet.value = nextSelectedIds
}

const syncCurrentPageSelection = async () => {
  await nextTick()
  syncingTableSelection.value = true
  dataTableRef.value?.setSelection(
    resourcesData.value.filter((resource) => selectedResourceIdSet.value.has(resource.id))
  )
  await nextTick()
  syncingTableSelection.value = false
}

const clearResourceSelection = () => {
  selectedResourceIdSet.value = new Set()
  dataTableRef.value?.clearSelection()
}

const selectAllMatchingResources = async () => {
  if (!modelUid.value || paginationData.total === 0 || selectingAllResources.value) return

  selectingAllResources.value = true
  const params = {
    model_uid: modelUid.value,
    offset: 0,
    limit: paginationData.total
  }

  try {
    const { data } = activeSearchKeyword.value
      ? await searchModelResourceApi({ ...params, keyword: activeSearchKeyword.value })
      : await listResourceApi(params)
    const allResources = data.resources || []
    selectedResourceIdSet.value = new Set(allResources.map((resource) => resource.id))
    await syncCurrentPageSelection()

    if (selectedResourceIds.value.length === paginationData.total) {
      ElMessage.success(`已选择全部 ${paginationData.total} 条结果`)
    } else {
      ElMessage.warning(
        `应选择 ${paginationData.total} 条，实际获取到 ${selectedResourceIds.value.length} 条，请刷新后重试`
      )
    }
  } catch (error) {
    ElMessage.error("选择全部结果失败")
    console.error("select all matching resources failed:", error)
  } finally {
    selectingAllResources.value = false
  }
}

const batchDialogVisible = ref(false)
const batchSubmitting = ref(false)
const batchProgressCompleted = ref(0)
const batchProgressTotal = ref(0)
const batchFormRef = ref<FormInstance>()
const batchForm = ref({
  fieldUid: "",
  value: ""
})

watch(
  () => batchForm.value.fieldUid,
  (fieldUid, previousFieldUid) => {
    if (previousFieldUid && fieldUid !== previousFieldUid) {
      batchForm.value.value = ""
    }
  }
)

const batchEditableFields = computed(() => {
  return attributeFiledsData.value.filter((field) => !field.secure && field.field_type !== "file")
})

const selectedBatchField = computed(() => {
  return batchEditableFields.value.find((field) => field.field_uid === batchForm.value.fieldUid)
})

const batchProgressPercent = computed(() => {
  if (batchProgressTotal.value === 0) return 0
  return Math.round((batchProgressCompleted.value / batchProgressTotal.value) * 100)
})

const batchFormRules: FormRules = {
  fieldUid: [{ required: true, message: "请选择要修改的字段", trigger: "change" }],
  value: [{ required: true, whitespace: true, message: "请输入新的字段值", trigger: ["blur", "change"] }]
}

const handleShowBatchUpdate = () => {
  if (selectedResourceIds.value.length === 0) {
    ElMessage.warning("请先选择要修改的数据")
    return
  }
  if (batchEditableFields.value.length === 0) {
    ElMessage.warning("当前模型没有可批量修改的普通字段")
    return
  }

  batchForm.value = { fieldUid: "", value: "" }
  batchProgressCompleted.value = 0
  batchProgressTotal.value = 0
  batchDialogVisible.value = true
}

const handleBatchDialogClosed = () => {
  if (batchSubmitting.value) return
  batchFormRef.value?.resetFields()
  batchForm.value = { fieldUid: "", value: "" }
  batchProgressCompleted.value = 0
  batchProgressTotal.value = 0
}

const updateResourcesWithConcurrency = async (resourceIds: number[], fieldUid: string, value: any) => {
  const failedResourceIds: number[] = []
  let nextIndex = 0
  const workerCount = Math.min(5, resourceIds.length)

  const worker = async () => {
    while (nextIndex < resourceIds.length) {
      const currentIndex = nextIndex
      nextIndex += 1
      const resourceId = resourceIds[currentIndex]

      try {
        await setCustomFieldApi({
          id: resourceId,
          field: fieldUid,
          data: value
        })
      } catch (error) {
        failedResourceIds.push(resourceId)
        console.error(`batch update resource ${resourceId} failed:`, error)
      } finally {
        batchProgressCompleted.value += 1
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return failedResourceIds
}

const handleBatchUpdate = async () => {
  if (batchSubmitting.value) return

  try {
    await batchFormRef.value?.validate()
  } catch {
    return
  }

  const field = selectedBatchField.value
  if (!field) {
    ElMessage.error("所选字段已不存在，请重新选择")
    return
  }

  const resourceIds = [...selectedResourceIds.value]
  const value = typeof batchForm.value.value === "string" ? batchForm.value.value.trim() : batchForm.value.value

  try {
    await ElMessageBox.confirm(
      `确认将 ${resourceIds.length} 条数据的“${field.field_name}”修改为“${String(value)}”？`,
      "批量修改确认",
      {
        confirmButtonText: "确认修改",
        cancelButtonText: "取消",
        type: "warning"
      }
    )
  } catch {
    return
  }

  batchSubmitting.value = true
  batchProgressCompleted.value = 0
  batchProgressTotal.value = resourceIds.length

  try {
    const failedResourceIds = await updateResourcesWithConcurrency(resourceIds, field.field_uid, value)
    const successCount = resourceIds.length - failedResourceIds.length

    await listResourceByModelUid()

    if (failedResourceIds.length === 0) {
      ElMessage.success(`批量修改完成，共成功修改 ${successCount} 条数据`)
      clearResourceSelection()
      batchDialogVisible.value = false
    } else {
      ElMessage.warning(
        `批量修改部分完成：成功 ${successCount} 条，失败 ${failedResourceIds.length} 条，可再次确认重试`
      )
    }
  } finally {
    batchSubmitting.value = false
  }
}

import type { Column } from "@@/components/DataTable/types"

// 表格列配置
const tableColumns = computed<Column[]>(() => {
  const columns: Column[] = displayFileds.value.map((item) => ({
    prop: `data.${item.field_uid}`,
    label: item.field_name,
    align: "center",
    slot: `data.${item.field_uid}`
  }))
  return columns
})

// 操作按钮配置
const operateBtnItems = computed(() => {
  const items = [
    { name: "详情", code: "detail", type: "primary", icon: markRaw(View) },
    { name: "修改", code: "edit", type: "warning", icon: markRaw(Edit) },
    { name: "删除", code: "delete", type: "danger", icon: markRaw(Delete) }
  ]

  // 如果是主机模型，添加终端按钮
  if (modelUid.value === "host") {
    items.unshift({ name: "终端", code: "terminal", type: "info", icon: markRaw(CirclePlus) })
  }

  return items
})

// 文件上传事件处理
const handleUploadSuccess = (file: UploadUserFile, fieldUid: string, row: Resource) => {
  console.log("Upload success:", file, fieldUid, row)
}

const handleUploadError = (error: any, fieldUid: string, row: Resource) => {
  console.error("Upload error:", error, fieldUid, row)
  ElMessage.error("上传失败")
}

const handleRemoveSuccess = (file: UploadUserFile, fieldUid: string, row: Resource) => {
  console.log("Remove success:", file, fieldUid, row)
}

const handleRemoveError = (error: any, fieldUid: string, row: Resource) => {
  console.error("Remove error:", error, fieldUid, row)
  ElMessage.error("删除失败")
}

const handlePreview = (uploadFile: UploadUserFile) => {
  console.log("Preview file:", uploadFile)
}

const handleDetailClick = (resource: Resource) => {
  router.push({
    path: "/cmdb/resource/info",
    query: { model_uid: modelUid.value, id: resource.id, name: resource.name }
  })
}

// ** 获取资产字段信息 */
const listAttributeFields = async () => {
  if (!modelUid.value) {
    attributeFiledsData.value = []
    attributeGroupsData.value = []
    displayFileds.value = []
    return
  }

  try {
    const { data } = await getModelAttributesWithGroupsApi(modelUid.value)
    // 保存分组数据
    attributeGroupsData.value = data.attribute_groups

    // 将分组数据转换为平铺的字段列表
    const allFields: Attribute[] = []
    data.attribute_groups.forEach((group) => {
      if (group.attributes) {
        allFields.push(...group.attributes)
      }
    })
    attributeFiledsData.value = allFields
    sortFields()
  } catch {
    attributeFiledsData.value = []
    attributeGroupsData.value = []
    displayFileds.value = []
  }
}

// ** 过滤展示字段，并排序 */
const sortFields = () => {
  displayFileds.value = attributeFiledsData.value
    .filter((item) => item.display === true)
    .sort((a, b) => {
      const indexA = a.display_index ?? a.sort_key ?? a.index ?? 100
      const indexB = b.display_index ?? b.sort_key ?? b.index ?? 100
      if (indexA !== indexB) return indexA - indexB
      return a.id - b.id
    })
}

// 跳转外部
const openNewPage = (url: string) => {
  window.open(url, "_blank")
}

// ** 获取资产列表 */
const resourcesData = ref<Resource[]>([])
const listResourceByModelUid = async () => {
  if (!modelUid.value) {
    resourcesData.value = []
    paginationData.total = 0
    return
  }

  loading.value = true
  const params = {
    model_uid: modelUid.value,
    offset: (paginationData.currentPage - 1) * paginationData.pageSize,
    limit: paginationData.pageSize
  }
  const keyword = activeSearchKeyword.value

  try {
    const { data } = keyword ? await searchModelResourceApi({ ...params, keyword }) : await listResourceApi(params)
    resourcesData.value = data.resources || []
    paginationData.total = data.total || 0
    await syncCurrentPageSelection()
  } catch (error) {
    resourcesData.value = []
    paginationData.total = 0
    ElMessage.error(keyword ? "搜索资源失败" : "获取资源列表失败")
    console.error("fetch resources failed:", error)
  } finally {
    loading.value = false
  }
}

const handleSearch = () => {
  clearResourceSelection()
  activeSearchKeyword.value = searchKeyword.value.trim()
  if (paginationData.currentPage === 1) {
    listResourceByModelUid()
  } else {
    paginationData.currentPage = 1
  }
}

const handleDelete = (row: Resource) => {
  ElMessageBox({
    title: "删除确认",
    message: h("p", null, [
      h("span", null, "正在删除名称: "),
      h("i", { style: "color: red" }, `${row.name}`),
      h("span", null, " 确认删除？")
    ]),
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning"
  }).then(() => {
    deleteResourceApi(row.id).then(() => {
      ElMessage.success("删除成功")
      clearResourceSelection()
      listResourceByModelUid()
    })
  })
}

const handleSecureClick = (row: Resource, item: Attribute) => {
  findSecureData({
    id: row.id,
    field_uid: item.field_uid
  }).then((data) => {
    // 存储安全数据到 row 中，这样切换页面后数据不会丢失
    row.data[item.field_uid] = data.data
    // row.data[`${item.field_uid}_secure_display`] = true
  })
}

const handleSecureDisplayChange = (row: Resource, item: Attribute, isDisplaying: boolean) => {
  row.data[`${item.field_uid}_secure_display`] = isDisplaying
}

const handleCopySecureContent = (content: string, rowId: number) => {
  // 复制逻辑已移到 SecureFieldView 组件内部
  console.log("Content copied:", content, "for row:", rowId)
}

const apiRef = ref<InstanceType<typeof Form>>()
const handlerCreate = () => {
  ElMessage.info("准备新增资产，请填写相关信息")
  title.value = "新增资产"
  drawerVisible.value = true
}

const handleUpdate = (row: Resource) => {
  ElMessage.info(`准备修改资产：${row.name}`)
  title.value = "修改资产"

  drawerVisible.value = true
  nextTick(() => {
    apiRef.value?.setForm(row)
  })
}

// 操作按钮事件
const handleOperateEvent = (row: Resource, action: string) => {
  if (action === "terminal") {
    // 跳转到终端页面
    window.open(`/terminal?resource_id=${row.id}&title=${row.name}`, "_blank")
  } else if (action === "detail") {
    handleDetailClick(row)
  } else if (action === "edit") {
    handleUpdate(row)
  } else if (action === "delete") {
    handleDelete(row)
  }
}

const onClosed = () => {
  apiRef.value?.resetForm()
  drawerVisible.value = false
}

const handleCreate = () => {
  apiRef.value?.handleSubmit()
}

// 返回上一页
const goBack = () => {
  router.back()
}

onMounted(() => {
  listAttributeFields()
})

onUnmounted(() => {
  // 组件销毁时的清理工作
})

/** 监听分页参数的变化 */
watch([() => paginationData.currentPage, () => paginationData.pageSize], listResourceByModelUid, { immediate: true })

/** 监听当前模型变化，同一个页面切换不同模型时重新加载字段和实例 */
watch(
  () => modelUid.value,
  () => {
    clearResourceSelection()
    resourcesData.value = []
    searchKeyword.value = ""
    activeSearchKeyword.value = ""
    if (paginationData.currentPage === 1) {
      listResourceByModelUid()
    } else {
      paginationData.currentPage = 1
    }
    listAttributeFields()
  }
)
</script>

<style lang="scss" scoped>
.resource-list {
  height: 100%;
  padding: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .model-identity {
    display: flex;
    align-items: center;
    gap: 16px;

    .identity-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--muted, #f9fafb);
      padding: 4px 8px;
      border-radius: 6px;

      .badge-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--muted-foreground, #6b7280);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }

      .identity-code {
        font-family: var(--font-mono, "Monaco", "Menlo", "Ubuntu Mono", monospace);
        font-size: 12px;
        font-weight: 600;
        color: var(--primary, #3b82f6);
        background: var(--background, #ffffff);
        padding: 2px 6px;
        border-radius: 3px;
      }
    }

    .model-name-section {
      .model-name {
        font-size: 16px;
        font-weight: 600;
        color: var(--foreground, #111827);
        margin: 0;
        line-height: 1.3;
      }
    }
  }

  :deep(.manager-header) {
    gap: 16px;
    align-items: flex-start;
  }

  :deep(.header-left) {
    min-width: 0;
  }

  :deep(.header-right) {
    flex-wrap: wrap;
    justify-content: flex-end;
    min-width: 360px;
  }

  .header-actions-bar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }

  .resource-search {
    width: 260px;
  }

  .selection-summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    color: #606266;
    font-size: 14px;

    strong {
      color: var(--primary, #3b82f6);
      font-size: 16px;
    }
  }

  :deep(.el-divider--vertical) {
    margin: 0 2px;
  }
}

.batch-dialog-summary {
  margin-bottom: 14px;
  color: #374151;

  strong {
    color: var(--primary, #3b82f6);
    font-size: 16px;
  }
}

.batch-field-alert {
  margin-bottom: 18px;
}

.batch-field-control {
  width: 100%;
}

.batch-field-meta {
  float: right;
  margin-left: 20px;
  color: #8492a6;
  font-size: 12px;
}

.batch-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: #606266;
  font-size: 13px;
}

@media (max-width: 1200px) {
  .resource-list {
    :deep(.manager-header) {
      flex-direction: column;
      align-items: stretch;
    }

    :deep(.header-right) {
      justify-content: flex-start;
      min-width: 0;
    }

    .header-actions-bar {
      justify-content: flex-start;
    }

    .resource-search {
      width: min(100%, 320px);
    }
  }
}

.file-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.file-name {
  max-width: 230px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
