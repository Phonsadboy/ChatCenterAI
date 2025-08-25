import mongoose, { Document, Schema } from 'mongoose';

export interface IInstruction extends Document {
  name: string;
  description: string;
  content: string;
  category: string;
  platforms: string[];
  isActive: boolean;
  priority: number;
  tags: string[];
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const InstructionSchema = new Schema<IInstruction>({
  name: {
    type: String,
    required: [true, 'Please add an instruction name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    trim: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  content: {
    type: String,
    required: [true, 'Please add instruction content'],
    trim: true
  },
  category: {
    type: String,
    required: [true, 'Please add a category'],
    enum: ['greeting', 'product', 'support', 'sales', 'general', 'custom'],
    default: 'general'
  },
  platforms: [{
    type: String,
    enum: ['facebook', 'line', 'telegram', 'instagram', 'whatsapp', 'web'],
    required: true
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdBy: {
    type: String,
    required: true
  },
  updatedBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Index for better query performance
InstructionSchema.index({ platforms: 1, isActive: 1, category: 1 });
InstructionSchema.index({ tags: 1 });

export const Instruction = mongoose.model<IInstruction>('Instruction', InstructionSchema);
