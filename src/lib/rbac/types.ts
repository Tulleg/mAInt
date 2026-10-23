export type SystemRoleCode =
  | "ADMIN"
  | "OPERATOR"
  | "COORDINATOR"
  | "TECHNICIAN"
  | "MAINT_PLANNER"
  | "SHIFT_LEAD"
  | "EXTERNAL_CONTRACTOR";

export type PermissionCode =
  | "orders:create"
  | "orders:read"
  | "orders:update"
  | "orders:delete"
  | "orders:transition"
  | "orders:complete"
  | "time:track"
  | "users:manage"
  | "workflows:manage"
  | "workflows:read"
  | "sap:sync"
  | "sap:configure"
  | "spare_parts:book"
  | "spare_parts:read"
  | "analytics:read"
  | "analytics:schedule"
  | "can_view_ai_analytics"
  | "assets:manage";

export interface UserRoleRecord {
  id: string;
  code: string;
  name: string;
  tenantId: string;
}

export interface TransitionPermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredRoleName?: string;
}
