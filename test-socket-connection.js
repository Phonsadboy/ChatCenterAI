// Socket.io 连接测试脚本
// 在浏览器控制台中运行此脚本来测试连接

const testSocketConnection = () => {
  // 获取当前页面的 Socket.io 客户端
  const socket = window.socket || window.io?.connect();
  
  if (!socket) {
    console.error('Socket.io 客户端未找到');
    return;
  }

  console.log('开始测试 Socket.io 连接...');
  
  // 监听连接事件
  socket.on('connect', () => {
    console.log('✅ 连接成功!');
    console.log('Socket ID:', socket.id);
    console.log('传输方式:', socket.io.engine.transport.name);
  });

  socket.on('disconnect', () => {
    console.log('❌ 连接断开');
  });

  socket.on('connect_error', (error) => {
    console.error('❌ 连接错误:', error);
  });

  socket.on('error', (error) => {
    console.error('❌ Socket 错误:', error);
  });

  // 测试事件
  socket.on('test-response', (data) => {
    console.log('✅ 收到测试响应:', data);
  });

  // 发送测试事件
  setTimeout(() => {
    if (socket.connected) {
      console.log('发送测试事件...');
      socket.emit('test-event', { message: 'Hello from test script' });
    }
  }, 1000);
};

// 运行测试
testSocketConnection();
