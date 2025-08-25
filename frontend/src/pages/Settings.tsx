import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const Settings: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ตั้งค่า</h1>
        <p className="text-gray-600">จัดการการตั้งค่าระบบและบัญชีผู้ใช้</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Profile */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">ข้อมูลผู้ใช้</h3>
            <p className="card-description">ข้อมูลส่วนตัวและบัญชีผู้ใช้</p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ</label>
                <p className="text-gray-900">{user?.name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">อีเมล</label>
                <p className="text-gray-900">{user?.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">บทบาท</label>
                <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-primary-100 text-primary-800">
                  {user?.role === 'admin' ? 'ผู้ดูแลระบบ' : user?.role === 'agent' ? 'เจ้าหน้าที่' : 'ผู้ดู'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">สถานะระบบ</h3>
            <p className="card-description">สถานะการทำงานของระบบ</p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">ฐานข้อมูล</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  เชื่อมต่อแล้ว
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">AI Service</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  พร้อมใช้งาน
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Real-time Chat</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  ทำงานปกติ
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Platform Configuration */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">การตั้งค่าแพลตฟอร์ม</h3>
            <p className="card-description">จัดการการเชื่อมต่อแพลตฟอร์มต่างๆ</p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Facebook Messenger</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                  ต้องตั้งค่า
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">LINE</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                  ต้องตั้งค่า
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Telegram</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                  ต้องตั้งค่า
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Web Chat</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  พร้อมใช้งาน
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* AI Configuration */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">การตั้งค่า AI</h3>
            <p className="card-description">จัดการการตั้งค่า AI และคำแนะนำ</p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">OpenAI API</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                  ต้องตั้งค่า
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">คำแนะนำ AI</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  พร้อมใช้งาน
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Auto Response</span>
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                  เปิดใช้งาน
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">การดำเนินการด่วน</h3>
          <p className="card-description">การดำเนินการที่ใช้บ่อย</p>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="btn btn-outline">
              จัดการคำแนะนำ AI
            </button>
            <button className="btn btn-outline">
              ตั้งค่าแพลตฟอร์ม
            </button>
            <button className="btn btn-outline">
              ดูบันทึกระบบ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
