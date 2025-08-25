import { Server, Socket } from 'socket.io';
import { Chat, IMessage } from '../models/Chat';
import mongoose from 'mongoose';

interface AuthenticatedSocket extends Socket {
  user?: any;
}

export const setupSocketHandlers = (io: Server) => {
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User connected: ${socket.id}`);

    // Join agent room for all users
    socket.join('agents');

    // Handle joining specific chat room
    socket.on('join-chat', (chatId: string) => {
      socket.join(`chat:${chatId}`);
      console.log(`User ${socket.user?.name} joined chat ${chatId}`);
    });

    // Handle leaving specific chat room
    socket.on('leave-chat', (chatId: string) => {
      socket.leave(`chat:${chatId}`);
      console.log(`User ${socket.user?.name} left chat ${chatId}`);
    });

    // Handle typing indicator
    socket.on('typing', (data: { chatId: string; isTyping: boolean }) => {
      socket.to(`chat:${data.chatId}`).emit('user-typing', {
        userId: socket.id,
        userName: 'Agent',
        isTyping: data.isTyping
      });
    });

    // Handle new message
    socket.on('send-message', async (data: {
      chatId: string;
      content: string;
      type?: string;
    }) => {
      try {
        const chat = await Chat.findById(data.chatId);
        
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        // Add message to chat
        const newMessage: IMessage = {
          id: Date.now().toString(),
          content: data.content,
          type: (data.type || 'text') as 'text' | 'image' | 'file' | 'audio' | 'video',
          sender: 'agent',
          senderId: socket.id,
          senderName: 'Agent',
          timestamp: new Date()
        };

        chat.messages.push(newMessage);
        chat.lastMessageAt = new Date();
        chat.humanResponses += 1;
        await chat.save();

        // Emit to all users in the chat room
        io.to(`chat:${data.chatId}`).emit('new-message', {
          chatId: data.chatId,
          message: newMessage
        });

        // Emit chat update to agents
        io.to('agents').emit('chat-updated', {
          chatId: data.chatId,
          lastMessage: newMessage,
          lastMessageAt: chat.lastMessageAt
        });

      } catch (error) {
        console.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle chat status update
    socket.on('update-chat-status', async (data: {
      chatId: string;
      status: 'active' | 'resolved' | 'pending' | 'closed';
    }) => {
      try {
        const chat = await Chat.findById(data.chatId);
        
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        chat.status = data.status;
        await chat.save();

        // Emit status update to all users in the chat room
        io.to(`chat:${data.chatId}`).emit('chat-status-updated', {
          chatId: data.chatId,
          status: data.status
        });

        // Emit to agents
        io.to('agents').emit('chat-updated', {
          chatId: data.chatId,
          status: data.status
        });

      } catch (error) {
        console.error('Update chat status error:', error);
        socket.emit('error', { message: 'Failed to update chat status' });
      }
    });

    // Handle chat assignment
    socket.on('assign-chat', async (data: {
      chatId: string;
      assignedAgent: string;
    }) => {
      try {
        const chat = await Chat.findById(data.chatId);
        
        if (!chat) {
          socket.emit('error', { message: 'Chat not found' });
          return;
        }

        chat.assignedAgent = new mongoose.Types.ObjectId(data.assignedAgent);
        await chat.save();

        // Emit assignment to all users in the chat room
        io.to(`chat:${data.chatId}`).emit('chat-assigned', {
          chatId: data.chatId,
          assignedAgent: data.assignedAgent
        });

        // Emit to agents
        io.to('agents').emit('chat-updated', {
          chatId: data.chatId,
          assignedAgent: data.assignedAgent
        });

        // Notify the assigned agent
        io.to(`user:${data.assignedAgent}`).emit('chat-assigned-to-you', {
          chatId: data.chatId,
          chat: chat
        });

      } catch (error) {
        console.error('Assign chat error:', error);
        socket.emit('error', { message: 'Failed to assign chat' });
      }
    });

    // Handle user online status
    socket.on('set-online-status', (isOnline: boolean) => {
      // Emit to agents
      io.to('agents').emit('user-status-changed', {
        userId: socket.id,
        userName: 'Agent',
        isOnline
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.id}`);
      
      // Emit offline status to agents
      io.to('agents').emit('user-status-changed', {
        userId: socket.id,
        userName: 'Agent',
        isOnline: false
      });
    });
  });
};

// Function to emit new chat to agents
export const emitNewChat = (io: Server, chat: any) => {
  io.to('agents').emit('new-chat', {
    chat: chat
  });
};

// Function to emit chat update to agents
export const emitChatUpdate = (io: Server, chatId: string, update: any) => {
  io.to('agents').emit('chat-updated', {
    chatId,
    ...update
  });
};

// Function to emit message to specific user
export const emitToUser = (io: Server, userId: string, event: string, data: any) => {
  io.to(`user:${userId}`).emit(event, data);
};

// Function to emit to all agents
export const emitToAgents = (io: Server, event: string, data: any) => {
  io.to('agents').emit(event, data);
};
