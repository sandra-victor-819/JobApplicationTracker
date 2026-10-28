
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const FINAL_STATUSES = ["Rejected", "Accepted", "Declined"];
const ACTIVE_STATUSES = ["Applied", "Interview", "Offer"];

const transitions = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Declined"],
  Rejected: [],
  Accepted: [],
  Declined: []
};

const applicationSchema = new mongoose.Schema({
  applicationId: {
    type: String,
    required: true,
    unique: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  jobRole: {
    type: String,
    required: true,
    trim: true
  },
  jobType: {
    type: String,
    enum: ["Full-time", "Internship", "Contract"],
    required: true
  },
  appliedDate: {
    type: Date,
    required: true
  },
  expectedSalary: {
    type: Number,
    min: 0,
    default: null
  },
  notes: {
    type: String,
    default: ""
  },
  status: {
    type: String,
    enum: ["Applied", "Interview", "Offer", "Rejected", "Accepted", "Declined"],
    default: "Applied"
  },
  followUpDate: {
    type: Date,
    required: true
  },
  statusHistory: [{
    status: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    }
  }]
}, { timestamps: true });

const counterSchema = new mongoose.Schema({
  companyKey: {
    type: String,
    unique: true,
    required: true
  },
  sequence: {
    type: Number,
    default: 0
  }
});

const Application = mongoose.model("Application", applicationSchema);
const Counter = mongoose.model("Counter", counterSchema);

function send(res, status, success, message, data = null) {
  return res.status(status).json({ success, message, data });
}

function isFutureDate(value) {
  if (!value) return true;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return true;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);

  return date > today;
}

function companyPrefix(company) {
  const letters = company.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters + "XXX").slice(0, 3);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function companyKey(company) {
  return company.trim().replace(/\s+/g, " ").toLowerCase();
}

function overdue(application) {
  return application.status === "Applied" &&
    new Date(application.followUpDate) < new Date();
}

async function findApplication(id) {
  if (mongoose.isValidObjectId(id)) {
    const application = await Application.findById(id);
    if (application) return application;
  }

  return Application.findOne({ applicationId: id });
}

async function findActiveDuplicate(companyName, jobRole, excludeId = null) {
  const filter = {
    companyName: {
      $regex: "^" + escapeRegex(companyName.trim()) + "$",
      $options: "i"
    },
    jobRole: {
      $regex: "^" + escapeRegex(jobRole.trim()) + "$",
      $options: "i"
    },
    status: { $in: ACTIVE_STATUSES }
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  return Application.findOne(filter);
}

function validateSalary(value) {
  return value === undefined ||
    value === null ||
    value === "" ||
    (Number.isFinite(Number(value)) && Number(value) >= 0);
}

// Health check
app.get("/api/health", (req, res) => {
  send(res, 200, true, "Job Application Tracker API is running");
});

// Get applications, filter by status and search by company
app.get("/api/applications", async (req, res) => {
  try {
    const filter = {};

    if (req.query.status) {
      if (!Object.prototype.hasOwnProperty.call(transitions, req.query.status)) {
        return send(res, 400, false, "Invalid application status");
      }

      filter.status = req.query.status;
    }

    if (req.query.company) {
      filter.companyName = {
        $regex: escapeRegex(String(req.query.company).trim()),
        $options: "i"
      };
    }

    const applications = await Application.find(filter).sort({ createdAt: -1 });
    const counts = {};

    for (const status of Object.keys(transitions)) {
      counts[status] = await Application.countDocuments({ status });
    }

    const data = applications.map(application => ({
      ...application.toObject(),
      isOverdue: overdue(application)
    }));

    return send(res, 200, true, "Applications retrieved", {
      applications: data,
      counts
    });
  } catch (error) {
    console.error("Get applications error:", error.message);
    return send(res, 500, false, "Failed to retrieve applications");
  }
});

// Get one application by MongoDB ID or generated application ID
app.get("/api/applications/:id", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);

    if (!application) {
      return send(res, 404, false, "Application not found");
    }

    return send(res, 200, true, "Application retrieved", {
      ...application.toObject(),
      isOverdue: overdue(application)
    });
  } catch (error) {
    console.error("Get application error:", error.message);
    return send(res, 500, false, "Failed to retrieve application");
  }
});

// Add an application
app.post("/api/applications", async (req, res) => {
  try {
    const {
      companyName,
      jobRole,
      jobType,
      appliedDate,
      expectedSalary,
      notes
    } = req.body;

    if (
      typeof companyName !== "string" ||
      !companyName.trim() ||
      typeof jobRole !== "string" ||
      !jobRole.trim() ||
      !jobType ||
      !appliedDate
    ) {
      return send(
        res, 400, false,
        "Company, job role, job type and applied date are required"
      );
    }

    if (!["Full-time", "Internship", "Contract"].includes(jobType)) {
      return send(res, 400, false, "Invalid job type");
    }

    if (isFutureDate(appliedDate)) {
      return send(res, 400, false, "Applied date cannot be in the future");
    }

    if (!validateSalary(expectedSalary)) {
      return send(res, 400, false, "Expected salary must be a non-negative number");
    }

    const duplicate = await findActiveDuplicate(companyName, jobRole);

    if (duplicate) {
      return send(
        res, 409, false,
        "An active application already exists for this company and job role"
      );
    }

    // Generate the ID on the backend; ignore any client-supplied ID.
    const key = companyKey(companyName);

    const counter = await Counter.findOneAndUpdate(
      { companyKey: key },
      { $inc: { sequence: 1 } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    const applicationId =
      `JA-${companyPrefix(companyName)}-${String(counter.sequence).padStart(3, "0")}`;

    const applied = new Date(appliedDate);
    const followUpDate = new Date(applied);
    followUpDate.setDate(followUpDate.getDate() + 7);

    const application = await Application.create({
      applicationId,
      companyName: companyName.trim(),
      jobRole: jobRole.trim(),
      jobType,
      appliedDate: applied,
      expectedSalary:
        expectedSalary === "" || expectedSalary == null
          ? null
          : Number(expectedSalary),
      notes: typeof notes === "string" ? notes : "",
      status: "Applied",
      followUpDate,
      statusHistory: [{
        status: "Applied",
        date: new Date()
      }]
    });

    return send(res, 201, true, "Application created", application);
  } catch (error) {
    console.error("Create application error:", error.message);

    if (error.code === 11000) {
      return send(res, 409, false, "Application ID conflict. Please try again");
    }

    if (error.name === "ValidationError") {
      return send(res, 400, false, error.message);
    }

    return send(res, 500, false, "Failed to create application");
  }
});

// Edit permitted fields only; application ID and applied date cannot change
app.put("/api/applications/:id", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);

    if (!application) {
      return send(res, 404, false, "Application not found");
    }

    const { companyName, jobRole, jobType, expectedSalary, notes } = req.body;

    const newCompany =
      companyName === undefined ? application.companyName : companyName;
    const newRole =
      jobRole === undefined ? application.jobRole : jobRole;

    if (
      typeof newCompany !== "string" ||
      !newCompany.trim() ||
      typeof newRole !== "string" ||
      !newRole.trim()
    ) {
      return send(res, 400, false, "Company name and job role are required");
    }

    if (
      jobType !== undefined &&
      !["Full-time", "Internship", "Contract"].includes(jobType)
    ) {
      return send(res, 400, false, "Invalid job type");
    }

    if (!validateSalary(expectedSalary)) {
      return send(res, 400, false, "Expected salary must be a non-negative number");
    }

    // Prevent editing an application into a duplicate active company/role.
    if (ACTIVE_STATUSES.includes(application.status)) {
      const duplicate = await findActiveDuplicate(
        newCompany,
        newRole,
        application._id
      );

      if (duplicate) {
        return send(
          res, 409, false,
          "An active application already exists for this company and job role"
        );
      }
    }

    application.companyName = newCompany.trim();
    application.jobRole = newRole.trim();

    if (jobType !== undefined) application.jobType = jobType;

    if (expectedSalary !== undefined) {
      application.expectedSalary =
        expectedSalary === "" || expectedSalary === null
          ? null
          : Number(expectedSalary);
    }

    if (notes !== undefined) {
      if (typeof notes !== "string") {
        return send(res, 400, false, "Notes must be text");
      }

      application.notes = notes;
    }

    await application.save();

    return send(res, 200, true, "Application updated", application);
  } catch (error) {
    console.error("Update application error:", error.message);

    if (error.code === 11000) {
      return send(res, 409, false, "Application ID conflict");
    }

    if (error.name === "ValidationError") {
      return send(res, 400, false, error.message);
    }

    return send(res, 500, false, "Failed to update application");
  }
});

// Change status according to the allowed workflow
app.patch("/api/applications/:id/status", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);

    if (!application) {
      return send(res, 404, false, "Application not found");
    }

    const { status } = req.body;

    if (!transitions[application.status]?.includes(status)) {
      return send(
        res, 400, false,
        `Cannot change status from ${application.status} to ${status}`
      );
    }

    application.status = status;
    application.statusHistory.push({
      status,
      date: new Date()
    });

    await application.save();

    return send(res, 200, true, "Status updated", application);
  } catch (error) {
    console.error("Change status error:", error.message);
    return send(res, 500, false, "Failed to update status");
  }
});

// Delete only when Applied or in a final status
app.delete("/api/applications/:id", async (req, res) => {
  try {
    const application = await findApplication(req.params.id);

    if (!application) {
      return send(res, 404, false, "Application not found");
    }

    if (!["Applied", ...FINAL_STATUSES].includes(application.status)) {
      return send(
        res, 400, false,
        "Applications in Interview or Offer status cannot be deleted"
      );
    }

    await application.deleteOne();

    return send(res, 200, true, "Application deleted", {
      applicationId: application.applicationId
    });
  } catch (error) {
    console.error("Delete application error:", error.message);
    return send(res, 500, false, "Failed to delete application");
  }
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`Backend running on port ${PORT}`);
    });
  })
  .catch(error => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
