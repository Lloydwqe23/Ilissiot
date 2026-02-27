import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

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

export async function setupAuth(app: Express) {
  // Session configuration
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: 7 * 24 * 60 * 60 * 1000, // 1 week
    tableName: "sessions",
  });

  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "dev-secret-key",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
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

      // Set session
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

      // Set session
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
