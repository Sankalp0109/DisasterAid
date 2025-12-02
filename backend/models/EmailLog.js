import mongoose from 'mongoose';

const emailLogSchema = new mongoose.Schema(
  {
    to: {
      type: String,
      required: true,
      index: true
    },
    
    from: {
      type: String,
      required: true
    },
    
    subject: {
      type: String,
      required: true
    },
    
    body: {
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
    
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment'
    },
    
    emailType: {
      type: String,
      enum: [
        'user_credentials',
        'password_reset',
        'password_changed',
        'assignment_notification',
        'delivery_confirmation',
        'critical_alert',
        'sos_alert',
        'other'
      ],
      required: true,
      index: true
    },
    
    provider: {
      type: String,
      enum: ['mailtrap', 'gmail', 'smtp', 'other'],
      default: 'mailtrap'
    },
    
    messageId: {
      type: String,
      sparse: true
    },
    
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed', 'bounced', 'timeout'],
      default: 'pending',
      index: true
    },
    
    error: String,
    
    priority: {
      type: String,
      enum: ['low', 'normal', 'high'],
      default: 'normal'
    },
    
    metadata: {
      type: Object,
      default: {}
    },
    
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    
    sentAt: Date,
    
    deliveredAt: Date,
    
    openedAt: Date
  },
  {
    timestamps: true,
    collection: 'email_logs'
  }
);

// Indexes for efficient querying
emailLogSchema.index({ to: 1, timestamp: -1 });
emailLogSchema.index({ userId: 1, timestamp: -1 });
emailLogSchema.index({ emailType: 1, timestamp: -1 });
emailLogSchema.index({ status: 1, timestamp: -1 });
emailLogSchema.index({ provider: 1, status: 1 });

export const EmailLog = mongoose.model('EmailLog', emailLogSchema);
