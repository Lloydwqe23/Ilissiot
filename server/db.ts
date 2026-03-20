import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  // Ensure UTF-8 encoding
  application_name: 'ilissiot-messenger',
});

// Set client encoding to UTF-8 on every connection
pool.on('connect', (client) => {
  client.query('SET client_encoding TO UTF8');
});

export const db = drizzle(pool, { schema });
