import mongoose from 'mongoose';

const advisorySchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ['info','watch','warning','danger'], default: 'info' },
  tags: [String],
  active: { type: Boolean, default: true },
  expiresAt: Date,
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// Auto deactivate expired advisories on fetch
advisorySchema.statics.findActive = async function() {
  const now = new Date();
  await this.updateMany({ expiresAt: { $lte: now }, active: true }, { $set: { active: false } });
  return this.find({ active: true }).sort('-createdAt');
};

export const Advisory = mongoose.model('Advisory', advisorySchema);
