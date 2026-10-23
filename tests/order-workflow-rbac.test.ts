import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../src/db";
import { transitionOrderStatus, WorkflowViolationError } from "../src/lib/workflow-engine";
import {
  createOrderAction,
  escalateOrderAction,
  pauseOrderAction,
  acceptOrderAction,
  startWorkTimer,
  stopWorkTimer,
  logManualWorkTime,
} from "../src/actions/order-actions";
import {
  createUser,
  updateUserRole,
  toggleUserStatus,
  importUsersFromAd,
  updateRolePermissions,
} from "../src/actions/user-admin-actions";

describe("Workflow Matrix & Acceptance Guard Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject transition to PAUSIERT if no reason/comment is provided", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-in-work",
    };

    const mockTransition = {
      id: "trans-pause",
      actionName: "Arbeit pausieren",
      requiredRoleId: null,
      fromStatus: { id: "status-in-work", name: "In Arbeit", code: "IN_WORK", category: "IN_PROGRESS" },
      toStatus: { id: "status-paused", name: "Pausiert", code: "PAUSIERT", category: "ON_HOLD" },
      guardConditions: {},
      requiresComment: true,
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

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => cb(txMock));

    await expect(
      transitionOrderStatus("order-1", "status-paused", "user-tech", { comment: "" })
    ).rejects.toThrow(/Kommentar zwingend erforderlich/);
  });

  it("should reject acceptance transition (TABG) if no time tracking entries exist", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-reported",
      actualDurationMinutes: 0, // No time logged!
    };

    const mockTransition = {
      id: "trans-accept",
      actionName: "Final abnehmen (TABG)",
      requiredRoleId: null,
      fromStatus: { id: "status-reported", name: "Rückgemeldet", category: "IN_PROGRESS" },
      toStatus: { id: "status-completed", name: "Technisch Abgeschlossen", code: "TABG", category: "COMPLETED" },
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
        orderTimeEntries: {
          findFirst: vi.fn().mockResolvedValue(null), // No time entry in DB!
        },
      },
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => cb(txMock));

    await expect(
      transitionOrderStatus("order-1", "status-completed", "user-coord")
    ).rejects.toThrow(/Vor der Abnahme muss mindestens eine Zeiterfassung/);
  });

  it("should allow acceptance transition (TABG) if time tracking exists on order", async () => {
    const mockOrder = {
      id: "order-1",
      tenantId: "tenant-1",
      orderTypeId: "type-1",
      currentStatusId: "status-reported",
      actualDurationMinutes: 75, // Time logged!
    };

    const mockTransition = {
      id: "trans-accept",
      actionName: "Final abnehmen (TABG)",
      requiredRoleId: null,
      fromStatus: { id: "status-reported", name: "Rückgemeldet", category: "IN_PROGRESS" },
      toStatus: { id: "status-completed", name: "Technisch Abgeschlossen", code: "TABG", category: "COMPLETED" },
      guardConditions: {},
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
        orderTimeEntries: {
          findFirst: vi.fn().mockResolvedValue({ id: "time-1", durationMinutes: 75 }),
        },
      },
      update: vi.fn().mockReturnValue({ set: updateSetMock }),
      insert: vi.fn().mockReturnValue({ values: insertValuesMock }),
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => cb(txMock));

    const result = await transitionOrderStatus("order-1", "status-completed", "user-coord", {
      comment: "Abnahme erfolgreich",
    });

    expect(result.success).toBe(true);
    expect(result.toStatusId).toBe("status-completed");
  });
});

describe("Order Creation Validation Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject order creation if orderTypeId is missing or empty", async () => {
    const res = await createOrderAction({
      tenantId: "tenant-1",
      title: "Pumpe defekt",
      description: "Lagertausch notwendig",
      priority: "2_HIGH",
      orderTypeId: "",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/zwingend eine gültige orderTypeId/);
  });

  it("should reject order creation if orderTypeId does not exist in DB", async () => {
    vi.spyOn(db.query.orderTypes, "findFirst").mockResolvedValue(undefined as any);

    const res = await createOrderAction({
      tenantId: "tenant-1",
      title: "Pumpe defekt",
      description: "Lagertausch notwendig",
      priority: "2_HIGH",
      orderTypeId: "non-existent-type",
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Ungültige orderTypeId.*Auftragsart existiert nicht/);
  });

  it("should create order successfully when orderTypeId is valid and scheduledStartDate is null", async () => {
    vi.spyOn(db.query.orderTypes, "findFirst").mockResolvedValue({
      id: "type-pm01",
      code: "PM01",
      name: "Störungsinstandsetzung",
    } as any);

    vi.spyOn(db.query.workflowStatuses, "findFirst").mockResolvedValue({
      id: "status-created",
      code: "CREATED",
      name: "Erfasst",
      isInitialStatus: true,
    } as any);

    const createdOrder = {
      id: "order-new-1",
      orderNumber: "MO-2026-999999",
      title: "Pumpe defekt",
      priority: "2_HIGH",
      scheduledStartAt: null,
    };

    vi.spyOn(db, "insert").mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdOrder]),
      }),
    } as any);

    const res = await createOrderAction({
      tenantId: "tenant-1",
      title: "Pumpe defekt",
      description: "Lagertausch notwendig",
      priority: "2_HIGH",
      orderTypeId: "type-pm01",
      scheduledStartDate: null, // Null-tolerant!
    });

    expect(res.success).toBe(true);
    expect(res.order.id).toBe("order-new-1");
  });
});

describe("Escalation Action Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should escalate an order to LEVEL_2 and write an audit log", async () => {
    const mockOrder = {
      id: "order-esc-1",
      tenantId: "tenant-1",
      currentStatusId: "status-open",
      reportedByUserId: "user-op",
      currentStatus: { name: "Freigegeben" },
    };

    vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrder as any);
    vi.spyOn(db.query.workflowStatuses, "findFirst").mockResolvedValue({
      id: "status-escalated",
      code: "ESCALATED",
      name: "Eskaliert",
    } as any);

    const updateSetMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    const insertValuesMock = vi.fn().mockResolvedValue({});

    vi.spyOn(db, "update").mockReturnValue({ set: updateSetMock } as any);
    vi.spyOn(db, "insert").mockReturnValue({ values: insertValuesMock } as any);

    const res = await escalateOrderAction("order-esc-1", "LEVEL_2", "Ersatzteil Lieferverzug", {
      userId: "user-coord",
    });

    expect(res.success).toBe(true);
    expect(res.escalationLevel).toBe("LEVEL_2");
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        escalationLevel: "LEVEL_2",
        priority: "2_HIGH",
        currentStatusId: "status-escalated",
      })
    );
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        comment: expect.stringContaining("[ESKALATION LEVEL_2]: Ersatzteil Lieferverzug"),
      })
    );
  });

  it("should escalate an order to LEVEL_3 and elevate priority to 1_EMERGENCY", async () => {
    const mockOrder = {
      id: "order-esc-2",
      tenantId: "tenant-1",
      currentStatusId: "status-open",
      reportedByUserId: "user-op",
      currentStatus: { name: "Freigegeben" },
    };

    vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrder as any);
    vi.spyOn(db.query.workflowStatuses, "findFirst").mockResolvedValue(undefined as any);

    const updateSetMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    const insertValuesMock = vi.fn().mockResolvedValue({});

    vi.spyOn(db, "update").mockReturnValue({ set: updateSetMock } as any);
    vi.spyOn(db, "insert").mockReturnValue({ values: insertValuesMock } as any);

    const res = await escalateOrderAction("order-esc-2", "LEVEL_3", "Produktionsstillstand droht");

    expect(res.success).toBe(true);
    expect(res.escalationLevel).toBe("LEVEL_3");
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        escalationLevel: "LEVEL_3",
        priority: "1_EMERGENCY",
      })
    );
  });
});

describe("Time Tracking & Work Documentation Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should start a live work timer on an order", async () => {
    const mockOrder = {
      id: "order-tt-1",
      tenantId: "tenant-1",
      assignedToUserId: "tech-1",
      actualStartAt: null,
    };

    vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrder as any);
    vi.spyOn(db.query.orderTimeEntries, "findFirst").mockResolvedValue(undefined as any); // No running timer

    const insertedTimer = {
      id: "timer-1",
      startedAt: new Date(),
    };

    vi.spyOn(db, "insert").mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([insertedTimer]),
      }),
    } as any);

    vi.spyOn(db, "update").mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    } as any);

    const res = await startWorkTimer("order-tt-1", { userId: "tech-1" });

    expect(res.success).toBe(true);
    expect(res.timerId).toBe("timer-1");
  });

  it("should stop a running work timer and accumulate actualDurationMinutes", async () => {
    const mockOrder = {
      id: "order-tt-1",
      tenantId: "tenant-1",
      actualDurationMinutes: 30,
    };

    const startTime = new Date(Date.now() - 45 * 60000); // 45 minutes ago
    const activeTimer = {
      id: "timer-1",
      startedAt: startTime,
      endedAt: null,
      workDescription: null,
    };

    vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrder as any);
    vi.spyOn(db.query.orderTimeEntries, "findFirst").mockResolvedValue(activeTimer as any);

    const updateSetMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    vi.spyOn(db, "update").mockReturnValue({ set: updateSetMock } as any);

    const res = await stopWorkTimer("order-tt-1", "Kugellager gereinigt und neu gefettet", "tech-1");

    expect(res.success).toBe(true);
    expect(res.durationMinutes).toBeGreaterThanOrEqual(44);
    expect(updateSetMock).toHaveBeenCalled();
  });

  it("should log manual work time with documentation text", async () => {
    const mockOrder = {
      id: "order-tt-2",
      tenantId: "tenant-1",
      actualDurationMinutes: 10,
    };

    vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrder as any);

    const insertedRecord = {
      id: "time-rec-1",
    };

    vi.spyOn(db, "insert").mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([insertedRecord]),
      }),
    } as any);

    const updateSetMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    vi.spyOn(db, "update").mockReturnValue({ set: updateSetMock } as any);

    const res = await logManualWorkTime("order-tt-2", 45, "Ölstand geprüft und nachgefüllt", {
      userId: "operator-1",
    });

    expect(res.success).toBe(true);
    expect(res.durationMinutes).toBe(45);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actualDurationMinutes: 55, // 10 + 45
      })
    );
  });
});

describe("User Admin Actions Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should create a new user and assign a role", async () => {
    vi.spyOn(db.query.users, "findFirst").mockResolvedValue(undefined as any);
    vi.spyOn(db.query.roles, "findFirst").mockResolvedValue({
      id: "role-tech",
      code: "TECHNICIAN",
      name: "Instandhalter",
    } as any);

    const createdUser = {
      id: "user-new",
      email: "max.mustermann@werk.de",
      firstName: "Max",
      lastName: "Mustermann",
    };

    vi.spyOn(db, "insert").mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([createdUser]),
      }),
    } as any);

    const res = await createUser({
      tenantId: "tenant-1",
      email: "max.mustermann@werk.de",
      firstName: "Max",
      lastName: "Mustermann",
      roleCodeOrId: "TECHNICIAN",
    });

    expect(res.success).toBe(true);
    expect(res.user?.email).toBe("max.mustermann@werk.de");
  });

  it("should toggle user status between active and inactive", async () => {
    const mockUser = {
      id: "user-active",
      tenantId: "tenant-1",
      firstName: "Anna",
      lastName: "Schmidt",
      isActive: true,
    };

    vi.spyOn(db.query.users, "findFirst").mockResolvedValue(mockUser as any);
    const updateSetMock = vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    });
    vi.spyOn(db, "update").mockReturnValue({ set: updateSetMock } as any);

    const res = await toggleUserStatus("user-active");

    expect(res.success).toBe(true);
    expect(res.isActive).toBe(false);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isActive: false,
      })
    );
  });

  it("should import users from AD CSV payload", async () => {
    vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({ id: "tenant-1" } as any);
    vi.spyOn(db.query.users, "findFirst").mockResolvedValue(undefined as any);
    vi.spyOn(db.query.roles, "findFirst").mockResolvedValue({ id: "role-1", code: "TECHNICIAN" } as any);

    vi.spyOn(db, "insert").mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "u-1" }]),
      }),
    } as any);

    const csvData = `email,firstName,lastName,role,personnelNr,workCenterCode
tech1@werk.de,Anton,Bauer,TECHNICIAN,00101,MECH-01
coord1@werk.de,Berta,Claus,COORDINATOR,00102,LEIT-01`;

    const res = await importUsersFromAd(csvData, { tenantId: "tenant-1" });

    expect(res.success).toBe(true);
    expect(res.importedCount).toBe(2);
  });

  it("should dynamically update role permissions in role_permissions table", async () => {
    vi.spyOn(db.query.permissions, "findMany").mockResolvedValue([
      { id: "perm-1", code: "orders:create" },
      { id: "perm-2", code: "orders:read" },
    ] as any);

    const deleteWhereMock = vi.fn().mockResolvedValue({});
    const insertValuesMock = vi.fn().mockResolvedValue({});

    vi.spyOn(db, "delete").mockReturnValue({ where: deleteWhereMock } as any);
    vi.spyOn(db, "insert").mockReturnValue({ values: insertValuesMock } as any);

    const res = await updateRolePermissions({
      roleId: "role-custom",
      permissionCodes: ["orders:create", "orders:read"],
    });

    expect(res.success).toBe(true);
    expect(deleteWhereMock).toHaveBeenCalled();
    expect(insertValuesMock).toHaveBeenCalled();
  });
});
