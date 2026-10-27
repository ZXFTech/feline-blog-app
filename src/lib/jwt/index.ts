import jwt from "jsonwebtoken";
import { Role } from "../../../generated/prisma-postgres/enums";

const JWT_SECRET = process.env.JWT_SECRET!;

export interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  authVersion?: number;
}

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;
  } catch {
    return null;
  }
}
