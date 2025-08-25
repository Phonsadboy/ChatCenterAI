import { Platform, IPlatform } from '../models/Platform';
import mongoose from 'mongoose';

export interface CreatePlatformData {
  userId: string;
  platformType: 'facebook' | 'line' | 'telegram' | 'instagram';
  name: string;
  credentials: {
    appId?: string;
    appSecret?: string;
    verifyToken?: string;
    pageAccessToken?: string;
    channelAccessToken?: string;
    channelSecret?: string;
    botToken?: string;
    accessToken?: string;
  };
  webhookUrl?: string;
}

export interface UpdatePlatformData {
  name?: string;
  isActive?: boolean;
  credentials?: {
    appId?: string;
    appSecret?: string;
    verifyToken?: string;
    pageAccessToken?: string;
    channelAccessToken?: string;
    channelSecret?: string;
    botToken?: string;
    accessToken?: string;
  };
  webhookUrl?: string;
}

export class PlatformService {
  // สร้าง platform ใหม่
  static async createPlatform(data: CreatePlatformData): Promise<IPlatform> {
    const platform = new Platform({
      userId: new mongoose.Types.ObjectId(data.userId),
      platformType: data.platformType,
      name: data.name,
      credentials: data.credentials,
      webhookUrl: data.webhookUrl
    });

    return await platform.save();
  }

  // ดึง platforms ทั้งหมดของผู้ใช้
  static async getPlatformsByUserId(userId: string): Promise<IPlatform[]> {
    return await Platform.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 });
  }

  // ดึง platform ตาม ID
  static async getPlatformById(platformId: string, userId: string): Promise<IPlatform | null> {
    return await Platform.findOne({
      _id: new mongoose.Types.ObjectId(platformId),
      userId: new mongoose.Types.ObjectId(userId)
    });
  }

  // อัปเดต platform
  static async updatePlatform(
    platformId: string, 
    userId: string, 
    data: UpdatePlatformData
  ): Promise<IPlatform | null> {
    return await Platform.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(platformId),
        userId: new mongoose.Types.ObjectId(userId)
      },
      { $set: data },
      { new: true }
    );
  }

  // ลบ platform
  static async deletePlatform(platformId: string, userId: string): Promise<boolean> {
    const result = await Platform.deleteOne({
      _id: new mongoose.Types.ObjectId(platformId),
      userId: new mongoose.Types.ObjectId(userId)
    });
    return result.deletedCount > 0;
  }

  // เปิด/ปิด platform
  static async togglePlatform(platformId: string, userId: string): Promise<IPlatform | null> {
    const platform = await this.getPlatformById(platformId, userId);
    if (!platform) return null;

    platform.isActive = !platform.isActive;
    return await platform.save();
  }

  // ดึง platforms ที่ active ตามประเภท
  static async getActivePlatformsByType(
    userId: string, 
    platformType: 'facebook' | 'line' | 'telegram' | 'instagram'
  ): Promise<IPlatform[]> {
    return await Platform.find({
      userId: new mongoose.Types.ObjectId(userId),
      platformType,
      isActive: true
    });
  }

  // ตรวจสอบว่า platform มี credentials ที่ครบถ้วนหรือไม่
  static isPlatformValid(platform: IPlatform): boolean {
    switch (platform.platformType) {
      case 'facebook':
        return !!(platform.credentials.appId && 
                  platform.credentials.appSecret && 
                  platform.credentials.pageAccessToken);
      case 'line':
        return !!(platform.credentials.channelAccessToken && 
                  platform.credentials.channelSecret);
      case 'telegram':
        return !!platform.credentials.botToken;
      case 'instagram':
        return !!platform.credentials.accessToken;
      default:
        return false;
    }
  }

  // ดึง credentials สำหรับ webhook
  static getPlatformCredentials(platform: IPlatform) {
    switch (platform.platformType) {
      case 'facebook':
        return {
          appId: platform.credentials.appId,
          appSecret: platform.credentials.appSecret,
          verifyToken: platform.credentials.verifyToken,
          pageAccessToken: platform.credentials.pageAccessToken
        };
      case 'line':
        return {
          channelAccessToken: platform.credentials.channelAccessToken,
          channelSecret: platform.credentials.channelSecret
        };
      case 'telegram':
        return {
          botToken: platform.credentials.botToken
        };
      case 'instagram':
        return {
          accessToken: platform.credentials.accessToken
        };
      default:
        return {};
    }
  }
}
