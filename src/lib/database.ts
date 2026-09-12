import "server-only";

import postgres, { type Sql } from "postgres";

let database: Sql | undefined;

export function getDatabase(): Sql {
  const connectionString = process.env.MOYUFUN_WEB_DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error("MOYUFUN_WEB_DATABASE_URL is not configured");
  }

  if (!URL.canParse(connectionString)) {
    throw new Error("MOYUFUN_WEB_DATABASE_URL is invalid");
  }

  const url = new URL(connectionString);

  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    !url.username.startsWith("moyufun_web.")
  ) {
    throw new Error(
      "MOYUFUN_WEB_DATABASE_URL must use the moyufun_web PostgreSQL role",
    );
  }

  database ??= postgres(connectionString, {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 1,
    prepare: false,
  });

  return database;
}
