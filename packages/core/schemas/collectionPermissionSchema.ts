import { z } from "zod";

export const collectionPermissionSchema = z.object({
  collection_name: z.string().min(1),
  operation: z.enum(["create", "read", "update", "delete"]),
  allowed_roles: z.array(z.enum(["admin", "editor", "viewer"])).min(1),
});
