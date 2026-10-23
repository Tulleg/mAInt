import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { seedHistoricalOrdersToDb } from "../lib/ai/seed-historical-orders";
import { sql } from "drizzle-orm";
import crypto from "crypto";

const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgrespassword@localhost:5432/maintai";

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

// Helper to generate a normalized 1536-dim embedding vector
function generateMockVector(seedText: string, dim = 1536): number[] {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash << 5) - hash + seedText.charCodeAt(i);
    hash |= 0;
  }
  const vec: number[] = new Array(dim);
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    const val = Math.sin(hash + i * 0.137);
    vec[i] = val;
    sumSq += val * val;
  }
  const mag = Math.sqrt(sumSq) || 1;
  return vec.map((v) => Number((v / mag).toFixed(6)));
}

async function runSeed() {
  console.log("🌱 Starting database seed...");

  // 1. Mandant (Tenant)
  console.log("🏢 Seeding Tenant...");
  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      code: "WERK-01",
      name: "Smart Factory Werk 1 (Süd)",
      sapPlantCode: "1000",
      sapSyncMode: "STANDALONE",
      sapConfig: {
        baseUrl: "https://sap-mock.internal.corp/odata/v4",
        sapClient: "100",
        systemId: "PRD",
        syncIntervalMinutes: 15,
        autoTriggerTabg: true,
      },
      aiConfig: {
        provider: "OPENAI",
        chatModel: "gpt-4o",
        embeddingModel: "text-embedding-3-small",
        embeddingDimensions: 1536,
      },
      isActive: true,
    })
    .onConflictDoUpdate({
      target: schema.tenants.code,
      set: { updatedAt: new Date() },
    })
    .returning();

  const tenantId = tenant.id;

  // 2. Rollen (Maschinenbediener, Koordinator, Instandhalter, Admin)
  console.log("👥 Seeding Roles (OPERATOR, COORDINATOR, TECHNICIAN, ADMIN)...");
  const roleDefinitions = [
    {
      code: "OPERATOR",
      name: "Maschinenbediener",
      description: "Erfasst Störungen, Fehlermeldungen und Anlagenzustände direkt vor Ort an der Linie.",
      isSystemRole: true,
    },
    {
      code: "COORDINATOR",
      name: "Koordinator",
      description: "Sichtet den Eingangspool, priorisiert, terminiert und disponiert Instandhaltungsaufträge.",
      isSystemRole: true,
    },
    {
      code: "TECHNICIAN",
      name: "Instandhalter",
      description: "Führt Reparaturen, Wartungsarbeiten und Inspektionen durch, bucht Zeiten und Ersatzteile.",
      isSystemRole: true,
    },
    {
      code: "ADMIN",
      name: "Admin",
      description: "Gesamtsystem-Administrator mit vollem Zugriff auf Konfigurationen und Workflows.",
      isSystemRole: true,
    },
    {
      code: "REPORTER",
      name: "Melder (Kompatibilität)",
      description: "Legacy-Rolle für Störungsmelder.",
      isSystemRole: true,
    },
    {
      code: "PLANNER",
      name: "Planer (Kompatibilität)",
      description: "Legacy-Rolle für Instandhaltungsplaner.",
      isSystemRole: true,
    },
  ];

  const roleMap: Record<string, string> = {};
  for (const r of roleDefinitions) {
    const [inserted] = await db
      .insert(schema.roles)
      .values({
        tenantId,
        code: r.code,
        name: r.name,
        description: r.description,
        isSystemRole: r.isSystemRole,
      })
      .onConflictDoUpdate({
        target: [schema.roles.tenantId, schema.roles.code],
        set: { name: r.name, description: r.description },
      })
      .returning();
    roleMap[r.code] = inserted.id;
  }

  // 2b. 4-stufige Struktur - Stufe 1: Bereiche (Areas / Plants)
  console.log("🏢 Seeding Areas (1st hierarchy level: Bereich / Werk)...");
  const areaDefs = [
    {
      code: "AREA-H01",
      name: "Halle 1 - Karosseriebau",
      description: "Rohbau, Punktschweiß-Robotik, Karosserie-Strukturfertigung und Pufferstrecken",
      source: "SAP" as const,
      sapId: "SAP-AREA-1000-01",
      lastSyncedAt: new Date(),
    },
    {
      code: "AREA-H02",
      name: "Halle 2 - Lackiererei",
      description: "Kathodische Tauchlackierung (KTL), Decklackierung, Trockenöfen und Farbmischraum",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
    },
    {
      code: "AREA-PROD-1",
      name: "Halle 1 - Karosseriebau (Produktionsbereich 1)",
      description: "Robotikzellen, Gurt- und Kettenfördersysteme, Pufferstrecken",
      source: "SAP" as const,
      sapId: "SAP-AREA-1000-01",
      lastSyncedAt: new Date(),
    },
    {
      code: "AREA-PROD-2",
      name: "Halle 2 - Lackiererei (Produktionsbereich 2)",
      description: "CNC-Fräszentren, Laser-Schneidanlagen, Abkantpressen",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
    },
    {
      code: "AREA-INFRA",
      name: "Bereich Infrastruktur & Zentrale Medien",
      description: "Kühlschmierstoff-Aufbereitung, Druckluftkompressoren, Hydraulikzentrale",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
    },
  ];

  const areaMap: Record<string, string> = {};
  for (const a of areaDefs) {
    const [inserted] = await db
      .insert(schema.areas)
      .values({
        tenantId,
        code: a.code,
        name: a.name,
        description: a.description,
        source: a.source,
        sapId: a.sapId,
        lastSyncedAt: a.lastSyncedAt,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.areas.tenantId, schema.areas.code],
        set: {
          name: a.name,
          description: a.description,
          source: a.source,
          sapId: a.sapId,
          lastSyncedAt: a.lastSyncedAt,
        },
      })
      .returning();
    areaMap[a.code] = inserted.id;
  }

  // 3. Benutzer für die Rollen (inkl. SSO / Azure AD / Department / Assigned Area)
  console.log("👤 Seeding Users with SSO/AD & Area Assignments...");
  const dummyPasswordHash = "$2a$12$e8YkZJ6r8Q2Fw3QxWJtFme8jE2E21uI2n3hN5lY9uP1v2g0k3hZKe"; // Bcrypt hash dummy

  const userDefinitions = [
    {
      roleCodes: ["OPERATOR", "REPORTER"],
      email: "bediener@maintai.local",
      firstName: "Bernd",
      lastName: "Bediener",
      personnelNr: "00010410",
      workCenterCode: "PROD-L1",
      department: "Produktion Fertigung 1",
      authProvider: "LOCAL" as const,
      assignedAreaId: areaMap["AREA-PROD-1"],
      qualifications: ["Basis-Bedienung", "5S", "TPM Level 1"],
    },
    {
      roleCodes: ["COORDINATOR", "PLANNER"],
      email: "koordinator@maintai.local",
      firstName: "Karin",
      lastName: "Koordinator",
      personnelNr: "00030588",
      workCenterCode: "IH-DISPO",
      department: "Instandhaltungsdisposition & Planung",
      authProvider: "AZURE_AD" as const,
      externalAdId: "ad-coord-001",
      assignedAreaId: null,
      qualifications: ["REFA-Grundausbildung", "SAP PM Power User", "Zuverlässigkeitsingenieur"],
    },
    {
      roleCodes: ["TECHNICIAN"],
      email: "instandhalter@maintai.local",
      firstName: "Ingo",
      lastName: "Instandhalter",
      personnelNr: "00020115",
      workCenterCode: "MECH-01",
      department: "Zentrale Instandhaltung",
      authProvider: "SSO" as const,
      externalAdId: "sso-tech-002",
      assignedAreaId: null,
      qualifications: ["Hydraulik-Fachkraft", "Elektrofachkraft für festgelegte Tätigkeiten", "Schweißpass"],
    },
    {
      roleCodes: ["ADMIN"],
      email: "admin@maintai.local",
      firstName: "Alexander",
      lastName: "Admin",
      personnelNr: "00000001",
      workCenterCode: "IT-SEC",
      department: "IT / OT Administration",
      authProvider: "LOCAL" as const,
      assignedAreaId: null,
      qualifications: ["Systemarchitektur", "Datenschutz & IT-Security"],
    },
    // Kompatibilitäts-Aliase für bestehende Tests / Views
    {
      roleCodes: ["OPERATOR", "REPORTER"],
      email: "melder@maintai.local",
      firstName: "Michael",
      lastName: "Melder",
      personnelNr: "00010411",
      workCenterCode: "PROD-L1",
      department: "Produktion Fertigung 1",
      authProvider: "LOCAL" as const,
      assignedAreaId: areaMap["AREA-PROD-1"],
      qualifications: ["Basis-Bedienung", "5S"],
    },
    {
      roleCodes: ["TECHNICIAN"],
      email: "techniker@maintai.local",
      firstName: "Thomas",
      lastName: "Techniker",
      personnelNr: "00020116",
      workCenterCode: "MECH-01",
      department: "Instandhaltung Mechanik",
      authProvider: "LOCAL" as const,
      assignedAreaId: null,
      qualifications: ["Hydraulik-Fachkraft", "Schweißpass"],
    },
    {
      roleCodes: ["COORDINATOR", "PLANNER"],
      email: "planer@maintai.local",
      firstName: "Petra",
      lastName: "Planer",
      personnelNr: "00030589",
      workCenterCode: "IH-PLAN",
      department: "Instandhaltungsplanung",
      authProvider: "LOCAL" as const,
      assignedAreaId: null,
      qualifications: ["REFA-Grundausbildung", "SAP PM Power User"],
    },
  ];

  const userMap: Record<string, string> = {};
  for (const u of userDefinitions) {
    const [inserted] = await db
      .insert(schema.users)
      .values({
        tenantId,
        email: u.email,
        passwordHash: dummyPasswordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        authProvider: u.authProvider,
        externalAdId: u.externalAdId || null,
        department: u.department,
        assignedAreaId: u.assignedAreaId || null,
        personnelNr: u.personnelNr,
        workCenterCode: u.workCenterCode,
        qualificationMatrix: u.qualifications,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.users.tenantId, schema.users.email],
        set: {
          firstName: u.firstName,
          lastName: u.lastName,
          authProvider: u.authProvider,
          externalAdId: u.externalAdId || null,
          department: u.department,
          assignedAreaId: u.assignedAreaId || null,
        },
      })
      .returning();

    for (const roleCode of u.roleCodes) {
      if (!userMap[roleCode]) {
        userMap[roleCode] = inserted.id;
      }
      if (roleMap[roleCode]) {
        await db
          .insert(schema.userRoles)
          .values({
            userId: inserted.id,
            roleId: roleMap[roleCode],
          })
          .onConflictDoNothing();
      }
    }
    userMap[u.email.split("@")[0]] = inserted.id;
    userMap[u.email] = inserted.id;
  }

  // 4. Technische Plätze (Functional Locations) - 2. Stufe der Anlagenstruktur
  console.log("🏭 Seeding Functional Locations (2nd hierarchy level: Technischer Platz)...");
  const flocDefs = [
    {
      code: "W1-HALLE1-ROB",
      name: "Werk 1 - Halle 1: Robotik & Karosseriebau",
      areaCode: "AREA-H01",
      plantSection: "Karosseriebau",
      costCenter: "CC-1100",
      source: "SAP" as const,
      sapId: "TPL-1000-01",
      sapTplnr: "TPL-1000-01",
      lastSyncedAt: new Date(),
      parentFlocCode: null as string | null,
    },
    {
      code: "W1-HALLE1-ROB-Z1",
      name: "Werk 1 - Halle 1: Schweißzelle 1 (Unterplatz)",
      areaCode: "AREA-H01",
      plantSection: "Karosseriebau",
      costCenter: "CC-1100",
      source: "SAP" as const,
      sapId: "TPL-1000-01-Z1",
      sapTplnr: "TPL-1000-01-Z1",
      lastSyncedAt: new Date(),
      parentFlocCode: "W1-HALLE1-ROB",
    },
    {
      code: "W1-HALLE1-CONV",
      name: "Werk 1 - Halle 1: Fördersysteme Karosseriebau",
      areaCode: "AREA-H01",
      plantSection: "Karosseriebau Logistik",
      costCenter: "CC-1120",
      source: "MANUAL" as const,
      sapId: null,
      sapTplnr: null,
      lastSyncedAt: null,
      parentFlocCode: null as string | null,
    },
    {
      code: "W1-HALLE2-MACH",
      name: "Werk 1 - Halle 2: Lackierstraße & Trocknung",
      areaCode: "AREA-H02",
      plantSection: "Lackiererei",
      costCenter: "CC-1200",
      source: "SAP" as const,
      sapId: "TPL-1000-03",
      sapTplnr: "TPL-1000-03",
      lastSyncedAt: new Date(),
      parentFlocCode: null as string | null,
    },
    {
      code: "W1-HALLE2-MACH-U1",
      name: "Werk 1 - Halle 2: KTL Tauchbecken (Unterplatz)",
      areaCode: "AREA-H02",
      plantSection: "Lackiererei KTL",
      costCenter: "CC-1200",
      source: "MANUAL" as const,
      sapId: null,
      sapTplnr: null,
      lastSyncedAt: null,
      parentFlocCode: "W1-HALLE2-MACH",
    },
    {
      code: "W1-MEDIEN-CENTRAL",
      name: "Werk 1 - Zentrale Medienversorgung & Hydraulik",
      areaCode: "AREA-INFRA",
      plantSection: "Infrastruktur",
      costCenter: "CC-1900",
      source: "MANUAL" as const,
      sapId: null,
      sapTplnr: null,
      lastSyncedAt: null,
      parentFlocCode: null as string | null,
    },
  ];

  const flocMap: Record<string, string> = {};
  for (const fl of flocDefs) {
    const parentId = fl.parentFlocCode ? flocMap[fl.parentFlocCode] || null : null;
    const [inserted] = await db
      .insert(schema.functionalLocations)
      .values({
        tenantId,
        areaId: areaMap[fl.areaCode] || null,
        parentFunctionalLocationId: parentId,
        code: fl.code,
        name: fl.name,
        plantSection: fl.plantSection,
        costCenter: fl.costCenter,
        source: fl.source,
        sapId: fl.sapId,
        sapTplnr: fl.sapTplnr,
        lastSyncedAt: fl.lastSyncedAt,
        sapSyncStatus: fl.source === "SAP" ? "SYNCED" : "NOT_APPLICABLE",
        sapLastSyncedAt: fl.lastSyncedAt,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.functionalLocations.tenantId, schema.functionalLocations.code],
        set: {
          name: fl.name,
          areaId: areaMap[fl.areaCode] || null,
          parentFunctionalLocationId: parentId,
          source: fl.source,
          sapId: fl.sapId,
          sapTplnr: fl.sapTplnr,
          lastSyncedAt: fl.lastSyncedAt,
          sapSyncStatus: fl.source === "SAP" ? "SYNCED" : "NOT_APPLICABLE",
          sapLastSyncedAt: fl.lastSyncedAt,
        },
      })
      .returning();
    flocMap[fl.code] = inserted.id;
  }

  // 5. 10 Industrie-Equipments (inkl. SAP-Nummern)
  console.log("⚙️ Seeding 10 Industrial Equipments (incl. SAP EQUNR)...");
  interface EquipmentDef {
    equipmentNumber: string;
    name: string;
    description: string;
    flocCode: string;
    manufacturer: string;
    modelType: string;
    serialNumber: string;
    yearOfManufacture: number;
    criticality: "A" | "B" | "C";
    status: "ACTIVE" | "IN_MAINTENANCE" | "BREAKDOWN" | "DECOMMISSIONED";
    operatingHoursCounter: string;
    sapEquipmentNr: string;
    source: "SAP" | "MANUAL";
    sapId: string | null;
    lastSyncedAt: Date | null;
    technicalSpecs: Record<string, string | number>;
  }

  const equipmentDefs: EquipmentDef[] = [
    {
      equipmentNumber: "EQ-10001001",
      name: "KUKA KR 210 R2700 prime - Roboterzelle 1",
      description: "6-Achs-Industrieroboter für Schwerlast-Handling und Punktschweißen",
      flocCode: "W1-HALLE1-ROB",
      manufacturer: "KUKA Roboter GmbH",
      modelType: "KR 210 R2700",
      serialNumber: "SN-KU-992140",
      yearOfManufacture: 2021,
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "14850.50",
      sapEquipmentNr: "10001001",
      source: "SAP" as const,
      sapId: "10001001",
      lastSyncedAt: new Date(),
      technicalSpecs: {
        maxPayloadKg: 210,
        reachMm: 2700,
        controller: "KR C4",
        axisCount: 6,
      },
    },
    {
      equipmentNumber: "EQ-10001002",
      name: "SEW Movitrac B - Hauptantrieb Förderband 4",
      description: "Getriebemotor mit integriertem Frequenzumrichter für Gurtförderband",
      flocCode: "W1-HALLE1-CONV",
      manufacturer: "SEW-EURODRIVE GmbH",
      modelType: "MC07B0015-5A3-4-00",
      serialNumber: "SN-SEW-441209",
      yearOfManufacture: 2020,
      criticality: "B" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "22340.00",
      sapEquipmentNr: "10001002",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
      technicalSpecs: {
        powerKw: 1.5,
        speedRpm: 1400,
        busInterface: "PROFINET",
        gearRatio: 24.5,
      },
    },
    {
      equipmentNumber: "EQ-10001003",
      name: "Grundfos CR 45-3 - Hochdruck-Kreiselpumpe",
      description: "Mehrstufige vertikale Kreiselpumpe für Prozess-Kühlwasserkreislauf",
      flocCode: "W1-MEDIEN-CENTRAL",
      manufacturer: "Grundfos Pumpen AG",
      modelType: "CR 45-3 A-F-A-E-HQQE",
      serialNumber: "SN-GF-884102",
      yearOfManufacture: 2019,
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "31200.75",
      sapEquipmentNr: "10001003",
      source: "SAP" as const,
      sapId: "10001003",
      lastSyncedAt: new Date(),
      technicalSpecs: {
        flowRateM3h: 45,
        headMeters: 62,
        powerKw: 11,
        medium: "Kühlwasser",
      },
    },
    {
      equipmentNumber: "EQ-10001004",
      name: "Atlas Copco GA 37 VSD+ - Schraubenkompressor",
      description: "Öleingespritzter Schraubenkompressor mit variabler Drehzahlregelung",
      flocCode: "W1-MEDIEN-CENTRAL",
      manufacturer: "Atlas Copco Kompressoren",
      modelType: "GA 37 VSD+",
      serialNumber: "SN-AC-551029",
      yearOfManufacture: 2022,
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "12840.20",
      sapEquipmentNr: "10001004",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
      technicalSpecs: {
        capacityFadL_s: 125,
        maxPressureBar: 10,
        powerKw: 37,
      },
    },
    {
      equipmentNumber: "EQ-10001005",
      name: "Siemens Sinamics S120 - Umrichtersystem Walzstraße",
      description: "Multi-Achs Servoumrichter-Cluster mit Active Line Module",
      flocCode: "W1-HALLE2-MACH",
      manufacturer: "Siemens AG",
      modelType: "Sinamics S120 Booksize",
      serialNumber: "SN-SIE-102941",
      yearOfManufacture: 2021,
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "16420.00",
      sapEquipmentNr: "10001005",
      source: "SAP" as const,
      sapId: "10001005",
      lastSyncedAt: new Date(),
      technicalSpecs: {
        lineModuleKw: 55,
        motorModules: "3x 30A",
        fieldbus: "Profinet IRT",
      },
    },
    {
      equipmentNumber: "EQ-10001006",
      name: "TRUMPF TruLaser 3030 - Faserlaserschneidanlage 4kW",
      description: "Hochpräzise CNC-2D-Laserschneidanlage mit TruDisk 4001 Resonator",
      flocCode: "W1-HALLE2-MACH",
      manufacturer: "TRUMPF Werkzeugmaschinen SE",
      modelType: "TruLaser 3030 (L20)",
      serialNumber: "SN-TR-772184",
      yearOfManufacture: 2023,
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "7650.00",
      sapEquipmentNr: "10001006",
      source: "SAP" as const,
      sapId: "10001006",
      lastSyncedAt: new Date(),
      technicalSpecs: {
        laserPowerWatts: 4000,
        sheetSizeMm: "3000x1500",
        cuttingGas: "N2 / O2",
      },
    },
    {
      equipmentNumber: "EQ-10001007",
      name: "Bosch Rexroth A4VSO - Axialkolben-Verstellpumpe",
      description: "Hydraulik-Hochdruckpumpe für 250t Umformpresse",
      flocCode: "W1-MEDIEN-CENTRAL",
      manufacturer: "Bosch Rexroth AG",
      modelType: "A4VSO125DR/30R-PPB13N00",
      serialNumber: "SN-RX-330198",
      yearOfManufacture: 2018,
      criticality: "B" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "27890.30",
      sapEquipmentNr: "10001007",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
      technicalSpecs: {
        displacementCc: 125,
        nominalPressureBar: 350,
        controller: "DR (Druckregler)",
      },
    },
    {
      equipmentNumber: "EQ-10001008",
      name: "Fanuc Robodrill D21LiB5 - 5-Achs CNC-Fräszentrum",
      description: "Vertikal-Bearbeitungszentrum für Präzisionsteilefertigung",
      flocCode: "W1-HALLE2-MACH",
      manufacturer: "Fanuc Corporation",
      modelType: "Alpha-D21LiB5",
      serialNumber: "SN-FAN-662910",
      yearOfManufacture: 2022,
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "9940.00",
      sapEquipmentNr: "10001008",
      source: "SAP" as const,
      sapId: "10001008",
      lastSyncedAt: new Date(),
      technicalSpecs: {
        spindleRpm: 24000,
        toolPositions: 21,
        controlUnit: "Fanuc 31i-B5",
      },
    },
    {
      equipmentNumber: "EQ-10001009",
      name: "Festo CPX-MPA - Modularer Ventilinsel-Cluster",
      description: "Pneumatische Ventilinsel mit Feldbusanbindung für Fügezelle",
      flocCode: "W1-HALLE1-ROB",
      manufacturer: "Festo SE & Co. KG",
      modelType: "CPX-M-FB36 / MPA-S",
      serialNumber: "SN-FES-219481",
      yearOfManufacture: 2020,
      criticality: "C" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "19100.00",
      sapEquipmentNr: "10001009",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
      technicalSpecs: {
        valveSlices: 16,
        operatingPressureBar: 6.5,
        fieldbus: "EtherNet/IP",
      },
    },
    {
      equipmentNumber: "EQ-10001010",
      name: "Endress+Hauser Promag 50P - Durchflussmessgerät",
      description: "Elektromagnetischer Durchflussmesser für Chemikalien-Dosierlinie",
      flocCode: "W1-MEDIEN-CENTRAL",
      manufacturer: "Endress+Hauser Group",
      modelType: "Promag 50P50-AA1AA1AAA0AA",
      serialNumber: "SN-EH-819231",
      yearOfManufacture: 2021,
      criticality: "C" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "18250.00",
      sapEquipmentNr: "10001010",
      source: "SAP" as const,
      sapId: "10001010",
      lastSyncedAt: new Date(),
      technicalSpecs: {
        diameterDn: 50,
        accuracyPercent: 0.5,
        output: "4-20mA HART",
      },
    },
  ];

  const equipmentList: Array<{ id: string; sapEquipmentNr: string; name: string; flocId: string; equipmentNumber: string }> = [];
  const equipmentByNumber: Record<string, { id: string; flocId: string; name: string }> = {};

  for (const eq of equipmentDefs) {
    const [inserted] = await db
      .insert(schema.equipments)
      .values({
        tenantId,
        functionalLocationId: flocMap[eq.flocCode],
        equipmentNumber: eq.equipmentNumber,
        isAssembly: false,
        name: eq.name,
        description: eq.description,
        manufacturer: eq.manufacturer,
        modelType: eq.modelType,
        serialNumber: eq.serialNumber,
        yearOfManufacture: eq.yearOfManufacture,
        criticality: eq.criticality,
        status: eq.status,
        operatingHoursCounter: eq.operatingHoursCounter,
        technicalSpecs: eq.technicalSpecs,
        source: eq.source,
        sapId: eq.sapId,
        lastSyncedAt: eq.lastSyncedAt,
        sapEquipmentNr: eq.sapEquipmentNr,
        sapSyncStatus: eq.source === "SAP" ? "SYNCED" : "NOT_APPLICABLE",
        sapLastSyncedAt: eq.lastSyncedAt,
      })
      .onConflictDoUpdate({
        target: [schema.equipments.tenantId, schema.equipments.equipmentNumber],
        set: {
          name: eq.name,
          description: eq.description,
          status: eq.status,
          isAssembly: false,
          source: eq.source,
          sapId: eq.sapId,
          lastSyncedAt: eq.lastSyncedAt,
          sapEquipmentNr: eq.sapEquipmentNr,
          sapSyncStatus: eq.source === "SAP" ? "SYNCED" : "NOT_APPLICABLE",
          sapLastSyncedAt: eq.lastSyncedAt,
        },
      })
      .returning();

    const eqObj = {
      id: inserted.id,
      sapEquipmentNr: eq.sapEquipmentNr,
      name: eq.name,
      flocId: flocMap[eq.flocCode],
      equipmentNumber: eq.equipmentNumber,
    };
    equipmentList.push(eqObj);
    equipmentByNumber[eq.equipmentNumber] = eqObj;
  }

  // 5b. Baugruppen / Funktionseinheiten (4. Stufe der Anlagenstruktur)
  console.log("🧩 Seeding Assemblies / Baugruppen (4th hierarchy level: Baugruppe / Funktionseinheit)...");
  const assemblyDefs = [
    {
      equipmentNumber: "BG-KU-AXIS4",
      parentEqNumber: "EQ-10001001",
      name: "Roboterzelle 1 - Baugruppe Achse 4 / Handgelenk",
      description: "Servomotor, spielfreies Harmonic-Drive-Getriebe & Schleppkabelstrang Achse 4",
      manufacturer: "KUKA Roboter GmbH",
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "14850.50",
      source: "SAP" as const,
      sapId: "SAP-BG-10001",
      lastSyncedAt: new Date(),
    },
    {
      equipmentNumber: "BG-KU-WELD",
      parentEqNumber: "EQ-10001001",
      name: "Roboterzelle 1 - Punktschweißzange C-Typ",
      description: "Pneumatisch betätigte Schweißzange mit integriertem Transformator und Elektrodenfräser",
      manufacturer: "Düring Schweißtechnik",
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "14850.50",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
    },
    {
      equipmentNumber: "BG-SEW-GEAR",
      parentEqNumber: "EQ-10001002",
      name: "Förderband 4 - Getriebeeinheit & Stirnradwelle",
      description: "Zweistufiges Stirnradgetriebe mit Hohlwelle und Schrumpfscheibe",
      manufacturer: "SEW-EURODRIVE GmbH",
      criticality: "B" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "22340.00",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
    },
    {
      equipmentNumber: "BG-GF-SEAL",
      parentEqNumber: "EQ-10001003",
      name: "Kreiselpumpe - Gleitringdichtungseinheit & Laufrad",
      description: "Cartridge-Gleitringdichtung SiC/SiC mit O-Ring-Satz und Laufrad Edelstahl",
      manufacturer: "Grundfos Pumpen AG",
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "31200.75",
      source: "SAP" as const,
      sapId: "SAP-BG-10003",
      lastSyncedAt: new Date(),
    },
    {
      equipmentNumber: "BG-AC-AIR-END",
      parentEqNumber: "EQ-10001004",
      name: "Kompressor GA 37 - Schrauben-Verdichterelement",
      description: "Öleingespritzte Verdichterstufe (Air-End) mit Rotorenpaar und Druckventil",
      manufacturer: "Atlas Copco Kompressoren",
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "12840.20",
      source: "MANUAL" as const,
      sapId: null,
      lastSyncedAt: null,
    },
    {
      equipmentNumber: "BG-TR-HEAD",
      parentEqNumber: "EQ-10001006",
      name: "TruLaser - Laserschneidkopf & Abstandssensorik",
      description: "2D-Schneidkopf mit Zoom-Kollimator, kapazitiver Höhenregelung und Keramikfassung",
      manufacturer: "TRUMPF Werkzeugmaschinen SE",
      criticality: "A" as const,
      status: "ACTIVE" as const,
      operatingHoursCounter: "7650.00",
      source: "SAP" as const,
      sapId: "SAP-BG-10006",
      lastSyncedAt: new Date(),
    },
  ];

  for (const assem of assemblyDefs) {
    const parentEq = equipmentByNumber[assem.parentEqNumber];
    if (!parentEq) continue;

    // 1. In dedicated assemblies table einfügen (4. Stufe der Anlagenstruktur)
    await db
      .insert(schema.assemblies)
      .values({
        tenantId,
        equipmentId: parentEq.id,
        code: assem.equipmentNumber,
        name: assem.name,
        description: assem.description,
        source: assem.source,
        sapId: assem.sapId,
        lastSyncedAt: assem.lastSyncedAt,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.assemblies.tenantId, schema.assemblies.code],
        set: {
          name: assem.name,
          description: assem.description,
          equipmentId: parentEq.id,
          source: assem.source,
          sapId: assem.sapId,
          lastSyncedAt: assem.lastSyncedAt,
        },
      });

    // 2. Auch in equipments als Sub-Equipment / Assembly für Hierarchie-Abwärtskompatibilität halten
    await db
      .insert(schema.equipments)
      .values({
        tenantId,
        parentEquipmentId: parentEq.id,
        functionalLocationId: parentEq.flocId,
        equipmentNumber: assem.equipmentNumber,
        isAssembly: true,
        name: assem.name,
        description: assem.description,
        manufacturer: assem.manufacturer,
        criticality: assem.criticality,
        status: assem.status,
        operatingHoursCounter: assem.operatingHoursCounter,
        source: assem.source,
        sapId: assem.sapId,
        lastSyncedAt: assem.lastSyncedAt,
        sapSyncStatus: assem.source === "SAP" ? "SYNCED" : "NOT_APPLICABLE",
        sapLastSyncedAt: assem.lastSyncedAt,
      })
      .onConflictDoUpdate({
        target: [schema.equipments.tenantId, schema.equipments.equipmentNumber],
        set: {
          name: assem.name,
          description: assem.description,
          parentEquipmentId: parentEq.id,
          isAssembly: true,
          source: assem.source,
          sapId: assem.sapId,
          lastSyncedAt: assem.lastSyncedAt,
          sapSyncStatus: assem.source === "SAP" ? "SYNCED" : "NOT_APPLICABLE",
          sapLastSyncedAt: assem.lastSyncedAt,
        },
      });
  }

  // 5c. Schadenscode-Kataloge (damage_catalogs) & Schadenscodes (damage_codes)
  console.log("🏷️ Seeding Damage Code Catalogs (MECH, HYDR, ELEK, PNEU) & Damage Codes...");
  const catalogDefs = [
    {
      code: "MECH",
      name: "Mechanik & Antriebstechnik",
      description: "Schadensbilder an Wälzlagern, Wellen, Kupplungen, Riementrieben und Führungen",
    },
    {
      code: "HYDR",
      name: "Hydraulik & Fluidtechnik",
      description: "Schadensbilder an Pumpen, Ventilen, Dichtungen, Schläuchen und Filtern",
    },
    {
      code: "ELEK",
      name: "Elektrik, Sensorik & Steuerung",
      description: "Schadensbilder an Sensoren, Kabeln, Schaltgeräten, Antrieben und Steuerungen",
    },
    {
      code: "PNEU",
      name: "Pneumatik",
      description: "Schadensbilder an Zylindern, Ventilinseln, Schalldämpfern und Druckleitungen",
    },
  ];

  const catalogMap: Record<string, string> = {};
  for (const c of catalogDefs) {
    const [inserted] = await db
      .insert(schema.damageCatalogs)
      .values({
        tenantId,
        code: c.code,
        name: c.name,
        description: c.description,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.damageCatalogs.tenantId, schema.damageCatalogs.code],
        set: { name: c.name, description: c.description },
      })
      .returning();
    catalogMap[c.code] = inserted.id;
  }

  const damageCodeDefs = [
    { catalogCode: "MECH", code: "LAGER_DEFEKT", name: "Wälzlager- / Gleitlagerschaden (Heißläufer, Pittings)" },
    { catalogCode: "MECH", code: "MECH_VERSCHLEISS", name: "Mechanischer Abrieb / Führungsspiel" },
    { catalogCode: "MECH", code: "GETRIEBE_SCHADEN", name: "Getriebeschaden / Zahnflankenbruch" },
    { catalogCode: "MECH", code: "MECH_VIBRATION", name: "Erhöhte Schwingung / Unwucht" },
    { catalogCode: "MECH", code: "MECH_JAM", name: "Mechanische Blockade / Fremdkörper" },
    { catalogCode: "HYDR", code: "LECKAGE", name: "Hydrauliköl-Leckage / Dichtungsversagen" },
    { catalogCode: "HYDR", code: "DRUCKVERLUST", name: "Systemdruckabfall / Druckschwankung" },
    { catalogCode: "HYDR", code: "KAVITATION", name: "Kavitation / Ansaugfilter verstopft" },
    { catalogCode: "ELEK", code: "SENSOR_AUSFALL", name: "Sensorausfall / Messwertdrift" },
    { catalogCode: "ELEK", code: "KABELBRUCH", name: "Kabelbruch / Schleppkettenschaden / Erdschluss" },
    { catalogCode: "ELEK", code: "UEBERLAST", name: "Elektrische Überlast / Überstromabschaltung" },
    { catalogCode: "ELEK", code: "COMM_PROFINET_FAIL", name: "Feldbus- / Profinet-Kommunikationsabbruch" },
    { catalogCode: "PNEU", code: "VENTIL_KLEMMT", name: "Ventilblockade / Schleichleckage" },
    { catalogCode: "PNEU", code: "SILENCER_CLOGGED", name: "Schalldämpfer zugesetzt / Entlüftungsverzug" },
  ];

  const damageCodeMap: Record<string, string> = {};
  for (const dc of damageCodeDefs) {
    const [inserted] = await db
      .insert(schema.damageCodes)
      .values({
        tenantId,
        catalogId: catalogMap[dc.catalogCode],
        code: dc.code,
        name: dc.name,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.damageCodes.tenantId, schema.damageCodes.code],
        set: { name: dc.name, catalogId: catalogMap[dc.catalogCode] },
      })
      .returning();
    damageCodeMap[dc.code] = inserted.id;
  }

  // 6. Konfigurierbare Auftragsarten
  console.log("📋 Seeding Order Types...");
  const orderTypeDefinitions = [
    {
      code: "IH01",
      name: "Instandsetzung / Störung",
      description: "Ungeplante Instandsetzung zur schnellen Störungsbehebung.",
      sapOrderTypeCode: "PM01",
      colorHex: "#EF4444",
      iconName: "AlertTriangle",
      requiresApproval: false,
      requiresSafetyPermit: false,
    },
    {
      code: "IH02",
      name: "Vorbeugende Wartung",
      description: "Geplante zyklische Instandhaltungsmaßnahmen laut Wartungsplan.",
      sapOrderTypeCode: "PM02",
      colorHex: "#3B82F6",
      iconName: "Calendar",
      requiresApproval: false,
      requiresSafetyPermit: false,
    },
    {
      code: "IH03",
      name: "Inspektion & Kalibrierung",
      description: "Zustandsfeststellung, Sensor-Kalibrierung und Prüflisten-Abarbeitung.",
      sapOrderTypeCode: "PM03",
      colorHex: "#10B981",
      iconName: "CheckSquare",
      requiresApproval: false,
      requiresSafetyPermit: false,
    },
    {
      code: "IH04",
      name: "Gesetzliche Prüfung / DGUV",
      description: "Sicherheitsrelevante Sachverständigen- und Unfallverhütungsprüfungen.",
      sapOrderTypeCode: "PM04",
      colorHex: "#F59E0B",
      iconName: "ShieldAlert",
      requiresApproval: true,
      requiresSafetyPermit: true,
    },
  ];

  const orderTypeMap: Record<string, string> = {};
  for (const ot of orderTypeDefinitions) {
    const [inserted] = await db
      .insert(schema.orderTypes)
      .values({
        tenantId,
        code: ot.code,
        name: ot.name,
        description: ot.description,
        sapOrderTypeCode: ot.sapOrderTypeCode,
        colorHex: ot.colorHex,
        iconName: ot.iconName,
        requiresApproval: ot.requiresApproval,
        requiresSafetyPermit: ot.requiresSafetyPermit,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.orderTypes.tenantId, schema.orderTypes.code],
        set: { name: ot.name, colorHex: ot.colorHex },
      })
      .returning();
    orderTypeMap[ot.code] = inserted.id;
  }

  // 7. Status-Workflows (Statuses + Transitions)
  console.log("🔄 Seeding Workflow Statuses & Transitions (ERFASST -> FREIGEGEBEN -> IN_ARBEIT -> TABG -> ABGS)...");
  const statusDefs = [
    // Standard-Stadien gemäß Workflow-Modell
    {
      code: "ERFASST",
      name: "Erfasst (Meldung)",
      description: "Störungsmeldung wurde angelegt, wartet auf Sichtung und Freigabe.",
      category: "INITIAL",
      sapSystemStatusCode: "I0001",
      color: "slate",
      colorHex: "#94A3B8",
      isInitialStatus: true,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: false,
      sortOrder: 10,
      isActive: true,
    },
    {
      code: "FREIGEGEBEN",
      name: "Freigegeben",
      description: "Auftrag wurde geprüft, terminiert und zur Bearbeitung freigegeben (SAP FREI).",
      category: "INITIAL",
      sapSystemStatusCode: "I0002",
      color: "sky",
      colorHex: "#3B82F6",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: false,
      sortOrder: 20,
      isActive: true,
    },
    {
      code: "IN_ARBEIT",
      name: "In Arbeit",
      description: "Techniker führt Arbeiten aktiv an der Anlage durch.",
      category: "IN_PROGRESS",
      sapSystemStatusCode: "I0042",
      color: "amber",
      colorHex: "#F59E0B",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: false,
      sortOrder: 30,
      isActive: true,
    },
    {
      code: "PAUSIERT",
      name: "Pausiert / Material",
      description: "Reparatur unterbrochen, Ersatzteilbestellung oder Rückfrage läuft.",
      category: "IN_PROGRESS",
      sapSystemStatusCode: null,
      color: "violet",
      colorHex: "#8B5CF6",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: false,
      sortOrder: 40,
      isActive: true,
    },
    {
      code: "TABG",
      name: "Technisch abgeschlossen (TABG)",
      description: "Reparatur beendet, Anlage läuft wieder, Ursache & Zeiten dokumentiert.",
      category: "TECHNICAL_COMPLETE",
      sapSystemStatusCode: "I0045",
      color: "emerald",
      colorHex: "#10B981",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: true,
      sortOrder: 50,
      isActive: true,
    },
    {
      code: "ABGS",
      name: "Kaufmännisch abgeschlossen (ABGS)",
      description: "Alle Kosten gebucht, finale Abrechnung und Archivierung erfolgt.",
      category: "CLOSED",
      sapSystemStatusCode: "I0046",
      color: "teal",
      colorHex: "#059669",
      isInitialStatus: false,
      isTerminalStatus: true,
      locksOrderEditing: true,
      triggersSapCompletion: false,
      sortOrder: 60,
      isActive: true,
    },
    // Kompatibilitäts-Aliase
    {
      code: "CREATED",
      name: "Gemeldet / Erfasst",
      description: "Störungsmeldung wurde angelegt, wartet auf Sichtung und Freigabe.",
      category: "INITIAL",
      sapSystemStatusCode: "I0001",
      color: "slate",
      colorHex: "#94A3B8",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: false,
      sortOrder: 11,
      isActive: true,
    },
    {
      code: "RELEASED",
      name: "Freigegeben",
      description: "Auftrag wurde geprüft, terminiert und zur Bearbeitung freigegeben (SAP FREI).",
      category: "INITIAL",
      sapSystemStatusCode: "I0002",
      color: "sky",
      colorHex: "#3B82F6",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: false,
      sortOrder: 21,
      isActive: true,
    },
    {
      code: "IN_PROGRESS",
      name: "In Bearbeitung",
      description: "Techniker führt Arbeiten aktiv an der Anlage durch.",
      category: "IN_PROGRESS",
      sapSystemStatusCode: "I0042",
      color: "amber",
      colorHex: "#F59E0B",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: false,
      sortOrder: 31,
      isActive: true,
    },
    {
      code: "WAITING_PARTS",
      name: "Warten auf Material",
      description: "Reparatur unterbrochen, Ersatzteilbestellung oder Materialentnahme läuft.",
      category: "IN_PROGRESS",
      sapSystemStatusCode: null,
      color: "violet",
      colorHex: "#8B5CF6",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: false,
      sortOrder: 41,
      isActive: true,
    },
    {
      code: "TECH_COMPLETED",
      name: "Technisch abgeschlossen (TABG)",
      description: "Reparatur beendet, Anlage läuft wieder, Ursache & Zeiten dokumentiert.",
      category: "TECHNICAL_COMPLETE",
      sapSystemStatusCode: "I0045",
      color: "emerald",
      colorHex: "#10B981",
      isInitialStatus: false,
      isTerminalStatus: false,
      locksOrderEditing: false,
      triggersSapCompletion: true,
      sortOrder: 51,
      isActive: true,
    },
    {
      code: "CLOSED",
      name: "Kaufmännisch abgeschlossen (ABGS)",
      description: "Alle Kosten gebucht, finale Abrechnung und Archivierung erfolgt.",
      category: "CLOSED",
      sapSystemStatusCode: "I0046",
      color: "teal",
      colorHex: "#059669",
      isInitialStatus: false,
      isTerminalStatus: true,
      locksOrderEditing: true,
      triggersSapCompletion: false,
      sortOrder: 61,
      isActive: true,
    },
  ];

  const statusMap: Record<string, string> = {};
  for (const st of statusDefs) {
    const [inserted] = await db
      .insert(schema.workflowStatuses)
      .values({
        tenantId,
        code: st.code,
        name: st.name,
        description: st.description,
        category: st.category,
        sapSystemStatusCode: st.sapSystemStatusCode,
        color: st.color,
        colorHex: st.colorHex,
        isInitialStatus: st.isInitialStatus,
        isTerminalStatus: st.isTerminalStatus,
        locksOrderEditing: st.locksOrderEditing,
        triggersSapCompletion: st.triggersSapCompletion,
        sortOrder: st.sortOrder,
        isActive: st.isActive,
      })
      .onConflictDoUpdate({
        target: [schema.workflowStatuses.tenantId, schema.workflowStatuses.code],
        set: {
          name: st.name,
          category: st.category,
          color: st.color,
          colorHex: st.colorHex,
          isInitialStatus: st.isInitialStatus,
          isTerminalStatus: st.isTerminalStatus,
          locksOrderEditing: st.locksOrderEditing,
          triggersSapCompletion: st.triggersSapCompletion,
          sortOrder: st.sortOrder,
          isActive: st.isActive,
          updatedAt: new Date(),
        },
      })
      .returning();
    statusMap[st.code] = inserted.id;
  }

  // Rückfall-Aliase für bestehende Mock-Generatoren
  if (statusMap["ERFASST"] && !statusMap["CREATED"]) statusMap["CREATED"] = statusMap["ERFASST"];
  if (statusMap["FREIGEGEBEN"] && !statusMap["RELEASED"]) statusMap["RELEASED"] = statusMap["FREIGEGEBEN"];
  if (statusMap["IN_ARBEIT"] && !statusMap["IN_PROGRESS"]) statusMap["IN_PROGRESS"] = statusMap["IN_ARBEIT"];
  if (statusMap["PAUSIERT"] && !statusMap["WAITING_PARTS"]) statusMap["WAITING_PARTS"] = statusMap["PAUSIERT"];
  if (statusMap["TABG"] && !statusMap["TECH_COMPLETED"]) statusMap["TECH_COMPLETED"] = statusMap["TABG"];
  if (statusMap["ABGS"] && !statusMap["CLOSED"]) statusMap["CLOSED"] = statusMap["ABGS"];

  // Transitions für Standard-Instandsetzungsauftrag (IH01)
  const transitionsDef = [
    {
      orderTypeCode: "IH01",
      from: "ERFASST",
      to: "FREIGEGEBEN",
      roleCode: "COORDINATOR",
      actionName: "Auftrag freigeben (FREI)",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    {
      orderTypeCode: "IH01",
      from: "FREIGEGEBEN",
      to: "IN_ARBEIT",
      roleCode: "TECHNICIAN",
      actionName: "Arbeit aufnehmen",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    {
      orderTypeCode: "IH01",
      from: "IN_ARBEIT",
      to: "PAUSIERT",
      roleCode: "TECHNICIAN",
      actionName: "Auf Material warten",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: true,
    },
    {
      orderTypeCode: "IH01",
      from: "PAUSIERT",
      to: "IN_ARBEIT",
      roleCode: "TECHNICIAN",
      actionName: "Material erhalten - Fortsetzen",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    {
      orderTypeCode: "IH01",
      from: "IN_ARBEIT",
      to: "TABG",
      roleCode: "TECHNICIAN",
      actionName: "Technisch abschließen (TABG)",
      requireChecklist: false,
      requireTimeEntry: true,
      requireRootCause: true,
      requireSignature: false,
      triggerSapSync: true,
      guard: { requireRootCauseFilled: true, requireActualDurationFilled: true },
      requiresComment: false,
    },
    {
      orderTypeCode: "IH01",
      from: "TABG",
      to: "ABGS",
      roleCode: "COORDINATOR",
      actionName: "Kaufmännisch abschließen (ABGS)",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    // Für IH02 (Wartung & Inspektion)
    {
      orderTypeCode: "IH02",
      from: "ERFASST",
      to: "FREIGEGEBEN",
      roleCode: "COORDINATOR",
      actionName: "Wartung freigeben",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    {
      orderTypeCode: "IH02",
      from: "FREIGEGEBEN",
      to: "IN_ARBEIT",
      roleCode: "TECHNICIAN",
      actionName: "Inspektion starten",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    {
      orderTypeCode: "IH02",
      from: "IN_ARBEIT",
      to: "TABG",
      roleCode: "TECHNICIAN",
      actionName: "Inspektion abschließen (TABG)",
      requireChecklist: true,
      requireTimeEntry: true,
      requireRootCause: false,
      requireSignature: true,
      triggerSapSync: true,
      guard: { requireChecklistCompleted: true, requireActualDurationFilled: true },
      requiresComment: false,
    },
    {
      orderTypeCode: "IH02",
      from: "TABG",
      to: "ABGS",
      roleCode: "COORDINATOR",
      actionName: "Endabnahme Wartung (ABGS)",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    // Legacy-Kompatibilität für bestehende Tests (CREATED -> RELEASED -> IN_PROGRESS -> TECH_COMPLETED -> CLOSED)
    {
      orderTypeCode: "IH01",
      from: "CREATED",
      to: "RELEASED",
      roleCode: "COORDINATOR",
      actionName: "Auftrag freigeben (FREI)",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    {
      orderTypeCode: "IH01",
      from: "RELEASED",
      to: "IN_PROGRESS",
      roleCode: "TECHNICIAN",
      actionName: "Arbeit aufnehmen",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    {
      orderTypeCode: "IH01",
      from: "IN_PROGRESS",
      to: "WAITING_PARTS",
      roleCode: "TECHNICIAN",
      actionName: "Auf Material warten",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: true,
    },
    {
      orderTypeCode: "IH01",
      from: "WAITING_PARTS",
      to: "IN_PROGRESS",
      roleCode: "TECHNICIAN",
      actionName: "Material erhalten - Fortsetzen",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
    {
      orderTypeCode: "IH01",
      from: "IN_PROGRESS",
      to: "TECH_COMPLETED",
      roleCode: "TECHNICIAN",
      actionName: "Technisch abschließen (TABG)",
      requireChecklist: false,
      requireTimeEntry: true,
      requireRootCause: true,
      requireSignature: false,
      triggerSapSync: true,
      guard: { requireRootCauseFilled: true, requireActualDurationFilled: true },
      requiresComment: false,
    },
    {
      orderTypeCode: "IH01",
      from: "TECH_COMPLETED",
      to: "CLOSED",
      roleCode: "COORDINATOR",
      actionName: "Kaufmännisch abschließen (ABGS)",
      requireChecklist: false,
      requireTimeEntry: false,
      requireRootCause: false,
      requireSignature: false,
      triggerSapSync: false,
      guard: {},
      requiresComment: false,
    },
  ];

  for (const tr of transitionsDef) {
    if (!statusMap[tr.from] || !statusMap[tr.to] || !orderTypeMap[tr.orderTypeCode]) {
      continue;
    }
    await db
      .insert(schema.workflowTransitions)
      .values({
        tenantId,
        orderTypeId: orderTypeMap[tr.orderTypeCode],
        fromStatusId: statusMap[tr.from],
        toStatusId: statusMap[tr.to],
        requiredRoleId: tr.roleCode,
        actionName: tr.actionName,
        requireChecklist: tr.requireChecklist,
        requireTimeEntry: tr.requireTimeEntry,
        requireRootCause: tr.requireRootCause,
        requireSignature: tr.requireSignature,
        triggerSapSync: tr.triggerSapSync,
        guardConditions: tr.guard,
        requiresComment: tr.requiresComment,
        triggersSapSync: tr.triggerSapSync,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [
          schema.workflowTransitions.tenantId,
          schema.workflowTransitions.orderTypeId,
          schema.workflowTransitions.fromStatusId,
          schema.workflowTransitions.toStatusId,
        ],
        set: {
          actionName: tr.actionName,
          requiredRoleId: tr.roleCode,
          requireChecklist: tr.requireChecklist,
          requireTimeEntry: tr.requireTimeEntry,
          requireRootCause: tr.requireRootCause,
          requireSignature: tr.requireSignature,
          triggerSapSync: tr.triggerSapSync,
          triggersSapSync: tr.triggerSapSync,
          guardConditions: tr.guard,
          requiresComment: tr.requiresComment,
          isActive: true,
          updatedAt: new Date(),
        },
      });
  }

  // 8. Ersatzteile (Spare Parts)
  console.log("🔩 Seeding Spare Parts...");
  const sparePartDefs = [
    {
      internalPartNumber: "SP-SKF-6205",
      name: "SKF Rillenkugellager 6205-2RSH",
      manufacturerPartNumber: "6205-2RSH",
      unitOfMeasure: "ST",
      storageLocation: "LAG-01",
      storageBin: "B-12-04",
      stockQuantity: "24.000",
      minStockLevel: "6.000",
      movingAveragePrice: "18.50",
      sapMaterialNr: "MAT-200101",
    },
    {
      internalPartNumber: "SP-FES-DSNU",
      name: "Festo Dichtsatz für Normzylinder DSNU-25",
      manufacturerPartNumber: "FES-193411",
      unitOfMeasure: "ST",
      storageLocation: "LAG-01",
      storageBin: "A-03-01",
      stockQuantity: "15.000",
      minStockLevel: "4.000",
      movingAveragePrice: "34.20",
      sapMaterialNr: "MAT-200102",
    },
    {
      internalPartNumber: "SP-GF-SEAL",
      name: "Grundfos Gleitringdichtung HQQE 12mm",
      manufacturerPartNumber: "96455086",
      unitOfMeasure: "ST",
      storageLocation: "LAG-02",
      storageBin: "C-08-11",
      stockQuantity: "8.000",
      minStockLevel: "2.000",
      movingAveragePrice: "142.00",
      sapMaterialNr: "MAT-200103",
    },
    {
      internalPartNumber: "SP-SIE-FUSE",
      name: "Siemens Halbleitersicherung SITOR 100A",
      manufacturerPartNumber: "3NE1820-0",
      unitOfMeasure: "ST",
      storageLocation: "LAG-ELEK",
      storageBin: "E-01-05",
      stockQuantity: "30.000",
      minStockLevel: "10.000",
      movingAveragePrice: "48.90",
      sapMaterialNr: "MAT-200104",
    },
    {
      internalPartNumber: "SP-OIL-VG46",
      name: "Mobil DTE 25 Ultra Hydrauliköl HLP VG 46",
      manufacturerPartNumber: "MOB-DTE25-20L",
      unitOfMeasure: "L",
      storageLocation: "LAG-OEL",
      storageBin: "F-TANK-01",
      stockQuantity: "450.000",
      minStockLevel: "100.000",
      movingAveragePrice: "6.20",
      sapMaterialNr: "MAT-200105",
    },
  ];

  const sparePartList: Array<{ id: string; partNumber: string; price: string }> = [];
  for (const sp of sparePartDefs) {
    const [inserted] = await db
      .insert(schema.spareParts)
      .values({
        tenantId,
        internalPartNumber: sp.internalPartNumber,
        name: sp.name,
        manufacturerPartNumber: sp.manufacturerPartNumber,
        unitOfMeasure: sp.unitOfMeasure,
        storageLocation: sp.storageLocation,
        storageBin: sp.storageBin,
        stockQuantity: sp.stockQuantity,
        minStockLevel: sp.minStockLevel,
        movingAveragePrice: sp.movingAveragePrice,
        currency: "EUR",
        sapMaterialNr: sp.sapMaterialNr,
        sapSyncStatus: "SYNCED",
        sapLastSyncedAt: new Date(),
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [schema.spareParts.tenantId, schema.spareParts.internalPartNumber],
        set: { name: sp.name, stockQuantity: sp.stockQuantity },
      })
      .returning();

    sparePartList.push({
      id: inserted.id,
      partNumber: sp.internalPartNumber,
      price: sp.movingAveragePrice,
    });
  }

  // 9. 30 historische Störungsaufträge (Breakdown Orders)
  console.log("🛠️ Seeding 30 Realistic Breakdown Orders (with Audit Logs & Embeddings)...");

  interface BreakdownPreset {
    title: string;
    description: string;
    symptom: string;
    damageCode: string;
    rootCause: string;
    causeCode: string;
    resolution: string;
    eqIndex: number;
    priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
    statusCode: string;
    downtimeMin: number;
    durationMin: number;
    partIndex?: number;
    daysAgo: number;
  }

  const breakdownPresets: BreakdownPreset[] = [
    {
      title: "Roboterzelle 1 Achse 4 Überstromabschaltung",
      description: "Roboter geht während Schweißzyklus bei Taktzeitsekunde 18 in Notaus mit Fehlercode E-842 Achse 4 Überstrom.",
      symptom: "Ruckartige Bewegung von Achse 4, anschließend Not-Halt und Überstrom-Warnung im KCP.",
      damageCode: "ELEC_OVERLOAD",
      rootCause: "Schleppkabelstrang im Armgelenk aufgescheuert, temporärer Erdschluss der Motorleitung.",
      causeCode: "CABLE_WEAR",
      resolution: "Leitungssatz für Achse 4 ausgetauscht, Kabelführung im Gelenk neu justiert und kalibriert.",
      eqIndex: 0,
      priority: "1_EMERGENCY",
      statusCode: "TECH_COMPLETED",
      downtimeMin: 145,
      durationMin: 180,
      daysAgo: 85,
    },
    {
      title: "Kreiselpumpe Kühlkreislauf Druckverlust & Leckage",
      description: "Druck im Primärkühlkreislauf sinkt unter 3.2 bar. Deutlicher Wasseraustritt am Pumpenflansch festgestellt.",
      symptom: "Pneumatische Kühldrucküberwachung löst Alarm aus, Pfützenbildung unter der Pumpe.",
      damageCode: "MECH_LEAKAGE",
      rootCause: "Gleitringdichtung durch abrasive Partikel im Kühlwasser vorzeitig verschlissen.",
      causeCode: "SEAL_FAILURE",
      resolution: "Pumpe isoliert, Gleitringdichtung SiC ersetzt, Ansaugfilter gereinigt und Drucktest mit 6 bar bestanden.",
      eqIndex: 2,
      priority: "1_EMERGENCY",
      statusCode: "CLOSED",
      downtimeMin: 90,
      durationMin: 120,
      partIndex: 2,
      daysAgo: 79,
    },
    {
      title: "Förderband 4 Riemen blockiert & Motorüberhitzung",
      description: "Gurtförderer bleibt unter Last stehen. SEW-Umrichter meldet F08 Motor Überlast / Drehzahlfehler.",
      symptom: "Starker Brandgeruch am Bandantrieb, Förderband rutscht durch.",
      damageCode: "MECH_JAM",
      rootCause: "Fremdkörper (abgebrochener Werkstückträger-Bolzen) in der Umlenkrolle verkeilt.",
      causeCode: "FOREIGN_OBJECT",
      resolution: "Umlenkstation entspannt, Bolzen entfernt, Lagerung auf Schlag geprüft und Band neu gespannt.",
      eqIndex: 1,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 55,
      durationMin: 75,
      daysAgo: 74,
    },
    {
      title: "Schraubenkompressor GA 37 Notabschaltung Übertemperatur",
      description: "Kompressor schaltet bei 108°C Verdichter-Endtemperatur automatisch ab. Druckluftnetz fällt auf 5.5 bar.",
      symptom: "Temperaturwarnung am Elektronikon-Display, Lüfterdrehzahl maximal aber keine Kühlung.",
      damageCode: "THERMAL_OVERHEAT",
      rootCause: "Kühllamellen des Ölkühlers durch Baustaub und Fasern vollständig zugesetzt.",
      causeCode: "CLOGGED_COOLER",
      resolution: "Ölkühler mit Druckluft und Trockeneis gereinigt, Thermoventil kontrolliert, Probelauf bei Volllast stabil 84°C.",
      eqIndex: 3,
      priority: "1_EMERGENCY",
      statusCode: "CLOSED",
      downtimeMin: 110,
      durationMin: 140,
      daysAgo: 68,
    },
    {
      title: "Siemens Sinamics S120 Zwischenkreis Überspannung",
      description: "Walzstraße schaltet bei Bremsvorgang ab. Fehlermeldung F30002 Zwischenkreis-Überspannung.",
      symptom: "Ausfall der Walzgerüst-Synchrongeschwindigkeit während der Verzögerungsrampe.",
      damageCode: "ELEC_OVERVOLT",
      rootCause: "Bremswiderstand-Thermoschalter defekt, Bremschopper wurde nicht freigegeben.",
      causeCode: "RESISTOR_DEFECT",
      resolution: "Thermoschalter am Bremswiderstand erneuert, Rückspeise-Parameter im STARTER überprüft.",
      eqIndex: 4,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 65,
      durationMin: 90,
      partIndex: 3,
      daysAgo: 63,
    },
    {
      title: "Laserschneider TruLaser Schneidkopf Kollision & Schiefstand",
      description: "Schneidkopf berührt aufgestelltes Blechteil. Kollisionsschutz hat ausgelöst.",
      symptom: "Kollisionsalarm im TruTops, Keramikteil des Schneidkopfs angebrochen.",
      damageCode: "MECH_COLLISION",
      rootCause: "Wärmeverzug eines 8mm-Stahlblechs führte zum Kippen der Restkontur in den Verfahrweg.",
      causeCode: "PROCESS_DEFECT",
      resolution: "Keramikfassung getauscht, Düse zentriert, Fokuslage kalibriert und Schnittbildkontrolle i.O.",
      eqIndex: 5,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 45,
      durationMin: 60,
      daysAgo: 58,
    },
    {
      title: "Hydraulikaggregat 2 Druckschwankung & Schaumbildung",
      description: "Axialkolbenpumpe erzeugt pulsierendes Geräusch. Druck bricht unter 180 bar ein.",
      symptom: "Starke Kavitationsgeräusche der Pumpe, Schaum im Schauglas des Hydrauliktanks sichtbar.",
      damageCode: "HYDR_CAVITATION",
      rootCause: "Saugfilter stark verschmutzt, Ansaugwiderstand führte zu Lufteintrag und Kavitation.",
      causeCode: "FILTER_CLOGGED",
      resolution: "Saugfilterelement gewechselt, Hydrauliköl VG 46 nachgefüllt und Anlage entlüftet.",
      eqIndex: 6,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 80,
      durationMin: 110,
      partIndex: 4,
      daysAgo: 54,
    },
    {
      title: "CNC-Fräse Robodrill Werkzeugwechsler klemmt bei T14",
      description: "Werkzeugwechselarm bleibt bei Übergabe des Fräsers stecken. Spindelhub blockiert.",
      symptom: "Alarm 1042 ATC INTERLOCK ERROR, Werkzeugwechsler in Zwischenposition eingefroren.",
      damageCode: "MECH_ATC_STUCK",
      rootCause: "Pneumatischer Ausblaskegel verschmutzt, Späne in der Spannzange verhinderten das Lösen.",
      causeCode: "DIRT_CHIPS",
      resolution: "Werkzeug manuell gelöst, Spannzange gereinigt, Spannkraftmessung durchgeführt (i.O. 7.8 kN).",
      eqIndex: 7,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 50,
      durationMin: 70,
      daysAgo: 50,
    },
    {
      title: "Festo Ventilinsel Schleichleckage an Ventilplatz 04",
      description: "Druckverlust in der Montagezelle im Ruhezustand. Zischen an der CPX-Ventilinsel hörbar.",
      symptom: "Druckluftzähler meldet erhöhten Grundverbrauch außerhalb der Produktionszeit.",
      damageCode: "PNEU_LEAKAGE",
      rootCause: "Dichtlippe des 5/2-Wegeventils porös durch ölhaltige Druckluft.",
      causeCode: "SEAL_WEAR",
      resolution: "Ventilscheibe Platz 4 ausgetauscht, Pneumatikverschraubung auf Drehmoment nachgezogen.",
      eqIndex: 8,
      priority: "3_MEDIUM",
      statusCode: "CLOSED",
      downtimeMin: 0,
      durationMin: 45,
      partIndex: 1,
      daysAgo: 46,
    },
    {
      title: "Promag 50P Durchfluss-Signal driftet stark",
      description: "Dosierung meldet unplausible Durchflusswerte mit Schwankungen +/- 40%.",
      symptom: "Regelkreis übersteuert Dosierpumpe, Fehlcharge droht.",
      damageCode: "SENSOR_DRIFT",
      rootCause: "Erdungsringe am Messaufnehmer locker, induktive Einstreuung durch benachbarten Motor.",
      causeCode: "GROUNDING_FAULT",
      resolution: "Erdungskabel an beiden Flanschen erneuert und fest verschraubt. Nullpunkt-Kalibrierung durchgeführt.",
      eqIndex: 9,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 35,
      durationMin: 50,
      daysAgo: 42,
    },
    {
      title: "KUKA Roboter Handgelenk Achse 5 Knackgeräusche",
      description: "Akustische Auffälligkeit bei Schwenkbewegung von Achse 5 unter voller Nutzlast.",
      symptom: "Vibrationen am Greifer, metallisches Knacken bei Richtungsumkehr.",
      damageCode: "MECH_VIBRATION",
      rootCause: "Beginnender Pittingschaden am Stirnradgetriebe der Handachse 5.",
      causeCode: "FATIGUE_WEAR",
      resolution: "Getriebeöl abgelassen, Späne nachgewiesen. Getriebestufe revidiert und neues KUKA-Spezialöl befüllt.",
      eqIndex: 0,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 210,
      durationMin: 300,
      daysAgo: 39,
    },
    {
      title: "Förderband 4 Kugellager Antriebstrommel Heißläufer",
      description: "Wärmebildkamera zeigt 92°C am Festlager der Antriebswalze.",
      symptom: "Hohe Temperatur, Pfeifgeräusch und Lagerspiel spürbar.",
      damageCode: "BEARING_OVERHEAT",
      rootCause: "Schmiermittelverlust durch defekten Simmerring, Trockenlauf der Wälzkörper.",
      causeCode: "LUBRICATION_LOSS",
      resolution: "SKF 6205 Rillenkugellager und Radialwellendichtring erneuert, Lager gefettet.",
      eqIndex: 1,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 70,
      durationMin: 95,
      partIndex: 0,
      daysAgo: 36,
    },
    {
      title: "Grundfos Kühlpumpe Motorschutzschalter löst aus",
      description: "Pumpe schaltet nach 12 Sekunden Anlaufzeit über Bimetall-Auslöser ab.",
      symptom: "Wicklungstemperatur erhöht, Motor brummt laut.",
      damageCode: "ELEC_TRIP",
      rootCause: "Fremdkörper im Pumpenlaufrad blockiert die Drehbewegung im Teillastbereich.",
      causeCode: "PUMP_IMPELLER_JAM",
      resolution: "Pumpenkopf demontiert, Schweißperle aus Laufradspalt entfernt, Freigang geprüft.",
      eqIndex: 2,
      priority: "1_EMERGENCY",
      statusCode: "CLOSED",
      downtimeMin: 105,
      durationMin: 130,
      daysAgo: 33,
    },
    {
      title: "Atlas Copco GA 37 Ölfilter Differenzdruck Alarm",
      description: "Warnung 'Ölfilter wechseln' im Bedienpanel aktiv, Differenzdruck > 1.8 bar.",
      symptom: "Anzeige im Display leuchtet gelb, Vorwarnstufe vor Leistungsminderung.",
      damageCode: "FILTER_WARNING",
      rootCause: "Reguläre Standzeit des Ölfilters erreicht, leichte Rußpartikelablagerung.",
      causeCode: "MAINT_OVERDUE",
      resolution: "Ölfilterpatrone erneuert, Füllstandskontrolle Kompressorenöl durchgeführt, Zähler quittiert.",
      eqIndex: 3,
      priority: "3_MEDIUM",
      statusCode: "CLOSED",
      downtimeMin: 20,
      durationMin: 40,
      daysAgo: 30,
    },
    {
      title: "Walzwerk Sinamics Profinet Kommunikationsabbruch",
      description: "SPS meldet Busfehler zu Sinamics Achse 2, Not-Aus der Walzstraße ausgelöst.",
      symptom: "BF-LED am CU320-2 blinkt rot, Antrieb nicht mehr ansprechbar.",
      damageCode: "COMM_PROFINET_FAIL",
      rootCause: "RJ45-Stecker an der Schaltschrankdurchführung durch Vibrationen lose vibriert.",
      causeCode: "VIBRATION_LOOSE",
      resolution: "Stecker durch robusten M12-D-kodierten Industriesteckverbinder ersetzt, Leitung geprüft.",
      eqIndex: 4,
      priority: "1_EMERGENCY",
      statusCode: "CLOSED",
      downtimeMin: 40,
      durationMin: 55,
      daysAgo: 27,
    },
    {
      title: "TruLaser Schutzglas Verschmutzung & Schnittabriss",
      description: "Laserschnitt bricht bei 15mm Baustahl ab. Schneidspalt schmilzt unsauber zu.",
      symptom: "Schlackenbildung an der Unterseite, Schutzglas-Monitor meldet 85% Streulicht.",
      damageCode: "OPTIC_CONTAMINATION",
      rootCause: "Schneidspritzer drangen wegen zu geringem Schneidgasdruck beim Einstechen ein.",
      causeCode: "PRESSURE_DROP",
      resolution: "Schutzglas gewechselt, Einstichparameter in der CNC-Steuerung optimiert, Schnittbild ok.",
      eqIndex: 5,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 30,
      durationMin: 45,
      daysAgo: 24,
    },
    {
      title: "Hydraulikpresse Druckbegrenzungsventil reagiert verzögert",
      description: "Druckanstiegszeit überschreitet Grenzwert um 350ms. Presszyklus verlangsamt.",
      symptom: "Presse fährt im Eilgang normal, Schleichgang-Umschaltung ruckartig.",
      damageCode: "VALVE_SLOW_RESPONSE",
      rootCause: "Steuerkolben des Vorsteuerventils durch gealtertes Harz leicht verklebt.",
      causeCode: "OIL_AGING",
      resolution: "Vorsteuerventil im Ultraschallbad gereinigt, Dichtungen getauscht, Ansprechzeit wieder < 80ms.",
      eqIndex: 6,
      priority: "3_MEDIUM",
      statusCode: "CLOSED",
      downtimeMin: 60,
      durationMin: 90,
      daysAgo: 21,
    },
    {
      title: "CNC Robodrill Spindellüfter Ausfall",
      description: "Alarm 'Spindle Cooler Fan Error' während Hochgeschwindigkeits-Schlichtbearbeitung.",
      symptom: "Spindeldrehzahl wird automatisch auf 6000 U/min begrenzt, rote Signalleuchte.",
      damageCode: "COOLING_FAN_FAIL",
      rootCause: "Lüftermotor blockiert durch Späneflug hinter dem Spindelgehäuse.",
      causeCode: "CHIP_ACCUMULATION",
      resolution: "Lüfterhaube abgenommen, Lüfter gereinigt, Schutzgitter mit feinerem Sieb versehen.",
      eqIndex: 7,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 40,
      durationMin: 60,
      daysAgo: 18,
    },
    {
      title: "Festo Ventilinsel Profinet Busknoten CPX Spannungsabfall",
      description: "Busknoten verliert intermittierend die 24V Elektronikversorgung.",
      symptom: "Ventile fallen sporadisch in Failsafe-Zustand, Montagezyklus bricht ab.",
      damageCode: "POWER_SUPPLY_DROP",
      rootCause: "Korrodierte Klemme am 24V-Schaltnetzteil in der Vor-Ort-Klemmenbox.",
      causeCode: "TERMINAL_CORROSION",
      resolution: "Aderendhülsen neu gecrimpt, Klemmenblock ersetzt, 24VDC unter Last stabil 24.1V.",
      eqIndex: 8,
      priority: "2_HIGH",
      statusCode: "CLOSED",
      downtimeMin: 45,
      durationMin: 65,
      daysAgo: 15,
    },
    {
      title: "Promag 50P Messrohr Verkrustung im Einlauf",
      description: "Fehlermeldung 'Empty Pipe' trotz voller Rohrleitung.",
      symptom: "Messwert springt zwischen 0 und 100%, Elektrodenwiderstand zu hoch.",
      damageCode: "ELECTRODE_FOULING",
      rootCause: "Kalk- und Chemikalienkruste an den Messelektroden isoliert das Signal.",
      causeCode: "SCALING_DEPOSIT",
      resolution: "Messstrecke gespült, chemische CIP-Reinigung durchgeführt, Elektrodenfunktion verifiziert.",
      eqIndex: 9,
      priority: "3_MEDIUM",
      statusCode: "CLOSED",
      downtimeMin: 50,
      durationMin: 75,
      daysAgo: 13,
    },
    {
      title: "KUKA Roboter Greiferbacke Führungsspiel zu groß",
      description: "Werkstücke werden nicht mehr mittig in die Schweißvorrichtung eingelegt.",
      symptom: "Positionsabweichung beim Fügen, Schweißnahtversatz festgestellt.",
      damageCode: "MECH_PLAY",
      rootCause: "Linearführungen der pneumatischen Parallelgreiferbacken ausgeschlagen.",
      causeCode: "WEAR_AND_TEAR",
      resolution: "Greiferbacken demontiert, Linearführungswagen gewechselt, TCP mit Messtaster neu eingemessen.",
      eqIndex: 0,
      priority: "2_HIGH",
      statusCode: "TECH_COMPLETED",
      downtimeMin: 90,
      durationMin: 120,
      daysAgo: 11,
    },
    {
      title: "Förderband 4 Lichtschranke Bandende dejustiert",
      description: "Förderband stoppt nicht automatisch bei Materialankunft am Bandende.",
      symptom: "Teile stauen sich an der Übergaberutsche, Band läuft weiter.",
      damageCode: "OPTIC_SENSOR_ALIGN",
      rootCause: "Reflektorspiegel durch manuelles Eingreifen eines Werkers verbogen.",
      causeCode: "MECHANICAL_IMPACT",
      resolution: "Halterung gerichtet, Reflektor gereinigt und Schaltabstand neu justiert.",
      eqIndex: 1,
      priority: "3_MEDIUM",
      statusCode: "CLOSED",
      downtimeMin: 15,
      durationMin: 25,
      daysAgo: 9,
    },
    {
      title: "Grundfos Pumpe Kavitationsgeräusche bei Spitzenlast",
      description: "Bei parallelem Zuschalten zweier Verbraucher fängt die Pumpe stark zu vibrieren an.",
      symptom: "Knisterndes Geräusch im Pumpengehäuse, Förderstrom bricht ein.",
      damageCode: "NPSH_INSUFFICIENT",
      rootCause: "Vordruck im Ausgleichsbehälter zu niedrig, Membran hat Druck verloren.",
      causeCode: "DIAPHRAGM_PRESSURE_LOSS",
      resolution: "Membran-Druckausdehnungsgefäß mit Stickstoff auf 2.5 bar Vordruck gefüllt, NPSH-Wert wieder ausreichend.",
      eqIndex: 2,
      priority: "2_HIGH",
      statusCode: "TECH_COMPLETED",
      downtimeMin: 35,
      durationMin: 50,
      daysAgo: 8,
    },
    {
      title: "Atlas Copco GA 37 Keilriemenspannung nachlassen",
      description: "Schlupf und Quietschen beim Hochlaufen des Kompressors.",
      symptom: "Drehzahldifferenz zwischen Motor und Verdichterblock bei Lastsprüngen.",
      damageCode: "BELT_SLIP",
      rootCause: "Keilriemen nach 4000 Betriebsstunden gelängt.",
      causeCode: "BELT_ELONGATION",
      resolution: "Keilriemensatz erneuert, Riemenspannung mit Frequenz-Messgerät exakt auf 85 Hz eingestellt.",
      eqIndex: 3,
      priority: "3_MEDIUM",
      statusCode: "CLOSED",
      downtimeMin: 45,
      durationMin: 60,
      daysAgo: 6,
    },
    {
      title: "Siemens Sinamics Lüfterkassette Schaltschrank defekt",
      description: "Warnung 'Temperatur Leistungsteil erhöht' an Achse 3.",
      symptom: "Lüfterkassette im Geräteboden läuft mit verringerter Drehzahl.",
      damageCode: "FAN_MODULE_FAIL",
      rootCause: "Lagerdefekt am 24V-Radiallüfter der Leistungseinheit.",
      causeCode: "COMPONENT_FAILURE",
      resolution: "Lüfterkassette im laufenden Betrieb getauscht, Modultemperatur sank von 72°C auf 48°C.",
      eqIndex: 4,
      priority: "3_MEDIUM",
      statusCode: "TECH_COMPLETED",
      downtimeMin: 0,
      durationMin: 30,
      daysAgo: 5,
    },
    {
      title: "TruLaser Stickstoff-Druckregler Vereisung",
      description: "Schneidgasdruck fällt während Dauerschnitt von 18 bar auf 11 bar ab.",
      symptom: "Starke Reifbildung am Druckminderer der N2-Bündelstation.",
      damageCode: "PRESSURE_REG_ICING",
      rootCause: "Elektrische Vorwärmung des Gas-Verdampfers durch defekten Thermostaten ausgefallen.",
      causeCode: "HEATER_DEFECT",
      resolution: "Heizpatrone der N2-Vorwärmung ersetzt, Enteisung durchgeführt, Gasdruck stabil 19.5 bar.",
      eqIndex: 5,
      priority: "2_HIGH",
      statusCode: "TECH_COMPLETED",
      downtimeMin: 75,
      durationMin: 90,
      daysAgo: 4,
    },
    {
      title: "Hydraulikaggregat 2 Schlauchleitung porös",
      description: "Bei Sichtprüfung Ölschwitzen an der Hochdruckleitung zum Presszylinder festgestellt.",
      symptom: "Ölfilm am Schlauchmantel, Drahtgeflecht sichtbar.",
      damageCode: "HOSE_WEAR",
      rootCause: "Biegeradius durch Schwenkbewegung grenzwertig, mechanischer Abrieb.",
      causeCode: "INSTALLATION_GEOMETRY",
      resolution: "Hochdruckschlauch 2SN DN16 getauscht, Scheuerschutzspirale angebracht und Verlegung optimiert.",
      eqIndex: 6,
      priority: "2_HIGH",
      statusCode: "IN_PROGRESS",
      downtimeMin: 30,
      durationMin: 60,
      partIndex: 4,
      daysAgo: 2,
    },
    {
      title: "CNC Robodrill Schmieröldruck Minimalalarm",
      description: "Meldung 'Way Lube Pressure Low' verhindert Start des Automatik-Zyklus.",
      symptom: "Schmiermittel-Druckaufbau dauert länger als 45 Sekunden.",
      damageCode: "LUBE_PRESSURE_LOW",
      rootCause: "Feinfilter der Zentralschmierpumpe verharzt.",
      causeCode: "LUBRICANT_RESIDUE",
      resolution: "Filter gereinigt, Bettbahnöl ISO VG 68 aufgefüllt, Entlüftungszyklus abgefahren.",
      eqIndex: 7,
      priority: "2_HIGH",
      statusCode: "IN_PROGRESS",
      downtimeMin: 25,
      durationMin: 45,
      daysAgo: 1,
    },
    {
      title: "Festo Ventilinsel Schalldämpfer zugesetzt",
      description: "Zylinder entlüften stark verzögert, Taktzeit der Montagezelle steigt um 1.8 Sekunden.",
      symptom: "Zischen leiser als gewöhnlich, Rückhubzeit verlangsamt.",
      damageCode: "SILENCER_CLOGGED",
      rootCause: "Sinterbronze-Schalldämpfer mit Öl-Staub-Emulsion verklebt.",
      causeCode: "DIRT_ACCUMULATION",
      resolution: "Schalldämpfer gegen wartungsfreien Typ ausgetauscht, Entlüftungsquerschnitt wieder frei.",
      eqIndex: 8,
      priority: "3_MEDIUM",
      statusCode: "RELEASED",
      downtimeMin: 0,
      durationMin: 30,
      daysAgo: 1,
    },
    {
      title: "Promag 50P Schutzleiter-Prüfung nach DGUV V3",
      description: "Periodische Wiederholungsprüfung der elektrischen Betriebsmittel an der Dosierstrecke.",
      symptom: "Turnusmäßige Überprüfung nach Vorschrift DGUV V3.",
      damageCode: "INSPECTION_CHECK",
      rootCause: "Reguläre Sicherheitskontrolle.",
      causeCode: "PREVENTIVE",
      resolution: "Schutzleiterwiderstand 0.08 Ohm gemessen (Grenzwert < 0.3 Ohm), Isolationswiderstand > 100 MOhm. Plakette erteilt.",
      eqIndex: 9,
      priority: "4_LOW",
      statusCode: "CREATED",
      downtimeMin: 0,
      durationMin: 45,
      daysAgo: 0,
    },
  ];

  const now = new Date();

  for (let i = 0; i < breakdownPresets.length; i++) {
    const item = breakdownPresets[i];
    const orderNumber = `MO-2026-${String(i + 1).padStart(4, "0")}`;
    const sapOrderNr = `4000${String(i + 1).padStart(4, "0")}`;
    const sapNotificationNr = `1000${String(i + 1).padStart(4, "0")}`;

    const createdAtDate = new Date(now.getTime() - item.daysAgo * 86400000 - (i % 8) * 3600000);
    // Neue Maßnahmen im Status CREATED landen initial ohne Starttermin im Eingangspool
    const isInitialPool = item.statusCode === "CREATED";
    const scheduledStart = isInitialPool ? null : new Date(createdAtDate.getTime() + 1800000);
    const scheduledEnd = scheduledStart ? new Date(scheduledStart.getTime() + item.durationMin * 60000) : null;

    const actualStart = !isInitialPool && item.statusCode !== "RELEASED" ? scheduledStart : null;
    const actualEnd =
      item.statusCode === "TECH_COMPLETED" || item.statusCode === "CLOSED"
        ? new Date((scheduledStart || createdAtDate).getTime() + item.durationMin * 60000)
        : null;

    const targetStatusId = statusMap[item.statusCode] || statusMap["CLOSED"];
    const targetEq = equipmentList[item.eqIndex];

    const mappedDamageCodeId =
      damageCodeMap[item.damageCode] ||
      (item.damageCode.includes("LEAK") || item.damageCode.includes("SEAL")
        ? damageCodeMap["LECKAGE"]
        : item.damageCode.includes("OVERLOAD") || item.damageCode.includes("OVERVOLT")
        ? damageCodeMap["UEBERLAST"]
        : item.damageCode.includes("BEARING")
        ? damageCodeMap["LAGER_DEFEKT"]
        : item.damageCode.includes("SENSOR") || item.damageCode.includes("DRIFT")
        ? damageCodeMap["SENSOR_AUSFALL"]
        : item.damageCode.includes("CAVITATION") || item.damageCode.includes("PRESSURE")
        ? damageCodeMap["DRUCKVERLUST"]
        : item.damageCode.includes("VENTIL") || item.damageCode.includes("PNEU")
        ? damageCodeMap["VENTIL_KLEMMT"]
        : item.damageCode.includes("JAM") || item.damageCode.includes("ATC")
        ? damageCodeMap["MECH_JAM"]
        : damageCodeMap["MECH_VERSCHLEISS"]);

    const escalationLevel =
      item.downtimeMin >= 90 || item.priority === "1_EMERGENCY"
        ? "LEVEL_3"
        : item.priority === "2_HIGH"
        ? "LEVEL_2"
        : "LEVEL_1";

    const [order] = await db
      .insert(schema.maintenanceOrders)
      .values({
        tenantId,
        orderNumber,
        orderTypeId: orderTypeMap["IH01"],
        currentStatusId: targetStatusId,
        priority: item.priority,
        escalationLevel,
        title: item.title,
        description: item.description,
        symptomDescription: item.symptom,
        damageCode: item.damageCode,
        damageCodeId: mappedDamageCodeId || null,
        rootCauseDescription: item.rootCause,
        causeCode: item.causeCode,
        resolutionSummary: item.resolution,
        equipmentId: targetEq.id,
        functionalLocationId: targetEq.flocId,
        reportedByUserId: userMap["OPERATOR"] || userMap["REPORTER"],
        assignedToUserId: isInitialPool ? null : userMap["TECHNICIAN"],
        scheduledStartAt: scheduledStart,
        scheduledEndAt: scheduledEnd,
        actualStartAt: actualStart,
        actualEndAt: actualEnd,
        plannedDurationMinutes: item.durationMin,
        actualDurationMinutes: actualEnd ? item.durationMin : null,
        downtimeMinutes: item.downtimeMin,
        sapOrderNr,
        sapNotificationNr,
        sapSyncStatus: "SYNCED",
        sapLastSyncedAt: createdAtDate,
        createdAt: createdAtDate,
        updatedAt: actualEnd || createdAtDate,
      })
      .onConflictDoUpdate({
        target: [schema.maintenanceOrders.tenantId, schema.maintenanceOrders.orderNumber],
        set: {
          title: item.title,
          description: item.description,
          currentStatusId: targetStatusId,
          escalationLevel,
          damageCodeId: mappedDamageCodeId || null,
          resolutionSummary: item.resolution,
        },
      })
      .returning();

    // 10. Status Audit Log für diesen Auftrag
    await db
      .insert(schema.orderStatusAuditLogs)
      .values({
        tenantId,
        maintenanceOrderId: order.id,
        fromStatusId: null,
        toStatusId: statusMap["CREATED"],
        changedByUserId: userMap["OPERATOR"] || userMap["REPORTER"],
        comment: "Störungsmeldung im System erfasst",
        createdAt: createdAtDate,
      })
      .onConflictDoNothing();

    if (item.statusCode !== "CREATED") {
      await db
        .insert(schema.orderStatusAuditLogs)
        .values({
          tenantId,
          maintenanceOrderId: order.id,
          fromStatusId: statusMap["CREATED"],
          toStatusId: statusMap["RELEASED"],
          changedByUserId: userMap["COORDINATOR"] || userMap["PLANNER"],
          comment: "Auftrag gesichtet und zur Instandsetzung freigegeben",
          createdAt: new Date(createdAtDate.getTime() + 600000),
        })
        .onConflictDoNothing();
    }

    if (item.statusCode === "IN_PROGRESS" || item.statusCode === "TECH_COMPLETED" || item.statusCode === "CLOSED") {
      await db
        .insert(schema.orderStatusAuditLogs)
        .values({
          tenantId,
          maintenanceOrderId: order.id,
          fromStatusId: statusMap["RELEASED"],
          toStatusId: statusMap["IN_PROGRESS"],
          changedByUserId: userMap["TECHNICIAN"],
          comment: "Vor-Ort-Diagnose und Arbeiten begonnen",
          createdAt: new Date(createdAtDate.getTime() + 1800000),
        })
        .onConflictDoNothing();
    }

    if (item.statusCode === "TECH_COMPLETED" || item.statusCode === "CLOSED") {
      await db
        .insert(schema.orderStatusAuditLogs)
        .values({
          tenantId,
          maintenanceOrderId: order.id,
          fromStatusId: statusMap["IN_PROGRESS"],
          toStatusId: statusMap["TECH_COMPLETED"],
          changedByUserId: userMap["TECHNICIAN"],
          comment: `Arbeiten abgeschlossen: ${item.resolution}`,
          createdAt: actualEnd || new Date(createdAtDate.getTime() + 7200000),
        })
        .onConflictDoNothing();
    }

    // 10b. Zeiterfassung (order_time_entries) für durchgeführte Arbeiten
    if (actualStart && actualEnd) {
      await db
        .insert(schema.orderTimeEntries)
        .values({
          tenantId,
          orderId: order.id,
          userId: userMap["TECHNICIAN"],
          startedAt: actualStart,
          endedAt: actualEnd,
          durationMinutes: item.durationMin,
          workDescription: item.resolution,
          createdAt: actualEnd,
        })
        .onConflictDoNothing();
    }

    // 11. Ersatzteilbuchung (falls vorhanden)
    if (item.partIndex !== undefined && sparePartList[item.partIndex]) {
      const part = sparePartList[item.partIndex];
      await db
        .insert(schema.orderSparePartBookings)
        .values({
          tenantId,
          maintenanceOrderId: order.id,
          sparePartId: part.id,
          bookedByUserId: userMap["TECHNICIAN"],
          quantityPlanned: "1.000",
          quantityConsumed: "1.000",
          unitPriceSnapshot: part.price,
          storageLocation: "LAG-01",
          sapReservationNr: `RES-${orderNumber}`,
          sapMaterialDocNr: `MBL-${orderNumber}`,
          sapMaterialDocYear: 2026,
          sapSyncStatus: "SYNCED",
          sapLastSyncedAt: createdAtDate,
          bookedAt: scheduledStart || createdAtDate,
        })
        .onConflictDoNothing();
    }

    // 12. RAG Vector Embedding für Ähnlichkeitssuche / KI-Wissensbasis
    if (item.statusCode === "TECH_COMPLETED" || item.statusCode === "CLOSED") {
      const docText = `Anlage: ${targetEq.name} (SAP: ${targetEq.sapEquipmentNr})
Störung: ${item.title}
Symptom: ${item.symptom}
Schadenscode: ${item.damageCode}
Ursache: ${item.rootCause} (Code: ${item.causeCode})
Lösung: ${item.resolution}
Stillstand: ${item.downtimeMin} Minuten`;

      const embeddingVector = generateMockVector(docText, 1536);

      await db
        .insert(schema.orderHistoryEmbeddings)
        .values({
          tenantId,
          maintenanceOrderId: order.id,
          equipmentId: targetEq.id,
          chunkIndex: 0,
          synthesizedDocumentText: docText,
          embeddingModel: "text-embedding-3-small",
          embedding: embeddingVector,
          metadataJson: {
            equipmentType: targetEq.name,
            damageCode: item.damageCode,
            causeCode: item.causeCode,
            downtimeMinutes: item.downtimeMin,
          },
        })
        .onConflictDoUpdate({
          target: [
            schema.orderHistoryEmbeddings.maintenanceOrderId,
            schema.orderHistoryEmbeddings.chunkIndex,
          ],
          set: {
            synthesizedDocumentText: docText,
            embedding: embeddingVector,
            updatedAt: new Date(),
          },
        });
    }
  }

    // 13. AI Copilot Historische Referenz-Aufträge (30 Fälle inkl. Embeddings)
    console.log("🧠 Seeding 30 Historical AI Copilot Orders & RAG Embeddings...");
    await seedHistoricalOrdersToDb(db, tenantId);

    // 14. User Saved Views / Dynamische Ansichten & Favoriten
    console.log("⭐ Seeding User Saved Views (Favoriten & dynamische Ansichten)...");
    const h1AreaId = areaMap["AREA-H01"] || areaMap["AREA-PROD-1"];

    const savedViewsToSeed = [
      // Admin
      ...(userMap["admin@maintai.local"]
        ? [
            {
              tenantId,
              userId: userMap["admin@maintai.local"],
              name: "Kritische Störungen Werksweit",
              icon: "alert-triangle",
              intent: "ORDERS_QUERY",
              filterPayload: { priority: ["1_EMERGENCY"], status: ["OPEN", "IN_PROGRESS"] },
              refreshInterval: 30,
              displayDensity: "detailed" as const,
              position: 1,
            },
            {
              tenantId,
              userId: userMap["admin@maintai.local"],
              name: "Systemweite Stillstände",
              icon: "flame",
              intent: "ORDERS_QUERY",
              filterPayload: { search: "Stillstand", status: ["OPEN", "IN_PROGRESS", "ON_HOLD"] },
              refreshInterval: 60,
              displayDensity: "standard" as const,
              position: 2,
            },
            {
              tenantId,
              userId: userMap["admin@maintai.local"],
              name: "Störungen Halle 1",
              icon: "star",
              intent: "ORDERS_QUERY",
              filterPayload: {
                ...(h1AreaId ? { areaId: h1AreaId } : {}),
                status: ["OPEN", "IN_PROGRESS"],
              },
              refreshInterval: 30,
              displayDensity: "compact" as const,
              position: 3,
            },
          ]
        : []),
      // Bediener / Melder
      ...[userMap["bediener@maintai.local"], userMap["melder@maintai.local"]]
        .filter(Boolean)
        .flatMap((uId) => [
          {
            tenantId,
            userId: uId,
            name: "Meine gemeldeten Störungen",
            icon: "alert-circle",
            intent: "ORDERS_QUERY",
            filterPayload: { reportedByMe: true, status: ["DRAFT", "OPEN", "IN_PROGRESS"] },
            refreshInterval: 60,
            displayDensity: "standard" as const,
            position: 1,
          },
          {
            tenantId,
            userId: uId,
            name: "Störungen Halle 1",
            icon: "star",
            intent: "ORDERS_QUERY",
            filterPayload: {
              ...(h1AreaId ? { areaId: h1AreaId } : {}),
              status: ["OPEN", "IN_PROGRESS"],
            },
            refreshInterval: 30,
            displayDensity: "compact" as const,
            position: 2,
          },
        ]),
      // Techniker (Instandhalter & Techniker Alias)
      ...[userMap["instandhalter@maintai.local"], userMap["techniker@maintai.local"]]
        .filter(Boolean)
        .flatMap((uId) => [
          {
            tenantId,
            userId: uId,
            name: "Meine offenen Tasks",
            icon: "wrench",
            intent: "ORDERS_QUERY",
            filterPayload: { assignedToMe: true, status: ["OPEN", "IN_PROGRESS"] },
            refreshInterval: 60,
            displayDensity: "compact" as const,
            position: 1,
          },
          {
            tenantId,
            userId: uId,
            name: "Störungen Halle 1",
            icon: "star",
            intent: "ORDERS_QUERY",
            filterPayload: {
              ...(h1AreaId ? { areaId: h1AreaId } : {}),
              status: ["OPEN", "IN_PROGRESS"],
            },
            refreshInterval: 30,
            displayDensity: "standard" as const,
            position: 2,
          },
          {
            tenantId,
            userId: uId,
            name: "Akute Notfälle (Prio 1)",
            icon: "zap",
            intent: "ORDERS_QUERY",
            filterPayload: { priority: ["1_EMERGENCY"], status: ["OPEN", "IN_PROGRESS"] },
            refreshInterval: 30,
            displayDensity: "detailed" as const,
            position: 3,
          },
        ]),
      // Koordinator (Koordinator & Planer Alias)
      ...[userMap["koordinator@maintai.local"], userMap["planer@maintai.local"]]
        .filter(Boolean)
        .flatMap((uId) => [
          {
            tenantId,
            userId: uId,
            name: "Eingangspool Ungeplante Aufträge",
            icon: "inbox",
            intent: "ORDERS_QUERY",
            filterPayload: { status: ["DRAFT", "OPEN"], orderType: "IH01" },
            refreshInterval: 30,
            displayDensity: "standard" as const,
            position: 1,
          },
          {
            tenantId,
            userId: uId,
            name: "Wartungen KW 43",
            icon: "calendar",
            intent: "ORDERS_QUERY",
            filterPayload: { status: ["OPEN", "IN_PROGRESS"], orderType: "IH02" },
            refreshInterval: 300,
            displayDensity: "compact" as const,
            position: 2,
          },
          {
            tenantId,
            userId: uId,
            name: "Kritische Störungen Werksweit",
            icon: "alert-triangle",
            intent: "ORDERS_QUERY",
            filterPayload: { priority: ["1_EMERGENCY"], status: ["OPEN", "IN_PROGRESS"] },
            refreshInterval: 30,
            displayDensity: "detailed" as const,
            position: 3,
          },
        ]),
    ];

    for (const view of savedViewsToSeed) {
      await db
        .insert(schema.userSavedViews)
        .values(view)
        .onConflictDoUpdate({
          target: [schema.userSavedViews.userId, schema.userSavedViews.name],
          set: {
            icon: view.icon,
            intent: view.intent,
            filterPayload: view.filterPayload,
            refreshInterval: view.refreshInterval,
            displayDensity: view.displayDensity,
            position: view.position,
            updatedAt: new Date(),
          },
        });
    }

  console.log("✅ Seed completed successfully!");
  console.log(`Summary:
  - 1 Tenant (${tenant.name})
  - 4 Configurable Roles (Maschinenbediener/OPERATOR, Koordinator/COORDINATOR, Instandhalter/TECHNICIAN, Admin/ADMIN)
  - 4 Users with SSO / Active Directory / Department / Assigned Area
  - 4-stufige Anlagenstruktur (inkl. SAP-Herkunftskennzeichnung):
      1. Bereich (${areaDefs.length} Bereiche: u.a. Halle 1 - Karosseriebau [SAP], Halle 2 - Lackiererei [MANUAL])
      2. Technischer Platz (${flocDefs.length} Functional Locations inkl. Unterplätzen)
      3. Equipment (${equipmentDefs.length} Industrie-Anlagen mit SAP-EQUNR / Herkunft)
      4. Baugruppe / Funktionseinheit (${assemblyDefs.length} Baugruppen in schema.assemblies)
  - 4 Schadenscode-Kataloge (MECH, HYDR, ELEK, PNEU) mit 14 Schadenscodes
  - 4 Configurable Order Types (IH01 - IH04)
  - 6 Workflow Statuses & Transitions
  - 5 Spare Parts
  - 30 Breakdown Orders (mit Eskalationslevel LEVEL_1-3, Schadenscode-Katalogverknüpfung & Zeiterfassung)
  - 30 Historical AI Copilot Orders (mit Semantic Embeddings)
  - ${savedViewsToSeed.length} User Saved Views (Favoriten für Admin, Techniker, Koordinator)`);
}

runSeed()
  .catch((err) => {
    console.error("❌ Seed failed with error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
