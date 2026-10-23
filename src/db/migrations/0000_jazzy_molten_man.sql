CREATE TYPE "public"."asset_criticality" AS ENUM('A', 'B', 'C');--> statement-breakpoint
CREATE TYPE "public"."asset_source" AS ENUM('SAP', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('ACTIVE', 'IN_MAINTENANCE', 'BREAKDOWN', 'DECOMMISSIONED');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('LOCAL', 'SSO', 'AZURE_AD');--> statement-breakpoint
CREATE TYPE "public"."maintenance_cycle_unit" AS ENUM('DAYS', 'WEEKS', 'MONTHS', 'OPERATING_HOURS', 'CYCLES');--> statement-breakpoint
CREATE TYPE "public"."order_escalation_level" AS ENUM('LEVEL_1', 'LEVEL_2', 'LEVEL_3');--> statement-breakpoint
CREATE TYPE "public"."order_priority" AS ENUM('1_EMERGENCY', '2_HIGH', '3_MEDIUM', '4_LOW');--> statement-breakpoint
CREATE TYPE "public"."sap_sync_mode" AS ENUM('STANDALONE', 'ODATA_V4', 'RFC_BAPI', 'REST_MIDDLEWARE');--> statement-breakpoint
CREATE TYPE "public"."sap_sync_queue_operation" AS ENUM('EQUIPMENT_PULL', 'SPARE_PART_BOOKING', 'ORDER_MIGRATE', 'ORDER_STATUS_UPDATE');--> statement-breakpoint
CREATE TYPE "public"."sap_sync_queue_status" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'PROCESSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."sap_sync_status" AS ENUM('NOT_APPLICABLE', 'PENDING', 'SYNCED', 'PROCESSED', 'FAILED', 'CONFLICT');--> statement-breakpoint
CREATE TYPE "public"."workflow_status_category" AS ENUM('DRAFT', 'OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"task_type" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"estimated_cost_eur" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"source" "asset_source" DEFAULT 'MANUAL' NOT NULL,
	"sap_id" varchar(100),
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assemblies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"source" "asset_source" DEFAULT 'MANUAL' NOT NULL,
	"sap_id" varchar(100),
	"last_synced_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"functional_location_id" uuid,
	"parent_equipment_id" uuid,
	"is_assembly" boolean DEFAULT false NOT NULL,
	"equipment_number" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"manufacturer" varchar(120),
	"model_type" varchar(120),
	"serial_number" varchar(120),
	"year_of_manufacture" integer,
	"criticality" "asset_criticality" DEFAULT 'B' NOT NULL,
	"status" "asset_status" DEFAULT 'ACTIVE' NOT NULL,
	"operating_hours_counter" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"technical_specs" jsonb DEFAULT '{}'::jsonb,
	"source" "asset_source" DEFAULT 'MANUAL' NOT NULL,
	"sap_id" varchar(100),
	"last_synced_at" timestamp with time zone,
	"sap_equipment_nr" varchar(36),
	"sap_sync_status" "sap_sync_status" DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"sap_last_synced_at" timestamp with time zone,
	"sap_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "damage_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"catalog_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "functional_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"area_id" uuid,
	"parent_functional_location_id" uuid,
	"code" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"cost_center" varchar(50),
	"plant_section" varchar(50),
	"source" "asset_source" DEFAULT 'MANUAL' NOT NULL,
	"sap_id" varchar(100),
	"last_synced_at" timestamp with time zone,
	"sap_tplnr" varchar(40),
	"sap_sync_status" "sap_sync_status" DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"sap_last_synced_at" timestamp with time zone,
	"sap_sync_error" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"schema_json" jsonb NOT NULL,
	"estimated_duration_minutes" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_number" varchar(64) NOT NULL,
	"order_type_id" uuid NOT NULL,
	"current_status_id" uuid NOT NULL,
	"priority" "order_priority" DEFAULT '3_MEDIUM' NOT NULL,
	"escalation_level" "order_escalation_level" DEFAULT 'LEVEL_1' NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"symptom_description" text,
	"damage_code" varchar(32),
	"damage_code_id" uuid,
	"root_cause_description" text,
	"cause_code" varchar(32),
	"resolution_summary" text,
	"equipment_id" uuid,
	"functional_location_id" uuid,
	"assembly_id" uuid,
	"maintenance_plan_id" uuid,
	"maintenance_plan_item_id" uuid,
	"inspection_template_id" uuid,
	"checklist_results_json" jsonb,
	"reported_by_user_id" uuid NOT NULL,
	"assigned_to_user_id" uuid,
	"scheduled_start_at" timestamp with time zone,
	"scheduled_end_at" timestamp with time zone,
	"actual_start_at" timestamp with time zone,
	"actual_end_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"planned_duration_minutes" integer DEFAULT 60 NOT NULL,
	"actual_duration_minutes" integer,
	"downtime_minutes" integer DEFAULT 0 NOT NULL,
	"client_created_offline_id" uuid,
	"sync_version" integer DEFAULT 1 NOT NULL,
	"last_modified_device_id" varchar(100),
	"sap_order_nr" varchar(24),
	"sap_notification_nr" varchar(24),
	"sap_sync_status" "sap_sync_status" DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"sap_last_synced_at" timestamp with time zone,
	"sap_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"maintenance_plan_id" uuid NOT NULL,
	"position_number" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"task_description" text,
	"equipment_id" uuid,
	"functional_location_id" uuid,
	"assembly_id" uuid,
	"inspection_template_id" uuid,
	"assigned_role_id" uuid,
	"estimated_duration_minutes" integer DEFAULT 60 NOT NULL,
	"planned_spare_parts_json" jsonb DEFAULT '[]'::jsonb,
	"sap_maintenance_item_nr" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_number" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"order_type_id" uuid NOT NULL,
	"default_priority" "order_priority" DEFAULT '3_MEDIUM' NOT NULL,
	"cycle_value" integer NOT NULL,
	"cycle_unit" "maintenance_cycle_unit" DEFAULT 'DAYS' NOT NULL,
	"call_horizon_percent" integer DEFAULT 80 NOT NULL,
	"lead_time_days" integer DEFAULT 7 NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"last_called_at" timestamp with time zone,
	"next_due_date" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sap_maintenance_plan_nr" varchar(30),
	"sap_sync_status" "sap_sync_status" DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"sap_last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_history_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"maintenance_order_id" uuid NOT NULL,
	"equipment_id" uuid,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"synthesized_document_text" text NOT NULL,
	"embedding_model" varchar(120) NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_spare_part_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"maintenance_order_id" uuid NOT NULL,
	"spare_part_id" uuid NOT NULL,
	"booked_by_user_id" uuid NOT NULL,
	"quantity_planned" numeric(12, 3) DEFAULT '0.000' NOT NULL,
	"quantity_consumed" numeric(12, 3) NOT NULL,
	"unit_price_snapshot" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"batch_number" varchar(50),
	"storage_location" varchar(64),
	"client_booking_offline_id" uuid,
	"sap_reservation_nr" varchar(20),
	"sap_material_doc_nr" varchar(20),
	"sap_material_doc_year" integer,
	"sap_sync_status" "sap_sync_status" DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"sap_last_synced_at" timestamp with time zone,
	"sap_sync_error" text,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_status_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"maintenance_order_id" uuid,
	"order_id" uuid,
	"transition_id" uuid,
	"from_status_id" uuid,
	"to_status_id" uuid NOT NULL,
	"changed_by_user_id" uuid,
	"user_id" uuid,
	"comment" text,
	"notes" text,
	"recorded_offline_at" timestamp with time zone,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"sap_system_status_code" varchar(10),
	"sap_user_status_code" varchar(10),
	"color" text DEFAULT 'sky' NOT NULL,
	"color_hex" varchar(20) DEFAULT '#64748B' NOT NULL,
	"is_initial_status" boolean DEFAULT false NOT NULL,
	"is_terminal_status" boolean DEFAULT false NOT NULL,
	"locks_order_editing" boolean DEFAULT false NOT NULL,
	"triggers_sap_completion" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_minutes" integer DEFAULT 0 NOT NULL,
	"work_description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"sap_order_type_code" varchar(10),
	"color_hex" varchar(7) DEFAULT '#3B82F6' NOT NULL,
	"icon_name" varchar(50) DEFAULT 'Wrench' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"requires_safety_permit" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"resource" varchar(64) NOT NULL,
	"action" varchar(64) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"is_system_role" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sap_sync_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"operation" "sap_sync_queue_operation" NOT NULL,
	"entity_type" varchar(64) NOT NULL,
	"entity_id" varchar(64),
	"payload" jsonb NOT NULL,
	"status" "sap_sync_queue_status" DEFAULT 'PENDING' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"max_retries" integer DEFAULT 5 NOT NULL,
	"error_message" text,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_saved_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text DEFAULT 'star',
	"intent" text DEFAULT 'ORDERS_QUERY' NOT NULL,
	"filter_payload" jsonb DEFAULT '{}'::jsonb,
	"refresh_interval" integer DEFAULT 0,
	"display_density" text DEFAULT 'standard',
	"position" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spare_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"internal_part_number" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"manufacturer_part_number" varchar(100),
	"unit_of_measure" varchar(16) DEFAULT 'ST' NOT NULL,
	"storage_location" varchar(64),
	"storage_bin" varchar(64),
	"stock_quantity" numeric(12, 3) DEFAULT '0.000' NOT NULL,
	"min_stock_level" numeric(12, 3) DEFAULT '0.000' NOT NULL,
	"moving_average_price" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"currency" varchar(3) DEFAULT 'EUR' NOT NULL,
	"is_batch_managed" boolean DEFAULT false NOT NULL,
	"sap_material_nr" varchar(40),
	"sap_sync_status" "sap_sync_status" DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"sap_last_synced_at" timestamp with time zone,
	"sap_sync_error" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(255) NOT NULL,
	"sap_plant_code" varchar(10),
	"sap_sync_mode" "sap_sync_mode" DEFAULT 'STANDALONE' NOT NULL,
	"sap_config" jsonb DEFAULT '{}'::jsonb,
	"ai_config" jsonb DEFAULT '{"provider":"OPENAI","chatModel":"gpt-4o","embeddingModel":"text-embedding-3-small","embeddingDimensions":1536,"routingModel":"gemini-3.8-flash","analyticsModel":"gemini-2.5-pro"}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_user_id" uuid,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"auth_provider" "auth_provider" DEFAULT 'LOCAL' NOT NULL,
	"external_ad_id" varchar(255),
	"department" varchar(120),
	"assigned_area_id" uuid,
	"personnel_nr" varchar(50),
	"work_center_code" varchar(50),
	"qualification_matrix" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_type_id" uuid NOT NULL,
	"from_status_id" uuid NOT NULL,
	"to_status_id" uuid NOT NULL,
	"required_role_id" text,
	"action_name" varchar(120) DEFAULT 'Status wechseln' NOT NULL,
	"description" text,
	"require_checklist" boolean DEFAULT false NOT NULL,
	"require_time_entry" boolean DEFAULT false NOT NULL,
	"require_root_cause" boolean DEFAULT false NOT NULL,
	"require_signature" boolean DEFAULT false NOT NULL,
	"trigger_sap_sync" boolean DEFAULT false NOT NULL,
	"guard_conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requires_comment" boolean DEFAULT false NOT NULL,
	"triggers_sap_sync" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assemblies" ADD CONSTRAINT "assemblies_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_functional_location_id_functional_locations_id_fk" FOREIGN KEY ("functional_location_id") REFERENCES "public"."functional_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_parent_equipment_id_equipments_id_fk" FOREIGN KEY ("parent_equipment_id") REFERENCES "public"."equipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_catalogs" ADD CONSTRAINT "damage_catalogs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_codes" ADD CONSTRAINT "damage_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "damage_codes" ADD CONSTRAINT "damage_codes_catalog_id_damage_catalogs_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."damage_catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functional_locations" ADD CONSTRAINT "functional_locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functional_locations" ADD CONSTRAINT "functional_locations_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functional_locations" ADD CONSTRAINT "functional_locations_parent_functional_location_id_functional_locations_id_fk" FOREIGN KEY ("parent_functional_location_id") REFERENCES "public"."functional_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_templates" ADD CONSTRAINT "inspection_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_order_type_id_order_types_id_fk" FOREIGN KEY ("order_type_id") REFERENCES "public"."order_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_current_status_id_order_statuses_id_fk" FOREIGN KEY ("current_status_id") REFERENCES "public"."order_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_damage_code_id_damage_codes_id_fk" FOREIGN KEY ("damage_code_id") REFERENCES "public"."damage_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_functional_location_id_functional_locations_id_fk" FOREIGN KEY ("functional_location_id") REFERENCES "public"."functional_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_assembly_id_assemblies_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."assemblies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_maintenance_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("maintenance_plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_maintenance_plan_item_id_maintenance_plan_items_id_fk" FOREIGN KEY ("maintenance_plan_item_id") REFERENCES "public"."maintenance_plan_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_inspection_template_id_inspection_templates_id_fk" FOREIGN KEY ("inspection_template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_orders" ADD CONSTRAINT "maintenance_orders_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_items" ADD CONSTRAINT "maintenance_plan_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_items" ADD CONSTRAINT "maintenance_plan_items_maintenance_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("maintenance_plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_items" ADD CONSTRAINT "maintenance_plan_items_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_items" ADD CONSTRAINT "maintenance_plan_items_functional_location_id_functional_locations_id_fk" FOREIGN KEY ("functional_location_id") REFERENCES "public"."functional_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_items" ADD CONSTRAINT "maintenance_plan_items_assembly_id_assemblies_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."assemblies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_items" ADD CONSTRAINT "maintenance_plan_items_inspection_template_id_inspection_templates_id_fk" FOREIGN KEY ("inspection_template_id") REFERENCES "public"."inspection_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_items" ADD CONSTRAINT "maintenance_plan_items_assigned_role_id_roles_id_fk" FOREIGN KEY ("assigned_role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_order_type_id_order_types_id_fk" FOREIGN KEY ("order_type_id") REFERENCES "public"."order_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history_embeddings" ADD CONSTRAINT "order_history_embeddings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history_embeddings" ADD CONSTRAINT "order_history_embeddings_maintenance_order_id_maintenance_orders_id_fk" FOREIGN KEY ("maintenance_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_history_embeddings" ADD CONSTRAINT "order_history_embeddings_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_spare_part_bookings" ADD CONSTRAINT "order_spare_part_bookings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_spare_part_bookings" ADD CONSTRAINT "order_spare_part_bookings_maintenance_order_id_maintenance_orders_id_fk" FOREIGN KEY ("maintenance_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_spare_part_bookings" ADD CONSTRAINT "order_spare_part_bookings_spare_part_id_spare_parts_id_fk" FOREIGN KEY ("spare_part_id") REFERENCES "public"."spare_parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_spare_part_bookings" ADD CONSTRAINT "order_spare_part_bookings_booked_by_user_id_users_id_fk" FOREIGN KEY ("booked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_audit_logs" ADD CONSTRAINT "order_status_audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_audit_logs" ADD CONSTRAINT "order_status_audit_logs_maintenance_order_id_maintenance_orders_id_fk" FOREIGN KEY ("maintenance_order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_audit_logs" ADD CONSTRAINT "order_status_audit_logs_order_id_maintenance_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_audit_logs" ADD CONSTRAINT "order_status_audit_logs_transition_id_workflow_transitions_id_fk" FOREIGN KEY ("transition_id") REFERENCES "public"."workflow_transitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_audit_logs" ADD CONSTRAINT "order_status_audit_logs_from_status_id_order_statuses_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."order_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_audit_logs" ADD CONSTRAINT "order_status_audit_logs_to_status_id_order_statuses_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."order_statuses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_audit_logs" ADD CONSTRAINT "order_status_audit_logs_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_audit_logs" ADD CONSTRAINT "order_status_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_statuses" ADD CONSTRAINT "order_statuses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_time_entries" ADD CONSTRAINT "order_time_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_time_entries" ADD CONSTRAINT "order_time_entries_order_id_maintenance_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."maintenance_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_time_entries" ADD CONSTRAINT "order_time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_types" ADD CONSTRAINT "order_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_sync_queue" ADD CONSTRAINT "sap_sync_queue_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_views" ADD CONSTRAINT "user_saved_views_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_views" ADD CONSTRAINT "user_saved_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_assigned_area_id_areas_id_fk" FOREIGN KEY ("assigned_area_id") REFERENCES "public"."areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_order_type_id_order_types_id_fk" FOREIGN KEY ("order_type_id") REFERENCES "public"."order_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_status_id_order_statuses_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."order_statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_status_id_order_statuses_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."order_statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_usage_logs_tenant_created" ON "ai_usage_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ai_usage_logs_task_type" ON "ai_usage_logs" USING btree ("task_type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_areas_tenant_code" ON "areas" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_areas_sap_id" ON "areas" USING btree ("tenant_id","sap_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assemblies_tenant_code" ON "assemblies" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_assemblies_equipment" ON "assemblies" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "idx_assemblies_sap_id" ON "assemblies" USING btree ("tenant_id","sap_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_equipments_tenant_number" ON "equipments" USING btree ("tenant_id","equipment_number");--> statement-breakpoint
CREATE INDEX "idx_equipments_floc" ON "equipments" USING btree ("functional_location_id");--> statement-breakpoint
CREATE INDEX "idx_equipments_sap_id" ON "equipments" USING btree ("tenant_id","sap_id");--> statement-breakpoint
CREATE INDEX "idx_equipments_sap_nr" ON "equipments" USING btree ("tenant_id","sap_equipment_nr");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_damage_catalogs_tenant_code" ON "damage_catalogs" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_damage_codes_tenant_code" ON "damage_codes" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_damage_codes_catalog" ON "damage_codes" USING btree ("catalog_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_floc_tenant_code" ON "functional_locations" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_floc_area" ON "functional_locations" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "idx_floc_parent" ON "functional_locations" USING btree ("parent_functional_location_id");--> statement-breakpoint
CREATE INDEX "idx_floc_sap_id" ON "functional_locations" USING btree ("tenant_id","sap_id");--> statement-breakpoint
CREATE INDEX "idx_floc_sap_tplnr" ON "functional_locations" USING btree ("tenant_id","sap_tplnr");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_inspection_templates_tenant_code_ver" ON "inspection_templates" USING btree ("tenant_id","code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_maint_orders_tenant_order_nr" ON "maintenance_orders" USING btree ("tenant_id","order_number");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_maint_orders_offline_idempotency" ON "maintenance_orders" USING btree ("tenant_id","client_created_offline_id");--> statement-breakpoint
CREATE INDEX "idx_maint_orders_status" ON "maintenance_orders" USING btree ("tenant_id","current_status_id");--> statement-breakpoint
CREATE INDEX "idx_maint_orders_equipment" ON "maintenance_orders" USING btree ("tenant_id","equipment_id");--> statement-breakpoint
CREATE INDEX "idx_maint_orders_assigned_user" ON "maintenance_orders" USING btree ("tenant_id","assigned_to_user_id");--> statement-breakpoint
CREATE INDEX "idx_maint_orders_sap_aufnr" ON "maintenance_orders" USING btree ("tenant_id","sap_order_nr");--> statement-breakpoint
CREATE INDEX "idx_maint_orders_damage_code_id" ON "maintenance_orders" USING btree ("tenant_id","damage_code_id");--> statement-breakpoint
CREATE INDEX "idx_maint_orders_assembly_id" ON "maintenance_orders" USING btree ("tenant_id","assembly_id");--> statement-breakpoint
CREATE INDEX "idx_maint_orders_escalation" ON "maintenance_orders" USING btree ("tenant_id","escalation_level");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_maint_plan_items_plan_pos" ON "maintenance_plan_items" USING btree ("maintenance_plan_id","position_number");--> statement-breakpoint
CREATE INDEX "idx_maint_plan_items_equipment" ON "maintenance_plan_items" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "idx_maint_plan_items_floc" ON "maintenance_plan_items" USING btree ("functional_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_maintenance_plans_tenant_nr" ON "maintenance_plans" USING btree ("tenant_id","plan_number");--> statement-breakpoint
CREATE INDEX "idx_maintenance_plans_next_due" ON "maintenance_plans" USING btree ("tenant_id","is_active","next_due_date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_order_embeddings_order_chunk" ON "order_history_embeddings" USING btree ("maintenance_order_id","chunk_index");--> statement-breakpoint
CREATE INDEX "idx_order_embeddings_tenant_equipment" ON "order_history_embeddings" USING btree ("tenant_id","equipment_id");--> statement-breakpoint
CREATE INDEX "idx_order_history_embeddings_hnsw" ON "order_history_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "idx_order_spare_bookings_order" ON "order_spare_part_bookings" USING btree ("maintenance_order_id");--> statement-breakpoint
CREATE INDEX "idx_order_spare_bookings_part" ON "order_spare_part_bookings" USING btree ("spare_part_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_order_spare_bookings_offline_id" ON "order_spare_part_bookings" USING btree ("tenant_id","client_booking_offline_id");--> statement-breakpoint
CREATE INDEX "idx_order_status_audit_order" ON "order_status_audit_logs" USING btree ("maintenance_order_id");--> statement-breakpoint
CREATE INDEX "idx_order_status_audit_order_id" ON "order_status_audit_logs" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_order_statuses_tenant_code" ON "order_statuses" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_order_time_entries_order" ON "order_time_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_time_entries_user" ON "order_time_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_order_time_entries_tenant" ON "order_time_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_order_types_tenant_code" ON "order_types" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_permissions_code" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_role_permissions_perm" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_roles_tenant_code" ON "roles" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "idx_sap_sync_queue_status" ON "sap_sync_queue" USING btree ("tenant_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_sap_sync_queue_entity" ON "sap_sync_queue" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_user_saved_views_user" ON "user_saved_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_saved_views_tenant" ON "user_saved_views" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_user_saved_views_user_name" ON "user_saved_views" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_spare_parts_tenant_part_nr" ON "spare_parts" USING btree ("tenant_id","internal_part_number");--> statement-breakpoint
CREATE INDEX "idx_spare_parts_sap_matnr" ON "spare_parts" USING btree ("tenant_id","sap_material_nr");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tenants_code" ON "tenants" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_user_roles_role" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_tenant_email" ON "users" USING btree ("tenant_id","email");--> statement-breakpoint
CREATE INDEX "idx_users_personnel_nr" ON "users" USING btree ("tenant_id","personnel_nr");--> statement-breakpoint
CREATE INDEX "idx_users_assigned_area" ON "users" USING btree ("assigned_area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workflow_transitions_unique_route" ON "workflow_transitions" USING btree ("tenant_id","order_type_id","from_status_id","to_status_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_transitions_lookup" ON "workflow_transitions" USING btree ("tenant_id","order_type_id","from_status_id");--> statement-breakpoint
CREATE INDEX "idx_workflow_transitions_role" ON "workflow_transitions" USING btree ("required_role_id");