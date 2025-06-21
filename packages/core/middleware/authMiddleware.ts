import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AppError } from "../errors/AppError";
import { User } from "../types/User"; // ✅ Import shared User type

// Extend Express Request to include our strict User type
export interface AuthenticatedRequest extends Request {
  user?: User;
}

const JWT_SECRET = process.env.SECRET_KEY || "shikor_access";
export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return next(
      AppError.unauthorized("Missing or invalid Authorization header")
    );
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as User; // ✅ Use strict type
    req.user = decoded;
    next();
  } catch (err) {
    return next(AppError.unauthorized("Invalid or expired token"));
  }
};
