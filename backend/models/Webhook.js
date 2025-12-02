import mongoose from 'mongoose';

const webhookSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Invalid webhook URL'
      }
    },
    event: {
      type: String,
      enum: [
        'request.created',
        'request.critical',
        'request.sos',
        'request.fulfilled',
        'assignment.created',
        'assignment.updated',
        'assignment.completed',
        'delivery.confirmed',
        'ngo.registered',
        'shelter.occupancy.critical'
      ],
      required: true
    },
    secret: {
      type: String,
      required: true,
      default: () => require('crypto').randomBytes(32).toString('hex')
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    active: {
      type: Boolean,
      default: true
    },
    failureCount: {
      type: Number,
      default: 0
    },
    lastTriggered: Date,
    lastSuccess: Date,
    lastError: String,
    description: String,
    headers: {
      type: Map,
      of: String,
      default: new Map()
    }
  },
  { timestamps: true }
);

// Index for faster queries
webhookSchema.index({ event: 1, active: 1 });
webhookSchema.index({ createdBy: 1 });

export const Webhook = mongoose.model('Webhook', webhookSchema);
