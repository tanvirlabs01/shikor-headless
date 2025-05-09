import type { User } from "../../../packages/core/src/auth/types";

declare module "express-serve-static-core" {
  interface Request {
    user?: User;
  }
}
