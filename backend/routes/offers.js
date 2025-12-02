import express from "express";
import {
  createOffer,
  getOffers,
  getOffer,
  updateOffer,
  deleteOffer,
  toggleOfferStatus,
  getOffersByLocation,
  getOfferStats,
} from "../controllers/offerController.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// NGO routes
router.post("/", authenticate, authorize("ngo"), createOffer);
router.get("/", authenticate, getOffers);
router.get("/stats", authenticate, authorize("ngo"), getOfferStats);
router.get("/location", authenticate, getOffersByLocation);
router.get("/:id", authenticate, getOffer);
router.put("/:id", authenticate, authorize("ngo"), updateOffer);
router.delete("/:id", authenticate, authorize("ngo"), deleteOffer);
router.patch("/:id/toggle", authenticate, authorize("ngo"), toggleOfferStatus);

export default router;
