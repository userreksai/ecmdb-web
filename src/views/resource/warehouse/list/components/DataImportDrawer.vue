<template>
  <Drawer
    v-model="visible"
    title="批量导入数据"
    subtitle="上传后先核对差异，确认后再同步模型数据"
    size="72%"
    direction="rtl"
    :header-icon="Upload"
    :show-footer="true"
    cancel-button-text="取消"
    :confirm-button-text="preview?.is_empty ? '确认清空模型' : '确认导入'"
    :confirm-button-type="preview?.is_empty ? 'danger' : 'primary'"
    :confirm-loading="importing"
    :confirm-disabled="!preview || uploading || previewing"
    @cancel="handleClose"
    @confirm="handleImport"
    @closed="handleClose"
  >
    <div class="import-drawer-content">
      <div class="steps-guide">
        <div v-for="(step, index) in steps" :key="step" class="step-wrap">
          <div class="step-item" :class="{ active: currentStep >= index + 1 }">
            <div class="step-number">{{ index + 1 }}</div>
            <div class="step-title">{{ step }}</div>
          </div>
          <el-icon v-if="index < steps.length - 1" class="step-arrow"><Right /></el-icon>
        </div>
      </div>

      <div class="upload-card">
        <el-button :icon="Download" :loading="exporting" @click="handleDownloadTemplate"> 下载模板 </el-button>

        <el-upload
          v-if="!selectedFile"
          ref="uploadRef"
          class="upload-dragger"
          drag
          :auto-upload="true"
          :limit="1"
          :http-request="handleUploadRequest"
          :before-upload="validateImportFile"
          :on-exceed="handleExceed"
          accept=".xlsx"
          :show-file-list="false"
        >
          <el-icon class="upload-icon"><Upload /></el-icon>
          <div class="upload-title">点击或拖拽 Excel 文件到此处</div>
          <div class="upload-hint">上传完成后会自动生成数据差异表，不会立即写入模型</div>
        </el-upload>

        <div v-else class="file-selected">
          <div class="file-info">
            <el-icon class="file-icon" :class="{ loading: uploading || previewing }">
              <Loading v-if="uploading || previewing" />
              <Document v-else />
            </el-icon>
            <div>
              <div class="file-name">{{ selectedFile.name }}</div>
              <div class="file-meta">
                {{ formatFileSize(selectedFile.size) }} ·
                {{ uploading ? "正在上传" : previewing ? "正在对比模型数据" : preview ? "差异已生成" : "等待处理" }}
              </div>
            </div>
          </div>
          <el-button
            type="danger"
            :icon="Delete"
            circle
            :disabled="uploading || previewing"
            @click="handleRemoveFile"
          />
        </div>
      </div>

      <template v-if="preview">
        <el-alert v-if="preview.is_empty" title="表格数据为空" type="error" :closable="false" show-icon>
          <template #default>
            继续导入将删除“{{ modelName || modelUid }}”当前全部 {{ preview.current_count }} 条模型数据。
          </template>
        </el-alert>

        <div class="summary-grid">
          <div class="summary-card source">
            <span>表格数据</span><strong>{{ preview.sheet_count }}</strong>
          </div>
          <div class="summary-card create">
            <span>新增</span><strong>{{ preview.created_count }}</strong>
          </div>
          <div class="summary-card update">
            <span>修改</span><strong>{{ preview.updated_count }}</strong>
          </div>
          <div class="summary-card delete">
            <span>删除</span><strong>{{ preview.deleted_count }}</strong>
          </div>
          <div class="summary-card unchanged">
            <span>不变</span><strong>{{ preview.unchanged_count }}</strong>
          </div>
        </div>

        <div class="diff-card">
          <div class="diff-header">
            <div>
              <h3>数据对比</h3>
              <p>以“{{ preview.unique_field }}”作为唯一索引；表格未包含的字段不会被覆盖。</p>
            </div>
            <el-radio-group v-model="actionFilter" size="small">
              <el-radio-button label="all">全部</el-radio-button>
              <el-radio-button label="create">新增</el-radio-button>
              <el-radio-button label="update">修改</el-radio-button>
              <el-radio-button label="delete">删除</el-radio-button>
              <el-radio-button label="unchanged">不变</el-radio-button>
            </el-radio-group>
          </div>

          <el-table :data="filteredRows" border stripe height="360" empty-text="没有符合条件的差异数据">
            <el-table-column prop="unique_id" :label="preview.unique_field" min-width="160" fixed="left" />
            <el-table-column label="操作" width="90" align="center">
              <template #default="{ row }">
                <el-tag :type="getActionTag(row.action).type" effect="plain">{{
                  getActionTag(row.action).label
                }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="变更字段" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">{{ row.changed_fields.join("、") || "-" }}</template>
            </el-table-column>
            <el-table-column label="原数据" min-width="300" show-overflow-tooltip>
              <template #default="{ row }"
                ><code>{{ compactJson(row.original_data) }}</code></template
              >
            </el-table-column>
            <el-table-column label="修改后数据" min-width="300" show-overflow-tooltip>
              <template #default="{ row }"
                ><code>{{ compactJson(row.modified_data) }}</code></template
              >
            </el-table-column>
          </el-table>
        </div>
      </template>

      <div class="tips-section">
        <el-icon><InfoFilled /></el-icon>
        <div>
          <strong>导入规则</strong>
          <ul>
            <li>字段标准与导出文件一致，唯一索引相同的数据执行更新，不存在的数据执行新增。</li>
            <li>表格未包含的模型字段保持原值；模型中多出的数据会列为删除项，确认后以表格为准同步。</li>
            <li>空表不会直接执行，必须再次确认后才会清空当前模型。</li>
          </ul>
        </div>
      </div>
    </div>
  </Drawer>
</template>

<script lang="ts" setup>
import { computed, ref } from "vue"
import { Delete, Document, Download, InfoFilled, Loading, Right, Upload } from "@element-plus/icons-vue"
import {
  ElMessage,
  ElMessageBox,
  type UploadInstance,
  type UploadRawFile,
  type UploadRequestOptions
} from "element-plus"
import { Drawer } from "@@/components/Dialogs"
import { useDataIO } from "@/common/composables/useDataIO"
import type { ImportChangeAction, ImportPreviewRes } from "@/api/resource/dataio/types"

interface Props {
  modelValue: boolean
  modelUid: string
  modelName?: string
}

const props = withDefaults(defineProps<Props>(), { modelName: "" })
const emits = defineEmits<{
  "update:modelValue": [value: boolean]
  "import-success": [count: number]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emits("update:modelValue", value)
})

const {
  exporting,
  importing,
  uploading,
  previewing,
  exportTemplate,
  uploadFileToS3,
  previewImportData,
  executeImportData
} = useDataIO()

const steps = ["下载模板", "上传文件", "核对差异", "确认同步"]
const uploadRef = ref<UploadInstance>()
const selectedFile = ref<File | null>(null)
const uploadedFileKey = ref("")
const preview = ref<ImportPreviewRes | null>(null)
const actionFilter = ref<"all" | ImportChangeAction>("all")

const currentStep = computed(() => {
  if (preview.value) return 4
  if (selectedFile.value) return 2
  return 1
})

const filteredRows = computed(() => {
  if (!preview.value) return []
  if (actionFilter.value === "all") return preview.value.rows
  return preview.value.rows.filter((row) => row.action === actionFilter.value)
})

const actionTag: Record<ImportChangeAction, { label: string; type: "success" | "warning" | "danger" | "info" }> = {
  create: { label: "新增", type: "success" },
  update: { label: "修改", type: "warning" },
  delete: { label: "删除", type: "danger" },
  unchanged: { label: "不变", type: "info" }
}
const getActionTag = (action: ImportChangeAction) => actionTag[action] || actionTag.unchanged

const handleDownloadTemplate = () => exportTemplate(props.modelUid, props.modelName)

const validateImportFile = async (file: UploadRawFile) => {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    ElMessage.error("仅支持由本系统导出或下载模板生成的 .xlsx 文件")
    return false
  }

  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const isZip =
    signature[0] === 0x50 &&
    signature[1] === 0x4b &&
    ((signature[2] === 0x03 && signature[3] === 0x04) ||
      (signature[2] === 0x05 && signature[3] === 0x06) ||
      (signature[2] === 0x07 && signature[3] === 0x08))
  if (isZip) return true

  ElMessage.error("文件内容不是有效的 .xlsx，请重新下载模板或重新导出")
  return false
}

const handleUploadRequest = async (options: UploadRequestOptions) => {
  selectedFile.value = options.file
  preview.value = null
  try {
    uploadedFileKey.value = await uploadFileToS3(options.file)
    preview.value = await previewImportData(uploadedFileKey.value, props.modelUid)
    ElMessage.success("数据差异已生成，请核对后确认导入")
  } catch (error) {
    console.error("生成导入差异失败:", error)
    handleRemoveFile()
  }
}

const handleExceed = () => ElMessage.warning("只能上传一个文件，请先移除已选择的文件")

const handleRemoveFile = () => {
  selectedFile.value = null
  uploadedFileKey.value = ""
  preview.value = null
  actionFilter.value = "all"
  uploadRef.value?.clearFiles()
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${Math.round((bytes / 1024 ** index) * 100) / 100} ${units[index]}`
}

const compactJson = (data: Record<string, unknown> | null) => (data ? JSON.stringify(data) : "-")

const handleImport = async () => {
  if (!uploadedFileKey.value || !preview.value) {
    ElMessage.warning("请先上传文件并完成数据对比")
    return
  }

  let confirmEmpty = false
  if (preview.value.is_empty) {
    try {
      await ElMessageBox.confirm(
        `表格数据为空，继续导入将删除“${props.modelName || props.modelUid}”全部 ${preview.value.current_count} 条数据，是否确认？`,
        "确认清空模型数据",
        { type: "error", confirmButtonText: "确认全部删除", cancelButtonText: "取消" }
      )
      confirmEmpty = true
    } catch {
      return
    }
  }

  try {
    const result = await executeImportData(uploadedFileKey.value, props.modelUid, confirmEmpty)
    emits("import-success", result.imported_count)
    handleClose()
  } catch (error) {
    console.error("导入失败:", error)
  }
}

const handleClose = () => {
  handleRemoveFile()
  visible.value = false
}
</script>

<style lang="scss" scoped>
.import-drawer-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 20px;
}

.steps-guide {
  display: flex;
  padding: 16px 20px;
  background: linear-gradient(135deg, #eff6ff, #dbeafe);
  border-radius: 12px;
}

.step-wrap {
  display: flex;
  flex: 1;
  align-items: center;

  &:last-child {
    flex: 0 0 auto;
  }
}

.step-item {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #94a3b8;

  &.active {
    color: #1d4ed8;
  }
}

.step-number {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  color: white;
  background: #94a3b8;
  border-radius: 50%;
  font-weight: 700;
}

.step-item.active .step-number {
  background: #2563eb;
}
.step-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.step-arrow {
  flex: 1;
  margin: 0 12px;
  color: #93c5fd;
}

.upload-card,
.diff-card {
  padding: 16px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
}

.upload-card {
  display: flex;
  align-items: stretch;
  gap: 14px;
}
.upload-dragger {
  flex: 1;
}
.upload-dragger :deep(.el-upload),
.upload-dragger :deep(.el-upload-dragger) {
  width: 100%;
}
.upload-dragger :deep(.el-upload-dragger) {
  padding: 20px;
}
.upload-icon {
  margin-bottom: 8px;
  font-size: 34px;
  color: #3b82f6;
}
.upload-title {
  color: #334155;
  font-weight: 600;
}
.upload-hint {
  margin-top: 6px;
  color: #94a3b8;
  font-size: 12px;
}

.file-selected {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #f0fdf4;
  border: 1px solid #86efac;
  border-radius: 9px;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
}
.file-icon {
  font-size: 30px;
  color: #10b981;
}
.file-icon.loading {
  color: #3b82f6;
  animation: rotate 1s linear infinite;
}
.file-name {
  color: #065f46;
  font-weight: 600;
}
.file-meta {
  margin-top: 4px;
  color: #059669;
  font-size: 12px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(110px, 1fr));
  gap: 12px;
}

.summary-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #64748b;
  border-radius: 10px;
  background: #fff;

  span {
    color: #64748b;
    font-size: 13px;
  }
  strong {
    color: #0f172a;
    font-size: 24px;
  }
  &.create {
    border-left-color: #22c55e;
  }
  &.update {
    border-left-color: #f59e0b;
  }
  &.delete {
    border-left-color: #ef4444;
  }
  &.unchanged {
    border-left-color: #94a3b8;
  }
  &.source {
    border-left-color: #3b82f6;
  }
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;

  h3 {
    margin: 0;
    color: #1e293b;
    font-size: 15px;
  }
  p {
    margin: 5px 0 0;
    color: #64748b;
    font-size: 12px;
  }
}

code {
  color: #475569;
  font-size: 12px;
}

.tips-section {
  display: flex;
  gap: 10px;
  padding: 14px 16px;
  color: #78350f;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;

  ul {
    margin: 8px 0 0;
    padding-left: 18px;
    font-size: 12px;
    line-height: 1.7;
  }
}

@keyframes rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .diff-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
