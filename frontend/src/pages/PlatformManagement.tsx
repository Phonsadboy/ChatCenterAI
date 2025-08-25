import React, { useState, useEffect } from 'react';
import LinePlatformConfig from '../components/LinePlatformConfig';

interface Platform {
  id: string;
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
  hasConfig: boolean;
  config?: any;
}

interface LineConfig {
  channelAccessToken: string;
  channelSecret: string;
  name: string;
  isActive: boolean;
}

const PlatformManagement: React.FC = () => {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    data?: any;
  } | null>(null);

  useEffect(() => {
    fetchPlatforms();
  }, []);

  const fetchPlatforms = async () => {
    try {
      const response = await fetch('/api/platforms');
      const data = await response.json();
      
      if (data.success) {
        setPlatforms(data.data);
      }
    } catch (error) {
      console.error('Error fetching platforms:', error);
    }
  };

  const handleSaveLineConfig = async (config: LineConfig) => {
    setIsLoading(true);
    try {
      const userId = 'system';
      const platformData = {
        userId,
        platformType: 'line' as const,
        name: config.name,
        credentials: {
          channelAccessToken: config.channelAccessToken,
          channelSecret: config.channelSecret
        },
        webhookUrl: `${window.location.origin}/api/webhooks/line`
      };

      // ตรวจสอบว่ามี Line platform อยู่แล้วหรือไม่
      const existingLine = platforms.find(p => p.id === 'line');
      
      let response;
      if (existingLine?.config) {
        // อัปเดต platform ที่มีอยู่
        response = await fetch(`/api/platforms/${existingLine.config._id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            name: config.name,
            isActive: config.isActive,
            credentials: {
              channelAccessToken: config.channelAccessToken,
              channelSecret: config.channelSecret
            }
          })
        });
      } else {
        // สร้าง platform ใหม่
        response = await fetch('/api/platforms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(platformData)
        });
      }

      const result = await response.json();
      
      if (result.success) {
        alert('บันทึกการตั้งค่า LINE สำเร็จ!');
        fetchPlatforms(); // รีเฟรชข้อมูล
        setSelectedPlatform(null);
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error saving LINE config:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestLineConnection = async () => {
    const linePlatform = platforms.find(p => p.id === 'line');
    if (!linePlatform?.config) {
      alert('กรุณาตั้งค่า LINE ก่อนทดสอบการเชื่อมต่อ');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/platforms/${linePlatform.config._id}/test`, {
        method: 'POST'
      });
      
      const result = await response.json();
      setTestResult(result);
      
      if (result.success) {
        alert('การทดสอบการเชื่อมต่อสำเร็จ!');
      } else {
        alert('การทดสอบการเชื่อมต่อล้มเหลว: ' + result.error);
      }
    } catch (error) {
      console.error('Error testing LINE connection:', error);
      alert('เกิดข้อผิดพลาดในการทดสอบการเชื่อมต่อ');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTogglePlatform = async (platformId: string) => {
    const platform = platforms.find(p => p.id === platformId);
    if (!platform?.config) {
      alert('กรุณาตั้งค่าแพลตฟอร์มก่อนเปิดใช้งาน');
      return;
    }

    try {
      const response = await fetch(`/api/platforms/${platform.config._id}/toggle`, {
        method: 'PATCH'
      });
      
      const result = await response.json();
      
      if (result.success) {
        fetchPlatforms(); // รีเฟรชข้อมูล
      } else {
        alert('เกิดข้อผิดพลาด: ' + result.error);
      }
    } catch (error) {
      console.error('Error toggling platform:', error);
      alert('เกิดข้อผิดพลาดในการเปลี่ยนสถานะแพลตฟอร์ม');
    }
  };

  const getPlatformIcon = (icon: string) => {
    const iconMap: Record<string, string> = {
      facebook: '📘',
      line: '💬',
      telegram: '📱',
      instagram: '📷',
      whatsapp: '📞',
      web: '🌐'
    };
    return iconMap[icon] || '📱';
  };

  const getInitialLineConfig = (): LineConfig | undefined => {
    const linePlatform = platforms.find(p => p.id === 'line');
    if (linePlatform?.config) {
      return {
        channelAccessToken: linePlatform.config.credentials.channelAccessToken || '',
        channelSecret: linePlatform.config.credentials.channelSecret || '',
        name: linePlatform.config.name || '',
        isActive: linePlatform.config.isActive || false
      };
    }
    return undefined;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">จัดการแพลตฟอร์ม</h1>
        <p className="text-gray-600">ตั้งค่าและจัดการการเชื่อมต่อแพลตฟอร์มต่างๆ</p>
      </div>

      {/* Platform List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {platforms.map((platform) => (
          <div
            key={platform.id}
            className={`card cursor-pointer transition-all duration-200 hover:shadow-md ${
              selectedPlatform === platform.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => setSelectedPlatform(platform.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div 
                  className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                  style={{ backgroundColor: platform.color + '20' }}
                >
                  {getPlatformIcon(platform.icon)}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{platform.name}</h3>
                  <p className="text-sm text-gray-600">
                    {platform.hasConfig ? 'ตั้งค่าแล้ว' : 'ยังไม่ได้ตั้งค่า'}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span
                  className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                    platform.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {platform.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </span>
                {platform.hasConfig && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTogglePlatform(platform.id);
                    }}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {platform.isActive ? 'ปิด' : 'เปิด'}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Platform Configuration */}
      {selectedPlatform && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              ตั้งค่า {platforms.find(p => p.id === selectedPlatform)?.name}
            </h2>
            <button
              onClick={() => setSelectedPlatform(null)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {selectedPlatform === 'line' && (
            <LinePlatformConfig
              onSave={handleSaveLineConfig}
              onTest={handleTestLineConnection}
              initialConfig={getInitialLineConfig()}
              isLoading={isLoading}
            />
          )}

          {selectedPlatform === 'facebook' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-yellow-900 mb-2">Facebook Messenger</h3>
              <p className="text-yellow-800">
                การตั้งค่า Facebook Messenger จะพร้อมใช้งานในเร็วๆ นี้
              </p>
            </div>
          )}

          {selectedPlatform === 'telegram' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-yellow-900 mb-2">Telegram</h3>
              <p className="text-yellow-800">
                การตั้งค่า Telegram จะพร้อมใช้งานในเร็วๆ นี้
              </p>
            </div>
          )}

          {selectedPlatform === 'instagram' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-yellow-900 mb-2">Instagram</h3>
              <p className="text-yellow-800">
                การตั้งค่า Instagram จะพร้อมใช้งานในเร็วๆ นี้
              </p>
            </div>
          )}

          {selectedPlatform === 'whatsapp' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-yellow-900 mb-2">WhatsApp</h3>
              <p className="text-yellow-800">
                การตั้งค่า WhatsApp จะพร้อมใช้งานในเร็วๆ นี้
              </p>
            </div>
          )}

          {selectedPlatform === 'web' && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <h3 className="text-lg font-medium text-green-900 mb-2">Web Chat</h3>
              <p className="text-green-800">
                Web Chat พร้อมใช้งานแล้ว! ผู้ใช้สามารถแชทผ่านเว็บไซต์ได้ทันที
              </p>
            </div>
          )}
        </div>
      )}

      {/* Test Result */}
      {testResult && (
        <div className={`mt-4 p-4 rounded-md ${
          testResult.success 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-red-50 border border-red-200'
        }`}>
          <h4 className={`font-medium mb-2 ${
            testResult.success ? 'text-green-900' : 'text-red-900'
          }`}>
            ผลการทดสอบการเชื่อมต่อ
          </h4>
          <p className={testResult.success ? 'text-green-800' : 'text-red-800'}>
            {testResult.message}
          </p>
          {testResult.data?.profile && (
            <div className="mt-2 text-sm text-gray-600">
              <p>Bot Name: {testResult.data.profile.displayName}</p>
              <p>Bot ID: {testResult.data.profile.userId}</p>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-6">
        <h3 className="text-lg font-medium text-blue-900 mb-3">คำแนะนำการใช้งาน</h3>
        <div className="space-y-2 text-blue-800">
          <p>• เลือกแพลตฟอร์มที่ต้องการตั้งค่า</p>
          <p>• กรอกข้อมูลการเชื่อมต่อตามที่แพลตฟอร์มกำหนด</p>
          <p>• ทดสอบการเชื่อมต่อก่อนใช้งานจริง</p>
          <p>• เปิดใช้งานแพลตฟอร์มเมื่อพร้อมใช้งาน</p>
        </div>
      </div>
    </div>
  );
};

export default PlatformManagement;
