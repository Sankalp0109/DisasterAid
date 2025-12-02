import { User } from "../models/User.js";
import { Request } from "../models/Request.js";
import { Assignment } from "../models/Assignment.js";
import { NGO } from "../models/NGO.js";
import { checkSoSStatus } from "../services/sosDetection.js";

// Store active connections
const activeConnections = new Map(); // socketId -> { userId, role, rooms }

export function socketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`📡 Client connected: ${socket.id}`);

    // ==================== AUTHENTICATION ====================
    socket.on("authenticate", async (data, callback) => {
      try {
        const { userId, role } = data;

        // Verify user exists
        const user = await User.findById(userId);
        if (!user) {
          return callback({ success: false, message: "User not found" });
        }

        // Update user online status
        user.isOnline = true;
        user.socketId = socket.id;
        user.lastActive = new Date();
        await user.save();

        // Store connection
        activeConnections.set(socket.id, {
          userId,
          role: user.role,
          rooms: [],
        });

        // Join role-based room
        socket.join(`role:${user.role}`);

        // If NGO, update NGO status
        if (user.role === "ngo" && user.organizationId) {
          const ngo = await NGO.findById(user.organizationId);
          if (ngo) {
            ngo.isOnline = true;
            ngo.lastActive = new Date();
            await ngo.save();
          }
          socket.join(`ngo:${user.organizationId}`);
        }

        console.log(`✅ User authenticated: ${user.name} (${user.role})`);

        callback({
          success: true,
          user: {
            id: user._id,
            name: user.name,
            role: user.role,
          },
        });
      } catch (error) {
        console.error("Authentication error:", error);
        callback({ success: false, message: error.message });
      }
    });

    // ==================== REQUEST EVENTS ====================

    // Join request room
    socket.on("request:join", async (data, callback) => {
      try {
        const { requestId } = data;
        const connection = activeConnections.get(socket.id);

        if (!connection) {
          return callback({ success: false, message: "Not authenticated" });
        }

        const request = await Request.findById(requestId);
        if (!request) {
          return callback({ success: false, message: "Request not found" });
        }

        // Check permissions
        if (
          connection.role === "victim" &&
          request.submittedBy.toString() !== connection.userId
        ) {
          return callback({ success: false, message: "Access denied" });
        }

        const roomName = `request:${requestId}`;
        socket.join(roomName);
        connection.rooms.push(roomName);

        callback({ success: true });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    // Send message in request
    socket.on("request:message", async (data, callback) => {
      try {
        const { requestId, message, type = "text" } = data;
        const connection = activeConnections.get(socket.id);

        if (!connection) {
          return callback({ success: false, message: "Not authenticated" });
        }

        const request = await Request.findById(requestId);
        if (!request) {
          return callback({ success: false, message: "Request not found" });
        }

        const messageObj = {
          sender: connection.userId,
          senderRole: connection.role,
          message,
          type,
          timestamp: new Date(),
        };

        request.messages.push(messageObj);
        request.lastActivity = new Date();

        // Check for SoS
        await checkSoSStatus(request);
        await request.save();

        // Broadcast to room
        io.to(`request:${requestId}`).emit("request:message-received", {
          requestId,
          message: messageObj,
          sosDetected: request.sosDetected,
          priority: request.priority,
        });

        // If SoS detected, alert authorities
        if (request.sosDetected) {
          io.to("role:authority").emit("sos:alert", {
            requestId: request._id,
            location: request.location,
            priority: request.priority,
            message: message,
          });
        }

        callback({ success: true, sosDetected: request.sosDetected });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    // Typing indicator
    socket.on("request:typing", (data) => {
      const { requestId, isTyping } = data;
      const connection = activeConnections.get(socket.id);

      if (connection) {
        socket.to(`request:${requestId}`).emit("request:typing-indicator", {
          userId: connection.userId,
          role: connection.role,
          isTyping,
        });
      }
    });

    // ==================== ASSIGNMENT EVENTS ====================

    // Join assignment room
    socket.on("assignment:join", async (data, callback) => {
      try {
        const { assignmentId } = data;
        const connection = activeConnections.get(socket.id);

        if (!connection) {
          return callback({ success: false, message: "Not authenticated" });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return callback({ success: false, message: "Assignment not found" });
        }

        const roomName = `assignment:${assignmentId}`;
        socket.join(roomName);
        connection.rooms.push(roomName);

        callback({ success: true });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    // Update assignment location (for tracking)
    socket.on("assignment:update-location", async (data, callback) => {
      try {
        const { assignmentId, location } = data;
        const connection = activeConnections.get(socket.id);

        if (!connection || connection.role !== "ngo") {
          return callback({ success: false, message: "Access denied" });
        }

        const assignment = await Assignment.findById(assignmentId);
        if (!assignment) {
          return callback({ success: false, message: "Assignment not found" });
        }

        // Broadcast location update
        io.to(`assignment:${assignmentId}`).emit("assignment:location-updated", {
          assignmentId,
          location,
          timestamp: new Date(),
        });

        callback({ success: true });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    // ==================== DASHBOARD EVENTS ====================

    // Subscribe to dashboard updates
    socket.on("dashboard:subscribe", async (data, callback) => {
      try {
        const connection = activeConnections.get(socket.id);

        if (!connection) {
          return callback({ success: false, message: "Not authenticated" });
        }

        // Join dashboard room based on role
        socket.join(`dashboard:${connection.role}`);

        callback({ success: true });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    // Request real-time stats
    socket.on("dashboard:get-stats", async (data, callback) => {
      try {
        const connection = activeConnections.get(socket.id);

        if (!connection) {
          return callback({ success: false, message: "Not authenticated" });
        }

        // Get stats based on role
        let stats = {};

        if (connection.role === "authority" || connection.role === "operator") {
          const [totalRequests, sosRequests, activeAssignments] = await Promise.all([
            Request.countDocuments({ status: { $in: ["new", "triaged", "assigned", "in-progress"] } }),
            Request.countDocuments({ sosDetected: true, status: { $in: ["new", "triaged", "assigned"] } }),
            Assignment.countDocuments({ status: { $in: ["new", "accepted", "en-route", "in-progress"] } }),
          ]);

          stats = {
            totalRequests,
            sosRequests,
            activeAssignments,
          };
        }

        callback({ success: true, stats });
      } catch (error) {
        callback({ success: false, message: error.message });
      }
    });

    // ==================== NOTIFICATIONS ====================

    // Broadcast new request to operators/authorities
    socket.on("request:created", async (data) => {
      const { requestId } = data;

      try {
        const request = await Request.findById(requestId)
          .populate("submittedBy", "name phone");

        if (request) {
          // Notify operators and authorities
          io.to("role:operator").to("role:authority").emit("request:new", {
            requestId: request._id,
            priority: request.priority,
            sosDetected: request.sosDetected,
            location: request.location,
            submittedBy: request.submittedBy,
            createdAt: request.createdAt,
          });

          // If SoS, also notify all NGOs
          if (request.sosDetected) {
            io.to("role:ngo").emit("sos:alert", {
              requestId: request._id,
              location: request.location,
              priority: request.priority,
            });
          }
        }
      } catch (error) {
        console.error("Error broadcasting new request:", error);
      }
    });

    // Broadcast assignment to NGO
    socket.on("assignment:created", async (data) => {
      const { assignmentId } = data;

      try {
        const assignment = await Assignment.findById(assignmentId)
          .populate("request")
          .populate("assignedTo");

        if (assignment) {
          // Notify assigned NGO
          io.to(`ngo:${assignment.assignedTo._id}`).emit("assignment:new", {
            assignmentId: assignment._id,
            ticketNumber: assignment.ticketNumber,
            request: assignment.request,
            priority: assignment.priority,
            category: assignment.category,
          });

          // Notify victim
          const request = await Request.findById(assignment.request);
          if (request) {
            io.to(`request:${request._id}`).emit("request:assigned", {
              assignmentId: assignment._id,
              ngo: assignment.assignedTo,
            });
          }
        }
      } catch (error) {
        console.error("Error broadcasting assignment:", error);
      }
    });

    // ==================== DISCONNECT ====================

    socket.on("disconnect", async () => {
      const connection = activeConnections.get(socket.id);

      if (connection) {
        try {
          // Update user status
          const user = await User.findById(connection.userId);
          if (user) {
            user.isOnline = false;
            user.lastActive = new Date();
            user.socketId = null;
            await user.save();

            // If NGO, update NGO status
            if (user.role === "ngo" && user.organizationId) {
              const ngo = await NGO.findById(user.organizationId);
              if (ngo) {
                ngo.isOnline = false;
                ngo.lastActive = new Date();
                await ngo.save();
              }
            }
          }

          activeConnections.delete(socket.id);
          console.log(`👋 User disconnected: ${connection.userId} (${connection.role})`);
        } catch (error) {
          console.error("Disconnect error:", error);
        }
      }

      console.log(`📡 Client disconnected: ${socket.id}`);
    });
  });

  // Periodic cleanup of stale connections
  setInterval(() => {
    activeConnections.forEach((connection, socketId) => {
      const socket = io.sockets.sockets.get(socketId);
      if (!socket) {
        activeConnections.delete(socketId);
      }
    });
  }, 60000); // Every minute
}
