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

const useCloudinary =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

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

    const cloudinaryUrl = typeof req.file.path === "string" ? req.file.path : null;
    const fileUrl = cloudinaryUrl && /^https?:\/\//.test(cloudinaryUrl)
      ? cloudinaryUrl
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
