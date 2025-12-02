import express from "express";
import {
  createAssignment,
  getAssignments,
  getAssignment,
  updateAssignmentStatus,
  addFulfillmentProof,
  addAssignmentMessage,
  reportIssue,
  cancelAssignment,
  confirmAssignment,
  declineAssignment,
  uploadDeliveryProof,
  acknowledgeDelivery,
  markAsDelivered,
  closeRequest,
  triageRequest,
  startRequest,
  confirmFulfillmentWithEvidence,
} from "../controllers/assignmentController.js";
import { authenticate, authorize, checkPermission } from "../middleware/auth.js";

const router = express.Router();

router.post("/", authenticate, authorize("authority", "admin"), checkPermission("canAssign"), createAssignment);
router.get("/", authenticate, getAssignments);
router.get("/:id", authenticate, getAssignment);
router.patch("/:id/status", authenticate, authorize("ngo", "authority", "admin"), updateAssignmentStatus);

// State transition endpoints
router.post("/:assignmentId/start", authenticate, authorize("ngo", "admin"), startRequest);
router.post("/:assignmentId/deliver", authenticate, authorize("ngo", "admin"), markAsDelivered);

// Request endpoints
router.post("/requests/:requestId/triage", authenticate, authorize("authority", "admin"), triageRequest);
router.post("/requests/:requestId/close", authenticate, authorize("victim", "admin"), closeRequest);
// ✅ Victim confirms fulfillment with evidence
router.post("/requests/:requestId/confirm-fulfillment", authenticate, authorize("victim"), confirmFulfillmentWithEvidence);

// NGO actions: confirm/decline/upload proof
router.post("/:id/confirm", authenticate, authorize("ngo"), confirmAssignment);
router.post("/:id/decline", authenticate, authorize("ngo"), declineAssignment);
router.post("/:id/delivery-proof", authenticate, authorize("ngo"), uploadDeliveryProof);
// Victim acknowledgement
router.post("/:id/acknowledge", authenticate, authorize("victim"), acknowledgeDelivery);
// Legacy endpoint (keep for backward compatibility)
router.post("/:id/fulfillment", authenticate, authorize("ngo"), addFulfillmentProof);
router.post("/:id/messages", authenticate, addAssignmentMessage);
router.post("/:id/issues", authenticate, reportIssue);
router.post("/:id/cancel", authenticate, authorize("operator", "authority", "admin"), cancelAssignment);

export default router;
