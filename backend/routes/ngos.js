import express from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { listNGOs, getMyNGO, updateMyLocation } from "../controllers/ngoController.js";

const router = express.Router();

// NGO can view their own info
router.get("/me", authenticate, authorize("ngo"), getMyNGO);

// NGO can update their location
router.patch("/me/location", authenticate, authorize("ngo"), updateMyLocation);

// Authority/admin can list all NGOs; NGOs can view themselves
router.get("/", authenticate, authorize("authority", "admin"), listNGOs);

export default router;
