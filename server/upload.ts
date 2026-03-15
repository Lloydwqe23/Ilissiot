// multer has no types in this project
// @ts-ignore
import multer from "multer";
import express from "express";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import type { Express, Request, Response } from "express";
import { isAuthenticated } from "./auth/local";

const uploadDir = path.join(process.cwd(), "public", "uploads");

// Create uploads directory if it doesn't exist
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const requiredCloudinaryEnv = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

const missingCloudinaryEnv = requiredCloudinaryEnv.filter((key) => !process.env[key]);
const useCloudinary = missingCloudinaryEnv.length === 0;

if (process.env.NODE_ENV === "production" && !useCloudinary) {
  throw new Error(
    `Cloudinary is required in production. Missing env vars: ${missingCloudinaryEnv.join(", ")}`
  );
}

if (useCloudinary) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const diskStorage = multer.diskStorage({
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

const cloudinaryStorage = new CloudinaryStorage({
  cloudinary,
  params: async () => ({
    folder: "ilissiot_media",
    resource_type: "auto",
  }),
});

const activeStorage = useCloudinary ? cloudinaryStorage : diskStorage;

const upload = multer({
  storage: activeStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

export function registerUploadRoutes(app: Express) {
  app.post("/api/upload", isAuthenticated, upload.single("file"), (req: any, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }

    const rawCloudinaryUrl =
      (typeof req.file.path === "string" && req.file.path) ||
      (typeof req.file.secure_url === "string" && req.file.secure_url) ||
      (typeof req.file.url === "string" && req.file.url) ||
      null;

    if (useCloudinary && (!rawCloudinaryUrl || !/^https?:\/\//.test(rawCloudinaryUrl))) {
      return res.status(500).json({ message: "Cloud upload failed: URL was not returned" });
    }

    const fileUrl = rawCloudinaryUrl && /^https?:\/\//.test(rawCloudinaryUrl)
      ? rawCloudinaryUrl
      : `/uploads/${encodeURIComponent(req.file.filename)}`;
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

  // Keep local static serving only for non-Cloudinary mode.
  if (!useCloudinary) {
    console.warn("[upload] Cloudinary env vars are missing. Using local /uploads storage.");
    app.use(
      "/uploads",
      express.static(uploadDir, {
        fallthrough: false,
        index: false,
        redirect: false,
      })
    );
  }
}
