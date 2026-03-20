/**
 * MAW Dashboard Server
 *
 * HTTP server with WebSocket support for real-time updates.
 * Based on Claude-Code-Workflow's Dashboard implementation.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { DashboardStorage } from './storage';
import { MAWBridge } from './maw-bridge';
import { createApiRoutes } from './routes/api';

interface DashboardConfig {
  port: number;
  dataDir: string;
  staticDir?: string;
}

export class DashboardServer {
  private app: express.Application;
  private wss: WebSocketServer | null = null;
  private storage: DashboardStorage;
  private mawBridge: MAWBridge;
  private config: DashboardConfig;
  private clients: Set<WebSocket> = new Set();
  private wsErrorCounts = new WeakMap<WebSocket, number>();

  constructor(config: Partial<DashboardConfig> = {}) {
    this.config = {
      port: config.port || 3000,
      dataDir: config.dataDir || '.maw',
      staticDir: config.staticDir || path.join(__dirname, '../public'),
    };

    this.storage = new DashboardStorage(this.config.dataDir);
    this.mawBridge = new MAWBridge(this.config.dataDir, this.storage);
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req: Request, _res: Response, next: NextFunction) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // API routes with MAW bridge
    const apiRouter = createApiRoutes(this.storage, this, this.mawBridge);
    this.app.use('/api', apiRouter);

    // Static files
    if (this.config.staticDir) {
      this.app.use(express.static(this.config.staticDir));

      // SPA fallback
      this.app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(this.config.staticDir!, 'index.html'));
      });
    }

    // Error handler
    this.app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
      console.error('Server error:', err);
      res.status(500).json({ error: err.message });
    });
  }

  /**
   * Broadcast message to all WebSocket clients
   */
  broadcast(event: string, data: unknown): void {
    const message = JSON.stringify({ event, data, timestamp: Date.now() });

    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    // Initialize MAW bridge with timeout
    await Promise.race([
      this.mawBridge.initialize(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Bridge init timed out')), 30000))
    ]).catch(err => console.warn('[Dashboard] Bridge init:', err.message));

    return new Promise((resolve) => {
      const server = createServer(this.app);

      // WebSocket server
      this.wss = new WebSocketServer({ server });

      this.wss.on('connection', (ws: WebSocket) => {
        console.log('WebSocket client connected');
        this.clients.add(ws);

        ws.on('message', (message: Buffer) => {
          try {
            const data = JSON.parse(message.toString());
            this.wsErrorCounts.set(ws, 0);
            this.handleWebSocketMessage(ws, data);
          } catch (e) {
            const count = (this.wsErrorCounts.get(ws) || 0) + 1;
            this.wsErrorCounts.set(ws, count);
            console.error('Invalid WebSocket message:', e);
            if (count >= 3) {
              console.warn('Closing WebSocket due to repeated invalid messages');
              ws.close(1003, 'Too many invalid messages');
            }
          }
        });

        ws.on('close', () => {
          console.log('WebSocket client disconnected');
          this.clients.delete(ws);
        });

        // Send initial state
        ws.send(JSON.stringify({
          event: 'connected',
          data: { version: '0.1.0' },
          timestamp: Date.now(),
        }));
      });

      server.listen(this.config.port, () => {
        console.log(`Dashboard running at http://localhost:${this.config.port}`);
        resolve();
      });
    });
  }

  private handleWebSocketMessage(ws: WebSocket, data: { type: string; payload?: unknown }): void {
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
        break;

      case 'subscribe':
        // Handle subscription to specific events
        console.log('Client subscribed to:', data.payload);
        break;

      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  }

  /**
   * Get storage instance
   */
  getStorage(): DashboardStorage {
    return this.storage;
  }
}

// Main entry point
if (require.main === module) {
  const port = parseInt(process.env.MAW_DASHBOARD_PORT || '3000', 10);
  const dataDir = process.env.MAW_DATA_DIR || '.maw';

  const server = new DashboardServer({ port, dataDir });
  server.start().catch(console.error);
}

export default DashboardServer;
