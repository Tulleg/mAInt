const { Pool } = require("pg");
const { drizzle } = require("drizzle-orm/node-postgres");
const { migrate } = require("drizzle-orm/node-postgres/migrator");
const path = require("path");

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.log("ℹ️ No DATABASE_URL set. Skipping migrations.");
    return;
  }

  console.log("🔌 Connecting to database for migrations...");
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 10000,
  });

  try {
    // 1. Enable pgvector extension
    try {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");
      console.log("✅ PostgreSQL extension 'vector' is active.");
    } catch (extErr) {
      console.warn("⚠️ Notice: Could not enable 'vector' extension automatically:", extErr.message);
    }

    // 2. Run Drizzle migrations
    const migrationsFolder = path.resolve(__dirname, "../src/db/migrations");
    console.log(`📦 Applying migrations from: ${migrationsFolder}`);
    const db = drizzle(pool);
    await migrate(db, { migrationsFolder });
    console.log("✅ Database migrations applied successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
