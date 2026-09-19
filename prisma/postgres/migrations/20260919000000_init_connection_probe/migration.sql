-- Internal-only table for explicit PostgreSQL connection smoke tests.
CREATE TABLE "_app_postgres_connection_probe" (
    "id" UUID NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "value" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "_app_postgres_connection_probe_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "_app_postgres_connection_probe_nonce_key"
ON "_app_postgres_connection_probe"("nonce");
