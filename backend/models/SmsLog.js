import mongoose from 'mongoose';

const smsLogSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      index: true
    },
    
    message: {
      type: String,
      required: true
    },
    
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Request'
    },
    
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true
    },
    
    provider: {
      type: String,
      enum: ['twilio', 'sns', 'other'],
      default: 'twilio'
    },
    
    messageId: {
      type: String,
      unique: true,
      sparse: true
    },
    
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed', 'received', 'bounced'],
      default: 'pending'
    },
    
    error: String,
    
    metadata: {
      type: Object,
      default: {}
    },
    
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    
    deliveredAt: Date,
    
    readAt: Date
  },
  {
    timestamps: true,
    collection: 'sms_logs'
  }
);

// Indexes for efficient querying
smsLogSchema.index({ phoneNumber: 1, timestamp: -1 });
smsLogSchema.index({ userId: 1, timestamp: -1 });
smsLogSchema.index({ requestId: 1, timestamp: -1 });
smsLogSchema.index({ direction: 1, status: 1 });

export const SmsLog = mongoose.model('SmsLog', smsLogSchema);
