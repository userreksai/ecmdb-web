/** 导入数据请求 */
export interface ImportReq {
  /** 模型 UID */
  model_uid: string
  /** S3 文件键 */
  file_key: string
  /** 空表导入时是否确认清空当前模型 */
  confirm_empty?: boolean
}

/** 导入数据响应 */
export interface ImportRes {
  /** 本次写入（新增 + 更新）的数据条数 */
  imported_count: number
  created_count: number
  updated_count: number
  deleted_count: number
  unchanged_count: number
}

export interface ImportPreviewReq {
  model_uid: string
  file_key: string
}

export type ImportChangeAction = "create" | "update" | "delete" | "unchanged"

export interface ImportPreviewRow {
  unique_id: string
  action: ImportChangeAction
  changed_fields: string[]
  original_data: Record<string, unknown> | null
  modified_data: Record<string, unknown> | null
}

export interface ImportPreviewRes {
  model_uid: string
  unique_field: string
  sheet_count: number
  current_count: number
  created_count: number
  updated_count: number
  deleted_count: number
  unchanged_count: number
  is_empty: boolean
  columns: string[]
  rows: ImportPreviewRow[]
}

/** 导出操作符枚举 */
export enum ExportOperator {
  /** 等于 */
  EQ = "eq",
  /** 不等于 */
  NE = "ne",
  /** 包含 */
  CONTAINS = "contains",
  /** 大于 */
  GT = "gt",
  /** 小于 */
  LT = "lt"
}

/** 导出筛选条件 */
export interface ExportFilterCondition {
  /** 字段 UID */
  field_uid: string
  /** 操作符 */
  operator: ExportOperator
  /** 筛选值 */
  value: string | number | boolean
}

/** 导出筛选条件组 (组内 AND) */
export interface ExportFilterGroup {
  filters: ExportFilterCondition[]
}

/** 导出关联模型字段 */
export interface ExportRelatedField {
  /** 关联关系名称 */
  relation_name: string
  /** 关联模型 UID */
  model_uid: string
  /** 关联模型字段 UID */
  field_uid: string
}

/** 导出范围枚举 */
export enum ExportScope {
  /** 全部数据 */
  ALL = "all",
  /** 当前页数据 */
  CURRENT = "current",
  /** 已选数据 */
  SELECTED = "selected"
}

/** 导出数据请求 */
export interface ExportReq {
  /** 模型 UID */
  model_uid: string
  /** 导出范围 */
  scope: ExportScope
  /** 资源 ID 列表 (scope='selected' 时必填) */
  resource_ids?: number[]
  /** 筛选条件组 (scope='all' 或 'current' 时可选) */
  filter_groups?: ExportFilterGroup[]
  /** 导出字段列表 (可选, 默认为全部字段) */
  fields?: string[]
  /** 关联模型字段列表 */
  related_fields?: ExportRelatedField[]
  /** 文件名 (可选, 后端可默认生成) */
  file_name?: string
}
