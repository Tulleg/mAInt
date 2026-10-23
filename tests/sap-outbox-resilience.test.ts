import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "../src/db";
import { sapSyncQueue, spareParts, orderSparePartBookings } from "../src/db/schema";
import { getSapConnector } from "../src/lib/sap/sap-connector";
import { processSapSyncQueue } from "../src/lib/sap/queue-worker";
import { processSapSyncQueue as processSapSyncQueueAction } from "../src/actions/order-actions";

describe("SAP Outbox-Resilienz & Retry-Worker Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("1. Outbox-Resilienz bei SAP-Ausfall (ODATA_V4 & BAPI)", () => {
    it("should enqueue Goods Movement 261 into sap_sync_queue with status PENDING when ODATA_V4 returns 500 or timeout", async () => {
      process.env.SAP_MODE = "ODATA_V4";
      process.env.SAP_ODATA_BASE_URL = "https://sap-gateway.example.com";

      const mockTenant = {
        id: "tenant-uuid-1",
        name: "Werk Nord",
        sapSyncMode: "ODATA_V4",
        sapConfig: { baseUrl: "https://sap-gateway.example.com" },
      };

      const mockSparePart = {
        id: "part-uuid-1",
        tenantId: "tenant-uuid-1",
        sapMaterialNr: "MAT-261-001",
        name: "Kugellager SKF 6205",
        stockQuantity: 10,
        storageLocation: "0001",
      };

      // Mock DB Queries
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue(mockTenant as any);
      vi.spyOn(db.query.spareParts, "findFirst").mockResolvedValue(mockSparePart as any);

      // Mock DB Update & Insert
      const updateSetSpy = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) });
      vi.spyOn(db, "update").mockReturnValue({ set: updateSetSpy } as any);

      let capturedQueueInsert: any = null;
      let capturedBookingInsert: any = null;

      vi.spyOn(db, "insert").mockImplementation((table: any) => {
        return {
          values: vi.fn().mockImplementation((val: any) => {
            if (table === sapSyncQueue) {
              capturedQueueInsert = val;
            } else if (table === orderSparePartBookings) {
              capturedBookingInsert = val;
            }
            return {
              returning: vi.fn().mockResolvedValue([{ id: "booking-uuid-1", ...val }]),
            };
          }),
        } as any;
      });

      // Simulate SAP OData 500 Internal Server Error
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: vi.fn().mockResolvedValue("RFC Connection to backend failed"),
      } as any);

      const connector = await getSapConnector("tenant-uuid-1");
      const result = await connector.bookSparePartConsumption(
        "order-uuid-101",
        "MAT-261-001",
        2,
        "0001",
        {
          userId: "user-uuid-99",
          unitPrice: 45.5,
          batchNumber: "CHARGE-A",
        }
      );

      // Assert Outbox Resilience
      expect(result.success).toBe(false);
      expect(result.queuedForSync).toBe(true);
      expect(result.message).toContain("sap_sync_queue");

      // Verify sap_sync_queue entry
      expect(capturedQueueInsert).not.toBeNull();
      expect(capturedQueueInsert.status).toBe("PENDING");
      expect(capturedQueueInsert.operation).toBe("SPARE_PART_BOOKING");
      expect(capturedQueueInsert.entityType).toBe("SPARE_PART_BOOKING");
      expect(capturedQueueInsert.entityId).toBe("order-uuid-101");
      expect(capturedQueueInsert.payload).toMatchObject({
        orderId: "order-uuid-101",
        materialNr: "MAT-261-001",
        quantity: 2,
        goodsMovementType: "261",
        batchNumber: "CHARGE-A",
      });

      // Verify local inventory booking was saved as PENDING
      expect(capturedBookingInsert).not.toBeNull();
      expect(capturedBookingInsert.sapSyncStatus).toBe("PENDING");
      expect(capturedBookingInsert.quantityConsumed).toBe("2");
    });

    it("should enqueue Goods Movement 261 into sap_sync_queue with status PENDING when BAPI returns Timeout/Network Error", async () => {
      process.env.SAP_MODE = "BAPI";
      process.env.SAP_MIDDLEWARE_URL = "https://sap-middleware.example.com";

      const mockTenant = {
        id: "tenant-uuid-2",
        name: "Werk Süd",
        sapSyncMode: "RFC_BAPI",
        sapConfig: { middlewareUrl: "https://sap-middleware.example.com" },
      };

      const mockSparePart = {
        id: "part-uuid-2",
        tenantId: "tenant-uuid-2",
        sapMaterialNr: "MAT-BAPI-261",
        name: "Dichtungssatz",
        stockQuantity: 5,
        storageLocation: "0002",
      };

      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue(mockTenant as any);
      vi.spyOn(db.query.spareParts, "findFirst").mockResolvedValue(mockSparePart as any);

      let capturedQueueInsert: any = null;
      let capturedBookingInsert: any = null;

      vi.spyOn(db, "update").mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }),
      } as any);

      vi.spyOn(db, "insert").mockImplementation((table: any) => {
        return {
          values: vi.fn().mockImplementation((val: any) => {
            if (table === sapSyncQueue) {
              capturedQueueInsert = val;
            } else if (table === orderSparePartBookings) {
              capturedBookingInsert = val;
            }
            return {
              returning: vi.fn().mockResolvedValue([{ id: "booking-bapi-1", ...val }]),
            };
          }),
        } as any;
      });

      // Simulate Network Timeout
      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("The operation was aborted due to timeout")
      );

      const connector = await getSapConnector("tenant-uuid-2");
      const result = await connector.bookSparePartConsumption(
        "order-uuid-202",
        "MAT-BAPI-261",
        1,
        "0002",
        {
          userId: "user-uuid-88",
          unitPrice: 120.0,
        }
      );

      expect(result.success).toBe(false);
      expect(result.queuedForSync).toBe(true);
      expect(result.message).toContain("sap_sync_queue");

      expect(capturedQueueInsert).not.toBeNull();
      expect(capturedQueueInsert.status).toBe("PENDING");
      expect(capturedQueueInsert.operation).toBe("SPARE_PART_BOOKING");
      expect(capturedQueueInsert.payload).toMatchObject({
        orderId: "order-uuid-202",
        materialNr: "MAT-BAPI-261",
        quantity: 1,
        goodsMovementType: "261",
        bapi: "BAPI_GOODSMVT_CREATE",
      });
      expect(capturedBookingInsert.sapSyncStatus).toBe("PENDING");
    });
  });

  describe("2. Retry-Worker (processSapSyncQueue)", () => {
    it("should retry pending booking, send to SAP and update queue status to PROCESSED on success", async () => {
      process.env.SAP_MODE = "ODATA_V4";
      process.env.SAP_ODATA_BASE_URL = "https://sap-gateway.example.com";

      const mockPendingJob = {
        id: "queue-job-1",
        tenantId: "tenant-uuid-1",
        operation: "SPARE_PART_BOOKING",
        entityType: "SPARE_PART_BOOKING",
        entityId: "order-uuid-101",
        status: "PENDING",
        retryCount: 0,
        maxRetries: 5,
        payload: {
          orderId: "order-uuid-101",
          materialNr: "MAT-261-001",
          quantity: 2,
          storageLocation: "0001",
          goodsMovementType: "261",
          bookingId: "booking-uuid-1",
        },
        scheduledAt: new Date(),
        createdAt: new Date(),
      };

      vi.spyOn(db.query.sapSyncQueue, "findMany").mockResolvedValue([mockPendingJob as any]);
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({
        id: "tenant-uuid-1",
        sapSyncMode: "ODATA_V4",
        sapConfig: { baseUrl: "https://sap-gateway.example.com" },
      } as any);

      vi.spyOn(db.query.spareParts, "findFirst").mockResolvedValue({
        id: "part-uuid-1",
        tenantId: "tenant-uuid-1",
        sapMaterialNr: "MAT-261-001",
      } as any);

      const updatedStatuses: any[] = [];
      vi.spyOn(db, "update").mockImplementation((table: any) => {
        return {
          set: vi.fn().mockImplementation((setValues: any) => {
            if (table === sapSyncQueue) {
              updatedStatuses.push(setValues);
            }
            return {
              where: vi.fn().mockResolvedValue({}),
            };
          }),
        } as any;
      });

      // Simulate SAP OData success on retry
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: vi.fn().mockResolvedValue({
          d: { MaterialDocument: "MBLNR-2026-9999" },
        }),
      } as any);

      const result = await processSapSyncQueue({ tenantId: "tenant-uuid-1" });

      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(1);
      expect(result.failedCount).toBe(0);
      expect(result.details[0].status).toBe("PROCESSED");

      // Verify that status was updated to PROCESSED
      const processedUpdate = updatedStatuses.find((u) => u.status === "PROCESSED");
      expect(processedUpdate).toBeDefined();
      expect(processedUpdate?.status).toBe("PROCESSED");
      expect(processedUpdate?.processedAt).toBeDefined();
      expect(processedUpdate?.errorMessage).toBeNull();
    });

    it("should retain status PENDING and increment retryCount if SAP fails during retry", async () => {
      process.env.SAP_MODE = "ODATA_V4";
      process.env.SAP_ODATA_BASE_URL = "https://sap-gateway.example.com";

      const mockPendingJob = {
        id: "queue-job-2",
        tenantId: "tenant-uuid-1",
        operation: "SPARE_PART_BOOKING",
        entityType: "SPARE_PART_BOOKING",
        entityId: "order-uuid-101",
        status: "PENDING",
        retryCount: 1,
        maxRetries: 5,
        payload: {
          orderId: "order-uuid-101",
          materialNr: "MAT-261-001",
          quantity: 2,
          storageLocation: "0001",
          goodsMovementType: "261",
        },
        scheduledAt: new Date(),
        createdAt: new Date(),
      };

      vi.spyOn(db.query.sapSyncQueue, "findMany").mockResolvedValue([mockPendingJob as any]);
      vi.spyOn(db.query.tenants, "findFirst").mockResolvedValue({
        id: "tenant-uuid-1",
        sapSyncMode: "ODATA_V4",
        sapConfig: { baseUrl: "https://sap-gateway.example.com" },
      } as any);

      vi.spyOn(db.query.spareParts, "findFirst").mockResolvedValue({
        id: "part-uuid-1",
        tenantId: "tenant-uuid-1",
        sapMaterialNr: "MAT-261-001",
      } as any);

      const updatedStatuses: any[] = [];
      vi.spyOn(db, "update").mockImplementation((table: any) => {
        return {
          set: vi.fn().mockImplementation((setValues: any) => {
            if (table === sapSyncQueue) {
              updatedStatuses.push(setValues);
            }
            return {
              where: vi.fn().mockResolvedValue({}),
            };
          }),
        } as any;
      });

      // Simulate continuing 503 Service Unavailable
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        text: vi.fn().mockResolvedValue("Maintenance Mode"),
      } as any);

      const result = await processSapSyncQueue({ tenantId: "tenant-uuid-1" });

      expect(result.success).toBe(false);
      expect(result.processedCount).toBe(0);
      expect(result.failedCount).toBe(1);

      // Verify retry increment and retained PENDING status
      const retryUpdate = updatedStatuses.find((u) => u.retryCount === 2);
      expect(retryUpdate).toBeDefined();
      expect(retryUpdate?.status).toBe("PENDING");
      expect(retryUpdate?.errorMessage).toContain("503");
    });

    it("should be executable via Server Action processSapSyncQueue", async () => {
      vi.spyOn(db.query.sapSyncQueue, "findMany").mockResolvedValue([]);

      const result = await processSapSyncQueueAction({ tenantId: "tenant-uuid-1" });
      expect(result).toHaveProperty("processedCount", 0);
      expect(result).toHaveProperty("totalChecked", 0);
      expect(result.success).toBe(true);
    });
  });
});
