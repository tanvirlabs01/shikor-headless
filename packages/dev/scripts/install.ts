// packages/dev/scripts/install.ts

import { bootstrapCoreTables } from "@shikor/core/bootstrap/bootstrapCoreTables";

(async () => {
  try {
    await bootstrapCoreTables({
      username: "superadmin",
      password: "S3cureP@ss",
      email: "admin@example.com",
    });

    console.log("✅ Core tables/collections bootstrapped successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Failed to install CMS:", err);
    process.exit(1);
  }
})();
