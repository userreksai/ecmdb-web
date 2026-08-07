<template>
  <PageContainer>
    <ManagerHeader
      title="任务分类管理"
      subtitle="以项目或业务维度组织调度任务，分类删除后任务会自动回到未分类"
      @refresh="fetchCategories"
    >
      <template #actions>
        <div class="header-actions">
          <el-input
            v-model="keyword"
            clearable
            class="search-input"
            placeholder="搜索分类..."
            @clear="fetchCategories"
            @keyup.enter="fetchCategories"
          >
            <template #prefix
              ><el-icon><Search /></el-icon
            ></template>
          </el-input>
          <el-button type="primary" :icon="Plus" @click="openCreate">新建分类</el-button>
          <el-button :icon="Back" @click="router.push('/task/manager')">返回任务管理</el-button>
        </div>
      </template>
    </ManagerHeader>

    <div class="category-summary">
      <div class="summary-item">
        <span class="summary-label">分类数量</span>
        <strong>{{ categories.length }}</strong>
      </div>
      <div class="summary-divider" />
      <div class="summary-item warning">
        <span class="summary-label">未分类任务</span>
        <strong>{{ uncategorizedCount }}</strong>
      </div>
    </div>

    <div class="table-card" v-loading="loading">
      <el-table :data="categories" row-key="id" empty-text="暂无任务分类">
        <el-table-column label="分类名称" min-width="180">
          <template #default="{ row }">
            <div class="category-name">
              <span class="category-icon"
                ><el-icon><FolderOpened /></el-icon
              ></span>
              <span>{{ row.name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="分类说明" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="description">{{ row.description || "暂无说明" }}</span>
          </template>
        </el-table-column>
        <el-table-column label="任务数量" width="120" align="center">
          <template #default="{ row }">
            <el-tag type="primary" effect="light" round>{{ row.task_count }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="190" align="center">
          <template #default="{ row }">{{ formatTimestamp(row.utime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link :icon="Connection" @click="openAssignment(row)">管理任务</el-button>
            <el-button type="primary" link :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button type="danger" link :icon="Delete" @click="removeCategory(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editingCategory ? '编辑任务分类' : '新建任务分类'"
      width="520px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="form.name" maxlength="128" show-word-limit placeholder="例如：商城项目" />
        </el-form-item>
        <el-form-item label="分类说明" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="说明该分类对应的项目或业务范围"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="assignmentVisible"
      :title="`管理“${assigningCategory?.name || ''}”的任务`"
      width="780px"
      destroy-on-close
    >
      <el-alert
        class="assignment-tip"
        type="info"
        :closable="false"
        show-icon
        title="从左侧选择任务加入当前分类；已属于其他分类的任务被选中后将移入当前分类。"
      />
      <div v-loading="tasksLoading" class="transfer-wrap">
        <el-transfer
          v-model="selectedTaskIds"
          filterable
          filter-placeholder="搜索任务"
          :data="taskOptions"
          :titles="['可选任务', '已加入分类']"
          :button-texts="['移出', '加入']"
        />
      </div>
      <template #footer>
        <el-button @click="assignmentVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingAssignment" @click="saveAssignment">保存分类任务</el-button>
      </template>
    </el-dialog>
  </PageContainer>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue"
import { useRouter } from "vue-router"
import { Back, Connection, Delete, Edit, FolderOpened, Plus, Search } from "@element-plus/icons-vue"
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus"
import PageContainer from "@@/components/PageContainer/index.vue"
import ManagerHeader from "@@/components/ManagerHeader/index.vue"
import { formatTimestamp } from "@@/utils/day"
import {
  createTaskCategoryApi,
  deleteTaskCategoryApi,
  listTaskCategoriesApi,
  listTasksApi,
  replaceCategoryTasksApi,
  updateTaskCategoryApi
} from "@/api/etask/manager"
import type { TaskCategory, TaskItem } from "@/api/etask/manager/type"

const router = useRouter()
const loading = ref(false)
const keyword = ref("")
const categories = ref<TaskCategory[]>([])
const uncategorizedCount = ref(0)

const fetchCategories = async () => {
  loading.value = true
  try {
    const res = await listTaskCategoriesApi(keyword.value)
    categories.value = res.data.categories || []
    uncategorizedCount.value = res.data.uncategorized_count || 0
  } finally {
    loading.value = false
  }
}

const formVisible = ref(false)
const saving = ref(false)
const editingCategory = ref<TaskCategory | null>(null)
const formRef = ref<FormInstance>()
const form = reactive({ name: "", description: "" })
const rules: FormRules = {
  name: [{ required: true, message: "请输入分类名称", trigger: "blur" }]
}

const resetForm = () => {
  form.name = ""
  form.description = ""
  formRef.value?.clearValidate()
}

const openCreate = () => {
  editingCategory.value = null
  resetForm()
  formVisible.value = true
}

const openEdit = (category: TaskCategory) => {
  editingCategory.value = category
  form.name = category.name
  form.description = category.description || ""
  formVisible.value = true
}

const submitForm = async () => {
  if (!(await formRef.value?.validate().catch(() => false))) return
  saving.value = true
  try {
    if (editingCategory.value) {
      await updateTaskCategoryApi({ id: editingCategory.value.id, name: form.name, description: form.description })
      ElMessage.success("分类更新成功")
    } else {
      await createTaskCategoryApi({ name: form.name, description: form.description })
      ElMessage.success("分类创建成功")
    }
    formVisible.value = false
    await fetchCategories()
  } finally {
    saving.value = false
  }
}

const removeCategory = async (category: TaskCategory) => {
  await ElMessageBox.confirm(
    `删除分类“${category.name}”后，其中 ${category.task_count} 个任务将回到未分类。是否继续？`,
    "删除任务分类",
    { type: "warning", confirmButtonText: "确认删除", cancelButtonText: "取消" }
  )
  await deleteTaskCategoryApi(category.id)
  ElMessage.success("分类已删除")
  await fetchCategories()
}

const assignmentVisible = ref(false)
const tasksLoading = ref(false)
const savingAssignment = ref(false)
const assigningCategory = ref<TaskCategory | null>(null)
const allTasks = ref<TaskItem[]>([])
const selectedTaskIds = ref<number[]>([])
const taskOptions = computed(() =>
  allTasks.value.map((task) => ({
    key: task.id,
    label:
      task.category_name && task.category_id !== assigningCategory.value?.id
        ? `${task.name}  [${task.category_name}]`
        : task.name
  }))
)

const fetchAllTasks = async () => {
  const pageSize = 200
  let offset = 0
  let total = 0
  const tasks: TaskItem[] = []
  do {
    const res = await listTasksApi({ offset, limit: pageSize })
    tasks.push(...(res.data.tasks || []))
    total = res.data.total
    offset += pageSize
  } while (offset < total)
  allTasks.value = tasks
}

const openAssignment = async (category: TaskCategory) => {
  assigningCategory.value = category
  assignmentVisible.value = true
  tasksLoading.value = true
  try {
    await fetchAllTasks()
    selectedTaskIds.value = allTasks.value.filter((task) => task.category_id === category.id).map((task) => task.id)
  } finally {
    tasksLoading.value = false
  }
}

const saveAssignment = async () => {
  if (!assigningCategory.value) return
  savingAssignment.value = true
  try {
    await replaceCategoryTasksApi(assigningCategory.value.id, { task_ids: selectedTaskIds.value })
    ElMessage.success("分类任务已更新")
    assignmentVisible.value = false
    await fetchCategories()
  } finally {
    savingAssignment.value = false
  }
}

onMounted(fetchCategories)
</script>

<style scoped lang="scss">
.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 220px;
}

.category-summary {
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 16px;
  padding: 18px 24px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.summary-item {
  display: flex;
  align-items: baseline;
  gap: 12px;

  strong {
    color: #2563eb;
    font-size: 24px;
  }

  &.warning strong {
    color: #d97706;
  }
}

.summary-label {
  color: #64748b;
  font-size: 13px;
}

.summary-divider {
  width: 1px;
  height: 28px;
  background: #e2e8f0;
}

.table-card {
  overflow: hidden;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
}

.category-name {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #0f172a;
  font-weight: 600;
}

.category-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  color: #2563eb;
  background: #eff6ff;
}

.description {
  color: #64748b;
}

.assignment-tip {
  margin-bottom: 16px;
}

.transfer-wrap {
  min-height: 330px;

  :deep(.el-transfer) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :deep(.el-transfer-panel) {
    width: 280px;
  }

  :deep(.el-transfer-panel__body) {
    height: 300px;
  }

  :deep(.el-transfer-panel__list.is-filterable) {
    height: 240px;
  }
}
</style>
