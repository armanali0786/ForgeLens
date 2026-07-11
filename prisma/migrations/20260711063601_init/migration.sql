-- CreateTable
CREATE TABLE "assets" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "location" TEXT,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sensors" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "normal_range_min" DECIMAL(65,30) NOT NULL,
    "normal_range_max" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "sensors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry" (
    "id" BIGSERIAL NOT NULL,
    "sensor_id" INTEGER NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "risk_level" TEXT NOT NULL,
    "likely_cause" TEXT NOT NULL,
    "confidence" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" SERIAL NOT NULL,
    "anomaly_id" INTEGER NOT NULL,
    "signal_name" TEXT NOT NULL,
    "change_description" TEXT NOT NULL,
    "weight" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" SERIAL NOT NULL,
    "anomaly_id" INTEGER NOT NULL,
    "engineer_verdict" TEXT NOT NULL,
    "actual_cause" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_weights" (
    "id" SERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "pattern_name" TEXT NOT NULL,
    "weight" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
    "correction_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_weights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_telemetry_sensor_time" ON "telemetry"("sensor_id", "recorded_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pattern_weights_asset_id_pattern_name_key" ON "pattern_weights"("asset_id", "pattern_name");

-- AddForeignKey
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry" ADD CONSTRAINT "telemetry_sensor_id_fkey" FOREIGN KEY ("sensor_id") REFERENCES "sensors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_anomaly_id_fkey" FOREIGN KEY ("anomaly_id") REFERENCES "anomalies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_anomaly_id_fkey" FOREIGN KEY ("anomaly_id") REFERENCES "anomalies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_weights" ADD CONSTRAINT "pattern_weights_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
