import express from "express";
import {
  createRequest,
  getRequest,
  getRequests,
  updateRequest,
  triageRequest,
  addMessage,
  uploadEvidence,
  getSoSQueue,
  getRequestsByLocation,
  updateRequestPriority,
} from "../controllers/requestController.js";
import { authenticate, authorize, checkPermission } from "../middleware/auth.js";

const router = express.Router();

// Public/authenticated routes
router.post("/", authenticate, createRequest);
router.get("/", authenticate, getRequests);
router.get("/sos", authenticate, authorize("authority", "admin"), getSoSQueue);
router.get("/location", authenticate, getRequestsByLocation);
router.get("/:id", authenticate, getRequest);
router.put("/:id", authenticate, updateRequest);

// Messages and evidence
router.post("/:id/messages", authenticate, addMessage);
router.post("/:id/evidence", authenticate, uploadEvidence);

// Triage (operator/authority only)
router.post("/:id/triage", authenticate, authorize("authority", "admin"), checkPermission("canTriage"), triageRequest);

// Update priority (authority/admin only)
router.patch("/:id/priority", authenticate, authorize("authority", "admin"), updateRequestPriority);

export default router;
