import axios from 'axios';
import crypto from 'crypto';
import { Platform } from '../models/Platform';

export interface LineMessage {
  type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'sticker';
  text?: string;
  originalContentUrl?: string;
  previewImageUrl?: string;
  duration?: number;
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  packageId?: string;
  stickerId?: string;
}

export interface LineEvent {
  type: 'message' | 'follow' | 'unfollow' | 'join' | 'leave' | 'postback' | 'beacon';
  mode: 'active' | 'standby';
  timestamp: number;
  replyToken?: string;
  source: {
    type: 'user' | 'group' | 'room';
    userId?: string;
    groupId?: string;
    roomId?: string;
  };
  message?: LineMessage;
  postback?: {
    data: string;
    params?: {
      date?: string;
      time?: string;
      datetime?: string;
    };
  };
}

export interface LineWebhookBody {
  destination: string;
  events: LineEvent[];
}

export class LineService {
  private static readonly LINE_API_BASE = 'https://api.line.me/v2';

  /**
   * ตรวจสอบความถูกต้องของ signature จาก Line webhook
   */
  static verifySignature(body: string, signature: string, channelSecret: string): boolean {
    const hash = crypto
      .createHmac('SHA256', channelSecret)
      .update(body)
      .digest('base64');
    
    return hash === signature;
  }

  /**
   * ส่งข้อความไปยัง Line
   */
  static async sendMessage(
    channelAccessToken: string,
    userId: string,
    messages: LineMessage[]
  ): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.LINE_API_BASE}/bot/message/push`,
        {
          to: userId,
          messages: messages
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`
          }
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('Error sending LINE message:', error);
      return false;
    }
  }

  /**
   * ส่งข้อความตอบกลับ (reply)
   */
  static async replyMessage(
    channelAccessToken: string,
    replyToken: string,
    messages: LineMessage[]
  ): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.LINE_API_BASE}/bot/message/reply`,
        {
          replyToken: replyToken,
          messages: messages
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`
          }
        }
      );

      return response.status === 200;
    } catch (error) {
      console.error('Error replying LINE message:', error);
      return false;
    }
  }

  /**
   * รับข้อมูลโปรไฟล์ของผู้ใช้
   */
  static async getUserProfile(
    channelAccessToken: string,
    userId: string
  ): Promise<any> {
    try {
      const response = await axios.get(
        `${this.LINE_API_BASE}/bot/profile/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${channelAccessToken}`
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting LINE user profile:', error);
      return null;
    }
  }

  /**
   * ทดสอบการเชื่อมต่อกับ Line API
   */
  static async testConnection(channelAccessToken: string): Promise<{
    success: boolean;
    message: string;
    profile?: any;
  }> {
    try {
      // ทดสอบโดยการดึงข้อมูล bot profile
      const response = await axios.get(
        `${this.LINE_API_BASE}/bot/profile`,
        {
          headers: {
            'Authorization': `Bearer ${channelAccessToken}`
          }
        }
      );

      if (response.status === 200) {
        return {
          success: true,
          message: 'การเชื่อมต่อสำเร็จ',
          profile: response.data
        };
      } else {
        return {
          success: false,
          message: 'การเชื่อมต่อล้มเหลว'
        };
      }
    } catch (error: any) {
      console.error('LINE connection test error:', error);
      
      if (error.response?.status === 401) {
        return {
          success: false,
          message: 'Channel Access Token ไม่ถูกต้อง'
        };
      } else if (error.response?.status === 403) {
        return {
          success: false,
          message: 'ไม่มีสิทธิ์ในการเข้าถึง API'
        };
      } else {
        return {
          success: false,
          message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + (error.message || 'Unknown error')
        };
      }
    }
  }

  /**
   * สร้างข้อความตอบกลับอัตโนมัติ
   */
  static createAutoReplyMessage(text: string): LineMessage {
    return {
      type: 'text',
      text: text
    };
  }

  /**
   * แปลงข้อความจาก Line เป็นรูปแบบมาตรฐาน
   */
  static parseLineMessage(lineEvent: LineEvent): {
    platform: string;
    userId: string;
    message: string;
    messageType: string;
    timestamp: Date;
    metadata?: any;
  } | null {
    if (lineEvent.type !== 'message' || !lineEvent.message) {
      return null;
    }

    const { message, source, timestamp } = lineEvent;
    
    return {
      platform: 'line',
      userId: source.userId || '',
      message: message.type === 'text' ? message.text || '' : `[${message.type.toUpperCase()}]`,
      messageType: message.type,
      timestamp: new Date(timestamp),
      metadata: {
        sourceType: source.type,
        groupId: source.groupId,
        roomId: source.roomId,
        originalMessage: message
      }
    };
  }

  /**
   * จัดการ webhook events จาก Line
   */
  static async handleWebhookEvents(
    events: LineEvent[],
    platform: any
  ): Promise<void> {
    for (const event of events) {
      try {
        // จัดการเฉพาะ message events
        if (event.type === 'message' && event.message) {
          const parsedMessage = this.parseLineMessage(event);
          
          if (parsedMessage) {
            // ส่งข้อความไปยังระบบแชท
            await this.processIncomingMessage(parsedMessage, platform);
            
            // ส่งข้อความตอบกลับอัตโนมัติ (ถ้าต้องการ)
            if (event.message.type === 'text') {
              await this.sendAutoReply(event, platform);
            }
          }
        }
        
        // จัดการ follow/unfollow events
        if (event.type === 'follow') {
          await this.handleFollowEvent(event, platform);
        } else if (event.type === 'unfollow') {
          await this.handleUnfollowEvent(event, platform);
        }
        
      } catch (error) {
        console.error('Error handling LINE webhook event:', error);
      }
    }
  }

  /**
   * ประมวลผลข้อความที่เข้ามา
   */
  private static async processIncomingMessage(
    parsedMessage: any,
    platform: any
  ): Promise<void> {
    // TODO: ส่งข้อความไปยังระบบแชทหลัก
    console.log('Processing LINE message:', parsedMessage);
    
    // ตัวอย่างการส่งไปยัง socket หรือ database
    // await ChatService.createMessage(parsedMessage);
  }

  /**
   * ส่งข้อความตอบกลับอัตโนมัติ
   */
  private static async sendAutoReply(
    event: LineEvent,
    platform: any
  ): Promise<void> {
    try {
      const welcomeMessage = 'ขอบคุณที่ติดต่อเรา! เราจะตอบกลับโดยเร็วที่สุด 🎉';
      
      await this.replyMessage(
        platform.credentials.channelAccessToken,
        event.replyToken || '',
        [this.createAutoReplyMessage(welcomeMessage)]
      );
    } catch (error) {
      console.error('Error sending auto reply:', error);
    }
  }

  /**
   * จัดการ follow event
   */
  private static async handleFollowEvent(
    event: LineEvent,
    platform: any
  ): Promise<void> {
    try {
      const welcomeMessage = 'สวัสดี! ยินดีต้อนรับสู่บริการของเรา 😊';
      
      await this.sendMessage(
        platform.credentials.channelAccessToken,
        event.source.userId || '',
        [this.createAutoReplyMessage(welcomeMessage)]
      );
    } catch (error) {
      console.error('Error handling follow event:', error);
    }
  }

  /**
   * จัดการ unfollow event
   */
  private static async handleUnfollowEvent(
    event: LineEvent,
    platform: any
  ): Promise<void> {
    try {
      // บันทึกการ unfollow ในฐานข้อมูล
      console.log('User unfollowed:', event.source.userId);
      
      // TODO: อัปเดตสถานะผู้ใช้ในฐานข้อมูล
      // await UserService.updateUserStatus(event.source.userId, 'unfollowed');
    } catch (error) {
      console.error('Error handling unfollow event:', error);
    }
  }
}
