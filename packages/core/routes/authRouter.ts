// packages/core/routes/authRouter.ts
import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { DatabaseStrategyFactory } from "../database/DatabaseStrategyFactory";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";

const router = Router();
const db = DatabaseStrategyFactory; // Will resolve during runtime

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post(
  "/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        throw AppError.validationError("Invalid registration data");
      }

      const { email, password, role } = result.data;
      const strategy = db.getRequiredStrategy();
      const existing = await strategy.read("users", { email });
      if (existing.length > 0) {
        throw AppError.validationError("Email already in use");
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await strategy.create("users", {
        email,
        password: hashedPassword,
        role,
      });

      logger.info({ email }, "User registered");
      res
        .status(201)
        .json({ success: true, user: { id: user.id, email, role } });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        throw AppError.validationError("Invalid login data");
      }

      const { email, password } = result.data;
      const strategy = db.getRequiredStrategy();
      const [user] = await strategy.read("users", { email });
      if (!user) {
        throw AppError.unauthorized("Invalid credentials");
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        throw AppError.unauthorized("Invalid credentials");
      }

      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.SECRET_KEY!,
        { expiresIn: "2h" }
      );

      logger.info({ email }, "User logged in");
      res.json({ success: true, token });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
