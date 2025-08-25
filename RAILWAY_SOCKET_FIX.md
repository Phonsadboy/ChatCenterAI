# Railway Socket.io 部署修复指南

## 问题描述
在 Railway 部署环境中出现 "Invalid namespace" 错误，这通常是由于 Socket.io 客户端和服务器端配置不匹配导致的。

## 解决方案

### 1. 环境变量配置

在 Railway 项目设置中添加以下环境变量：

#### 后端环境变量 (Backend Service)
```
NODE_ENV=production
FRONTEND_URL=https://your-frontend-app-name.railway.app
PORT=3001
```

#### 前端环境变量 (Frontend Service)
```
VITE_SOCKET_URL=https://your-backend-app-name.railway.app
VITE_API_URL=https://your-backend-app-name.railway.app/api
```

### 2. 代码修复

已完成的修复包括：

#### 前端修复 (`frontend/src/config/socket.ts`)
- 更新 `getSocketUrl()` 函数以正确处理生产环境 URL
- 使用 `window.location.origin` 作为默认值

#### 前端修复 (`frontend/src/contexts/SocketContext.tsx`)
- 添加额外的调试头部信息
- 确保连接参数正确

#### 后端修复 (`backend/src/index.ts`)
- 更新 CORS 配置以支持 Railway 域名
- 添加对 `X-Client-Type` 头部的支持

### 3. 验证步骤

1. 确保两个服务都已部署到 Railway
2. 检查环境变量是否正确设置
3. 打开浏览器开发者工具，查看控制台日志
4. 确认 Socket.io 连接成功

### 4. 调试信息

在浏览器控制台中，您应该看到：
```
Connecting to Socket.io at: https://your-backend-app-name.railway.app
Socket connected
```

如果仍然出现错误，请检查：
- Railway 服务的域名是否正确
- 环境变量是否已正确设置
- 网络连接是否正常

### 5. 常见问题

#### 问题：仍然出现 "Invalid namespace" 错误
**解决方案：**
- 确保 `VITE_SOCKET_URL` 环境变量指向正确的后端服务 URL
- 检查后端服务的 CORS 配置是否包含前端域名

#### 问题：连接超时
**解决方案：**
- 检查 Railway 服务的健康状态
- 确认端口配置正确
- 验证网络连接

#### 问题：CORS 错误
**解决方案：**
- 确保 `FRONTEND_URL` 环境变量设置正确
- 检查 CORS 配置是否包含所有必要的域名

## 部署检查清单

- [ ] 后端服务已部署到 Railway
- [ ] 前端服务已部署到 Railway
- [ ] 环境变量已正确设置
- [ ] CORS 配置已更新
- [ ] Socket.io 连接测试通过
- [ ] 功能测试通过
