import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage {
  id: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'audio' | 'video';
  sender: 'customer' | 'agent' | 'ai';
  senderId?: string;
  senderName?: string;
  timestamp: Date;
  metadata?: {
    platform?: string;
    messageId?: string;
    replyTo?: string;
    attachments?: Array<{
      url: string;
      type: string;
      name?: string;
    }>;
  };
}

export interface IChat extends Document {
  customerId: string;
  customerName: string;
  platform: 'facebook' | 'line' | 'telegram' | 'instagram' | 'whatsapp' | 'web';
  platformId: string;
  status: 'active' | 'resolved' | 'pending' | 'closed';
  assignedAgent?: mongoose.Types.ObjectId;
  messages: IMessage[];
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  aiResponses: number;
  humanResponses: number;
}

const MessageSchema = new Schema<IMessage>({
  id: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'audio', 'video'],
    default: 'text'
  },
  sender: {
    type: String,
    enum: ['customer', 'agent', 'ai'],
    required: true
  },
  senderId: String,
  senderName: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    platform: String,
    messageId: String,
    replyTo: String,
    attachments: [{
      url: String,
      type: String,
      name: String
    }]
  }
});

const ChatSchema = new Schema<IChat>({
  customerId: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  platform: {
    type: String,
    enum: ['facebook', 'line', 'telegram', 'instagram', 'whatsapp', 'web'],
    required: true
  },
  platformId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'resolved', 'pending', 'closed'],
    default: 'active'
  },
  assignedAgent: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  messages: [MessageSchema],
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  tags: [{
    type: String,
    trim: true
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  aiResponses: {
    type: Number,
    default: 0
  },
  humanResponses: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better query performance
ChatSchema.index({ customerId: 1, platform: 1 });
ChatSchema.index({ platformId: 1 });
ChatSchema.index({ status: 1, assignedAgent: 1 });
ChatSchema.index({ lastMessageAt: -1 });
ChatSchema.index({ priority: 1, status: 1 });

export const Chat = mongoose.model<IChat>('Chat', ChatSchema);
