import type * as menu from "../../menu/types/menu"

export interface userRolePermission {
  menus: menu.menu[]
  role_codes: string[]
}

export interface rolePermission {
  authz_ids: number[]
  menus: menu.menu[]
  model_groups: ModelPermissionGroup[]
  denied_model_uids: string[]
}

export interface ModelPermission {
  id: number
  name: string
  uid: string
}

export interface ModelPermissionGroup {
  group_id: number
  group_name: string
  models: ModelPermission[]
}
