import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import toast from 'react-hot-toast';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  joinChat: (chatId: string) => void;
  leaveChat: (chatId: string) => void;
  sendMessage: (chatId: string, content: string, type?: string) => void;
  updateChatStatus: (chatId: string, status: string) => void;
  assignChat: (chatId: string, assignedAgent: string) => void;
  setTyping: (chatId: string, isTyping: boolean) => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';
    
    const newSocket = io(socketUrl, {
      auth: {
        token
      },
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('Socket connected');
      setIsConnected(true);
      toast.success('เชื่อมต่อสำเร็จ');
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setIsConnected(false);
      toast.error('การเชื่อมต่อขาดหาย');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      toast.error('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
      toast.error(error.message || 'เกิดข้อผิดพลาด');
    });

    newSocket.on('new-chat', (data) => {
      toast.success(`แชทใหม่จาก ${data.chat.customerName}`);
    });

    newSocket.on('chat-assigned-to-you', (data) => {
      toast.success(`แชทถูกมอบหมายให้คุณ: ${data.chat.customerName}`);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user]);

  const joinChat = (chatId: string) => {
    if (socket && isConnected) {
      socket.emit('join-chat', chatId);
    }
  };

  const leaveChat = (chatId: string) => {
    if (socket && isConnected) {
      socket.emit('leave-chat', chatId);
    }
  };

  const sendMessage = (chatId: string, content: string, type = 'text') => {
    if (socket && isConnected) {
      socket.emit('send-message', { chatId, content, type });
    }
  };

  const updateChatStatus = (chatId: string, status: string) => {
    if (socket && isConnected) {
      socket.emit('update-chat-status', { chatId, status });
    }
  };

  const assignChat = (chatId: string, assignedAgent: string) => {
    if (socket && isConnected) {
      socket.emit('assign-chat', { chatId, assignedAgent });
    }
  };

  const setTyping = (chatId: string, isTyping: boolean) => {
    if (socket && isConnected) {
      socket.emit('typing', { chatId, isTyping });
    }
  };

  const value = {
    socket,
    isConnected,
    joinChat,
    leaveChat,
    sendMessage,
    updateChatStatus,
    assignChat,
    setTyping
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
