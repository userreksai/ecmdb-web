import { useUserStore } from "@/pinia/stores/user"
import HyRequest from "@@/utils/request"
import { getToken } from "@@/utils/cache/cookies"

export type ApiService = keyof typeof API_SERVICE
export const API_SERVICE = {
  CMDB: import.meta.env.VITE_ECMDB_API_PREFIX,
  TASK: import.meta.env.VITE_TASK_API_PREFIX,
  ALERT: import.meta.env.VITE_ALERT_API_PREFIX
}

const instance = new HyRequest({
  baseURL: import.meta.env.VITE_BASE_API,
  timeout: 5000,
  withCredentials: true,
  interceptors: {
    requestInterceptor: (config) => {
      const token = getToken()
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`
      }
      return config
    },
    responseInterceptor: (response) => {
      const userStore = useUserStore()
      const token = response.headers?.["x-access-token"]
      if (token) {
        userStore.setToken(token)
      }
      return response
    }
  }
})

export default instance
