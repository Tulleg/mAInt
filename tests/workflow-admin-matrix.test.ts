import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createOrderStatus,
  updateOrderStatus,
  deleteOrderStatus,
  saveWorkflowMatrix,
  getOrderTypeWorkflows,
} from "../src/actions/workflow-actions";
import { db } from "../src/db";
import { RbacPermissionError } from "../src/lib/rbac";

describe("Workflow Admin Server Actions & Matrix Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("createOrderStatus", () => {
    it("should reject creation if user is not ADMIN", async () => {
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({ id: "tenant-1" } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        { role: { code: "TECHNICIAN" } },
      ] as any);

      await expect(
        createOrderStatus(
          {
            code: "NEU_STATUS",
            name: "Neuer Status",
            category: "IN_PROGRESS",
            userId: "user-tech",
          }
        )
      ).rejects.toThrow(RbacPermissionError);
    });

    it("should allow creation if user is ADMIN", async () => {
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({ id: "tenant-1" } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);

      const mockCreated = {
        id: "status-new-id",
        tenantId: "tenant-1",
        code: "IN_INSPECTION",
        name: "In Prüfung",
        category: "IN_PROGRESS",
      };

      vi.spyOn(db, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      } as any);

      const result = await createOrderStatus({
        code: "IN_INSPECTION",
        name: "In Prüfung",
        category: "IN_PROGRESS",
        userId: "user-admin",
      });

      expect(result.success).toBe(true);
      expect(result.data.code).toBe("IN_INSPECTION");
      expect(result.data.name).toBe("In Prüfung");
    });
  });

  describe("updateOrderStatus", () => {
    it("should reject update if user is not ADMIN", async () => {
      vi.spyOn(db.query.orderStatuses, "findFirst").mockResolvedValue({
        id: "status-1",
        tenantId: "tenant-1",
        name: "Alt",
      } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        { role: { code: "TECHNICIAN" } },
      ] as any);

      await expect(
        updateOrderStatus("status-1", {
          name: "Neuer Name",
          userId: "user-tech",
        })
      ).rejects.toThrow(RbacPermissionError);
    });

    it("should allow update if user is ADMIN", async () => {
      vi.spyOn(db.query.orderStatuses, "findFirst").mockResolvedValue({
        id: "status-1",
        tenantId: "tenant-1",
        name: "Alt",
      } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);

      const mockUpdated = {
        id: "status-1",
        name: "Aktualisierter Status",
      };

      vi.spyOn(db, "update").mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([mockUpdated]),
          }),
        }),
      } as any);

      const result = await updateOrderStatus("status-1", {
        name: "Aktualisierter Status",
        userId: "user-admin",
      });

      expect(result.success).toBe(true);
      expect(result.data.name).toBe("Aktualisierter Status");
    });
  });

  describe("deleteOrderStatus", () => {
    it("should reject deletion if user is not ADMIN", async () => {
      vi.spyOn(db.query.orderStatuses, "findFirst").mockResolvedValue({
        id: "status-1",
        tenantId: "tenant-1",
        name: "Status 1",
      } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        { role: { code: "TECHNICIAN" } },
      ] as any);

      await expect(
        deleteOrderStatus("status-1", { userId: "user-tech" })
      ).rejects.toThrow(RbacPermissionError);
    });

    it("should reject deletion if orders currently exist in that status", async () => {
      vi.spyOn(db.query.orderStatuses, "findFirst").mockResolvedValue({
        id: "status-1",
        tenantId: "tenant-1",
        name: "Status in Benutzung",
      } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);
      vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue({
        id: "order-42",
        currentStatusId: "status-1",
      } as any);

      await expect(
        deleteOrderStatus("status-1", { userId: "user-admin" })
      ).rejects.toThrow(/kann nicht gelöscht werden, da er noch von Instandhaltungsaufträgen verwendet wird/);
    });

    it("should successfully delete status and associated transitions for ADMIN when no orders use it", async () => {
      vi.spyOn(db.query.orderStatuses, "findFirst").mockResolvedValue({
        id: "status-unused",
        tenantId: "tenant-1",
        name: "Ungenutzter Status",
      } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);
      vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(undefined as any);

      const deleteWhereMock = vi.fn().mockResolvedValue({});
      vi.spyOn(db, "delete").mockReturnValue({
        where: deleteWhereMock,
      } as any);

      const result = await deleteOrderStatus("status-unused", { userId: "user-admin" });
      expect(result.success).toBe(true);
      expect(result.data.name).toBe("Ungenutzter Status");
      expect(deleteWhereMock).toHaveBeenCalledTimes(2); // 1 for transitions, 1 for status
    });
  });

  describe("saveWorkflowMatrix", () => {
    it("should reject matrix saving if user is not ADMIN", async () => {
      vi.spyOn(db.query.orderTypes, "findFirst").mockResolvedValue({
        id: "type-pm01",
        tenantId: "tenant-1",
      } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        { role: { code: "COORDINATOR" } },
      ] as any);

      await expect(
        saveWorkflowMatrix("type-pm01", [], { userId: "user-coord" })
      ).rejects.toThrow(RbacPermissionError);
    });

    it("should save full workflow transition matrix atomically in transaction for ADMIN", async () => {
      vi.spyOn(db.query.orderTypes, "findFirst").mockResolvedValue({
        id: "type-pm01",
        tenantId: "tenant-1",
      } as any);
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);

      const deleteWhereMock = vi.fn().mockResolvedValue({});
      const insertValuesMock = vi.fn().mockResolvedValue({});

      const txMock = {
        delete: vi.fn().mockReturnValue({ where: deleteWhereMock }),
        insert: vi.fn().mockReturnValue({ values: insertValuesMock }),
      };

      vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => cb(txMock));

      const transitionsInput = [
        {
          fromStatusId: "stat-draft",
          toStatusId: "stat-open",
          actionName: "Freigeben",
          requiredRoleId: "role-planner",
          triggerSapSync: true,
          requireChecklist: false,
          requireTimeEntry: false,
          requireRootCause: false,
          guardConditions: {},
        },
        {
          fromStatusId: "stat-open",
          toStatusId: "stat-work",
          actionName: "Bearbeiten",
          requiredRoleId: "role-tech",
          triggerSapSync: false,
          requireChecklist: false,
          requireTimeEntry: false,
          requireRootCause: false,
          guardConditions: {},
        },
        {
          fromStatusId: "stat-work",
          toStatusId: "stat-complete",
          actionName: "Technisch abschließen",
          requiredRoleId: "role-tech",
          triggerSapSync: true,
          requireChecklist: true,
          requireTimeEntry: true,
          requireRootCause: true,
          guardConditions: {
            requireChecklistCompleted: true,
            requireActualDurationFilled: true,
            requireRootCauseFilled: true,
            requireDamageCode: true,
          },
        },
      ];

      const result = await saveWorkflowMatrix("type-pm01", transitionsInput, {
        userId: "user-admin",
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(txMock.delete).toHaveBeenCalled();
      expect(txMock.insert).toHaveBeenCalled();
    });
  });

  describe("getOrderTypeWorkflows", () => {
    it("should fetch all configured transitions for the given orderTypeId", async () => {
      const mockTransitions = [
        {
          id: "trans-1",
          orderTypeId: "type-pm01",
          fromStatusId: "stat-1",
          toStatusId: "stat-2",
          actionName: "Freigabe",
          isActive: true,
        },
        {
          id: "trans-2",
          orderTypeId: "type-pm01",
          fromStatusId: "stat-2",
          toStatusId: "stat-3",
          actionName: "Abschluss",
          isActive: true,
        },
      ];

      vi.spyOn(db.query.workflowTransitions, "findMany").mockResolvedValue(mockTransitions as any);

      const result = await getOrderTypeWorkflows("type-pm01");
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.transitions).toHaveLength(2);
      expect(result.data[0].actionName).toBe("Freigabe");
    });
  });
});
