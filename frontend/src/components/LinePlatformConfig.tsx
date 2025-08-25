import React, { useState, useEffect } from 'react';

interface LineConfig {
  channelAccessToken: string;
  channelSecret: string;
  name: string;
  isActive: boolean;
}

interface LinePlatformConfigProps {
  onSave: (config: LineConfig) => void;
  onTest: () => void;
  initialConfig?: LineConfig;
  isLoading?: boolean;
}

const LinePlatformConfig: React.FC<LinePlatformConfigProps> = ({
  onSave,
  onTest,
  initialConfig,
  isLoading = false
}) => {
  const [config, setConfig] = useState<LineConfig>({
    channelAccessToken: '',
    channelSecret: '',
    name: '',
    isActive: false,
    ...initialConfig
  });

  const [showSecrets, setShowSecrets] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig);
    }
  }, [initialConfig]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!config.name.trim()) {
      newErrors.name = 'กรุณาระบุชื่อเพจ';
    }

    if (!config.channelAccessToken.trim()) {
      newErrors.channelAccessToken = 'กรุณาระบุ Channel Access Token';
    } else if (config.channelAccessToken.length < 50) {
      newErrors.channelAccessToken = 'Channel Access Token ต้องมีความยาวอย่างน้อย 50 ตัวอักษร';
    }

    if (!config.channelSecret.trim()) {
      newErrors.channelSecret = 'กรุณาระบุ Channel Secret';
    } else if (config.channelSecret.length < 20) {
      newErrors.channelSecret = 'Channel Secret ต้องมีความยาวอย่างน้อย 20 ตัวอักษร';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) {
      onSave(config);
    }
  };

  const handleInputChange = (field: keyof LineConfig, value: string | boolean) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
          <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">LINE Official Account</h3>
          <p className="text-sm text-gray-600">เชื่อมต่อกับ LINE Official Account เพื่อรับข้อความ</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Page Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            ชื่อเพจ <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={config.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
              errors.name ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="เช่น บริษัท ABC, ร้านค้า XYZ"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name}</p>
          )}
        </div>

        {/* Channel Access Token */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Channel Access Token <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showSecrets ? 'text' : 'password'}
              value={config.channelAccessToken}
              onChange={(e) => handleInputChange('channelAccessToken', e.target.value)}
              className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                errors.channelAccessToken ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="กรอก Channel Access Token จาก LINE Developers"
            />
            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showSecrets ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {errors.channelAccessToken && (
            <p className="mt-1 text-sm text-red-600">{errors.channelAccessToken}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            หาได้จาก LINE Developers Console → Channel → Messaging API → Channel access token
          </p>
        </div>

        {/* Channel Secret */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Channel Secret <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type={showSecrets ? 'text' : 'password'}
              value={config.channelSecret}
              onChange={(e) => handleInputChange('channelSecret', e.target.value)}
              className={`w-full px-3 py-2 pr-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 ${
                errors.channelSecret ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="กรอก Channel Secret จาก LINE Developers"
            />
            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showSecrets ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {errors.channelSecret && (
            <p className="mt-1 text-sm text-red-600">{errors.channelSecret}</p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            หาได้จาก LINE Developers Console → Channel → Basic settings → Channel secret
          </p>
        </div>

        {/* Active Status */}
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isActive"
            checked={config.isActive}
            onChange={(e) => handleInputChange('isActive', e.target.checked)}
            className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
          />
          <label htmlFor="isActive" className="ml-2 block text-sm text-gray-700">
            เปิดใช้งานการเชื่อมต่อ LINE
          </label>
        </div>

        {/* Setup Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">วิธีการตั้งค่า LINE Official Account</h4>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>ไปที่ <a href="https://developers.line.biz/" target="_blank" rel="noopener noreferrer" className="underline">LINE Developers Console</a></li>
            <li>สร้าง Channel ใหม่หรือเลือก Channel ที่มีอยู่</li>
            <li>ในส่วน Messaging API ให้เปิดใช้งาน</li>
            <li>คัดลอก Channel Access Token และ Channel Secret มาใส่ด้านบน</li>
            <li>ตั้งค่า Webhook URL เป็น: <code className="bg-blue-100 px-1 rounded">https://your-domain.com/api/webhooks/line</code></li>
            <li>เปิดใช้งาน "Use webhook" ใน LINE Developers Console</li>
          </ol>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={isLoading || !config.channelAccessToken || !config.channelSecret}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ทดสอบการเชื่อมต่อ
          </button>
        </div>
      </form>
    </div>
  );
};

export default LinePlatformConfig;
