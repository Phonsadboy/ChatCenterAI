import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useForm } from 'react-hook-form';
import { 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  Filter,
  Save,
  X,
  Eye,
  EyeOff
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

interface Instruction {
  _id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  platforms: string[];
  isActive: boolean;
  priority: number;
  tags: string[];
  createdBy: {
    name: string;
    email: string;
  };
  updatedBy: {
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

interface InstructionFormData {
  name: string;
  description: string;
  content: string;
  category: string;
  platforms: string[];
  priority: number;
  tags: string[];
}

const Instructions: React.FC = () => {
  const [showForm, setShowForm] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<Instruction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState('');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm<InstructionFormData>();

  const platforms = watch('platforms') || [];

  const { data: instructions, isLoading } = useQuery<{ data: Instruction[]; total: number }>(
    ['instructions', searchTerm, selectedCategory, selectedPlatform, showActiveOnly],
    async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory) params.append('category', selectedCategory);
      if (selectedPlatform) params.append('platform', selectedPlatform);
      if (showActiveOnly) params.append('isActive', 'true');
      
      const response = await axios.get(`/instructions?${params.toString()}`);
      return response.data;
    }
  );

  const createMutation = useMutation(
    async (data: InstructionFormData) => {
      const response = await axios.post('/instructions', data);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('instructions');
        toast.success('สร้างคำแนะนำสำเร็จ');
        handleCloseForm();
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'เกิดข้อผิดพลาดในการสร้างคำแนะนำ');
      }
    }
  );

  const updateMutation = useMutation(
    async ({ id, data }: { id: string; data: Partial<InstructionFormData> }) => {
      const response = await axios.put(`/instructions/${id}`, data);
      return response.data;
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('instructions');
        toast.success('อัปเดตคำแนะนำสำเร็จ');
        handleCloseForm();
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'เกิดข้อผิดพลาดในการอัปเดตคำแนะนำ');
      }
    }
  );

  const deleteMutation = useMutation(
    async (id: string) => {
      await axios.delete(`/instructions/${id}`);
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('instructions');
        toast.success('ลบคำแนะนำสำเร็จ');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'เกิดข้อผิดพลาดในการลบคำแนะนำ');
      }
    }
  );

  const toggleStatusMutation = useMutation(
    async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await axios.put(`/instructions/${id}`, { isActive });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries('instructions');
        toast.success('อัปเดตสถานะสำเร็จ');
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'เกิดข้อผิดพลาดในการอัปเดตสถานะ');
      }
    }
  );

  const onSubmit = (data: InstructionFormData) => {
    if (editingInstruction) {
      updateMutation.mutate({ id: editingInstruction._id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (instruction: Instruction) => {
    setEditingInstruction(instruction);
    reset({
      name: instruction.name,
      description: instruction.description,
      content: instruction.content,
      category: instruction.category,
      platforms: instruction.platforms,
      priority: instruction.priority,
      tags: instruction.tags
    });
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('คุณแน่ใจหรือไม่ที่จะลบคำแนะนำนี้?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    toggleStatusMutation.mutate({ id, isActive: !currentStatus });
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingInstruction(null);
    reset();
  };

  const getCategoryName = (category: string) => {
    const categories: Record<string, string> = {
      greeting: 'ทักทาย',
      product: 'สินค้า',
      support: 'บริการลูกค้า',
      sales: 'ขาย',
      general: 'ทั่วไป',
      custom: 'กำหนดเอง'
    };
    return categories[category] || category;
  };

  const getPlatformName = (platform: string) => {
    const platforms: Record<string, string> = {
      facebook: 'Facebook',
      line: 'LINE',
      telegram: 'Telegram',
      instagram: 'Instagram',
      whatsapp: 'WhatsApp',
      web: 'Web'
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">คำแนะนำ AI</h1>
          <p className="text-gray-600">จัดการคำแนะนำสำหรับ AI ในการตอบกลับลูกค้า</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary"
        >
          <Plus className="h-4 w-4 mr-2" />
          เพิ่มคำแนะนำ
        </button>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="card-content">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ค้นหา</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ค้นหาคำแนะนำ..."
                  className="input pl-10"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">หมวดหมู่</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="input"
              >
                <option value="">ทั้งหมด</option>
                <option value="greeting">ทักทาย</option>
                <option value="product">สินค้า</option>
                <option value="support">บริการลูกค้า</option>
                <option value="sales">ขาย</option>
                <option value="general">ทั่วไป</option>
                <option value="custom">กำหนดเอง</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">แพลตฟอร์ม</label>
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="input"
              >
                <option value="">ทั้งหมด</option>
                <option value="facebook">Facebook</option>
                <option value="line">LINE</option>
                <option value="telegram">Telegram</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="web">Web</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="activeOnly"
                  checked={showActiveOnly}
                  onChange={(e) => setShowActiveOnly(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="activeOnly" className="ml-2 text-sm text-gray-700">
                  แสดงเฉพาะที่ใช้งาน
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Instructions Table */}
      <div className="card">
        <div className="card-content">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ชื่อ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    หมวดหมู่
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    แพลตฟอร์ม
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ลำดับความสำคัญ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    สถานะ
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    การดำเนินการ
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {instructions?.data.map((instruction) => (
                  <tr key={instruction._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{instruction.name}</div>
                        <div className="text-sm text-gray-500">{instruction.description}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                        {getCategoryName(instruction.category)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {instruction.platforms.map((platform) => (
                          <span
                            key={platform}
                            className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800"
                          >
                            {getPlatformName(platform)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {instruction.priority}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleStatus(instruction._id, instruction.isActive)}
                        className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${
                          instruction.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {instruction.isActive ? (
                          <>
                            <Eye className="h-3 w-3 mr-1" />
                            ใช้งาน
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3 w-3 mr-1" />
                            ไม่ใช้งาน
                          </>
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleEdit(instruction)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(instruction._id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-1/2 shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {editingInstruction ? 'แก้ไขคำแนะนำ' : 'เพิ่มคำแนะนำใหม่'}
              </h3>
              <button
                onClick={handleCloseForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ชื่อคำแนะนำ *
                </label>
                <input
                  {...register('name', { required: 'กรุณากรอกชื่อคำแนะนำ' })}
                  type="text"
                  className="input"
                  placeholder="ชื่อคำแนะนำ"
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  คำอธิบาย *
                </label>
                <input
                  {...register('description', { required: 'กรุณากรอกคำอธิบาย' })}
                  type="text"
                  className="input"
                  placeholder="คำอธิบายสั้นๆ"
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  เนื้อหา *
                </label>
                <textarea
                  {...register('content', { required: 'กรุณากรอกเนื้อหา' })}
                  rows={4}
                  className="input"
                  placeholder="เนื้อหาคำแนะนำสำหรับ AI"
                />
                {errors.content && (
                  <p className="mt-1 text-sm text-red-600">{errors.content.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    หมวดหมู่ *
                  </label>
                  <select
                    {...register('category', { required: 'กรุณาเลือกหมวดหมู่' })}
                    className="input"
                  >
                    <option value="">เลือกหมวดหมู่</option>
                    <option value="greeting">ทักทาย</option>
                    <option value="product">สินค้า</option>
                    <option value="support">บริการลูกค้า</option>
                    <option value="sales">ขาย</option>
                    <option value="general">ทั่วไป</option>
                    <option value="custom">กำหนดเอง</option>
                  </select>
                  {errors.category && (
                    <p className="mt-1 text-sm text-red-600">{errors.category.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ลำดับความสำคัญ
                  </label>
                  <input
                    {...register('priority', { valueAsNumber: true, min: 1, max: 10 })}
                    type="number"
                    min="1"
                    max="10"
                    className="input"
                    placeholder="1-10"
                  />
                  {errors.priority && (
                    <p className="mt-1 text-sm text-red-600">{errors.priority.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  แพลตฟอร์ม *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {['facebook', 'line', 'telegram', 'instagram', 'whatsapp', 'web'].map((platform) => (
                    <label key={platform} className="flex items-center">
                      <input
                        type="checkbox"
                        value={platform}
                        {...register('platforms', { required: 'กรุณาเลือกอย่างน้อย 1 แพลตฟอร์ม' })}
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                      <span className="ml-2 text-sm text-gray-700">{getPlatformName(platform)}</span>
                    </label>
                  ))}
                </div>
                {errors.platforms && (
                  <p className="mt-1 text-sm text-red-600">{errors.platforms.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  แท็ก (คั่นด้วยเครื่องหมายจุลภาค)
                </label>
                <input
                  {...register('tags')}
                  type="text"
                  className="input"
                  placeholder="แท็ก1, แท็ก2, แท็ก3"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="btn btn-outline"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isLoading || updateMutation.isLoading}
                  className="btn btn-primary"
                >
                  {createMutation.isLoading || updateMutation.isLoading ? (
                    'กำลังบันทึก...'
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      {editingInstruction ? 'อัปเดต' : 'สร้าง'}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Instructions;
