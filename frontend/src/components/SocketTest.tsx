import React, { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';

export const SocketTest: React.FC = () => {
  const { socket, isConnected } = useSocket();
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [lastEvent, setLastEvent] = useState<string>('');

  useEffect(() => {
    if (socket) {
      // 监听连接状态变化
      socket.on('connect', () => {
        setConnectionStatus('Connected');
        setLastEvent('Connected to server');
      });

      socket.on('disconnect', () => {
        setConnectionStatus('Disconnected');
        setLastEvent('Disconnected from server');
      });

      socket.on('connect_error', (error) => {
        setConnectionStatus('Connection Error');
        setLastEvent(`Connection error: ${error.message}`);
      });

      socket.on('error', (error) => {
        setConnectionStatus('Socket Error');
        setLastEvent(`Socket error: ${error.message}`);
      });

      // 测试事件
      socket.on('test-response', (data) => {
        setLastEvent(`Test response: ${JSON.stringify(data)}`);
      });
    }
  }, [socket]);

  const testConnection = () => {
    if (socket && isConnected) {
      socket.emit('test-event', { message: 'Hello from client' });
      setLastEvent('Sent test event');
    }
  };

  const getConnectionInfo = () => {
    if (socket) {
      return {
        id: socket.id,
        connected: socket.connected,
        disconnected: socket.disconnected,
        transport: socket.io.engine.transport.name
      };
    }
    return null;
  };

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Socket.io 连接测试</h3>
      
      <div className="space-y-3">
        <div>
          <span className="font-medium">连接状态: </span>
          <span className={`px-2 py-1 rounded text-sm ${
            isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {connectionStatus}
          </span>
        </div>

        <div>
          <span className="font-medium">Socket ID: </span>
          <span className="font-mono text-sm">{getConnectionInfo()?.id || 'N/A'}</span>
        </div>

        <div>
          <span className="font-medium">传输方式: </span>
          <span className="font-mono text-sm">{getConnectionInfo()?.transport || 'N/A'}</span>
        </div>

        <div>
          <span className="font-medium">最后事件: </span>
          <span className="text-sm text-gray-600">{lastEvent}</span>
        </div>

        <button
          onClick={testConnection}
          disabled={!isConnected}
          className={`px-4 py-2 rounded ${
            isConnected 
              ? 'bg-blue-500 hover:bg-blue-600 text-white' 
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          测试连接
        </button>
      </div>
    </div>
  );
};
