import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../src/db";
import {
  getUserSavedViews,
  createSavedView,
  updateSavedView,
  deleteSavedView,
  getSavedViewById,
  getSavedViewAction,
} from "../src/actions/saved-view-actions";
import { queryOrdersAction, getOrderDetailsAction } from "../src/actions/order-actions";

describe("Saved Views & Query Orders Server Actions Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Saved View Actions", () => {
    it("should fetch user saved views ordered by position", async () => {
      const mockViews = [
        {
          id: "view-1",
          tenantId: "tenant-1",
          userId: "user-1",
          name: "Eingangspool",
          filterPayload: { status: ["OPEN"] },
          refreshInterval: 30,
          displayDensity: "standard",
          position: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "view-2",
          tenantId: "tenant-1",
          userId: "user-1",
          name: "Wartungen",
          filterPayload: { status: ["IN_PROGRESS"] },
          refreshInterval: 60,
          displayDensity: "compact",
          position: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      vi.spyOn(db.query.userSavedViews, "findMany").mockResolvedValue(mockViews as any);

      const res = await getUserSavedViews("user-1");

      expect(Array.isArray(res)).toBe(true);
      expect(res).toHaveLength(2);
      expect(res[0].name).toBe("Eingangspool");
      expect(res[1].name).toBe("Wartungen");
      expect(res.success).toBe(true);
      expect(res.views).toEqual(mockViews);
    });

    it("should create a new saved view with default density and calculated position", async () => {
      const createdView = {
        id: "view-new",
        tenantId: "demo-tenant-1000",
        userId: "user-1",
        name: "Meine Notfälle",
        icon: "star",
        intent: "ORDERS_QUERY",
        filterPayload: { priority: ["1_EMERGENCY"] },
        refreshInterval: 15,
        displayDensity: "standard",
        position: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db.query.userSavedViews, "findMany").mockResolvedValue([]);
      vi.spyOn(db, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([createdView]),
        }),
      } as any);

      const res = await createSavedView({
        name: "Meine Notfälle",
        filterPayload: { priority: ["1_EMERGENCY"] },
        refreshInterval: 15,
        userId: "user-1",
      });

      expect(res.success).toBe(true);
      expect(res.id).toBe("view-new");
      expect(res.name).toBe("Meine Notfälle");
      expect(res.refreshInterval).toBe(15);
    });

    it("should reject creating a saved view with empty name", async () => {
      await expect(
        createSavedView({
          name: "  ",
          filterPayload: {},
        })
      ).rejects.toThrow("Ein Name für den Favoriten ist erforderlich.");
    });

    it("should update a saved view configuration", async () => {
      const existingView = {
        id: "view-1",
        tenantId: "demo-tenant-1000",
        userId: "user-1",
        name: "Alt",
        refreshInterval: 0,
        displayDensity: "standard",
      };

      const updatedView = {
        ...existingView,
        name: "Neu Konfiguriert",
        refreshInterval: 45,
        displayDensity: "compact",
        updatedAt: new Date(),
      };

      vi.spyOn(db.query.userSavedViews, "findFirst").mockResolvedValue(existingView as any);
      vi.spyOn(db, "update").mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedView]),
          }),
        }),
      } as any);

      const res = await updateSavedView("view-1", {
        name: "Neu Konfiguriert",
        refreshInterval: 45,
        displayDensity: "compact",
      });

      expect(res.success).toBe(true);
      expect(res.name).toBe("Neu Konfiguriert");
      expect(res.refreshInterval).toBe(45);
      expect(res.displayDensity).toBe("compact");
    });

    it("should delete a saved view", async () => {
      vi.spyOn(db, "delete").mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      } as any);

      const res = await deleteSavedView("view-to-delete");
      expect(res.success).toBe(true);
      expect(res.id).toBe("view-to-delete");
    });

    it("should reject deleting or updating a saved view with empty or invalid viewId", async () => {
      const res = await deleteSavedView("   ");
      expect(res.success).toBe(false);
      expect(res.error).toContain("Ungültige oder leere viewId");

      await expect(updateSavedView("", { name: "Test" })).rejects.toThrow("Ungültige viewId");
    });

    it("should safely fetch saved view by id or handle invalid / non-existent id gracefully", async () => {
      // 1. Leere ID
      const emptyRes = await getSavedViewById("");
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.view).toBeNull();
      expect(emptyRes.error).toBeDefined();

      // 2. Nicht gefundene ID
      vi.spyOn(db.query.userSavedViews, "findFirst").mockResolvedValue(null as any);
      const notFoundRes = await getSavedViewById("non-existent-id");
      expect(notFoundRes.success).toBe(false);
      expect(notFoundRes.view).toBeNull();
      expect(notFoundRes.error).toContain("nicht gefunden");

      // 3. Gültige ID
      const mockView = {
        id: "view-123",
        name: "Meine Störungen",
        filterPayload: { priorityList: ["1_EMERGENCY"] },
      };
      vi.spyOn(db.query.userSavedViews, "findFirst").mockResolvedValue(mockView as any);
      const foundRes = await getSavedViewAction("view-123");
      expect(foundRes.success).toBe(true);
      expect(foundRes.view?.id).toBe("view-123");
      expect(foundRes.view?.name).toBe("Meine Störungen");
    });
  });

  describe("Dynamic Order Queries (queryOrdersAction) & Deep-Linking Absicherung", () => {
    it("should query orders with relations: equipment, functionalLocation, assembly, and damageCode", async () => {
      const mockOrder = {
        id: "order-101",
        orderNumber: "MO-2026-0001",
        title: "Druckverlust Hydraulikaggregat",
        description: "Pumpe fördert nicht ausreichend Druck",
        priority: "1_EMERGENCY",
        currentStatusId: "status-open-uuid",
        currentStatus: { id: "status-open-uuid", code: "FREI", name: "Freigegeben", category: "OPEN" },
        equipmentId: "eq-1",
        equipment: {
          id: "eq-1",
          name: "Hydraulikaggregat 01",
          equipmentNumber: "EQ-HYD-01",
          assemblies: [{ id: "bg-1", code: "BG-PUMP", name: "Druckpumpe" }],
        },
        functionalLocationId: "floc-1",
        functionalLocation: { id: "floc-1", code: "W1-HALLE1-L1", name: "Fertigungslinie 1" },
        assemblyId: null,
        assembly: null,
        damageCodeId: "dc-1",
        damageCodeCatalog: { id: "dc-1", code: "HYD-LEAK", name: "Leckage / Druckabfall" },
        damageCode: "HYD-LEAK",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({ id: "demo-tenant-1000" } as any);
      vi.spyOn(db.query.functionalLocations, "findMany").mockResolvedValue([{ id: "floc-1" }] as any);
      vi.spyOn(db.query.equipments, "findMany").mockResolvedValue([{ id: "eq-1" }] as any);
      vi.spyOn(db.query.workflowStatuses, "findMany").mockResolvedValue([
        { id: "status-open-uuid", code: "FREI", category: "OPEN" },
      ] as any);
      vi.spyOn(db.query.maintenanceOrders, "findMany").mockResolvedValue([mockOrder] as any);

      const res = await queryOrdersAction({
        areaId: "area-halle-1",
        statusList: ["OPEN"],
        priorityList: ["1_EMERGENCY"],
        search: "Druckverlust",
        limit: 10,
      });

      expect(Array.isArray(res)).toBe(true);
      expect(res).toHaveLength(1);
      expect(res.success).toBe(true);

      const firstOrder = res[0];
      expect(firstOrder.id).toBe("order-101");
      expect(firstOrder.equipment).toBeDefined();
      expect(firstOrder.equipment?.name).toBe("Hydraulikaggregat 01");
      expect(firstOrder.functionalLocation).toBeDefined();
      expect(firstOrder.functionalLocation?.code).toBe("W1-HALLE1-L1");
      expect(firstOrder.assembly).toBeDefined();
      expect(firstOrder.assembly?.code).toBe("BG-PUMP");
      expect(firstOrder.damageCodeCatalog).toBeDefined();
      expect(firstOrder.damageCodeCatalog?.code).toBe("HYD-LEAK");
    });

    it("should resolve viewId deep-linking and merge filterPayload safely without throwing", async () => {
      const mockSavedView = {
        id: "view-deep-link",
        name: "Kritische Pumpenstörungen",
        filterPayload: {
          statusList: ["OPEN", "IN_PROGRESS"],
          priorityList: ["1_EMERGENCY"],
          search: "Pumpe",
        },
      };

      vi.spyOn(db.query.userSavedViews, "findFirst").mockResolvedValue(mockSavedView as any);
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({ id: "demo-tenant-1000" } as any);
      vi.spyOn(db.query.workflowStatuses, "findMany").mockResolvedValue([
        { id: "status-uuid-1", code: "OPEN", category: "OPEN" },
      ] as any);
      vi.spyOn(db.query.equipments, "findMany").mockResolvedValue([]);
      vi.spyOn(db.query.functionalLocations, "findMany").mockResolvedValue([]);
      vi.spyOn(db.query.maintenanceOrders, "findMany").mockResolvedValue([]);

      const res = await queryOrdersAction({
        viewId: "view-deep-link",
      });

      expect(res.success).toBe(true);
      expect(Array.isArray(res.orders)).toBe(true);
    });

    it("should handle empty or invalid filter parameters gracefully without generating faulty SQL", async () => {
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({ id: "demo-tenant-1000" } as any);
      vi.spyOn(db.query.maintenanceOrders, "findMany").mockResolvedValue([]);

      const res = await queryOrdersAction({
        areaId: "   ",
        statusList: ["", "   "],
        priorityList: ["UNGUELTIG", ""],
        search: "   ",
        viewId: "invalid-or-empty-view-id",
        limit: -5,
        offset: -10,
      });

      expect(res.success).toBe(true);
      expect(Array.isArray(res.orders)).toBe(true);
    });
  });

  describe("Detail-Fetch Server Action (getOrderDetailsAction)", () => {
    it("should catch invalid or empty order IDs without throwing unhandled exceptions", async () => {
      const resEmpty = await getOrderDetailsAction("");
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.order).toBeNull();
      expect(resEmpty.error).toContain("Ungültige oder leere Auftrags-ID");

      const resWhitespace = await getOrderDetailsAction("   ");
      expect(resWhitespace.success).toBe(false);
      expect(resWhitespace.order).toBeNull();

      const resNull = await getOrderDetailsAction(null as any);
      expect(resNull.success).toBe(false);
      expect(resNull.order).toBeNull();
    });

    it("should handle non-existent order gracefully and return success: false without throwing", async () => {
      vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(null as any);

      const res = await getOrderDetailsAction("00000000-0000-0000-0000-000000000099");
      expect(res.success).toBe(false);
      expect(res.order).toBeNull();
      expect(res.error).toContain("existiert nicht");
    });

    it("should load order details with all relational dependencies (equipment, floc, protocols, timeEntries)", async () => {
      const mockOrder = {
        id: "order-12345",
        orderNumber: "MO-2026-00412",
        title: "Reparatur Kühlmittelpumpe",
        description: "Dichtung getauscht",
        priority: "1_EMERGENCY",
        currentStatusId: "stat-open",
        currentStatus: { id: "stat-open", code: "OPEN", name: "Freigegeben" },
        orderTypeId: "ot-1",
        orderType: { id: "ot-1", code: "IH01", name: "Instandsetzung" },
        equipmentId: "eq-1",
        equipment: {
          id: "eq-1",
          name: "Kühlmittelpumpe 1",
          equipmentNumber: "EQ-100",
          functionalLocation: { id: "floc-1", code: "W1-L1", name: "Linie 1" },
          assemblies: [{ id: "bg-1", name: "Laufrad" }],
        },
        functionalLocationId: "floc-1",
        functionalLocation: { id: "floc-1", code: "W1-L1", name: "Linie 1" },
        assembly: null,
        damageCodeCatalog: null,
        reportedByUser: { firstName: "Max", lastName: "Mustermann" },
        assignedToUser: { firstName: "Anna", lastName: "Techniker" },
        statusAuditLogs: [
          {
            id: "log-1",
            fromStatusId: "stat-open",
            toStatusId: "stat-open",
            comment: "Auftrag neu angelegt",
            createdAt: new Date(),
          },
        ],
        timeEntries: [
          {
            id: "time-1",
            durationMinutes: 45,
            startedAt: new Date(),
          },
        ],
        sparePartBookings: [
          {
            id: "part-book-1",
            quantity: 2,
            bookedAt: new Date(),
          },
        ],
      };

      vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrder as any);
      vi.spyOn(db.query.workflowTransitions, "findMany").mockResolvedValue([
        { id: "trans-1", actionName: "Freigeben" },
      ] as any);

      const res = await getOrderDetailsAction("order-12345");

      expect(res.success).toBe(true);
      expect(res.order).toBeDefined();
      expect(res.order?.id).toBe("order-12345");
      expect(res.order?.title).toBe("Reparatur Kühlmittelpumpe");

      // Relationale Abhängigkeiten
      expect(res.order?.equipment?.name).toBe("Kühlmittelpumpe 1");
      expect(res.order?.functionalLocation?.code).toBe("W1-L1");
      expect(res.order?.assembly?.name).toBe("Laufrad");

      // Protokolle und Zeiteinträge als sichere Arrays
      expect(Array.isArray(res.order?.protocols)).toBe(true);
      expect(res.order?.protocols).toHaveLength(1);
      expect(Array.isArray(res.order?.timeEntries)).toBe(true);
      expect(res.order?.timeEntries).toHaveLength(1);
      expect(Array.isArray(res.order?.sparePartBookings)).toBe(true);
      expect(res.order?.sparePartBookings).toHaveLength(1);
      expect(Array.isArray(res.order?.transitions)).toBe(true);
      expect(res.order?.transitions).toHaveLength(1);
    });

    it("should guarantee empty arrays fallback for relational dependencies when none exist", async () => {
      const mockOrderNoRelations = {
        id: "order-empty-rel",
        orderNumber: "MO-2026-00999",
        title: "Auftrag ohne Historie",
        description: "Neu erstellter Auftrag",
        priority: "3_MEDIUM",
        currentStatusId: "stat-1",
        orderTypeId: "ot-1",
        equipment: null,
        functionalLocation: null,
        assembly: null,
        statusAuditLogs: null,
        timeEntries: null,
        sparePartBookings: null,
      };

      vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrderNoRelations as any);
      vi.spyOn(db.query.orderStatusAuditLogs, "findMany").mockResolvedValue([] as any);
      vi.spyOn(db.query.orderTimeEntries, "findMany").mockResolvedValue([] as any);
      vi.spyOn(db.query.workflowTransitions, "findMany").mockResolvedValue([] as any);

      const res = await getOrderDetailsAction("order-empty-rel");

      expect(res.success).toBe(true);
      expect(res.order).toBeDefined();
      expect(res.order?.equipment).toBeNull();
      expect(res.order?.functionalLocation).toBeNull();
      expect(res.order?.assembly).toBeNull();
      expect(Array.isArray(res.order?.protocols)).toBe(true);
      expect(res.order?.protocols).toEqual([]);
      expect(Array.isArray(res.order?.timeEntries)).toBe(true);
      expect(res.order?.timeEntries).toEqual([]);
      expect(Array.isArray(res.order?.sparePartBookings)).toBe(true);
      expect(res.order?.sparePartBookings).toEqual([]);
      expect(Array.isArray(res.order?.transitions)).toBe(true);
      expect(res.order?.transitions).toEqual([]);
    });
  });
});
