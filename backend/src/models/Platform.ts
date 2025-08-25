import mongoose, { Document, Schema } from 'mongoose';

export interface IPlatform extends Document {
  userId: mongoose.Types.ObjectId;
  platformType: 'facebook' | 'line' | 'telegram' | 'instagram';
  name: string;
  isActive: boolean;
  credentials: {
    // Facebook
    appId?: string;
    appSecret?: string;
    verifyToken?: string;
    pageAccessToken?: string;
    
    // Line
    channelAccessToken?: string;
    channelSecret?: string;
    
    // Telegram
    botToken?: string;
    
    // Instagram
    accessToken?: string;
  };
  webhookUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlatformSchema = new Schema<IPlatform>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  platformType: {
    type: String,
    enum: ['facebook', 'line', 'telegram', 'instagram'],
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  credentials: {
    // Facebook
    appId: {
      type: String,
      trim: true
    },
    appSecret: {
      type: String,
      trim: true
    },
    verifyToken: {
      type: String,
      trim: true
    },
    pageAccessToken: {
      type: String,
      trim: true
    },
    
    // Line
    channelAccessToken: {
      type: String,
      trim: true
    },
    channelSecret: {
      type: String,
      trim: true
    },
    
    // Telegram
    botToken: {
      type: String,
      trim: true
    },
    
    // Instagram
    accessToken: {
      type: String,
      trim: true
    }
  },
  webhookUrl: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
PlatformSchema.index({ userId: 1, platformType: 1 });

// Virtual for platform-specific validation
PlatformSchema.virtual('isValid').get(function() {
  switch (this.platformType) {
    case 'facebook':
      return !!(this.credentials.appId && this.credentials.appSecret && this.credentials.pageAccessToken);
    case 'line':
      return !!(this.credentials.channelAccessToken && this.credentials.channelSecret);
    case 'telegram':
      return !!this.credentials.botToken;
    case 'instagram':
      return !!this.credentials.accessToken;
    default:
      return false;
  }
});

export const Platform = mongoose.model<IPlatform>('Platform', PlatformSchema);
