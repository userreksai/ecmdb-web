import type * as task from "./type"
import instance from "@@/utils/service"
import { API_SERVICE } from "@@/utils/service"

/** 创建任务 */
export function createTaskApi(data: task.CreateTaskReq) {
  return instance.post<string>({
    url: `${API_SERVICE.TASK}/manager/create`,
    data
  })
}

/** 修改任务 */
export function updateTaskApi(data: task.UpdateTaskReq) {
  return instance.post<void>({
    url: `${API_SERVICE.TASK}/manager/update`,
    data
  })
}

/** 获取任务列表 */
export function listTasksApi(data: task.PageQuery) {
  return instance.post<task.TaskPage>({
    url: `${API_SERVICE.TASK}/manager/list`,
    data
  })
}

/** 获取单条任务详情 */
export function getTaskDetailApi(taskId: number) {
  return instance.get<task.TaskItem>({
    url: `${API_SERVICE.TASK}/manager/detail/${taskId}`
  })
}

/** 获取任务日志 */
export function getTaskLogsApi(data: task.GetLogsReq) {
  return instance.post<task.ListLogResp>({
    url: `${API_SERVICE.TASK}/manager/logs`,
    data
  })
}

/** 获取任务执行历史列表 */
export function listExecutionsApi(data: task.ListExecutionsReq) {
  return instance.post<task.ListExecutionResp>({
    url: `${API_SERVICE.TASK}/manager/executions`,
    data
  })
}

/** 删除任务 */
export function deleteTaskApi(taskId: number) {
  return instance.delete<void>({
    url: `${API_SERVICE.TASK}/manager/delete/${taskId}`
  })
}

/** 立即运行一次任务 */
export function runTaskApi(taskId: number) {
  return instance.post<void>({
    url: `${API_SERVICE.TASK}/manager/run/${taskId}`
  })
}

/** 停止任务执行/禁用调度 */
export function stopTaskApi(taskId: number) {
  return instance.post<void>({
    url: `${API_SERVICE.TASK}/manager/stop/${taskId}`
  })
}

/** 创建任务分类 */
export function createTaskCategoryApi(data: task.CreateTaskCategoryReq) {
  return instance.post<number>({
    url: `${API_SERVICE.TASK}/manager/categories/create`,
    data
  })
}

/** 任务分类列表 */
export function listTaskCategoriesApi(keyword = "") {
  return instance.post<task.TaskCategoryList>({
    url: `${API_SERVICE.TASK}/manager/categories/list`,
    data: { keyword }
  })
}

/** 更新任务分类 */
export function updateTaskCategoryApi(data: task.UpdateTaskCategoryReq) {
  return instance.post<number>({
    url: `${API_SERVICE.TASK}/manager/categories/update`,
    data
  })
}

/** 删除任务分类，已归类任务会回到未分类 */
export function deleteTaskCategoryApi(categoryId: number) {
  return instance.delete<number>({
    url: `${API_SERVICE.TASK}/manager/categories/${categoryId}`
  })
}

/** 覆盖指定分类的任务集合 */
export function replaceCategoryTasksApi(categoryId: number, data: task.ReplaceCategoryTasksReq) {
  return instance.post<void>({
    url: `${API_SERVICE.TASK}/manager/categories/${categoryId}/tasks`,
    data
  })
}
