-- CreateTable
CREATE TABLE "analysis_runs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "auto_saved" INTEGER NOT NULL DEFAULT 0,
    "needs_review" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "runner_id" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "last_heartbeat_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_run_items" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "file_name_snapshot" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "transaction_id" UUID,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_run_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analysis_runs_user_id_status_created_at_idx" ON "analysis_runs"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "analysis_runs_user_id_created_at_idx" ON "analysis_runs"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_run_items_run_id_file_id_key" ON "analysis_run_items"("run_id", "file_id");

-- CreateIndex
CREATE INDEX "analysis_run_items_run_id_state_position_idx" ON "analysis_run_items"("run_id", "state", "position");

-- CreateIndex
CREATE INDEX "analysis_run_items_file_id_created_at_idx" ON "analysis_run_items"("file_id", "created_at");

-- AddForeignKey
ALTER TABLE "analysis_runs" ADD CONSTRAINT "analysis_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run_items" ADD CONSTRAINT "analysis_run_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_run_items" ADD CONSTRAINT "analysis_run_items_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
