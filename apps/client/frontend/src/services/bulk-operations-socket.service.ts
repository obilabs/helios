import { io, Socket } from 'socket.io-client';
import { wsUrl } from '../config/api';

export interface BulkOperationProgressEvent {
  bulkOperationId: string;
  organizationId: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  progress: number;
}

export interface BulkOperationFailureEvent extends BulkOperationProgressEvent {
  error: string;
}

type ProgressCallback = (data: BulkOperationProgressEvent) => void;
type CompletionCallback = (data: BulkOperationProgressEvent) => void;
type FailureCallback = (data: BulkOperationFailureEvent) => void;
type ErrorCallback = (error: { message: string }) => void;

class BulkOperationsSocketService {
  private socket: Socket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  private progressCallbacks: Map<string, ProgressCallback[]> = new Map();
  private completionCallbacks: Map<string, CompletionCallback[]> = new Map();
  private failureCallbacks: Map<string, FailureCallback[]> = new Map();
  private errorCallbacks: ErrorCallback[] = [];

  /**
   * Connect to the WebSocket server
   */
  connect(token: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      const socketUrl = wsUrl('/socket.io/');

      this.socket = io(socketUrl, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
      });

      this.socket.on('connect', () => {
        console.log('[BulkOps WebSocket] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('[BulkOps WebSocket] Connection error:', error.message);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Failed to connect to WebSocket server'));
        }
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[BulkOps WebSocket] Disconnected:', reason);
        this.isConnected = false;
      });

      this.socket.on('error', (error: { message: string }) => {
        console.error('[BulkOps WebSocket] Error:', error);
        this.errorCallbacks.forEach(cb => cb(error));
      });

      // Listen for bulk operation events
      this.socket.on('bulk:progress', (data: BulkOperationProgressEvent) => {
        this.handleProgress(data);
      });

      this.socket.on('bulk:completed', (data: BulkOperationProgressEvent) => {
        this.handleCompletion(data);
      });

      this.socket.on('bulk:failed', (data: BulkOperationFailureEvent) => {
        this.handleFailure(data);
      });

      this.socket.on('bulk:status:response', (data: BulkOperationProgressEvent) => {
        this.handleProgress(data);
      });

      // Organization-wide events (for list updates)
      this.socket.on('bulk:operation:progress', (data: { operationId: string; progress: number; status: string }) => {
        // Can be used for list view updates
        console.log('[BulkOps WebSocket] Operation progress:', data);
      });

      this.socket.on('bulk:operation:completed', (data: { operationId: string; successCount: number; failureCount: number }) => {
        console.log('[BulkOps WebSocket] Operation completed:', data);
      });

      this.socket.on('bulk:operation:failed', (data: { operationId: string; error: string }) => {
        console.log('[BulkOps WebSocket] Operation failed:', data);
      });
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.progressCallbacks.clear();
      this.completionCallbacks.clear();
      this.failureCallbacks.clear();
      console.log('[BulkOps WebSocket] Disconnected manually');
    }
  }

  /**
   * Check if connected
   */
  getIsConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Subscribe to a bulk operation's progress updates
   */
  subscribe(
    operationId: string,
    onProgress: ProgressCallback,
    onCompletion?: CompletionCallback,
    onFailure?: FailureCallback
  ): void {
    if (!this.socket?.connected) {
      console.warn('[BulkOps WebSocket] Not connected, cannot subscribe');
      return;
    }

    // Store callbacks
    if (!this.progressCallbacks.has(operationId)) {
      this.progressCallbacks.set(operationId, []);
    }
    this.progressCallbacks.get(operationId)!.push(onProgress);

    if (onCompletion) {
      if (!this.completionCallbacks.has(operationId)) {
        this.completionCallbacks.set(operationId, []);
      }
      this.completionCallbacks.get(operationId)!.push(onCompletion);
    }

    if (onFailure) {
      if (!this.failureCallbacks.has(operationId)) {
        this.failureCallbacks.set(operationId, []);
      }
      this.failureCallbacks.get(operationId)!.push(onFailure);
    }

    // Subscribe on server
    this.socket.emit('bulk:subscribe', { operationId });
    console.log('[BulkOps WebSocket] Subscribed to operation:', operationId);
  }

  /**
   * Unsubscribe from a bulk operation
   */
  unsubscribe(operationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('bulk:unsubscribe', { operationId });
    }

    this.progressCallbacks.delete(operationId);
    this.completionCallbacks.delete(operationId);
    this.failureCallbacks.delete(operationId);
    console.log('[BulkOps WebSocket] Unsubscribed from operation:', operationId);
  }

  /**
   * Request current status of an operation
   */
  requestStatus(operationId: string): void {
    if (!this.socket?.connected) {
      console.warn('[BulkOps WebSocket] Not connected, cannot request status');
      return;
    }

    this.socket.emit('bulk:status', { operationId });
  }

  /**
   * Add a global error callback
   */
  onError(callback: ErrorCallback): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * Remove a global error callback
   */
  offError(callback: ErrorCallback): void {
    const index = this.errorCallbacks.indexOf(callback);
    if (index > -1) {
      this.errorCallbacks.splice(index, 1);
    }
  }

  private handleProgress(data: BulkOperationProgressEvent): void {
    const callbacks = this.progressCallbacks.get(data.bulkOperationId);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  private handleCompletion(data: BulkOperationProgressEvent): void {
    const callbacks = this.completionCallbacks.get(data.bulkOperationId);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
    // Automatically unsubscribe after completion
    this.unsubscribe(data.bulkOperationId);
  }

  private handleFailure(data: BulkOperationFailureEvent): void {
    const callbacks = this.failureCallbacks.get(data.bulkOperationId);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
    // Automatically unsubscribe after failure
    this.unsubscribe(data.bulkOperationId);
  }
}

// Singleton instance
export const bulkOperationsSocket = new BulkOperationsSocketService();
