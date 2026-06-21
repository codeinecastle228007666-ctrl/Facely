// Test Face++ API with a simple image
// Run: node scripts/test-facepp.js
// or: npx tsx scripts/test-facepp.ts

import { createCanvas } from "canvas";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";

const KEY = process.env.FACE_PLUS_KEY;
const SECRET = process.env.FACE_PLUS_SECRET;

if (!KEY || !SECRET) {
  console.error("FACE_PLUS_KEY or FACE_PLUS_SECRET not set");
  process.exit(1);
}

// Create a simple test Face Detection call with the detect endpoint first
async function testDetect() {
  // Use a minimal 1x1 JPEG to test auth
  // First, let's just test the API connectivity
  const params = new URLSearchParams();
  params.append("api_key", KEY!);
  params.append("api_secret", SECRET!);

  // We need an image. Let's try with a very simple approach:
  // Just send api_key and api_secret without an image to see the error
  const res = await fetch("https://api-us.faceplusplus.com/facepp/v3/detect", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const text = await res.text();
  console.log("Detect API (no image):", text.slice(0, 200));
}

// Test with a real image - check if there's a test image in the project
async function testWithImage() {
  // Look for any JPEG in uploads or temp
  const testPaths = [
    path.join(process.cwd(), "uploads"),
    process.env.STORAGE_PATH,
  ];

  let imagePath = null;
  for (const p of testPaths) {
    if (p && fs.existsSync(p)) {
      const files = fs.readdirSync(p);
      const jpg = files.find((f) => f.endsWith(".jpg") || f.endsWith(".jpeg"));
      if (jpg) {
        imagePath = path.join(p, jpg);
        break;
      }
    }
  }

  if (!imagePath) {
    console.log("No test image found. Testing API connectivity only.");
    return;
  }

  console.log("Testing with image:", imagePath);
  
  const buffer = fs.readFileSync(imagePath);
  const base64 = buffer.toString("base64");
  console.log(`Image size: ${buffer.length} bytes (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  if (buffer.length > 2 * 1024 * 1024) {
    console.log("Image too large (>2MB), skipping skin analyze test");
    return;
  }

  // Test skin analyze
  const params = new URLSearchParams();
  params.append("api_key", KEY!);
  params.append("api_secret", SECRET!);
  params.append("image_base64", base64);
  params.append("return_attributes", "skin_status,skin_health");

  console.log("Sending to Face++ Skin Analyze...");
  const start = Date.now();
  const res = await fetch("https://api-us.faceplusplus.com/facepp/v1/skinanalyze", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const elapsed = Date.now() - start;
  const text = await res.text();
  console.log(`Response (${res.status}, ${elapsed}ms):`);
  console.log(text.slice(0, 500));
}

testDetect()
  .then(() => testWithImage())
  .then(() => console.log("Done"))
  .catch(console.error);
