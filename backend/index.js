import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import { Server } from "socket.io";

import { connectDB } from "./config/db.js";
import { socketHandlers } from "./socket/socketHandlers.js";
import { setIO } from "./socket/ioInstance.js";
import { backfillPendingRequests, getQueueSnapshot, startAutoAssignmentWorker } from "./services/autoAssignmentService.js";

// Import routes
import authRoutes from "./routes/auth.js";
import requestRoutes from "./routes/requests.js";
import offerRoutes from "./routes/offers.js";
import assignmentRoutes from "./routes/assignments.js";
import ngoRoutes from "./routes/ngos.js";
import advisoryRoutes from "./routes/advisories.js";
import blockedRouteRoutes from "./routes/blockedRoutes.js";
import adminRoutes from "./routes/admin.js";
import analyticsRoutes from "./routes/analytics.js";
import integrationRoutes from "./routes/integrationRoutes.js";
import operatorRoutes from "./routes/operator.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

// CORS setup: allow multiple frontend origins via env FRONTEND_URLS (comma-separated)
const allowedOrigins = (process.env.FRONTEND_URLS || "http://localhost:5173").split(",").map(s => s.trim());

const corsOptions = {
  origin: function(origin, callback) {
    // Allow REST tools or server-to-server (no origin)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  credentials: true,
};

const io = new Server(server, { cors: corsOptions });

// Store IO instance for use in controllers
setIO(io);

app.use(cors(corsOptions));
app.use(express.json({ limit: "50mb" })); // Increased for base64 images
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(cookieParser());

// Health check
app.get("/", (req, res) => {
  res.json({ message: "DisasterAid API is running", status: "ok" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/ngos", ngoRoutes);
app.use("/api/advisories", advisoryRoutes);
app.use("/api/blocked-routes", blockedRouteRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/operator", operatorRoutes);

// Make IO available to controllers via app.locals
app.set('io', io);

// Socket.IO
socketHandlers(io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 3000;
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`✅ Socket.IO ready for connections`);

    // Optional: On startup, enqueue existing pending requests for auto-assignment
    if ((process.env.AUTO_ASSIGN_ON_START || 'true').toLowerCase() === 'true') {
      backfillPendingRequests()
        .then((res) => {
          if (res.success) {
            console.log(`🚀 Auto-assign backfill: scanned=${res.scanned}, enqueued=${res.enqueued}`);
            const snapshot = getQueueSnapshot();
            if (snapshot.length > 0) {
              console.log(`📦 Queue snapshot (first 10):`, snapshot.slice(0, 10));
            }
          } else {
            console.warn(`⚠️ Auto-assign backfill failed: ${res.error}`);
          }
        })
        .catch((err) => console.error("Backfill error:", err));
    } else {
      console.log("ℹ️ AUTO_ASSIGN_ON_START is disabled; startup backfill skipped.");
    }

    // Ensure continuous background processing
    if ((process.env.AUTO_ASSIGN_WORKER || 'true').toLowerCase() === 'true') {
      startAutoAssignmentWorker();
    } else {
      console.log("ℹ️ AUTO_ASSIGN_WORKER is disabled; background worker not started.");
    }
  });
}).catch((err) => {
  console.error("❌ Database connection failed:", err);
  process.exit(1);
});


