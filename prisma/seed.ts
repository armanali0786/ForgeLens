import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SENSOR_DEFS = [
  { name: "supply_air_temp", unit: "°F", min: 55, max: 65 },
  { name: "valve_command", unit: "%", min: 20, max: 60 },
  { name: "cooling_output", unit: "%", min: 40, max: 80 },
  { name: "fan_load", unit: "%", min: 40, max: 70 },
  { name: "static_pressure", unit: "inWC", min: 0.8, max: 1.4 },
];

const ASSETS = [
  { name: "AHU-01", location: "Building A · Roof" },
  { name: "AHU-02", location: "Building A · Roof" },
  { name: "AHU-03", location: "Building B · Mechanical Room" },
  { name: "AHU-04", location: "Building B · Mechanical Room" },
  { name: "AHU-05", location: "Building C · Penthouse" },
];

async function main() {
  await prisma.feedback.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.anomaly.deleteMany();
  await prisma.patternWeight.deleteMany();
  await prisma.telemetry.deleteMany();
  await prisma.sensor.deleteMany();
  await prisma.asset.deleteMany();

  for (const assetDef of ASSETS) {
    await prisma.asset.create({
      data: {
        name: assetDef.name,
        type: "Air Handling Unit",
        location: assetDef.location,
        sensors: {
          create: SENSOR_DEFS.map((s) => ({
            name: s.name,
            unit: s.unit,
            normalRangeMin: s.min,
            normalRangeMax: s.max,
          })),
        },
      },
    });
  }

  console.log(`Seeded ${ASSETS.length} assets with ${SENSOR_DEFS.length} sensors each.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
