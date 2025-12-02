import express from "express";
import {
  getDuplicates,
  resolveDuplicate,
  getMatches,
  confirmMatch,
  getEscalations,
  handleEscalation,
  createEscalation
} from "../controllers/operatorController.js";
import { authenticate, authorize, checkPermission } from "../middleware/auth.js";

const router = express.Router();

// All operator routes require authentication and operator/authority/admin role

// Duplicate Management
router.get(
  "/duplicates",
  authenticate,
  authorize("operator", "authority", "admin"),
  checkPermission("canResolveDuplicates"),
  getDuplicates
);

router.post(
  "/duplicates/resolve",
  authenticate,
  authorize("operator", "authority", "admin"),
  checkPermission("canResolveDuplicates"),
  resolveDuplicate
);

// Match Confirmation
router.get(
  "/matches",
  authenticate,
  authorize("operator", "authority", "admin"),
  checkPermission("canConfirmMatches"),
  getMatches
);

router.post(
  "/matches/confirm",
  authenticate,
  authorize("operator", "authority", "admin"),
  checkPermission("canConfirmMatches"),
  confirmMatch
);

// Escalation Handling
router.get(
  "/escalations",
  authenticate,
  authorize("operator", "authority", "admin"),
  checkPermission("canHandleEscalations"),
  getEscalations
);

router.post(
  "/escalations/:id/handle",
  authenticate,
  authorize("operator", "authority", "admin"),
  checkPermission("canHandleEscalations"),
  handleEscalation
);

router.post(
  "/escalations/create",
  authenticate,
  authorize("operator", "authority", "admin", "ngo", "victim"),
  createEscalation
);

export default router;
