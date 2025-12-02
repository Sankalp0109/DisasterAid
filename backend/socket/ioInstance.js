// Singleton for storing and accessing the Socket.IO instance
let io = null;

export function setIO(ioInstance) {
  io = ioInstance;
}

export function getIO() {
  if (!io) {
    throw new Error("Socket.IO instance not initialized");
  }
  return io;
}

export function isIOInitialized() {
  return io !== null;
}
