import React from 'react';
import { useQuery } from 'react-query';
import { 
  MessageSquare, 
  Users, 
  Clock, 
  TrendingUp,
  Facebook,
  MessageCircle,
  Smartphone
} from 'lucide-react';
import axios from 'axios';

interface DashboardStats {
  totalChats: number;
  activeChats: number;
  resolvedChats: number;
  pendingChats: number;
  newChatsToday: number;
  totalAIResponses: number;
  totalHumanResponses: number;
}

interface PlatformStats {
  id: string;
  name: string;
  totalChats: number;
  activeChats: number;
  avgResponseTime: number;
  satisfactionRate: number;
}

const Dashboard: React.FC = () => {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>(
    'dashboard-stats',
    async () => {
      const response = await axios.get('/chat/stats/overview');
      return response.data.data;
    },
    {
      refetchInterval: 30000, // Refetch every 30 seconds
    }
  );

  const { data: platformStats, isLoading: platformLoading } = useQuery<PlatformStats[]>(
    'platform-stats',
    async () => {
      const platforms = ['facebook', 'line', 'telegram', 'instagram', 'whatsapp', 'web'];
      const stats = await Promise.all(
        platforms.map(async (platform) => {
          try {
            const response = await axios.get(`/platforms/${platform}/stats`);
            return {
              id: platform,
              name: getPlatformName(platform),
              ...response.data.data
            };
          } catch (error) {
            return {
              id: platform,
              name: getPlatformName(platform),
              totalChats: 0,
              activeChats: 0,
              avgResponseTime: 0,
              satisfactionRate: 0
            };
          }
        })
      );
      return stats;
    },
    {
      refetchInterval: 60000, // Refetch every minute
    }
  );

  const getPlatformName = (platform: string): string => {
    const names: Record<string, string> = {
      facebook: 'Facebook',
      line: 'LINE',
      telegram: 'Telegram',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      web: 'Web Chat'
    };
    return names[platform] || platform;
  };

  const getPlatformIcon = (platform: string) => {
    const icons: Record<string, React.ComponentType> = {
      facebook: Facebook,
      line: MessageCircle,
      telegram: MessageCircle,
      instagram: Smartphone,
      whatsapp: Smartphone,
      web: MessageSquare
    };
    return icons[platform] || MessageSquare;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-600 bg-green-100';
      case 'resolved':
        return 'text-blue-600 bg-blue-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  if (statsLoading || platformLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">แดชบอร์ด</h1>
        <p className="text-gray-600">ภาพรวมของระบบแชทและ AI</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <MessageSquare className="h-8 w-8 text-primary-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">แชททั้งหมด</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalChats || 0}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">แชทที่กำลังดำเนินการ</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.activeChats || 0}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">แชทใหม่วันนี้</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.newChatsToday || 0}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-content">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">การตอบกลับ AI</p>
                <p className="text-2xl font-bold text-gray-900">{stats?.totalAIResponses || 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">สถิติตามแพลตฟอร์ม</h3>
            <p className="card-description">ภาพรวมการใช้งานในแต่ละแพลตฟอร์ม</p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              {platformStats?.map((platform) => {
                const Icon = getPlatformIcon(platform.id);
                return (
                  <div key={platform.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center">
                      <Icon className="h-6 w-6 text-primary-600 mr-3" />
                      <div>
                        <p className="font-medium text-gray-900">{platform.name}</p>
                        <p className="text-sm text-gray-500">
                          {platform.activeChats} แชทที่กำลังดำเนินการ
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-gray-900">{platform.totalChats}</p>
                      <p className="text-sm text-gray-500">แชททั้งหมด</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">สถานะแชท</h3>
            <p className="card-description">การกระจายของแชทตามสถานะ</p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <div className="h-3 w-3 bg-green-500 rounded-full mr-3"></div>
                  <span className="font-medium text-gray-900">กำลังดำเนินการ</span>
                </div>
                <span className="font-bold text-gray-900">{stats?.activeChats || 0}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div className="flex items-center">
                  <div className="h-3 w-3 bg-blue-500 rounded-full mr-3"></div>
                  <span className="font-medium text-gray-900">เสร็จสิ้น</span>
                </div>
                <span className="font-bold text-gray-900">{stats?.resolvedChats || 0}</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                <div className="flex items-center">
                  <div className="h-3 w-3 bg-yellow-500 rounded-full mr-3"></div>
                  <span className="font-medium text-gray-900">รอดำเนินการ</span>
                </div>
                <span className="font-bold text-gray-900">{stats?.pendingChats || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">กิจกรรมล่าสุด</h3>
          <p className="card-description">การตอบกลับและกิจกรรมล่าสุดในระบบ</p>
        </div>
        <div className="card-content">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-primary-100 rounded-full flex items-center justify-center mr-3">
                  <MessageSquare className="h-4 w-4 text-primary-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">การตอบกลับ AI</p>
                  <p className="text-sm text-gray-500">
                    AI ได้ตอบกลับลูกค้าแล้ว {stats?.totalAIResponses || 0} ครั้ง
                  </p>
                </div>
              </div>
              <span className="text-sm text-gray-500">วันนี้</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center mr-3">
                  <Users className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">การตอบกลับมนุษย์</p>
                  <p className="text-sm text-gray-500">
                    เจ้าหน้าที่ได้ตอบกลับลูกค้าแล้ว {stats?.totalHumanResponses || 0} ครั้ง
                  </p>
                </div>
              </div>
              <span className="text-sm text-gray-500">วันนี้</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
