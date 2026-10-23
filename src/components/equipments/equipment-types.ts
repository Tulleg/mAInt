export type EquipmentSource = "SAP" | "MANUAL";

export type CriticalityClass = "A" | "B" | "C";

export type AssetStatus = "ACTIVE" | "IN_MAINTENANCE" | "BREAKDOWN" | "DECOMMISSIONED";

export interface OrderSummary {
  id: string;
  orderNumber: string;
  title: string;
  priority: string;
  statusCode?: string;
  statusName: string;
  createdAt: string;
  assignedTo?: string | null;
  completedAt?: string | null;
  resolutionSummary?: string | null;
}

export interface EquipmentTreeNode {
  id: string;
  equipmentNumber: string;
  name: string;
  description?: string | null;
  manufacturer?: string | null;
  modelType?: string | null;
  serialNumber?: string | null;
  yearOfManufacture?: number | null;
  criticality: CriticalityClass;
  status: AssetStatus;
  operatingHoursCounter: string;
  sapEquipmentNr?: string | null;
  technicalSpecs?: Record<string, string | number> | null;
  parentEquipmentId?: string | null;
  functionalLocationId?: string | null;
  source: EquipmentSource;
  isAssembly?: boolean;
  subEquipments?: EquipmentTreeNode[];
  openOrders?: OrderSummary[];
  recentOrders?: OrderSummary[];
}

export interface FunctionalLocationNode {
  id: string;
  code: string;
  name: string;
  areaId?: string | null;
  plantSection?: string;
  costCenter?: string | null;
  sapTplnr?: string | null;
  source: EquipmentSource;
  equipments: EquipmentTreeNode[];
  openOrders?: OrderSummary[];
  recentOrders?: OrderSummary[];
}

export interface AreaNode {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  source: EquipmentSource;
  functionalLocations: FunctionalLocationNode[];
  openOrders?: OrderSummary[];
  recentOrders?: OrderSummary[];
}
