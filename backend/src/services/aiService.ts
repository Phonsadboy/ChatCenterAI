import OpenAI from 'openai';
import { Instruction } from '../models/Instruction';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ChatContext {
  customerName: string;
  platform: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  instructions: string[];
}

export class AIService {
  private static instance: AIService;

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  async generateResponse(context: ChatContext): Promise<string> {
    try {
      // Get relevant instructions for the platform
      const instructions = await this.getRelevantInstructions(context.platform);
      
      // Build system prompt with instructions
      const systemPrompt = this.buildSystemPrompt(instructions, context);
      
      // Prepare messages for OpenAI
      const messages = [
        { role: 'system' as const, content: systemPrompt },
        ...context.conversationHistory.slice(-10) // Last 10 messages for context
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages,
        max_tokens: 500,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      });

      return completion.choices[0]?.message?.content || 'ขออภัย ไม่สามารถตอบกลับได้ในขณะนี้';
    } catch (error) {
      console.error('AI Service Error:', error);
      return 'ขออภัย เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่อีกครั้ง';
    }
  }

  private async getRelevantInstructions(platform: string): Promise<string[]> {
    try {
      const instructions = await Instruction.find({
        platforms: platform,
        isActive: true
      }).sort({ priority: -1 });

      return instructions.map(instruction => instruction.content);
    } catch (error) {
      console.error('Error fetching instructions:', error);
      return [];
    }
  }

  private buildSystemPrompt(instructions: string[], context: ChatContext): string {
    const basePrompt = `คุณเป็นผู้ช่วยลูกค้าที่เป็นมิตรและเป็นประโยชน์ คุณกำลังสนทนากับ ${context.customerName} ผ่าน ${context.platform}

คำแนะนำในการตอบกลับ:
- ตอบกลับเป็นภาษาไทยเสมอ
- ใช้ภาษาที่เป็นมิตรและเป็นทางการ
- ให้ข้อมูลที่ถูกต้องและเป็นประโยชน์
- หากไม่แน่ใจ ให้ถามเพื่อความชัดเจน
- อย่าให้ข้อมูลส่วนตัวหรือข้อมูลที่ละเอียดอ่อน

คำแนะนำเฉพาะสำหรับ ${context.platform}:`;

    const instructionText = instructions.length > 0 
      ? instructions.join('\n\n')
      : 'ตอบกลับด้วยความสุภาพและเป็นประโยชน์';

    return `${basePrompt}\n\n${instructionText}`;
  }

  async analyzeSentiment(message: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    confidence: number;
    keywords: string[];
  }> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'วิเคราะห์ความรู้สึกของข้อความและส่งคืนเป็น JSON ในรูปแบบ: {"sentiment": "positive/negative/neutral", "confidence": 0.0-1.0, "keywords": ["คำสำคัญ1", "คำสำคัญ2"]}'
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 200,
        temperature: 0.1,
      });

      const response = completion.choices[0]?.message?.content;
      if (response) {
        try {
          return JSON.parse(response);
        } catch {
          return {
            sentiment: 'neutral',
            confidence: 0.5,
            keywords: []
          };
        }
      }

      return {
        sentiment: 'neutral',
        confidence: 0.5,
        keywords: []
      };
    } catch (error) {
      console.error('Sentiment analysis error:', error);
      return {
        sentiment: 'neutral',
        confidence: 0.5,
        keywords: []
      };
    }
  }

  async extractIntent(message: string): Promise<{
    intent: string;
    confidence: number;
    entities: Record<string, any>;
  }> {
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'วิเคราะห์เจตนาของข้อความและส่งคืนเป็น JSON ในรูปแบบ: {"intent": "greeting/inquiry/complaint/order/other", "confidence": 0.0-1.0, "entities": {"product": "ชื่อสินค้า", "price": "ราคา", "location": "สถานที่"}}'
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 200,
        temperature: 0.1,
      });

      const response = completion.choices[0]?.message?.content;
      if (response) {
        try {
          return JSON.parse(response);
        } catch {
          return {
            intent: 'other',
            confidence: 0.5,
            entities: {}
          };
        }
      }

      return {
        intent: 'other',
        confidence: 0.5,
        entities: {}
      };
    } catch (error) {
      console.error('Intent extraction error:', error);
      return {
        intent: 'other',
        confidence: 0.5,
        entities: {}
      };
    }
  }
}

export const aiService = AIService.getInstance();
