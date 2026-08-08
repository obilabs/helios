import { Server, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger.js';
import { authenticateSocketToken } from '../middleware/socket-auth.js';
import { bulkOperationsService, BulkOperation } from '../services/bulk-operations.service.js';
import { EventEmitter } from 'events';

// Global event emitter for bulk operation progress
export const bulkOperationEvents = new EventEmitter();

export interface BulkOperationProgressEvent {
  bulkOperationId: string;
  organizationId: string;
  status: string;
  totalItems: number;
  processedItems: number;
  successCount: number;
  failureCount: number;
  progress: number; // 0-100
}

export class BulkOperationsGateway {
  private io: Server;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private socketUsers: Map<string, string> = new Map(); // socketId -> userId
  private operationSubscriptions: Map<string, Set<string>> = new Map(); // operationId -> socketIds

  constructor(server: HTTPServer) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
      },
      path: '/socket.io/',
    });

    this.initialize();
    this.setupEventListeners();
  }

  private initialize() {
    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        const user = await authenticateSocketToken(token);
        if (!user) {
          return next(new Error('Authentication failed'));
        }
        socket.data.user = user;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    this.io.on('connection', (socket: Socket) => {
      const userId = socket.data.user.id;
      const organizationId = socket.data.user.organizationId;

      logger.info(`Bulk operations: User connected: ${userId} on socket ${socket.id}`);
      this.handleUserConnection(userId, socket.id);

      // Join organization room for broadcasts
      socket.join(`org:${organizationId}`);

      // Subscribe to a specific bulk operation's progress
      socket.on('bulk:subscribe', async (data: { operationId: string }) => {
        try {
          await this.handleSubscribe(socket, data.operationId);
        } catch (error) {
          logger.error('Error subscribing to bulk operation:', error);
          socket.emit('error', { message: 'Failed to subscribe to operation' });
        }
      });

      // Unsubscribe from a bulk operation
      socket.on('bulk:unsubscribe', async (data: { operationId: string }) => {
        try {
          await this.handleUnsubscribe(socket, data.operationId);
        } catch (error) {
          logger.error('Error unsubscribing from bulk operation:', error);
        }
      });

      // Get current status of an operation
      socket.on('bulk:status', async (data: { operationId: string }) => {
        try {
          const operation = await bulkOperationsService.getBulkOperation(data.operationId);
          if (operation && operation.organizationId === organizationId) {
            socket.emit('bulk:status:response', this.mapOperationToProgress(operation));
          } else {
            socket.emit('error', { message: 'Operation not found or access denied' });
          }
        } catch (error) {
          logger.error('Error getting bulk operation status:', error);
          socket.emit('error', { message: 'Failed to get operation status' });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`Bulk operations: User disconnected: ${userId} from socket ${socket.id}`);
        this.handleUserDisconnection(userId, socket.id);
      });
    });
  }

  private setupEventListeners() {
    // Listen for progress events from the worker/service
    bulkOperationEvents.on('progress', (data: BulkOperationProgressEvent) => {
      this.broadcastProgress(data);
    });

    bulkOperationEvents.on('completed', (data: BulkOperationProgressEvent) => {
      this.broadcastCompletion(data);
    });

    bulkOperationEvents.on('failed', (data: BulkOperationProgressEvent & { error: string }) => {
      this.broadcastFailure(data);
    });
  }

  private handleUserConnection(userId: string, socketId: string) {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
    this.socketUsers.set(socketId, userId);
  }

  private handleUserDisconnection(userId: string, socketId: string) {
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userSockets.delete(userId);
      }
    }
    this.socketUsers.delete(socketId);

    // Remove from all operation subscriptions
    for (const [operationId, sockets] of this.operationSubscriptions.entries()) {
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.operationSubscriptions.delete(operationId);
      }
    }
  }

  private async handleSubscribe(socket: Socket, operationId: string) {
    const organizationId = socket.data.user.organizationId;

    // Verify the operation belongs to user's organization
    const operation = await bulkOperationsService.getBulkOperation(operationId);
    if (!operation || operation.organizationId !== organizationId) {
      socket.emit('error', { message: 'Operation not found or access denied' });
      return;
    }

    // Add to subscription list
    if (!this.operationSubscriptions.has(operationId)) {
      this.operationSubscriptions.set(operationId, new Set());
    }
    this.operationSubscriptions.get(operationId)!.add(socket.id);

    // Join operation-specific room
    socket.join(`bulk:${operationId}`);

    // Send current status immediately
    socket.emit('bulk:progress', this.mapOperationToProgress(operation));

    logger.info(`Socket ${socket.id} subscribed to bulk operation ${operationId}`);
  }

  private async handleUnsubscribe(socket: Socket, operationId: string) {
    const sockets = this.operationSubscriptions.get(operationId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        this.operationSubscriptions.delete(operationId);
      }
    }

    socket.leave(`bulk:${operationId}`);
    logger.info(`Socket ${socket.id} unsubscribed from bulk operation ${operationId}`);
  }

  private broadcastProgress(data: BulkOperationProgressEvent) {
    // Broadcast to all subscribed sockets
    this.io.to(`bulk:${data.bulkOperationId}`).emit('bulk:progress', data);

    // Also broadcast to organization room
    this.io.to(`org:${data.organizationId}`).emit('bulk:operation:progress', {
      operationId: data.bulkOperationId,
      progress: data.progress,
      status: data.status,
    });
  }

  private broadcastCompletion(data: BulkOperationProgressEvent) {
    this.io.to(`bulk:${data.bulkOperationId}`).emit('bulk:completed', data);
    this.io.to(`org:${data.organizationId}`).emit('bulk:operation:completed', {
      operationId: data.bulkOperationId,
      successCount: data.successCount,
      failureCount: data.failureCount,
    });
  }

  private broadcastFailure(data: BulkOperationProgressEvent & { error: string }) {
    this.io.to(`bulk:${data.bulkOperationId}`).emit('bulk:failed', data);
    this.io.to(`org:${data.organizationId}`).emit('bulk:operation:failed', {
      operationId: data.bulkOperationId,
      error: data.error,
    });
  }

  private mapOperationToProgress(operation: BulkOperation): BulkOperationProgressEvent {
    const progress = operation.totalItems > 0
      ? Math.floor((operation.processedItems / operation.totalItems) * 100)
      : 0;

    return {
      bulkOperationId: operation.id,
      organizationId: operation.organizationId,
      status: operation.status,
      totalItems: operation.totalItems,
      processedItems: operation.processedItems,
      successCount: operation.successCount,
      failureCount: operation.failureCount,
      progress,
    };
  }

  // Public method to manually broadcast progress (can be called from routes/services)
  public emitProgress(data: BulkOperationProgressEvent) {
    bulkOperationEvents.emit('progress', data);
  }

  public emitCompletion(data: BulkOperationProgressEvent) {
    bulkOperationEvents.emit('completed', data);
  }

  public emitFailure(data: BulkOperationProgressEvent & { error: string }) {
    bulkOperationEvents.emit('failed', data);
  }
}

// Singleton instance (will be set when gateway is initialized)
let bulkOperationsGateway: BulkOperationsGateway | null = null;

export function initializeBulkOperationsGateway(server: HTTPServer): BulkOperationsGateway {
  bulkOperationsGateway = new BulkOperationsGateway(server);
  return bulkOperationsGateway;
}

export function getBulkOperationsGateway(): BulkOperationsGateway | null {
  return bulkOperationsGateway;
}
