import mongoose from 'mongoose';

const blockedRouteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  reason: String,
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  coordinates: {
    type: [[Number]], // Array of [lon, lat] pairs defining the route path
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length >= 2 && v.every(coord => 
          Array.isArray(coord) && coord.length === 2 && 
          typeof coord[0] === 'number' && typeof coord[1] === 'number'
        );
      },
      message: 'Coordinates must be an array of at least 2 [longitude, latitude] pairs'
    }
  },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  expiresAt: Date,
}, { timestamps: true });

blockedRouteSchema.index({ coordinates: '2dsphere' });
blockedRouteSchema.index({ active: 1, expiresAt: 1 });

// Auto-deactivate expired routes
blockedRouteSchema.statics.findActive = async function() {
  const now = new Date();
  await this.updateMany(
    { expiresAt: { $lte: now }, active: true },
    { $set: { active: false } }
  );
  return this.find({ active: true }).sort('-createdAt');
};

export const BlockedRoute = mongoose.model('BlockedRoute', blockedRouteSchema);
