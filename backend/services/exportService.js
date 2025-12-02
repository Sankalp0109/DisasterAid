import { Request } from "../models/Request.js";
import { Assignment } from "../models/Assignment.js";
import { NGO } from "../models/NGO.js";

/**
 * Export incidents (requests) as JSON or CSV
 */
export async function exportIncidents(filters = {}) {
  try {
    const { startDate, endDate, priority, status, format = "json" } = filters;

    let query = {};

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Status filter
    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }

    // Priority filter
    if (priority) {
      query.priority = Array.isArray(priority) ? { $in: priority } : priority;
    }

    const incidents = await Request.find(query)
      .populate("submittedBy", "name email phone")
      .sort({ createdAt: -1 })
      .lean();

    if (format === "csv") {
      return convertToCSV(incidents);
    }

    return incidents;
  } catch (error) {
    console.error("Error exporting incidents:", error);
    throw error;
  }
}

/**
 * Export assignments (fulfillment/delivery records)
 */
export async function exportAssignments(filters = {}) {
  try {
    const { startDate, endDate, status, ngoId, format = "json" } = filters;

    let query = {};

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Status filter
    if (status) {
      query.status = Array.isArray(status) ? { $in: status } : status;
    }

    // NGO filter
    if (ngoId) {
      query.assignedTo = ngoId;
    }

    const assignments = await Assignment.find(query)
      .populate("request", "location priority needs")
      .populate("assignedTo", "name email phone stats")
      .sort({ createdAt: -1 })
      .lean();

    if (format === "csv") {
      return convertAssignmentsToCSV(assignments);
    }

    return assignments;
  } catch (error) {
    console.error("Error exporting assignments:", error);
    throw error;
  }
}

/**
 * Export NGO performance metrics
 */
export async function exportNGOMetrics(filters = {}) {
  try {
    const { startDate, endDate, format = "json" } = filters;

    let matchStage = {};

    // Date range filter for NGOs created
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const ngos = await NGO.aggregate([
      { $match: { ...matchStage, isActive: true } },
      {
        $project: {
          name: 1,
          email: 1,
          isVerified: 1,
          stats: 1,
          location: 1,
          createdAt: 1,
          completionRate: {
            $cond: [
              { $gt: ["$stats.totalAssignments", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$stats.completedAssignments", "$stats.totalAssignments"] },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { "stats.completedAssignments": -1 } },
    ]);

    if (format === "csv") {
      return convertNGOMetricsToCSV(ngos);
    }

    return ngos;
  } catch (error) {
    console.error("Error exporting NGO metrics:", error);
    throw error;
  }
}

/**
 * Convert incident data to CSV
 */
function convertToCSV(incidents) {
  if (!incidents || incidents.length === 0) {
    return "No incidents found";
  }

  const headers = [
    "Incident ID",
    "Status",
    "Priority",
    "Location",
    "Created By",
    "Contact",
    "Beneficiaries",
    "Food Need",
    "Water Need",
    "Medical Need",
    "Created Date",
  ];

  const rows = incidents.map((incident) => [
    incident._id.toString(),
    incident.status,
    incident.priority,
    incident.location?.address || `${incident.location?.coordinates?.join(", ")}`,
    incident.submittedBy?.name || "Unknown",
    incident.submittedBy?.phone || incident.submittedBy?.email || "",
    incident.beneficiaries?.total || 0,
    incident.needs?.food?.required ? "Yes" : "No",
    incident.needs?.water?.required ? "Yes" : "No",
    incident.needs?.medical?.required ? "Yes" : "No",
    new Date(incident.createdAt).toISOString(),
  ]);

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

  return csv;
}

/**
 * Convert assignment data to CSV
 */
function convertAssignmentsToCSV(assignments) {
  if (!assignments || assignments.length === 0) {
    return "No assignments found";
  }

  const headers = [
    "Assignment ID",
    "Request ID",
    "Status",
    "Category",
    "Quantity",
    "NGO Name",
    "NGO Rating",
    "Delivery Location",
    "Assigned Date",
    "Completion Status",
  ];

  const rows = assignments.map((assignment) => [
    assignment._id.toString(),
    assignment.request?._id?.toString() || "",
    assignment.status,
    assignment.category,
    assignment.quantity,
    assignment.assignedTo?.name || "Unknown",
    assignment.assignedTo?.stats?.rating || "N/A",
    assignment.deliveryLocation?.address || `${assignment.deliveryLocation?.coordinates?.join(", ")}`,
    new Date(assignment.createdAt).toISOString(),
    assignment.status === "fulfilled" ? "Yes" : "No",
  ]);

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

  return csv;
}

/**
 * Convert NGO metrics to CSV
 */
function convertNGOMetricsToCSV(ngos) {
  if (!ngos || ngos.length === 0) {
    return "No NGOs found";
  }

  const headers = [
    "NGO Name",
    "Email",
    "Verified",
    "Total Assignments",
    "Completed Assignments",
    "Completion Rate %",
    "Rating",
    "People Helped",
    "Avg Response Time (min)",
  ];

  const rows = ngos.map((ngo) => [
    ngo.name,
    ngo.email,
    ngo.isVerified ? "Yes" : "No",
    ngo.stats?.totalAssignments || 0,
    ngo.stats?.completedAssignments || 0,
    ngo.completionRate || 0,
    ngo.stats?.rating || "N/A",
    ngo.stats?.peopleHelped || 0,
    ngo.stats?.averageResponseTime || "N/A",
  ]);

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

  return csv;
}
