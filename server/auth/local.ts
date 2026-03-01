import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }
  }
}

/** Exported so that WebSocket upgrade can also validate the session. */
export let sessionMiddleware: RequestHandler;

/** Minimum password length enforced at registration and (optionally) login. */
const MIN_PASSWORD_LENGTH = 8;

export async function setupAuth(app: Express) {
  // Session configuration
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: 7 * 24 * 60 * 60 * 1000, // 1 week
    tableName: "sessions",
  });

  if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: SESSION_SECRET is not set – using insecure default. Set it in production!');
  }

  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "dev-secret-key-CHANGE-ME",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    name: 'connect.sid',
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });

  app.use(sessionMiddleware);

  // Set user on request from session
  app.use((req: any, res: Response, next: NextFunction) => {
    if (req.session?.userId) {
      req.user = {
        claims: {
          sub: req.session.userId
        }
      };
    }
    next();
  });
}

export function registerAuthRoutes(app: Express) {
  // Register route
  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      // A03/A07: Validate password strength
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      }

      // A03: Basic email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof email !== 'string' || !emailRegex.test(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }

      // Check if user exists
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (existingUser.length > 0) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await db
        .insert(users)
        .values({
          email,
          password: hashedPassword,
          firstName: firstName || null,
          lastName: lastName || null,
        })
        .returning();

      // A07: Regenerate session ID to prevent session fixation
      await new Promise<void>((resolve, reject) => {
        (req as any).session.regenerate((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      (req as any).session.userId = newUser[0].id;
      await new Promise((resolve, reject) => {
        (req as any).session.save((err: any) => {
          if (err) reject(err);
          else resolve(null);
        });
      });

      res.status(201).json({
        id: newUser[0].id,
        email: newUser[0].email,
        firstName: newUser[0].firstName,
        lastName: newUser[0].lastName,
      });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login route
  app.post("/api/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      // Find user
      const foundUsers = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (foundUsers.length === 0) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const user = foundUsers[0];

      // Check password
      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // A07: Regenerate session ID on login to prevent session fixation
      await new Promise<void>((resolve, reject) => {
        (req as any).session.regenerate((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
      (req as any).session.userId = user.id;
      await new Promise((resolve, reject) => {
        (req as any).session.save((err: any) => {
          if (err) reject(err);
          else resolve(null);
        });
      });

      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        bio: user.bio,
        status: user.status,
        theme: user.theme || 'light',
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Get current user
  app.get("/api/me", async (req: Request, res: Response) => {
    try {
      const userId = (req as any).session?.userId;

      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      const foundUsers = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      if (foundUsers.length === 0) {
        return res.status(401).json({ message: "User not found" });
      }

      const user = foundUsers[0];
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        bio: user.bio,
        status: user.status,
        theme: user.theme || 'light',
        lastSeen: user.lastSeen,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      console.error("Get me error:", error);
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Logout route
  app.post("/api/logout", (req: Request, res: Response) => {
    (req as any).session.destroy((err: any) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logged out" });
    });
  });
}

export async function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if ((req as any).session?.userId) {
    const userId = (req as any).session.userId;
    // Ensure req.user is set
    (req as any).user = {
      claims: {
        sub: userId
      }
    };
    next();
  } else {
    res.status(401).json({ message: "Not authenticated" });
  }
}
