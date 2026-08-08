import { Server, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger.js';
import { authenticateSocketToken } from '../middleware/socket-auth.js';
import { helpdeskService } from '../services/helpdesk.service.js';

export class PresenceGateway {
  private io: Server;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> socketIds
  private socketUsers: Map<string, string> = new Map(); // socketId -> userId
  private presenceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(server: HTTPServer) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true,
      },
      path: '/socket.io/',
    });

    this.initialize();
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

      logger.info(`User connected: ${userId} on socket ${socket.id}`);
      this.handleUserConnection(userId, socket.id);

      // Join organization room for broadcasts
      socket.join(`org:${organizationId}`);

      // Handle viewing ticket
      socket.on('ticket:view', async (data: { ticketId: string }) => {
        try {
          await this.handleTicketView(socket, data.ticketId);
        } catch (error) {
          logger.error('Error handling ticket view:', error);
          socket.emit('error', { message: 'Failed to register view' });
        }
      });

      // Handle typing start
      socket.on('ticket:typing:start', async (data: { ticketId: string }) => {
        try {
          await this.handleTypingStart(socket, data.ticketId);
        } catch (error) {
          logger.error('Error handling typing start:', error);
        }
      });

      // Handle typing stop
      socket.on('ticket:typing:stop', async (data: { ticketId: string }) => {
        try {
          await this.handleTypingStop(socket, data.ticketId);
        } catch (error) {
          logger.error('Error handling typing stop:', error);
        }
      });

      // Handle presence ping (keep-alive)
      socket.on('presence:ping', async (data: { ticketId?: string }) => {
        try {
          await this.handlePresencePing(socket, data.ticketId);
        } catch (error) {
          logger.error('Error handling presence ping:', error);
        }
      });

      // Handle ticket assignment
      socket.on('ticket:assign', async (data: { ticketId: string; assignToUserId?: string }) => {
        try {
          const result = await helpdeskService.assignTicket(
            data.ticketId,
            data.assignToUserId || userId,
            userId,
            organizationId
          );

          // Broadcast to organization
          this.io.to(`org:${organizationId}`).emit('ticket:assigned', {
            ticketId: data.ticketId,
            assignedTo: result.assignedTo,
            assignedBy: result.assignedBy,
          });
        } catch (error) {
          logger.error('Error assigning ticket:', error);
          socket.emit('error', { message: 'Failed to assign ticket' });
        }
      });

      // Handle status update
      socket.on('ticket:status', async (data: { ticketId: string; status: string }) => {
        try {
          const result = await helpdeskService.updateTicketStatus(
            data.ticketId,
            data.status,
            userId,
            organizationId
          );

          // Broadcast to organization
          this.io.to(`org:${organizationId}`).emit('ticket:status:updated', {
            ticketId: data.ticketId,
            status: result.status,
            updatedBy: userId,
          });
        } catch (error) {
          logger.error('Error updating ticket status:', error);
          socket.emit('error', { message: 'Failed to update status' });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        logger.info(`User disconnected: ${userId} from socket ${socket.id}`);
        this.handleUserDisconnection(userId, socket.id);
      });
    });
  }

  private handleUserConnection(userId: string, socketId: string) {
    // Track user's sockets
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
    this.socketUsers.set(socketId, userId);
  }

  private handleUserDisconnection(userId: string, socketId: string) {
    // Remove socket from user's socket list
    const userSockets = this.userSockets.get(userId);
    if (userSockets) {
      userSockets.delete(socketId);
      if (userSockets.size === 0) {
        this.userSockets.delete(userId);
        // User has no more connections, clear their presence
        this.clearUserPresence(userId);
      }
    }
    this.socketUsers.delete(socketId);
  }

  private async handleTicketView(socket: Socket, ticketId: string) {
    const userId = socket.data.user.id;
    const organizationId = socket.data.user.organizationId;

    // Join ticket room
    socket.join(`ticket:${ticketId}`);

    // Update presence in database
    await helpdeskService.updatePresence(userId, ticketId, 'viewing');

    // Get all viewers for this ticket
    const presence = await helpdeskService.getTicketPresence(ticketId);

    // Broadcast updated presence to all viewers
    this.io.to(`ticket:${ticketId}`).emit('presence:update', {
      ticketId,
      viewers: presence.viewers,
      typers: presence.typers,
    });

    // Set up presence timeout
    this.setupPresenceTimeout(userId, ticketId);
  }

  private async handleTypingStart(socket: Socket, ticketId: string) {
    const userId = socket.data.user.id;

    // Update presence in database
    await helpdeskService.updatePresence(userId, ticketId, 'typing');

    // Get updated presence
    const presence = await helpdeskService.getTicketPresence(ticketId);

    // Broadcast to all viewers
    this.io.to(`ticket:${ticketId}`).emit('presence:update', {
      ticketId,
      viewers: presence.viewers,
      typers: presence.typers,
    });

    // Set up typing timeout (stop typing after 5 seconds of inactivity)
    this.setupTypingTimeout(userId, ticketId);
  }

  private async handleTypingStop(socket: Socket, ticketId: string) {
    const userId = socket.data.user.id;

    // Clear typing status
    await helpdeskService.clearPresence(userId, ticketId, 'typing');

    // Get updated presence
    const presence = await helpdeskService.getTicketPresence(ticketId);

    // Broadcast to all viewers
    this.io.to(`ticket:${ticketId}`).emit('presence:update', {
      ticketId,
      viewers: presence.viewers,
      typers: presence.typers,
    });
  }

  private async handlePresencePing(socket: Socket, ticketId?: string) {
    const userId = socket.data.user.id;

    if (ticketId) {
      // Update last ping time
      await helpdeskService.updatePresencePing(userId, ticketId);

      // Reset presence timeout
      this.setupPresenceTimeout(userId, ticketId);
    }
  }

  private setupPresenceTimeout(userId: string, ticketId: string) {
    const key = `${userId}:${ticketId}:viewing`;

    // Clear existing timeout
    if (this.presenceTimers.has(key)) {
      clearTimeout(this.presenceTimers.get(key)!);
    }

    // Set new timeout (30 seconds)
    const timeout = setTimeout(async () => {
      await helpdeskService.clearPresence(userId, ticketId, 'viewing');

      const presence = await helpdeskService.getTicketPresence(ticketId);
      this.io.to(`ticket:${ticketId}`).emit('presence:update', {
        ticketId,
        viewers: presence.viewers,
        typers: presence.typers,
      });
    }, 30000);

    this.presenceTimers.set(key, timeout);
  }

  private setupTypingTimeout(userId: string, ticketId: string) {
    const key = `${userId}:${ticketId}:typing`;

    // Clear existing timeout
    if (this.presenceTimers.has(key)) {
      clearTimeout(this.presenceTimers.get(key)!);
    }

    // Set new timeout (5 seconds)
    const timeout = setTimeout(async () => {
      await helpdeskService.clearPresence(userId, ticketId, 'typing');

      const presence = await helpdeskService.getTicketPresence(ticketId);
      this.io.to(`ticket:${ticketId}`).emit('presence:update', {
        ticketId,
        viewers: presence.viewers,
        typers: presence.typers,
      });
    }, 5000);

    this.presenceTimers.set(key, timeout);
  }

  private async clearUserPresence(userId: string) {
    // Clear all presence records for this user
    await helpdeskService.clearAllUserPresence(userId);

    // Clear all timers for this user
    for (const [key, timer] of this.presenceTimers.entries()) {
      if (key.startsWith(`${userId}:`)) {
        clearTimeout(timer);
        this.presenceTimers.delete(key);
      }
    }
  }

  public broadcastNewTicket(organizationId: string, ticket: any) {
    this.io.to(`org:${organizationId}`).emit('ticket:new', { ticket });
  }

  public broadcastTicketUpdate(ticketId: string, update: any) {
    this.io.to(`ticket:${ticketId}`).emit('ticket:updated', update);
  }
}