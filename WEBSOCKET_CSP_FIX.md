# WebSocket CSP 错误解决方案

## 问题描述
浏览器拒绝连接到WebSocket服务器，出现以下错误：
```
Refused to connect to 'ws:<URL>/socket.io/?EIO=4&transport=websocket' because it violates the following Content Security Policy directive: "default-src 'self'"
```

以及Google Fonts加载错误：
```
Refused to load the stylesheet 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap' because it violates the following Content Security Policy directive: "style-src 'self' 'unsafe-inline'"
```

## 原因分析
1. **内容安全策略（CSP）限制**：浏览器默认的CSP策略阻止了WebSocket连接和外部资源加载
2. **端口不匹配**：前端和后端的端口配置不一致
3. **CORS配置问题**：WebSocket的CORS设置不正确
4. **Socket命名空间错误**：连接到了错误的Socket端点
5. **代理配置问题**：Vite代理可能导致WebSocket连接问题

## 解决方案

### 1. 前端HTML CSP配置
在 `frontend/index.html` 中添加了完整的CSP meta标签：
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ws: wss: http: https:; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:;" />
```

### 2. 直接连接后端（推荐方案）
移除了Vite代理配置，前端直接连接到后端：
```typescript
// frontend/src/config/socket.ts
export const getSocketUrl = () => {
  if (import.meta.env.DEV) {
    // 开发环境直接连接后端
    return 'http://localhost:3001';
  }
  return import.meta.env.VITE_SOCKET_URL || '/socket.io';
};
```

### 3. Socket连接配置优化
创建了 `frontend/src/config/socket.ts` 来集中管理Socket配置：
- 开发环境直接连接到 `http://localhost:3001`
- 生产环境使用环境变量 `VITE_SOCKET_URL`
- 添加了重连和错误处理选项
- 确保使用正确的Socket路径和传输方式

### 4. 后端CORS和CSP配置
在 `backend/src/index.ts` 中：
- 修复了CORS origin配置，支持多个端口
- 添加了Helmet CSP配置，允许WebSocket连接和Google Fonts
- 改进了WebSocket CORS设置
- 添加了必要的HTTP方法和头部支持

### 5. Socket连接调试
- 在 `frontend/src/contexts/SocketContext.tsx` 中添加了详细的连接日志
- 创建了 `frontend/src/components/SocketTest.tsx` 测试组件
- 在后端添加了测试事件处理

## 使用方法

### 开发环境
1. 启动后端服务器（端口3001）
2. 启动前端开发服务器（端口3000）
3. 前端直接连接到后端，不使用代理
4. 使用SocketTest组件测试连接状态

### 生产环境
1. 设置环境变量 `VITE_SOCKET_URL` 为完整的WebSocket URL
2. 确保后端CORS配置包含前端域名

## 环境变量
```bash
# 前端
VITE_SOCKET_URL=http://localhost:3001  # 开发环境
VITE_SOCKET_URL=https://your-domain.com  # 生产环境

# 后端
FRONTEND_URL=https://your-domain.com
NODE_ENV=production
```

## 验证修复
1. 检查浏览器控制台是否还有CSP错误
2. 确认WebSocket连接状态
3. 使用SocketTest组件测试连接
4. 测试实时功能是否正常工作

## 测试组件
使用 `SocketTest` 组件来调试Socket连接：
- 显示连接状态和Socket ID
- 显示传输方式（WebSocket/Polling）
- 提供测试连接按钮
- 显示最后收到的事件

## 故障排除

### 如果仍然出现CSP错误：
1. 清除浏览器缓存和Cookie
2. 检查是否有其他CSP策略（如服务器端设置）
3. 确保HTML文件中的CSP meta标签正确

### 如果Socket连接失败：
1. 确认后端服务器正在运行
2. 检查端口3001是否被占用
3. 查看浏览器控制台的详细错误信息
4. 使用SocketTest组件诊断连接问题

## 注意事项
- 开发环境直接连接可以避免代理问题
- 生产环境需要正确配置CSP和CORS
- 确保前后端端口配置一致
- 定期检查安全策略设置
- 使用测试组件验证连接状态
- 清除浏览器缓存以应用新的CSP策略
