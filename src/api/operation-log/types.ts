export type OperationType = "CREATE" | "UPDATE" | "DELETE" | "IMPORT"

export interface OperationLog {
  id: number
  account: string
  operation_model: string
  operation_type: OperationType
  original_data: unknown
  modified_data: unknown
  operation_time: string
  modified_count: number
}

export interface ListOperationLogReq {
  offset: number
  limit: number
  account?: string
  operation_model?: string
  operation_type?: OperationType | ""
  start_time?: string
  end_time?: string
}

export interface ListOperationLogRes {
  total: number
  logs: OperationLog[]
}
