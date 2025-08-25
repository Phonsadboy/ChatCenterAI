# WebSocket CSP 错误解决方案

## 问题描述
浏览器拒绝连接到WebSocket服务器，出现以下错误：
```
Refused to connect to 'ws:<URL>/socket.io/?EIO=4&transport=websocket' because it violates the following Content Security Policy directive: "default-src 'self'"
```

## 原因分析
1. **内容安全策略（CSP）限制**：浏览器默认的CSP策略阻止了WebSocket连接
2. **端口不匹配**：前端和后端的端口配置不一致
3. **CORS配置问题**：WebSocket的CORS设置不正确

## 解决方案

### 1. 前端HTML CSP配置
在 `frontend/index.html` 中添加了CSP meta标签：
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' ws: wss: http: https:; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;" />
```

### 2. Vite代理配置
在 `frontend/vite.config.ts` 中添加了WebSocket代理：
```typescript
server: {
  port: 3000,
  cors: true,
  proxy: {
    '/socket.io': {
      target: 'http://localhost:3001',
      ws: true,
      changeOrigin: true
    }
  }
}
```

### 3. Socket连接配置
创建了 `frontend/src/config/socket.ts` 来集中管理Socket配置：
- 开发环境使用相对路径 `/socket.io`
- 生产环境使用环境变量 `VITE_SOCKET_URL`
- 添加了重连和错误处理选项

### 4. 后端CORS和CSP配置
在 `backend/src/index.ts` 中：
- 修复了CORS origin配置，支持多个端口
- 添加了Helmet CSP配置，允许WebSocket连接
- 改进了WebSocket CORS设置

## 使用方法

### 开发环境
1. 启动后端服务器（端口3001）
2. 启动前端开发服务器（端口3000）
3. Vite代理会自动处理WebSocket连接

### 生产环境
1. 设置环境变量 `VITE_SOCKET_URL` 为完整的WebSocket URL
2. 确保后端CORS配置包含前端域名

## 环境变量
```bash
# 前端
VITE_SOCKET_URL=/socket.io  # 开发环境
VITE_SOCKET_URL=https://your-domain.com/socket.io  # 生产环境

# 后端
FRONTEND_URL=https://your-domain.com
NODE_ENV=production
```

## 验证修复
1. 检查浏览器控制台是否还有CSP错误
2. 确认WebSocket连接状态
3. 测试实时功能是否正常工作

## 注意事项
- 开发环境使用代理可以避免CSP问题
- 生产环境需要正确配置CSP和CORS
- 确保前后端端口配置一致
- 定期检查安全策略设置
