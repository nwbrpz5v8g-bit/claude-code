import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const existing = await db.location.count();
  if (existing > 0) {
    console.log("Seed skipped: data already present");
    return;
  }

  const weekdays = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, opensAt: "07:00", closesAt: "19:00" }));
  const saturday = { dayOfWeek: 6, opensAt: "08:00", closesAt: "17:00" };

  await db.location.create({
    data: {
      name: "Downtown Express",
      address: "120 Main St, New York, NY",
      timezone: "America/New_York",
      operatingHours: { create: [...weekdays, saturday] }, // closed Sundays
      bays: { create: [{ name: "Bay 1" }, { name: "Bay 2" }, { name: "Bay 3" }] },
      blackoutDates: { create: [{ date: "2026-12-25", reason: "Closed for Christmas" }] },
    },
  });
  await db.location.create({
    data: {
      name: "Harbor Shine",
      address: "8 Pier Rd, Los Angeles, CA",
      timezone: "America/Los_Angeles",
      operatingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: "08:00", closesAt: "18:00" })) },
      bays: { create: [{ name: "Bay A" }, { name: "Bay B" }] },
    },
  });

  await db.package.createMany({
    data: [
      { code: "basic", name: "Basic", description: "Exterior wash and dry", durationMin: 15, priceCents: 1500 },
      { code: "deluxe", name: "Deluxe", description: "Basic plus wax and wheel shine", durationMin: 30, priceCents: 2900 },
      { code: "interior", name: "Inside & Out", description: "Deluxe plus vacuum and interior wipe-down", durationMin: 60, priceCents: 5500 },
    ],
  });
  console.log("Seeded 2 locations and 3 packages");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
