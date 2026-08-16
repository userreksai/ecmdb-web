<template>
  <div class="datasource-page">
    <header class="page-header">
      <div>
        <div class="page-title">
          <el-icon><Connection /></el-icon>
          <h1>Prometheus 数据源</h1>
        </div>
        <p>监控模块独立配置，不依赖告警管理服务。指标仍保存在 Prometheus 中。</p>
      </div>
      <div class="header-actions">
        <el-button @click="router.push('/monitor/dashboard')">返回监控看板</el-button>
        <el-button type="primary" @click="openCreateDrawer">
          <el-icon><Plus /></el-icon>
          新增数据源
        </el-button>
      </div>
    </header>

    <el-alert
      title="推荐使用同源代理地址 /prometheus"
      description="开发环境代理到 VITE_PROMETHEUS_API；Docker 部署默认代理到宿主机 9090 端口。填写完整 HTTP 地址时，需要 Prometheus 允许浏览器跨域访问。"
      type="info"
      show-icon
      :closable="false"
    />

    <section class="datasource-card">
      <el-table :data="datasources" empty-text="暂无数据源">
        <el-table-column prop="name" label="名称" min-width="170">
          <template #default="scope">
            <div class="name-cell">
              <span class="source-icon"><DataLine /></span>
              <div>
                <strong>{{ scope.row.name }}</strong>
                <span>{{ scope.row.description || "未填写说明" }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="url" label="Prometheus 根地址" min-width="260">
          <template #default="scope">
            <code>{{ scope.row.url }}</code>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.enabled ? 'success' : 'info'" effect="plain">
              {{ scope.row.enabled ? "已启用" : "已停用" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="连接测试" width="130">
          <template #default="scope">
            <el-tag
              v-if="testStates[scope.row.id]"
              :type="testStates[scope.row.id].success ? 'success' : 'danger'"
              effect="plain"
            >
              {{ testStates[scope.row.id].success ? "可用" : "失败" }}
            </el-tag>
            <span v-else class="not-tested">未测试</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="scope">
            <el-button text type="primary" :loading="testingId === scope.row.id" @click="testDatasource(scope.row)">
              测试
            </el-button>
            <el-button text type="primary" @click="openEditDrawer(scope.row)">编辑</el-button>
            <el-button text type="danger" @click="removeDatasource(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-drawer v-model="drawerVisible" :title="editingId ? '编辑数据源' : '新增数据源'" size="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：生产 Prometheus" maxlength="50" show-word-limit />
        </el-form-item>

        <el-form-item label="Prometheus 根地址" prop="url">
          <el-input v-model="form.url" placeholder="/prometheus 或 http://127.0.0.1:9090" clearable />
          <div class="form-help">不要填写 <code>/api/v1/query</code>；系统会自动拼接 Prometheus API 路径。</div>
        </el-form-item>

        <el-form-item label="说明" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="200" show-word-limit />
        </el-form-item>

        <el-form-item label="启用状态">
          <el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" />
        </el-form-item>

        <el-alert
          v-if="drawerTestResult"
          :title="drawerTestResult.message"
          :type="drawerTestResult.success ? 'success' : 'error'"
          show-icon
          :closable="false"
        />
      </el-form>

      <template #footer>
        <el-button @click="drawerVisible = false">取消</el-button>
        <el-button :loading="drawerTesting" @click="testFormDatasource">测试连接</el-button>
        <el-button type="primary" @click="saveDatasource">保存</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from "vue"
import { useRouter } from "vue-router"
import { Connection, DataLine, Plus } from "@element-plus/icons-vue"
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus"
import { testPrometheusDatasource } from "@/api/monitor/prometheus"
import type { DatasourceTestResult, MonitorDatasource } from "@/api/monitor/prometheus/types"
import { useMonitorDatasources } from "../composables/useMonitorDatasources"

const router = useRouter()
const { datasources, save, remove } = useMonitorDatasources()
const drawerVisible = ref(false)
const editingId = ref("")
const formRef = ref<FormInstance>()
const testingId = ref("")
const drawerTesting = ref(false)
const drawerTestResult = ref<DatasourceTestResult | null>(null)
const testStates = reactive<Record<string, DatasourceTestResult>>({})

const emptyForm = (): MonitorDatasource => ({
  id: "",
  name: "",
  url: "/prometheus",
  enabled: true,
  description: ""
})

const form = reactive<MonitorDatasource>(emptyForm())

const rules: FormRules<MonitorDatasource> = {
  name: [{ required: true, message: "请输入数据源名称", trigger: "blur" }],
  url: [
    { required: true, message: "请输入 Prometheus 根地址", trigger: "blur" },
    {
      validator: (_rule, value: string, callback) => {
        const url = value.trim()
        if ((url.startsWith("/") && url.length > 1) || /^https?:\/\//i.test(url)) callback()
        else callback(new Error("请输入 / 开头的代理路径，或完整的 HTTP/HTTPS 地址"))
      },
      trigger: "blur"
    }
  ]
}

const setForm = (datasource: MonitorDatasource) => {
  Object.assign(form, datasource)
  drawerTestResult.value = null
}

const openCreateDrawer = () => {
  editingId.value = ""
  setForm(emptyForm())
  drawerVisible.value = true
}

const openEditDrawer = (datasource: MonitorDatasource) => {
  editingId.value = datasource.id
  setForm({ ...datasource })
  drawerVisible.value = true
}

const getFormDatasource = (): MonitorDatasource => ({
  ...form,
  id: editingId.value || crypto.randomUUID(),
  name: form.name.trim(),
  url: form.url.trim().replace(/\/+$/, ""),
  description: form.description.trim()
})

const testDatasource = async (datasource: MonitorDatasource) => {
  testingId.value = datasource.id
  const result = await testPrometheusDatasource(datasource)
  testStates[datasource.id] = result
  testingId.value = ""
  ElMessage({ type: result.success ? "success" : "error", message: result.message })
}

const testFormDatasource = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  drawerTesting.value = true
  drawerTestResult.value = await testPrometheusDatasource(getFormDatasource())
  drawerTesting.value = false
}

const saveDatasource = async () => {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  save(getFormDatasource())
  drawerVisible.value = false
  ElMessage.success("数据源已保存")
}

const removeDatasource = async (datasource: MonitorDatasource) => {
  try {
    await ElMessageBox.confirm(`确定删除数据源“${datasource.name}”吗？`, "删除数据源", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    })
  } catch {
    return
  }
  remove(datasource.id)
  delete testStates[datasource.id]
  ElMessage.success("数据源已删除")
}
</script>

<style scoped lang="scss">
.datasource-page {
  min-height: 100%;
  padding: 18px;
  background: var(--el-fill-color-extra-light);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
  padding: 18px 20px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.page-title,
.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  color: var(--el-color-primary);
  font-size: 22px;
}

.page-title h1 {
  margin: 0;
  color: var(--el-text-color-primary);
  font-size: 20px;
}

.page-header p {
  margin: 7px 0 0 32px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.datasource-card {
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-bg-color);
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 11px;
}

.name-cell > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.name-cell strong {
  color: var(--el-text-color-primary);
}

.name-cell span,
.not-tested {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-icon {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 18px;
}

code {
  color: var(--el-text-color-primary);
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.form-help {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 768px) {
  .datasource-page {
    padding: 10px;
  }

  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .page-header p {
    margin-left: 0;
  }
}
</style>
