import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { RequestHandler } from "express";

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
    }
  }
}

/** Exported so that WebSocket upgrade can also validate the session. */
export let sessionMiddleware: RequestHandler;

/** Minimum password length enforced at registration and (optionally) login. */
const MIN_PASSWORD_LENGTH = 8;

function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

function usernameBaseFromUser(user: { email?: string | null; firstName?: string | null; lastName?: string | null }): string {
  const fromName = normalizeUsername(`${user.firstName || ""}${user.lastName || ""}`);
  if (fromName.length >= 3) return fromName.slice(0, 32);

  const emailLocal = normalizeUsername((user.email || "").split("@")[0] || "user");
  if (emailLocal.length >= 3) return emailLocal.slice(0, 32);

  return "user";
}

async function findAvailableUsername(baseInput: string): Promise<string> {
  const base = (normalizeUsername(baseInput) || "user").slice(0, 32);
  const starter = base.length >= 3 ? base : `${base}user`.slice(0, 32);

  let candidate = starter;
  let suffix = 1;

  while (true) {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);

    if (existing.length === 0) return candidate;

    suffix += 1;
    const suffixText = String(suffix);
    const trimmed = starter.slice(0, Math.max(3, 32 - suffixText.length));
    candidate = `${trimmed}${suffixText}`;
  }
}

async function ensureUserHasUsername(userId: string): Promise<string> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) throw new Error("User not found");
  if (user.username) return user.username;

  const generated = await findAvailableUsername(usernameBaseFromUser(user));
  await db
    .update(users)
    .set({ username: generated, updatedAt: new Date() })
    .where(eq(users.id, userId));

  return generated;
}

async function backfillMissingUsernames(): Promise<void> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.username} is null`);

  for (const row of rows) {
    await ensureUserHasUsername(row.id);
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

  if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: SESSION_SECRET is not set – using insecure default. Set it in production!');
  }

  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "dev-secret-key-CHANGE-ME",
    store: sessionStore,
    proxy: process.env.NODE_ENV === "production",
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

  await backfillMissingUsernames();
}

export function registerAuthRoutes(app: Express) {
  // Register route
  app.post("/api/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, username } = req.body;

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

      let finalUsername: string;
      if (typeof username === 'string' && username.trim()) {
        const normalizedUsername = normalizeUsername(username);
        if (!/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
          return res.status(400).json({ message: "Username must be 3-32 chars: a-z, 0-9, _" });
        }
        const [existingUsername] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, normalizedUsername))
          .limit(1);
        if (existingUsername) {
          return res.status(400).json({ message: "Username already taken" });
        }
        finalUsername = normalizedUsername;
      } else {
        finalUsername = await findAvailableUsername(usernameBaseFromUser({ email, firstName, lastName }));
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await db
        .insert(users)
        .values({
          email,
          username: finalUsername,
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
        username: newUser[0].username,
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

      if (!user.username) {
        user.username = await ensureUserHasUsername(user.id);
      }

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
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        bio: user.bio,
        birthday: user.birthday,
        status: user.status,
        theme: user.theme || 'light',
        language: user.language || 'en',
        colorTheme: user.colorTheme || 'blue',
        fontType: user.fontType || 'inter',
        textSize: user.textSize || 'normal',
        sidebarPlacement: user.sidebarPlacement || 'left',
        lastSeenPrivacy: user.lastSeenPrivacy || 'everyone',
        groupAddPrivacy: user.groupAddPrivacy || 'everyone',
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

      if (!user.username) {
        user.username = await ensureUserHasUsername(user.id);
      }
      res.json({
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        bio: user.bio,
        birthday: user.birthday,
        status: user.status,
        theme: user.theme || 'light',
        language: user.language || 'en',
        colorTheme: user.colorTheme || 'blue',
        fontType: user.fontType || 'inter',
        textSize: user.textSize || 'normal',
        sidebarPlacement: user.sidebarPlacement || 'left',
        lastSeenPrivacy: user.lastSeenPrivacy || 'everyone',
        groupAddPrivacy: user.groupAddPrivacy || 'everyone',
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
