// types/express.d.ts
import { Logger } from "pino";

declare global {
  namespace Express {
    interface Request {
      log: Logger;
      id: string;
    }
  }
}
