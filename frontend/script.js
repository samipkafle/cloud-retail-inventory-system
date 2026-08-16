:root {
  --bg: #f4f8f5;
  --surface: #ffffff;
  --surface-soft: #eef6f0;
  --border: #d8e4dc;
  --text: #17251c;
  --muted: #66756b;
  --primary: #167a42;
  --primary-dark: #0f5e31;
  --warning: #b7791f;
  --danger: #b42318;
  --success: #087443;
  --shadow: 0 14px 40px rgba(15, 94, 49, 0.1);
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, Helvetica, sans-serif;
  background: var(--bg);
  color: var(--text);
}

button,
input,
select {
  font: inherit;
}

button {
  border: 0;
  border-radius: 8px;
  background: var(--primary);
  color: #ffffff;
  cursor: pointer;
  font-weight: 700;
  padding: 0.8rem 1rem;
}

button:hover {
  background: var(--primary-dark);
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.secondary-button {
  background: #e4efe8;
  color: var(--primary-dark);
}

.secondary-button:hover {
  background: #d3e5d9;
}

input,
select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #ffffff;
  color: var(--text);
  padding: 0.75rem;
}

input:focus,
select:focus {
  border-color: var(--primary);
  outline: 3px solid rgba(22, 122, 66, 0.16);
}

.app-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 430px);
  gap: 1.5rem;
  align-items: start;
  padding: 2rem;
  background: linear-gradient(135deg, #123f27 0%, #1f7a46 100%);
  color: #ffffff;
}

.eyebrow {
  margin: 0 0 0.5rem;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.app-header h1 {
  margin: 0;
  font-size: clamp(2rem, 4vw, 3.6rem);
  line-height: 1.05;
}

.header-text {
  max-width: 620px;
  margin: 1rem 0 0;
  color: #d9f0e2;
  font-size: 1.05rem;
}

.api-panel {
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  padding: 1rem;
}

.badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #ffffff;
  color: var(--primary-dark);
  font-size: 0.78rem;
  font-weight: 800;
  padding: 0.35rem 0.7rem;
}

.badge.live {
  color: #ffffff;
  background: var(--success);
}

.api-form {
  display: grid;
  gap: 0.55rem;
  margin-top: 1rem;
}

.api-form label {
  color: #edf9f1;
  font-size: 0.9rem;
  font-weight: 700;
}

.api-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
}

.api-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.page-shell {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1.5rem 0 2rem;
}

.status-message {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
  margin-bottom: 1rem;
  padding: 0.95rem 1rem;
}

.status-message.success {
  border-color: rgba(8, 116, 67, 0.35);
  color: var(--success);
}

.status-message.error {
  border-color: rgba(180, 35, 24, 0.35);
  color: var(--danger);
}

.status-message.warning {
  border-color: rgba(183, 121, 31, 0.35);
  color: var(--warning);
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.summary-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
  padding: 1rem;
}

.summary-card span {
  color: var(--muted);
  display: block;
  font-size: 0.88rem;
  margin-bottom: 0.35rem;
}

.summary-card strong {
  display: block;
  font-size: 1.7rem;
}

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
  padding: 1rem;
}

.panel-heading {
  margin-bottom: 1rem;
}

.panel-heading h2 {
  margin: 0 0 0.25rem;
  font-size: 1.2rem;
}

.panel-heading p {
  color: var(--muted);
  margin: 0;
}

.form-grid {
  display: grid;
  gap: 0.85rem;
}

.form-grid label {
  display: grid;
  gap: 0.35rem;
  color: var(--muted);
  font-size: 0.9rem;
  font-weight: 700;
}

.product-detail {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-soft);
  margin-top: 1rem;
  padding: 0.85rem;
}

.table-heading {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.low-stock-note {
  align-self: start;
  border-radius: 999px;
  background: var(--surface-soft);
  color: var(--primary-dark);
  font-size: 0.85rem;
  font-weight: 700;
  padding: 0.45rem 0.75rem;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  border-bottom: 1px solid var(--border);
  padding: 0.85rem;
  text-align: left;
  vertical-align: middle;
}

th {
  color: var(--muted);
  font-size: 0.82rem;
  text-transform: uppercase;
}

.stock-pill,
.status-pill {
  display: inline-flex;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 800;
  padding: 0.35rem 0.65rem;
}

.status-ok {
  background: #e4f4ea;
  color: var(--success);
}

.status-low {
  background: #fff4dc;
  color: var(--warning);
}

.status-sold-out {
  background: #fee4e2;
  color: var(--danger);
}

.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.action-row button {
  padding: 0.55rem 0.7rem;
}

.action-row input {
  max-width: 90px;
  padding: 0.55rem;
}

.danger-button {
  background: var(--danger);
}

.danger-button:hover {
  background: #8f1c13;
}

.empty-state {
  color: var(--muted);
  margin-bottom: 0;
  text-align: center;
}

.is-busy button {
  pointer-events: none;
  opacity: 0.7;
}

@media (max-width: 980px) {
  .app-header,
  .workspace-grid {
    grid-template-columns: 1fr;
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 620px) {
  .app-header {
    padding: 1.25rem;
  }

  .api-row,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .page-shell {
    width: min(100% - 1rem, 1180px);
  }

  th,
  td {
    padding: 0.7rem;
  }
}
