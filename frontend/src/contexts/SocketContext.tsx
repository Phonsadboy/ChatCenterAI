import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';
import { socketConfig, getSocketUrl } from '../config/socket';

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
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    
    console.log('Connecting to Socket.io at:', socketUrl);
    
    const newSocket = io(socketUrl, {
      ...socketConfig.options,
      // 确保连接选项正确
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: true,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // 添加额外的调试信息
      extraHeaders: {
        'X-Client-Type': 'web'
      }
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
  }, []);

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
