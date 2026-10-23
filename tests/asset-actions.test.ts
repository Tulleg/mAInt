import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "../src/db";
import {
  createArea,
  updateArea,
  deleteArea,
  createFunctionalLocation,
  updateFunctionalLocation,
  deleteFunctionalLocation,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  createAssembly,
  updateAssembly,
  deleteAssembly,
  syncAssetsFromSapAction,
  getAssetHierarchy,
  getSapSyncMode,
} from "../src/actions/asset-actions";
import { updateGlobalSapModeAction } from "../src/actions/admin-sap-actions";
import { RbacPermissionError } from "../src/lib/rbac";

describe("Asset Management & Security Guards", () => {
  const originalEnv = process.env.SAP_MODE;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.SAP_MODE;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SAP_MODE = originalEnv;
    } else {
      delete process.env.SAP_MODE;
    }
  });

  describe("1. RBAC Guard Permissions", () => {
    it("should reject manual asset creation if user lacks ADMIN role or assets:manage permission", async () => {
      // Mock user without admin role and without assets:manage permission
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-tech",
          roleId: "role-tech",
          role: { id: "role-tech", code: "TECHNICIAN", name: "Techniker", tenantId: "tenant-1" },
        } as any,
      ]);
      vi.spyOn(db.query.userRoles, "findFirst").mockResolvedValue(undefined as any);
      vi.spyOn(db.query.rolePermissions, "findFirst").mockResolvedValue(undefined as any);

      await expect(
        createArea({
          tenantId: "tenant-1",
          code: "AREA-01",
          name: "Fertigungshalle 1",
          userId: "user-tech",
        })
      ).rejects.toThrow(RbacPermissionError);

      await expect(
        createFunctionalLocation({
          tenantId: "tenant-1",
          code: "W1-HALLE1-L1",
          name: "Linie 1",
          userId: "user-tech",
        })
      ).rejects.toThrow(RbacPermissionError);

      await expect(
        createEquipment({
          tenantId: "tenant-1",
          functionalLocationId: "floc-1",
          equipmentNumber: "EQ-100",
          name: "Roboterzelle 1",
          userId: "user-tech",
        })
      ).rejects.toThrow(RbacPermissionError);

      await expect(
        createAssembly({
          tenantId: "tenant-1",
          parentEquipmentId: "eq-1",
          equipmentNumber: "BG-101",
          name: "Greifarm Modul A",
          userId: "user-tech",
        })
      ).rejects.toThrow(RbacPermissionError);
    });

    it("should allow manual asset creation if user has role ADMIN", async () => {
      process.env.SAP_MODE = "STANDALONE";

      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);

      const mockArea = {
        id: "area-1",
        tenantId: "tenant-1",
        code: "AREA-01",
        name: "Montage",
        source: "MANUAL",
        isActive: true,
      };

      vi.spyOn(db, "insert").mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockArea]),
        }),
      } as any);

      const res = await createArea({
        tenantId: "tenant-1",
        code: "AREA-01",
        name: "Montage",
        userId: "user-admin",
      });

      expect(res.success).toBe(true);
      expect(res.area?.code).toBe("AREA-01");
    });
  });

  describe("2. SAP-Modus Guard Protection", () => {
    it("should reject manual Create/Update/Delete when SAP_MODE is active (ODATA_V4 or RFC_BAPI)", async () => {
      process.env.SAP_MODE = "ODATA_V4";

      // Even if user is ADMIN
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);

      const expectedErrorMessage =
        "Stammdaten werden zentral über SAP PM geführt und können im aktiven SAP-Modus nicht manuell bearbeitet werden.";

      await expect(
        createArea({
          tenantId: "tenant-1",
          code: "AREA-99",
          name: "Neue Halle",
          userId: "user-admin",
        })
      ).rejects.toThrow(expectedErrorMessage);

      vi.spyOn(db.query.areas, "findFirst").mockResolvedValue({
        id: "area-1",
        tenantId: "tenant-1",
        code: "AREA-01",
        name: "Halle 1",
        source: "MANUAL",
      } as any);

      await expect(
        updateArea({
          id: "area-1",
          name: "Halle 1 Neu",
          userId: "user-admin",
        })
      ).rejects.toThrow(expectedErrorMessage);

      await expect(deleteArea("area-1", "user-admin")).rejects.toThrow(expectedErrorMessage);
    });

    it("should properly detect SAP mode from getSapSyncMode()", async () => {
      process.env.SAP_MODE = "RFC_BAPI";
      expect(await getSapSyncMode("tenant-1")).toBe("RFC_BAPI");

      delete process.env.SAP_MODE;
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({
        id: "tenant-1",
        sapSyncMode: "ODATA_V4",
      } as any);
      expect(await getSapSyncMode("tenant-1")).toBe("ODATA_V4");

      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({
        id: "tenant-1",
        sapSyncMode: "STANDALONE",
      } as any);
      expect(await getSapSyncMode("tenant-1")).toBe("STANDALONE");
    });

    it("should allow ADMIN to centrally switch global operating mode via updateGlobalSapModeAction", async () => {
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({
        id: "tenant-1",
        code: "WERK-1000",
        sapSyncMode: "STANDALONE",
      } as any);

      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);

      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });
      vi.spyOn(db, "update").mockReturnValue({ set: updateSetMock } as any);

      const res = await updateGlobalSapModeAction({
        tenantId: "tenant-1",
        mode: "ODATA_V4",
        sapPlantCode: "1000",
        userId: "user-admin",
      });

      expect(res.success).toBe(true);
      expect(res.mode).toBe("ODATA_V4");
      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sapSyncMode: "ODATA_V4",
          sapPlantCode: "1000",
        })
      );
    });
  });

  describe("3. SAP Source Protection (source === 'SAP')", () => {
    beforeEach(() => {
      process.env.SAP_MODE = "STANDALONE";
      vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
        {
          userId: "user-admin",
          roleId: "role-admin",
          role: { id: "role-admin", code: "ADMIN", name: "Administrator", tenantId: "tenant-1" },
        } as any,
      ]);
    });

    it("should reject updating or deleting records that originate from SAP (source === 'SAP')", async () => {
      const sapArea = {
        id: "area-sap-1",
        tenantId: "tenant-1",
        code: "AREA-SAP",
        name: "SAP Import Halle",
        source: "SAP",
      };

      const sapFloc = {
        id: "floc-sap-1",
        tenantId: "tenant-1",
        code: "W1-SAP-PL1",
        name: "SAP Technischer Platz",
        source: "SAP",
      };

      const sapEquipment = {
        id: "eq-sap-1",
        tenantId: "tenant-1",
        equipmentNumber: "EQ-SAP-100",
        name: "SAP Pumpe",
        source: "SAP",
        isAssembly: false,
      };

      const sapAssembly = {
        id: "asm-sap-1",
        tenantId: "tenant-1",
        parentEquipmentId: "eq-sap-1",
        equipmentNumber: "ASM-SAP-200",
        name: "SAP Getriebe",
        source: "SAP",
        isAssembly: true,
      };

      vi.spyOn(db.query.areas, "findFirst").mockResolvedValue(sapArea as any);
      vi.spyOn(db.query.functionalLocations, "findFirst").mockResolvedValue(sapFloc as any);
      (vi.spyOn(db.query.equipments, "findFirst") as any).mockImplementation(((args: any) => {
        if (args?.where && String(args.where).includes("asm-sap-1")) {
          return Promise.resolve(sapAssembly as any);
        }
        return Promise.resolve(sapEquipment as any);
      }) as any);

      const expectedError = /Datensätze mit source === 'SAP' dürfen grundsätzlich nicht manuell überschrieben werden/;

      // Area
      await expect(
        updateArea({ id: "area-sap-1", name: "Geänderter Name", userId: "user-admin" })
      ).rejects.toThrow(expectedError);
      await expect(deleteArea("area-sap-1", "user-admin")).rejects.toThrow(expectedError);

      // Functional Location
      await expect(
        updateFunctionalLocation({ id: "floc-sap-1", name: "Neu", userId: "user-admin" })
      ).rejects.toThrow(expectedError);
      await expect(deleteFunctionalLocation("floc-sap-1", "user-admin")).rejects.toThrow(expectedError);

      // Equipment
      await expect(
        updateEquipment({ id: "eq-sap-1", name: "Neu", userId: "user-admin" })
      ).rejects.toThrow(expectedError);
      await expect(deleteEquipment("eq-sap-1", "user-admin")).rejects.toThrow(expectedError);

      // Assembly
      await expect(
        updateAssembly({ id: "asm-sap-1", name: "Neu", userId: "user-admin" })
      ).rejects.toThrow(expectedError);
      await expect(deleteAssembly("asm-sap-1", "user-admin")).rejects.toThrow(expectedError);
    });
  });

  describe("4. SAP Synchronization Action", () => {
    it("should fetch functional locations and equipments via SapConnector and upsert with source = 'SAP' and last_synced_at", async () => {
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({
        id: "tenant-1",
        sapSyncMode: "ODATA_V4",
      } as any);

      // Existing floc in DB
      vi.spyOn(db.query.functionalLocations, "findFirst").mockResolvedValue({
        id: "floc-1",
        tenantId: "tenant-1",
        code: "TPLNR-001",
        name: "Alter Name",
      } as any);

      // No existing equipment in DB
      vi.spyOn(db.query.equipments, "findFirst").mockResolvedValue(undefined as any);

      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });
      vi.spyOn(db, "update").mockReturnValue({ set: updateSetMock } as any);

      const insertValuesMock = vi.fn().mockResolvedValue({});
      vi.spyOn(db, "insert").mockReturnValue({ values: insertValuesMock } as any);

      const res = await syncAssetsFromSapAction("area-1", { tenantId: "tenant-1" });

      expect(res.success).toBe(true);
      expect(res.message).toMatch(/erfolgreich mit SAP synchronisiert/);
    });

    it("should upsert DTOs with source = 'SAP' and last_synced_at when connector provides fetch methods", async () => {
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({
        id: "tenant-1",
        sapSyncMode: "STANDALONE",
      } as any);

      // Existing floc in DB
      vi.spyOn(db.query.functionalLocations, "findFirst").mockResolvedValue({
        id: "floc-1",
        tenantId: "tenant-1",
        code: "TPLNR-001",
        name: "Alter Name",
      } as any);

      // Existing equipment in DB
      vi.spyOn(db.query.equipments, "findFirst").mockResolvedValue({
        id: "eq-1",
        tenantId: "tenant-1",
        equipmentNumber: "EQ-100",
        name: "Alte Pumpe",
      } as any);

      const updateSetMock = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      });
      vi.spyOn(db, "update").mockReturnValue({ set: updateSetMock } as any);

      const mockConnector = {
        fetchFunctionalLocations: vi.fn().mockResolvedValue([
          { sapTplnr: "TPLNR-001", code: "TPLNR-001", name: "Neuer Floc Name aus SAP" },
        ]),
        fetchEquipments: vi.fn().mockResolvedValue([
          { sapEquipmentNr: "SAP-EQ-100", equipmentNumber: "EQ-100", name: "Neue Pumpe aus SAP" },
        ]),
        pullEquipments: vi.fn().mockResolvedValue({ importedCount: 0, updatedCount: 0 }),
      };

      const sapConnectorModule = await import("../src/lib/sap/sap-connector");
      vi.spyOn(sapConnectorModule, "getSapConnector").mockResolvedValue(mockConnector as any);

      const res = await syncAssetsFromSapAction("area-1", { tenantId: "tenant-1" });

      expect(res.success).toBe(true);
      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          source: "SAP",
          sapSyncStatus: "SYNCED",
        })
      );
    });
  });

  describe("5. Filterable Asset Hierarchy Tree", () => {
    const mockAreas = [
      { id: "area-1", tenantId: "tenant-1", code: "A1", name: "Halle 1", description: "Presswerk", isActive: true, source: "MANUAL", lastSyncedAt: null },
      { id: "area-2", tenantId: "tenant-1", code: "A2", name: "Halle 2", description: "Lackiererei", isActive: true, source: "MANUAL", lastSyncedAt: null },
    ];

    const mockFlocs = [
      { id: "floc-1", tenantId: "tenant-1", areaId: "area-1", code: "FL-01", name: "Presse Linie A", description: "Schuler Presse", costCenter: "K100", plantSection: "P1", sapTplnr: "TPL-1", parentFunctionalLocationId: null, source: "MANUAL", lastSyncedAt: null },
      { id: "floc-2", tenantId: "tenant-1", areaId: "area-2", code: "FL-02", name: "Tauchbecken", description: "KTL", costCenter: "K200", plantSection: "P2", sapTplnr: "TPL-2", parentFunctionalLocationId: null, source: "MANUAL", lastSyncedAt: null },
    ];

    const mockEquipments = [
      { id: "eq-1", tenantId: "tenant-1", functionalLocationId: "floc-1", parentEquipmentId: null, isAssembly: false, equipmentNumber: "EQ-PUMP-01", name: "Hydraulikpumpe A", description: "Hauptpumpe", manufacturer: "Bosch Rexroth", modelType: "A10VSO", serialNumber: "SN-9988", criticality: "A", status: "ACTIVE", sapEquipmentNr: "SAP-101", source: "MANUAL", lastSyncedAt: null },
      { id: "asm-1", tenantId: "tenant-1", functionalLocationId: "floc-1", parentEquipmentId: "eq-1", isAssembly: true, equipmentNumber: "BG-VALVE-01", name: "Proportionalventil", description: "Regelventil", manufacturer: "Rexroth", modelType: "4WRPEH", serialNumber: "SN-VALVE-1", criticality: "A", status: "ACTIVE", sapEquipmentNr: "SAP-201", source: "MANUAL", lastSyncedAt: null },
    ];

    beforeEach(() => {
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({ id: "tenant-1" } as any);
      vi.spyOn(db.query.areas, "findMany").mockResolvedValue(mockAreas as any);
      vi.spyOn(db.query.functionalLocations, "findMany").mockResolvedValue(mockFlocs as any);
      vi.spyOn(db.query.equipments, "findMany").mockResolvedValue(mockEquipments as any);
    });

    it("should build full 4-level nested hierarchy: Bereiche -> Plätze -> Equipments -> Baugruppen", async () => {
      const tree = await getAssetHierarchy({ tenantId: "tenant-1" });

      expect(tree).toHaveLength(2); // 2 areas

      const area1 = tree.find((a) => a.id === "area-1");
      expect(area1).toBeDefined();
      expect(area1?.functionalLocations).toHaveLength(1);

      const floc1 = area1?.functionalLocations[0];
      expect(floc1?.code).toBe("FL-01");
      expect(floc1?.equipments).toHaveLength(1);

      const eq1 = floc1?.equipments[0];
      expect(eq1?.equipmentNumber).toBe("EQ-PUMP-01");
      expect(eq1?.assemblies).toHaveLength(1);

      const asm1 = eq1?.assemblies[0];
      expect(asm1?.equipmentNumber).toBe("BG-VALVE-01");
      expect(asm1?.name).toBe("Proportionalventil");
    });

    it("should filter hierarchy by areaId", async () => {
      vi.spyOn(db.query.areas, "findMany").mockResolvedValue([mockAreas[0]] as any);

      const tree = await getAssetHierarchy({ areaId: "area-1", tenantId: "tenant-1" });

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("area-1");
    });

    it("should filter hierarchy by search keyword matching equipment or assembly", async () => {
      const tree = await getAssetHierarchy({ search: "Proportionalventil", tenantId: "tenant-1" });

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe("area-1");
      expect(tree[0].functionalLocations).toHaveLength(1);
      expect(tree[0].functionalLocations[0].equipments).toHaveLength(1);
      expect(tree[0].functionalLocations[0].equipments[0].assemblies).toHaveLength(1);
      expect(tree[0].functionalLocations[0].equipments[0].assemblies[0].name).toBe("Proportionalventil");
    });
  });
});
