import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { verify } from 'jsonwebtoken';
import { config } from '../config.js';

let io: Server;

export function initSocket(server: HttpServer): Server {
    io = new Server(server, {
        cors: { origin: config.corsOrigin, credentials: true },
        path: '/ws',
    });

    io.use((socket, next) => {
        const token = socket.handshake.auth.token;
        try {
            const decoded = verify(token, config.jwtSecret);
            socket.data.user = decoded;
            next();
        } catch {
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        console.log(`[WS] User connected: ${socket.data.user.userId}`);

        socket.join(`user:${socket.data.user.userId}`);

        socket.on('join:team', (teamId: string) => {
            socket.join(`team:${teamId}`);
        });

        socket.on('leave:team', (teamId: string) => {
            socket.leave(`team:${teamId}`);
        });

        socket.on('join:document', (docType: string, docId: string) => {
            socket.join(`doc:${docType}:${docId}`);
        });

        socket.on('leave:document', (docType: string, docId: string) => {
            socket.leave(`doc:${docType}:${docId}`);
        });

        socket.on('typing', (docType: string, docId: string) => {
            socket.to(`doc:${docType}:${docId}`).emit('user:typing', {
                userId: socket.data.user.userId,
                docType,
                docId,
            });
        });

        socket.on('cursor', (docType: string, docId: string, position: unknown) => {
            socket.to(`doc:${docType}:${docId}`).emit('user:cursor', {
                userId: socket.data.user.userId,
                docType,
                docId,
                position,
            });
        });

        socket.on('disconnect', () => {
            console.log(`[WS] User disconnected: ${socket.data.user.userId}`);
        });
    });

    return io;
}

export function getIO(): Server | undefined {
    return io;
}

export function emitToUser(userId: string, event: string, data: unknown) {
    io?.to(`user:${userId}`).emit(event, data);
}

export function emitToTeam(teamId: string, event: string, data: unknown) {
    io?.to(`team:${teamId}`).emit(event, data);
}

export function emitToDocument(docType: string, docId: string, event: string, data: unknown) {
    io?.to(`doc:${docType}:${docId}`).emit(event, data);
}
