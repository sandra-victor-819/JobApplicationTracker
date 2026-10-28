
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://localhost:5000/api/applications";
const STATUSES = ["Applied", "Interview", "Offer", "Rejected", "Accepted", "Declined"];
const NEXT = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Declined"],
  Rejected: [],
  Accepted: [],
  Declined: [],
};
const today = new Date().toLocaleDateString("en-CA");

const emptyForm = {
  companyName: "",
  jobRole: "",
  jobType: "Full-time",
  appliedDate: today,
  expectedSalary: "",
  notes: "",
};

export default function App() {
  const [applications, setApplications] = useState([]);
  const [counts, setCounts] = useState({});
  const [status, setStatus] = useState("");
  const [company, setCompany] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [details, setDetails] = useState(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.message || "Something went wrong");
    }
    return result.data;
  }

  async function load() {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (company.trim()) params.set("company", company.trim());
      const data = await request(`${API}?${params.toString()}`);
      setApplications(data.applications);
      setCounts(data.counts);
    } catch (error) {
      setMessage(error.message);
    }
  }

  useEffect(() => {
    load();
  }, [status, company]);

  function changeField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function startEdit(application) {
    setEditing(application.applicationId);
    setForm({
      companyName: application.companyName,
      jobRole: application.jobRole,
      jobType: application.jobType,
      appliedDate: application.appliedDate.slice(0, 10),
      expectedSalary: application.expectedSalary ?? "",
      notes: application.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
  }

  async function saveApplication(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const payload = {
        companyName: form.companyName,
        jobRole: form.jobRole,
        jobType: form.jobType,
        expectedSalary: form.expectedSalary,
        notes: form.notes,
      };

      if (!editing) {
        payload.appliedDate = form.appliedDate;
      }

      await request(
        editing ? `${API}/${encodeURIComponent(editing)}` : API,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(payload),
        }
      );

      setMessage(editing ? "Application updated successfully." : "Application added successfully.");
      resetForm();
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(application, newStatus) {
    if (!newStatus) return;
    try {
      await request(`${API}/${encodeURIComponent(application.applicationId)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setMessage("Application status updated.");
      await load();
      if (details?.applicationId === application.applicationId) {
        setDetails(await request(`${API}/${encodeURIComponent(application.applicationId)}`));
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteApplication(application) {
    if (!window.confirm(`Delete the application for ${application.companyName}?`)) return;
    try {
      await request(`${API}/${encodeURIComponent(application.applicationId)}`, {
        method: "DELETE",
      });
      setMessage("Application deleted.");
      if (details?.applicationId === application.applicationId) setDetails(null);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function openDetails(application) {
    try {
      setDetails(await request(`${API}/${encodeURIComponent(application.applicationId)}`));
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-content">
          <span className="eyebrow">YOUR CAREER, ORGANIZED</span>
          <h1>Job Application Tracker</h1>
          <p>Keep every opportunity, interview and next step in one place.</p>
        </div>
        <div className="hero-icon" aria-hidden="true">✦</div>
      </header>

      {message && (
        <div className="notice" role="status">
          <span>{message}</span>
          <button className="close-notice" onClick={() => setMessage("")} aria-label="Dismiss message">×</button>
        </div>
      )}

      <section className="stats">
        {STATUSES.map((item) => (
          <button
            key={item}
            className={`stat-card ${status === item ? "selected" : ""}`}
            onClick={() => setStatus(status === item ? "" : item)}
          >
            <span>{item}</span>
            <strong>{counts[item] ?? 0}</strong>
          </button>
        ))}
      </section>

      <section className="panel form-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{editing ? "UPDATE DETAILS" : "NEW OPPORTUNITY"}</span>
            <h2>{editing ? "Edit application" : "Add an application"}</h2>
          </div>
          {editing && <button className="button secondary" onClick={resetForm}>Cancel edit</button>}
        </div>

        <form onSubmit={saveApplication}>
          <div className="form-grid">
            <label>
              Company name *
              <input name="companyName" value={form.companyName} onChange={changeField} required maxLength={100} placeholder="e.g. Infosys" />
            </label>
            <label>
              Job role *
              <input name="jobRole" value={form.jobRole} onChange={changeField} required maxLength={100} placeholder="e.g. Software Engineer" />
            </label>
            <label>
              Job type *
              <select name="jobType" value={form.jobType} onChange={changeField} required>
                <option>Full-time</option>
                <option>Internship</option>
                <option>Contract</option>
              </select>
            </label>
            {!editing && (
              <label>
                Applied date *
                <input type="date" name="appliedDate" value={form.appliedDate} max={today} onChange={changeField} required />
              </label>
            )}
            <label>
              Expected salary (optional)
              <input type="number" name="expectedSalary" min="0" value={form.expectedSalary} onChange={changeField} placeholder="e.g. 500000" />
            </label>
            <label className="full-width">
              Notes (optional)
              <textarea name="notes" value={form.notes} onChange={changeField} rows="3" placeholder="Recruiter details, preparation notes..." />
            </label>
          </div>
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Saving..." : editing ? "Save changes" : "+ Add application"}
          </button>
        </form>
      </section>

      <section className="panel list-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR OPPORTUNITIES</span>
            <h2>Applications <span className="total">{applications.length}</span></h2>
          </div>
          <button className="button secondary" onClick={load}>Refresh</button>
        </div>

        <div className="filters">
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="Search company..."
            aria-label="Search company"
          />
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option>
            {STATUSES.map((item) => <option key={item}>{item}</option>)}
          </select>
          {(company || status) && <button className="button secondary" onClick={() => { setCompany(""); setStatus(""); }}>Clear filters</button>}
        </div>

        {applications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⌕</div>
            <h3>No applications found</h3>
            <p>Add an application above or change your search filters.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Company & role</th>
                  <th>Applied date</th>
                  <th>Status</th>
                  <th>Next action</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => {
                  const canDelete = ["Applied", "Rejected", "Accepted", "Declined"].includes(a.status);
                  return (
                    <tr key={a._id}>
                      <td><strong className="application-id">{a.applicationId}</strong></td>
                      <td>
                        <strong>{a.companyName}</strong>
                        <span className="subtext">{a.jobRole}</span>
                        <span className="subtext">{a.jobType}</span>
                      </td>
                      <td>{new Date(a.appliedDate).toLocaleDateString()}</td>
                      <td>
                        <span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span>
                        {a.isOverdue && <span className="overdue">Follow-up Overdue</span>}
                      </td>
                      <td>
                        {NEXT[a.status].length ? (
                          <select
                            className="next-select"
                            defaultValue=""
                            onChange={(event) => changeStatus(a, event.target.value)}
                            aria-label={`Change status for ${a.companyName}`}
                          >
                            <option value="">Change status</option>
                            {NEXT[a.status].map((s) => <option key={s}>{s}</option>)}
                          </select>
                        ) : <span className="subtext">Final status</span>}
                      </td>
                      <td>
                        <div className="actions">
                          <button className="text-button" onClick={() => openDetails(a)}>Details</button>
                          <button className="text-button" onClick={() => startEdit(a)}>Edit</button>
                          <button className="text-button danger" disabled={!canDelete} title={!canDelete ? "Cannot delete during Interview or Offer" : "Delete application"} onClick={() => deleteApplication(a)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {details && (
        <div className="modal-backdrop" onClick={() => setDetails(null)}>
          <section className="panel details-panel" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">APPLICATION TIMELINE</span>
                <h2>{details.companyName}</h2>
                <p>{details.jobRole} · {details.applicationId}</p>
              </div>
              <button className="button secondary" onClick={() => setDetails(null)}>Close</button>
            </div>
            <div className="detail-grid">
              <p><strong>Job type</strong><span>{details.jobType}</span></p>
              <p><strong>Applied date</strong><span>{new Date(details.appliedDate).toLocaleDateString()}</span></p>
              <p><strong>Expected salary</strong><span>{details.expectedSalary == null ? "Not specified" : Number(details.expectedSalary).toLocaleString()}</span></p>
              <p><strong>Follow-up date</strong><span>{new Date(details.followUpDate).toLocaleDateString()}</span></p>
              <p className="full-width"><strong>Notes</strong><span>{details.notes || "No notes"}</span></p>
            </div>
            <h3>Status history</h3>
            <ol className="timeline">
              {details.statusHistory?.map((entry, index) => (
                <li key={`${entry.status}-${index}`}>
                  <span className="timeline-dot" />
                  <div><strong>{entry.status}</strong><span>{new Date(entry.date).toLocaleString()}</span></div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      <footer>Job Application Tracker · Stay organized, move forward.</footer>
    </main>
  );
}
