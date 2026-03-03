// multer has no types in this project
// @ts-ignore
import multer from "multer";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "./auth/local";

const uploadDir = path.join(process.cwd(), "public", "uploads");

// Create uploads directory if it doesn't exist
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    cb(null, uploadDir);
  },
  filename: (req: any, file: any, cb: any) => {
    // Decode filename from latin1 to utf-8 (multer quirk with non-ASCII names)
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf-8');
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1e9);
    const ext = path.extname(originalName).toLowerCase();
    // A08/A03: Sanitize filename – strip path separators and null bytes to prevent
    // directory traversal and other injection attacks
    const rawName = path.basename(originalName, ext)
      .replace(/[\\/:*?"<>|\\x00]/g, '_')  // remove dangerous characters
      .replace(/\\.\\./g, '_')               // remove directory traversal
      .slice(0, 100);                       // limit length
    const name = rawName || 'file';
    cb(null, `${name}-${timestamp}-${random}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

export function registerUploadRoutes(app: Express) {
  app.post("/api/upload", isAuthenticated, upload.single("file"), (req: any, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const fileUrl = `/uploads/${encodeURIComponent(req.file.filename)}`;
    // Decode filename from latin1 to utf-8 (multer quirk with non-ASCII names)
    const fileName = Buffer.from(req.file.originalname, 'latin1').toString('utf-8');

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      url: fileUrl,
      name: fileName,
      type: req.file.mimetype,
      size: req.file.size,
    });
  });

  // Serve uploaded files statically
  app.use("/uploads", (req, res, next) => {
    // Security: ensure path doesn't escape uploads directory
    const filePath = path.join(uploadDir, req.path);
    if (!filePath.startsWith(uploadDir)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  });
}
