import { Server } from "socket.io";
import type { Server as HttpServer } from "http";

let io: Server | null = null;

export function initSocket(httpServer: HttpServer, clientOrigin: string): Server {
  io = new Server(httpServer, { cors: { origin: clientOrigin } });
  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);
    socket.on("disconnect", () => console.log(`[socket] disconnected: ${socket.id}`));
  });
  return io;
}

export function emitAnomalyNew(payload: unknown) {
  io?.emit("anomaly:new", payload);
}

export function emitAnomalyUpdated(payload: unknown) {
  io?.emit("anomaly:updated", payload);
}

export function emitFeedbackRecorded(payload: unknown) {
  io?.emit("feedback:recorded", payload);
}
