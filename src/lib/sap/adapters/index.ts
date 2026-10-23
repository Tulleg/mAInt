import { ISapConnector, SapAdapterConfig } from "./types";
import { NoOpSapConnector } from "./noop-adapter";
import { ODataSapConnector } from "./odata-adapter";
import { BapiSapConnector } from "./bapi-adapter";

export * from "./types";
export * from "./noop-adapter";
export * from "./odata-adapter";
export * from "./bapi-adapter";

/**
 * Factory-Funktion zur Instanziierung des passenden SAP-Adapters
 * basierend auf dem Mandantenmodus:
 * - STANDALONE -> NoOpSapConnector
 * - ODATA_V4 -> ODataSapConnector
 * - RFC_BAPI -> BapiSapConnector
 * - REST_MIDDLEWARE -> ODataSapConnector (Standard OData/REST)
 */
export function createSapAdapter(
  mode: string,
  tenantId: string,
  config: SapAdapterConfig = {}
): ISapConnector {
  switch (mode?.toUpperCase()) {
    case "ODATA":
    case "ODATA_V4":
      return new ODataSapConnector(tenantId, config);
    case "RFC_BAPI":
    case "BAPI":
      return new BapiSapConnector(tenantId, config);
    case "REST_MIDDLEWARE":
      return new ODataSapConnector(tenantId, config);
    case "STANDALONE":
    default:
      return new NoOpSapConnector(tenantId);
  }
}
