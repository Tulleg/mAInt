import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  transitionOrderStatus,
  getAvailableTransitions,
  WorkflowViolationError,
} from "../src/lib/workflow-engine";
import { db } from "../src/db";
import * as sapConnectorModule from "../src/lib/sap/sap-connector";

describe("Workflow Engine & RBAC Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject transition if order not found", async () => {
    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return cb(txMock);
    });

    await expect(
      transitionOrderStatus("invalid-order-id", "status-2", "user-1")
    ).rejects.toThrow("nicht gefunden");
  });

  it("should reject transition if no transition rule exists in workflow_transitions", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-1",
    };

    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        workflowTransitions: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        workflowStatuses: {
          findFirst: vi.fn().mockResolvedValue({ id: "status-2", name: "In Arbeit" }),
        },
      },
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return cb(txMock);
    });

    await expect(
      transitionOrderStatus("order-1", "status-2", "user-1")
    ).rejects.toThrow("Ungültiger Statusübergang");
  });

  it("should reject transition if user lacks required role (RBAC)", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-1",
    };

    const mockTransition = {
      id: "trans-1",
      actionName: "Auftrag freigeben",
      requiredRoleId: "role-maint-planner",
      requiredRole: { id: "role-maint-planner", name: "Instandhaltungsplaner" },
      fromStatus: { id: "status-1", name: "Erfasst" },
      toStatus: { id: "status-2", name: "Freigegeben", category: "OPEN" },
      guardConditions: {},
    };

    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        workflowTransitions: {
          findFirst: vi.fn().mockResolvedValue(mockTransition),
        },
        userRoles: {
          findFirst: vi.fn().mockResolvedValue(null), // User has NO role
        },
        roles: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return cb(txMock);
    });

    await expect(
      transitionOrderStatus("order-1", "status-2", "user-unauthorized")
    ).rejects.toThrow(/Fehlende Berechtigung.*Instandhaltungsplaner/);
  });

  it("should reject transition if checklist guard condition is violated", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-in-work",
      inspectionTemplateId: "tpl-1",
      checklistResultsJson: null, // Checklist not completed!
    };

    const mockTransition = {
      id: "trans-complete",
      actionName: "Technisch abschließen",
      requiredRoleId: null,
      fromStatus: { id: "status-in-work", name: "In Arbeit" },
      toStatus: { id: "status-completed", name: "Technisch Abgeschlossen", category: "COMPLETED" },
      guardConditions: {
        requireChecklistCompleted: true,
      },
    };

    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        workflowTransitions: {
          findFirst: vi.fn().mockResolvedValue(mockTransition),
        },
      },
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return cb(txMock);
    });

    await expect(
      transitionOrderStatus("order-1", "status-completed", "user-tech")
    ).rejects.toThrow(/Guard Condition verletzt.*Prüfprotokoll/);
  });

  it("should reject transition if root cause guard is violated", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-in-work",
      rootCauseDescription: "", // Empty root cause!
    };

    const mockTransition = {
      id: "trans-complete",
      actionName: "Technisch abschließen",
      requiredRoleId: null,
      fromStatus: { id: "status-in-work", name: "In Arbeit" },
      toStatus: { id: "status-completed", name: "Technisch Abgeschlossen", category: "COMPLETED" },
      guardConditions: {
        requireRootCauseFilled: true,
      },
    };

    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        workflowTransitions: {
          findFirst: vi.fn().mockResolvedValue(mockTransition),
        },
      },
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return cb(txMock);
    });

    await expect(
      transitionOrderStatus("order-1", "status-completed", "user-tech")
    ).rejects.toThrow(/Guard Condition verletzt.*Schadensursache/);
  });

  it("should reject transition if damage code guard is violated", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-in-work",
      damageCode: null,
      damageCodeId: null,
    };

    const mockTransition = {
      id: "trans-complete",
      actionName: "Technisch abschließen",
      requiredRoleId: null,
      fromStatus: { id: "status-in-work", name: "In Arbeit" },
      toStatus: { id: "status-completed", name: "Technisch Abgeschlossen", category: "COMPLETED" },
      guardConditions: {
        requireDamageCode: true,
      },
    };

    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        workflowTransitions: {
          findFirst: vi.fn().mockResolvedValue(mockTransition),
        },
      },
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return cb(txMock);
    });

    await expect(
      transitionOrderStatus("order-1", "status-completed", "user-tech")
    ).rejects.toThrow(/Guard Condition verletzt.*Schadenscode/);
  });

  it("should successfully transition status, write audit log, and return result when authorized and guards satisfied", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-1",
      actualDurationMinutes: 45,
      actualEndAt: null,
    };

    const mockTransition = {
      id: "trans-ok",
      actionName: "Freigeben",
      requiredRoleId: "role-planner",
      requiredRole: { name: "Planer" },
      fromStatus: { id: "status-1", name: "Erfasst", category: "DRAFT" },
      toStatus: { id: "status-2", name: "Freigegeben", category: "OPEN" },
      guardConditions: {},
      triggersSapSync: false,
    };

    const updateSetMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    const insertValuesMock = vi.fn().mockResolvedValue({});

    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        workflowTransitions: {
          findFirst: vi.fn().mockResolvedValue(mockTransition),
        },
        userRoles: {
          findFirst: vi.fn().mockResolvedValue({ userId: "user-planner", roleId: "role-planner" }),
        },
      },
      update: vi.fn().mockReturnValue({ set: updateSetMock }),
      insert: vi.fn().mockReturnValue({ values: insertValuesMock }),
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return cb(txMock);
    });

    const result = await transitionOrderStatus("order-1", "status-2", "user-planner", {
      comment: "Freigabe erteilt",
    });

    expect(result.success).toBe(true);
    expect(result.fromStatusId).toBe("status-1");
    expect(result.toStatusId).toBe("status-2");
    expect(txMock.update).toHaveBeenCalled();
    expect(txMock.insert).toHaveBeenCalled();
  });

  it("should trigger sapConnector.updateOrderStatus when triggerSapSync is true, and enqueue into sap_sync_queue on failure", async () => {
    const mockOrder = {
      id: "order-sap",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-1",
      actualDurationMinutes: 30,
      actualEndAt: null,
    };

    const mockTransition = {
      id: "trans-sap",
      actionName: "In Arbeit",
      requiredRoleId: null,
      fromStatus: { id: "status-1", name: "Freigegeben", category: "OPEN" },
      toStatus: { id: "status-2", name: "In Arbeit", category: "IN_PROGRESS" },
      guardConditions: {},
      triggerSapSync: true,
    };

    const insertValuesMock = vi.fn().mockResolvedValue({});
    const updateSetMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });

    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(mockOrder),
        },
        workflowTransitions: {
          findFirst: vi.fn().mockResolvedValue(mockTransition),
        },
      },
      update: vi.fn().mockReturnValue({ set: updateSetMock }),
      insert: vi.fn().mockReturnValue({ values: insertValuesMock }),
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => cb(txMock));

    // Mock SAP connector to fail and verify fallback queueing
    const mockSapConnector = {
      updateOrderStatus: vi.fn().mockRejectedValue(new Error("SAP System offline")),
    };
    vi.spyOn(sapConnectorModule, "getSapConnector").mockResolvedValue(mockSapConnector as any);

    const result = await transitionOrderStatus("order-sap", "status-2", "user-1", {
      notes: "Status update with SAP sync",
    });

    expect(result.success).toBe(true);
    expect(result.sapSyncQueued).toBe(true);
    expect(mockSapConnector.updateOrderStatus).toHaveBeenCalledWith("order-sap", "status-2", {
      fromStatusId: "status-1",
      notes: "Status update with SAP sync",
    });
    // Check insert called for both audit log and sap_sync_queue
    expect(txMock.insert).toHaveBeenCalledTimes(2);
  });

  describe("getAvailableTransitions", () => {
    it("should return available transitions with guard fulfillment flags for user role", async () => {
      const mockOrder = {
        id: "order-available-1",
        tenantId: "tenant-1",
        orderTypeId: "type-pm01",
        currentStatusId: "status-created",
        actualDurationMinutes: 0,
        damageCode: "MECH-01",
        damageCodeId: "code-uuid-1",
        rootCauseDescription: "Verschleiß an Dichtung",
        inspectionTemplateId: "tpl-1",
        checklistResultsJson: {
          completedAt: new Date().toISOString(),
          values: { check_1: "OK" },
        },
      };

      const mockTransitions = [
        {
          id: "trans-tech",
          orderTypeId: "type-pm01",
          fromStatusId: "status-created",
          toStatusId: "status-work",
          actionName: "Bearbeiten",
          description: "Starten",
          requiredRoleId: "TECHNICIAN",
          triggerSapSync: true,
          requireChecklist: true,
          requireTimeEntry: false,
          requireRootCause: true,
          requireSignature: false,
          requiresComment: false,
          guardConditions: {
            requireDamageCode: true,
          },
          fromStatus: { id: "status-created", code: "ERFASST", name: "Erfasst", category: "DRAFT" },
          toStatus: { id: "status-work", code: "IN_ARBEIT", name: "In Arbeit", category: "IN_PROGRESS", color: "sky", colorHex: "#38BDF8" },
          requiredRole: { id: "role-tech-id", code: "TECHNICIAN", name: "Techniker" },
        },
        {
          id: "trans-admin-only",
          orderTypeId: "type-pm01",
          fromStatusId: "status-created",
          toStatusId: "status-cancelled",
          actionName: "Stornieren",
          description: "Abbrechen",
          requiredRoleId: "ADMIN",
          triggerSapSync: false,
          requireChecklist: false,
          requireTimeEntry: false,
          requireRootCause: false,
          requireSignature: false,
          requiresComment: true,
          guardConditions: {},
          fromStatus: { id: "status-created", code: "ERFASST", name: "Erfasst", category: "DRAFT" },
          toStatus: { id: "status-cancelled", code: "STORNIERT", name: "Storniert", category: "CLOSED" },
          requiredRole: { id: "role-admin-id", code: "ADMIN", name: "Administrator" },
        },
      ];

      vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrder as any);
      vi.spyOn(db.query.workflowTransitions, "findMany").mockResolvedValue(mockTransitions as any);
      vi.spyOn(db.query.roles, "findMany").mockResolvedValue([
        { id: "role-tech-id", code: "TECHNICIAN", name: "Techniker" },
        { id: "role-admin-id", code: "ADMIN", name: "Administrator" },
      ] as any);

      // 1. TECHNICIAN should see only the technician transition
      const techTransitions = await getAvailableTransitions("order-available-1", "TECHNICIAN");
      expect(techTransitions).toHaveLength(1);
      expect(techTransitions[0].actionName).toBe("Bearbeiten");
      expect(techTransitions[0].guards.requireChecklist).toBe(true);
      expect(techTransitions[0].guards.checklistSatisfied).toBe(true);
      expect(techTransitions[0].guards.requireDamageCode).toBe(true);
      expect(techTransitions[0].guards.damageCodeSatisfied).toBe(true);
      expect(techTransitions[0].guards.rootCauseSatisfied).toBe(true);
      expect(techTransitions[0].guards.allGuardsSatisfied).toBe(true);

      // 2. ADMIN should see all transitions
      const adminTransitions = await getAvailableTransitions("order-available-1", "ADMIN");
      expect(adminTransitions).toHaveLength(2);
    });
  });
});

