// packages/core/types/express.d.ts
import { User } from "@shikor/core/src/auth/types"; // Adjust path to your user type

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
