import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useSocket } from '../contexts/SocketContext';
import { Send, User, Bot, Clock } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

interface Message {
  id: string;
  content: string;
  type: string;
  sender: 'customer' | 'agent' | 'ai';
  senderId?: string;
  senderName?: string;
  timestamp: Date;
}

interface Chat {
  _id: string;
  customerId: string;
  customerName: string;
  platform: string;
  platformId: string;
  status: string;
  assignedAgent?: {
    _id: string;
    name: string;
    email: string;
  };
  messages: Message[];
  lastMessageAt: Date;
  tags: string[];
  priority: string;
  aiResponses: number;
  humanResponses: number;
}

const Chat: React.FC = () => {
  const { chatId } = useParams<{ chatId: string }>();
  const [message, setMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const queryClient = useQueryClient();
  const { socket, joinChat, leaveChat, sendMessage, isConnected } = useSocket();

  const { data: chat, isLoading } = useQuery<Chat>(
    ['chat', chatId],
    async () => {
      const response = await axios.get(`/chat/${chatId}`);
      return response.data.data;
    },
    {
      enabled: !!chatId,
      refetchInterval: 5000,
    }
  );

  const sendMessageMutation = useMutation(
    async (content: string) => {
      await axios.post(`/chat/${chatId}/messages`, { content });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['chat', chatId]);
        setMessage('');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'เกิดข้อผิดพลาดในการส่งข้อความ');
      }
    }
  );

  const updateStatusMutation = useMutation(
    async (status: string) => {
      await axios.put(`/chat/${chatId}/status`, { status });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['chat', chatId]);
        toast.success('อัปเดตสถานะสำเร็จ');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'เกิดข้อผิดพลาดในการอัปเดตสถานะ');
      }
    }
  );

  useEffect(() => {
    if (chatId && isConnected) {
      joinChat(chatId);
      return () => {
        leaveChat(chatId);
      };
    }
  }, [chatId, isConnected]);

  useEffect(() => {
    if (socket) {
      socket.on('new-message', (data: { chatId: string; message: Message }) => {
        if (data.chatId === chatId) {
          queryClient.invalidateQueries(['chat', chatId]);
        }
      });

      socket.on('user-typing', (data: { userId: string; isTyping: boolean }) => {
        setIsTyping(data.isTyping);
      });

      return () => {
        socket.off('new-message');
        socket.off('user-typing');
      };
    }
  }, [socket, chatId, queryClient]);

  const handleSendMessage = () => {
    if (!message.trim()) return;
    
    sendMessageMutation.mutate(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'resolved':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusName = (status: string) => {
    switch (status) {
      case 'active':
        return 'กำลังดำเนินการ';
      case 'resolved':
        return 'เสร็จสิ้น';
      case 'pending':
        return 'รอดำเนินการ';
      case 'closed':
        return 'ปิด';
      default:
        return status;
    }
  };

  const getPlatformName = (platform: string) => {
    const platforms: Record<string, string> = {
      facebook: 'Facebook',
      line: 'LINE',
      telegram: 'Telegram',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      web: 'Web Chat'
    };
    return platforms[platform] || platform;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">ไม่พบแชทที่ต้องการ</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Chat Header */}
      <div className="bg-white border-b border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="h-10 w-10 bg-primary-600 rounded-full flex items-center justify-center">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{chat.customerName}</h2>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <span>{getPlatformName(chat.platform)}</span>
                <span>•</span>
                <span>ID: {chat.customerId}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={chat.status}
              onChange={(e) => updateStatusMutation.mutate(e.target.value)}
              className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusColor(chat.status)}`}
            >
              <option value="active">กำลังดำเนินการ</option>
              <option value="pending">รอดำเนินการ</option>
              <option value="resolved">เสร็จสิ้น</option>
              <option value="closed">ปิด</option>
            </select>
            {chat.assignedAgent && (
              <div className="text-sm text-gray-500">
                มอบหมายให้: {chat.assignedAgent.name}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {chat.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.sender === 'customer' ? 'justify-start' : 'justify-end'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                msg.sender === 'customer'
                  ? 'bg-white border border-gray-200'
                  : msg.sender === 'ai'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-primary-600 text-white'
              }`}
            >
              <div className="flex items-center space-x-2 mb-1">
                {msg.sender === 'ai' ? (
                  <Bot className="h-4 w-4" />
                ) : msg.sender === 'agent' ? (
                  <User className="h-4 w-4" />
                ) : null}
                <span className="text-xs font-medium">
                  {msg.sender === 'ai' ? 'AI Assistant' : msg.senderName || 'ลูกค้า'}
                </span>
              </div>
              <p className="text-sm">{msg.content}</p>
              <div className="flex items-center justify-end mt-1">
                <Clock className="h-3 w-3 text-gray-400 mr-1" />
                <span className="text-xs text-gray-400">
                  {format(new Date(msg.timestamp), 'HH:mm', { locale: th })}
                </span>
              </div>
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 px-4 py-2 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-sm text-gray-500">กำลังพิมพ์...</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="bg-white border-t border-gray-200 p-4">
        <div className="flex space-x-4">
          <div className="flex-1">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="พิมพ์ข้อความ..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
              rows={2}
            />
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!message.trim() || sendMessageMutation.isLoading}
            className="btn btn-primary px-6"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
