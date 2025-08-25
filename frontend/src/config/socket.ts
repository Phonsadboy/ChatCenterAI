export const socketConfig = {
  // 开发环境使用相对路径，让Vite代理处理
  url: import.meta.env.VITE_SOCKET_URL || '/socket.io',
  
  // Socket.io 连接选项
  options: {
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
    // 确保不使用命名空间，使用默认路径
    path: '/socket.io/',
    // 添加额外的连接选项
    withCredentials: true
  }
};

export const getSocketUrl = () => {
  // 根据环境返回适当的Socket URL
  if (import.meta.env.DEV) {
    // 开发环境使用完整的本地URL，避免代理问题
    return 'http://localhost:3001';
  }
  
  // 生产环境使用环境变量或默认值
  return import.meta.env.VITE_SOCKET_URL || '/socket.io';
};
