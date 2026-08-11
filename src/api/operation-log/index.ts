import instance from "@@/utils/service"
import { API_SERVICE } from "@@/utils/service"
import type { ListOperationLogReq, ListOperationLogRes } from "./types"

export function listOperationLogsApi(data: ListOperationLogReq) {
  return instance.post<ListOperationLogRes>({
    url: `${API_SERVICE.CMDB}/operation-log/list`,
    data
  })
}
