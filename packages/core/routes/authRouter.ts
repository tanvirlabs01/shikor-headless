import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { DatabaseStrategyFactory } from "../database/DatabaseStrategyFactory";
import { AppError } from "../errors/AppError";
import { logger } from "../src/telemetry/logger";
import {
  AuthenticatedRequest,
  authenticateToken,
} from "../middleware/authMiddleware";
const router = Router();
const db = DatabaseStrategyFactory;

const ACCESS_TOKEN_SECRET = process.env.SECRET_KEY || "shikor_access";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_SECRET || "shikor_refresh";

const registerSchema = z.object({
  username: z.string().min(8),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

// === Register ===
router.post(
  "/register",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        throw AppError.validationError(
          "Invalid registration data",
          result.error.flatten()
        );
      }

      const { username, email, password, role } = result.data;
      const strategy = db.getRequiredStrategy();

      const hashedPassword = await bcrypt.hash(password, 10);

      const existing = await strategy.read(
        "users",
        {},
        {
          or: [
            { field: "email", value: email },
            { field: "username", value: username },
          ],
        }
      );

      if (existing.length > 0) {
        throw AppError.conflict("Email or username already in use");
      }
      const user = await strategy.create("users", {
        username,
        email,
        password: hashedPassword,
        role,
      });

      logger.info({ email }, "User registered");

      res.status(201).json({
        success: true,
        user: {
          id: user.id,
          email,
          username,
          role,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// === Login ===
router.post(
  "/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        throw AppError.validationError(
          "Invalid login data",
          result.error.flatten()
        );
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

      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        ACCESS_TOKEN_SECRET,
        { expiresIn: "2h" }
      );

      const refreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, {
        expiresIn: "7d",
      });

      await strategy.update(
        "users",
        { id: user.id },
        { refresh_token: refreshToken, last_login_at: new Date() }
      );

      logger.info({ email }, "User logged in");
      res.json({ success: true, token: accessToken, refreshToken });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/logout",
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user?.id) {
        throw AppError.unauthorized("User not authenticated");
      }

      const strategy = db.getRequiredStrategy();
      await strategy.update("users", { id: user.id }, { refresh_token: null });

      res.json({ success: true, message: "Logged out successfully" });
    } catch (err) {
      next(err);
    }
  }
);

// === Refresh Token ===
router.post(
  "/refresh-token",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = refreshSchema.safeParse(req.body);
      if (!result.success) {
        throw AppError.badRequest("Refresh token is required");
      }

      const { refreshToken } = result.data;
      const payload = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as {
        id: string;
      };

      const strategy = db.getRequiredStrategy();
      const [user] = await strategy.read("users", { id: payload.id });

      if (!user || user.refresh_token !== refreshToken) {
        throw AppError.unauthorized("Invalid refresh token");
      }

      const newAccessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        ACCESS_TOKEN_SECRET,
        { expiresIn: "2h" }
      );

      const newRefreshToken = jwt.sign({ id: user.id }, REFRESH_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      await strategy.update(
        "users",
        { id: user.id },
        { refresh_token: newRefreshToken, last_login_at: new Date() }
      );

      res.json({
        success: true,
        token: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (err) {
      next(AppError.unauthorized("Failed to refresh token"));
    }
  }
);

export default router;
