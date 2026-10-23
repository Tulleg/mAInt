import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../src/db";
import {
  getEquipmentAction,
  getFunctionalLocationAction,
  createEquipmentAction,
  updateEquipmentAction,
  deleteEquipmentAction,
} from "../src/actions/equipment-actions";
import { getOrderDetailsAction, queryOrdersAction } from "../src/actions/order-actions";
import { getInspectionTemplateAction } from "../src/actions/maintenance-plan-actions";

describe("Defensive Server Actions, Safe Joins & Zod Guards", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. getEquipmentAction (404 & Safe Joins)", () => {
    it("should return clean validation error for empty or invalid equipment ID without throwing", async () => {
      const resEmpty = await getEquipmentAction("");
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.error).toMatch(/Ungültige oder leere Equipment-ID/);
      expect(resEmpty.equipment).toBeNull();

      const resWhitespace = await getEquipmentAction("   ");
      expect(resWhitespace.success).toBe(false);
      expect(resWhitespace.error).toMatch(/Ungültige oder leere Equipment-ID/);

      const resNull = await getEquipmentAction(null as any);
      expect(resNull.success).toBe(false);
    });

    it("should return clean 404 error when equipment does not exist in DB", async () => {
      vi.spyOn(db.query.equipments, "findFirst").mockResolvedValue(null as any);

      const res = await getEquipmentAction("00000000-0000-0000-0000-000000000099");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/nicht gefunden \(404\)/);
      expect(res.equipment).toBeNull();
    });

    it("should provide safe join fallbacks (area: null, assemblies: []) when relational links are missing", async () => {
      const mockEquipmentNoRelations = {
        id: "eq-isolated-1",
        tenantId: "tenant-1",
        equipmentNumber: "EQ-ISOLATED",
        name: "Stand-Alone Aggregat",
        isAssembly: false,
        functionalLocationId: null,
        parentEquipmentId: null,
        status: "ACTIVE",
        functionalLocation: null,
        parentEquipment: null,
        assemblies: null,
      };

      vi.spyOn(db.query.equipments, "findFirst").mockResolvedValue(mockEquipmentNoRelations as any);

      const res = await getEquipmentAction("eq-isolated-1");

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data?.id).toBe("eq-isolated-1");
      expect(res.data?.functionalLocation).toBeNull();
      expect(res.data?.area).toBeNull();
      expect(res.data?.parentEquipment).toBeNull();
      expect(Array.isArray(res.data?.assemblies)).toBe(true);
      expect(res.data?.assemblies).toEqual([]);
      expect(res.equipment).toEqual(res.data);
    });
  });

  describe("2. getFunctionalLocationAction (404 & Safe Joins)", () => {
    it("should reject invalid ID gracefully", async () => {
      const res = await getFunctionalLocationAction("");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/Ungültige oder leere Floc-ID/);
    });

    it("should return 404 when location does not exist", async () => {
      vi.spyOn(db.query.functionalLocations, "findFirst").mockResolvedValue(null as any);

      const res = await getFunctionalLocationAction("floc-non-existent");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/nicht gefunden \(404\)/);
    });
  });

  describe("3. getInspectionTemplateAction (404 Not Found Handling)", () => {
    it("should return clean 404 when template ID is not found", async () => {
      vi.spyOn(db.query.inspectionTemplates, "findFirst").mockResolvedValue(null as any);

      const res = await getInspectionTemplateAction("template-9999");
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/nicht gefunden \(404\)/);
    });
  });

  describe("4. Zod Validation Guards in Equipment CRUD", () => {
    it("should reject createEquipmentAction when required fields are missing before hitting DB", async () => {
      const res = await createEquipmentAction({
        tenantId: "",
        equipmentNumber: "",
        name: "",
        functionalLocationId: "",
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(/Validierungsfehler/);
      }
    });

    it("should reject updateEquipmentAction when required fields are missing", async () => {
      const res = await updateEquipmentAction({
        id: "",
        tenantId: "",
      });

      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(/Validierungsfehler/);
      }
    });

    it("should reject deleteEquipmentAction when IDs are invalid", async () => {
      const res = await deleteEquipmentAction("", "");
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error).toMatch(/Validierungsfehler/);
      }
    });
  });

  describe("5. getOrderDetailsAction Safe Joins & Standardized Pattern", () => {
    it("should return standardized { success: true, data: T } pattern and guarantee non-null fallbacks", async () => {
      const mockOrder = {
        id: "order-test-safe",
        orderNumber: "MO-SAFE-01",
        title: "Sicherheitstest Safe Join",
        priority: "3_MEDIUM",
        currentStatusId: "stat-open",
        equipment: null,
        functionalLocation: null,
        assembly: null,
        statusAuditLogs: null,
        timeEntries: null,
        sparePartBookings: null,
      };

      vi.spyOn(db.query.maintenanceOrders, "findFirst").mockResolvedValue(mockOrder as any);

      const res = await getOrderDetailsAction("order-test-safe");

      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.order).toBeDefined();
      expect(res.data?.equipment).toBeNull();
      expect(res.data?.functionalLocation).toBeNull();
      expect(Array.isArray(res.data?.protocols)).toBe(true);
      expect(Array.isArray(res.data?.timeEntries)).toBe(true);
      expect(Array.isArray(res.data?.sparePartBookings)).toBe(true);
    });
  });
});
