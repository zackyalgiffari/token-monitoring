import { useState } from 'react';
import { useAlertStore } from '../state/useAlertStore';
import { saveBudget, deleteBudget, listBudgets, listAlertsFired } from '../lib/ipc';
import type { Budget } from '../lib/ipc';
import { fmtCost, fmtDateTime } from '../lib/format';
import { useMetricsStore } from '../state/useMetricsStore';

export function AlertsRoute() {
  const { budgets, setBudgets, alertsFired, setAlertsFired } = useAlertStore();
  const [showForm, setShowForm] = useState(false);
  const [editBudget, setEditBudget] = useState<Budget | null>(null);

  const refresh = async () => {
    setBudgets(await listBudgets());
    setAlertsFired(await listAlertsFired());
  };

  const handleDelete = async (id: number) => {
    await deleteBudget(id);
    refresh();
  };

  const handleEdit = (b: Budget) => {
    setEditBudget(b);
    setShowForm(true);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '48px 1fr', height: '100%', gap: 1, background: 'var(--grid)' }}>
      <div className="panel" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 12 }}>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-1)', letterSpacing: '0.1em' }}>BUDGET RULES</span>
        <div style={{ flex: 1 }} />
        <button className="btn btn-accent" onClick={() => { setEditBudget(null); setShowForm(true); }}>+ NEW RULE</button>
      </div>

      {/* Budget list */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="panel-header"><span className="panel-title">Rules</span></div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Limit</th>
                <th>Period</th>
                <th>Scope</th>
                <th>On</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {budgets.map((b) => (
                <tr key={b.id}>
                  <td style={{ color: 'var(--fg-0)' }}>{b.name}</td>
                  <td style={{ color: 'var(--amber)' }}>{fmtCost(b.limit_usd, 2)}</td>
                  <td style={{ color: 'var(--fg-1)', fontSize: 'var(--font-size-xs)', letterSpacing: '0.06em' }}>{b.period.toUpperCase()}</td>
                  <td style={{ color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)' }}>{scopeLabel(b)}</td>
                  <td>
                    <span style={{ color: b.enabled ? 'var(--green)' : 'var(--fg-2)' }}>
                      {b.enabled ? '●' : '○'}
                    </span>
                  </td>
                  <td>
                    <button className="btn" style={{ marginRight: 4 }} onClick={() => handleEdit(b)}>EDIT</button>
                    <button className="btn btn-danger" onClick={() => handleDelete(b.id)}>DEL</button>
                  </td>
                </tr>
              ))}
              {budgets.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--fg-2)', padding: 16 }}>NO RULES — CREATE ONE</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert history */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div className="panel-header"><span className="panel-title">Alert History</span></div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Rule</th>
                <th style={{ textAlign: 'right' }}>Spent</th>
                <th style={{ textAlign: 'right' }}>Limit</th>
              </tr>
            </thead>
            <tbody>
              {alertsFired.map((a) => (
                <tr key={a.id}>
                  <td style={{ color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)' }}>{fmtDateTime(a.fired_at_ms)}</td>
                  <td style={{ color: 'var(--fg-0)' }}>{a.budget_name}</td>
                  <td style={{ textAlign: 'right', color: 'var(--red)' }}>{fmtCost(a.spent_usd, 4)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--amber)' }}>{fmtCost(a.limit_usd, 2)}</td>
                </tr>
              ))}
              {alertsFired.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--fg-2)', padding: 16 }}>NO ALERTS FIRED</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <BudgetForm
          initial={editBudget}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); refresh(); }}
        />
      )}
    </div>
  );
}

function scopeLabel(b: Budget): string {
  if ('All' in b.scope) return 'all';
  if ('Source' in b.scope) return `source: ${b.scope.Source}`;
  if ('Model' in b.scope) return `model: ${b.scope.Model}`;
  return '';
}

function BudgetForm({ initial, onClose, onSaved }: {
  initial: Budget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [limitUsd, setLimitUsd] = useState(String(initial?.limit_usd ?? 5));
  const [period, setPeriod] = useState<'Daily' | 'Monthly'>(initial?.period ?? 'Daily');
  const [scopeType, setScopeType] = useState<'All' | 'Source' | 'Model'>(() => {
    if (!initial) return 'All';
    if ('Source' in initial.scope) return 'Source';
    if ('Model' in initial.scope) return 'Model';
    return 'All';
  });
  const [scopeVal, setScopeVal] = useState<string>(() => {
    if (!initial) return '';
    if ('Source' in initial.scope) return initial.scope.Source;
    if ('Model' in initial.scope) return initial.scope.Model;
    return '';
  });
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);

  const handleSubmit = async () => {
    const scope =
      scopeType === 'Source' ? { Source: scopeVal } :
      scopeType === 'Model' ? { Model: scopeVal } :
      { All: null };

    const budget: Budget = {
      id: initial?.id ?? 0,
      name, period, enabled,
      limit_usd: parseFloat(limitUsd) || 0,
      scope,
    };
    await saveBudget(budget);
    onSaved();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div className="panel" style={{ width: 380, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--fg-0)', marginBottom: 4 }}>
          {initial ? 'EDIT RULE' : 'NEW RULE'}
        </div>

        <label style={labelStyle}>NAME<input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginTop: 4 }} /></label>
        <label style={labelStyle}>LIMIT (USD)<input className="input" type="number" step="0.01" value={limitUsd} onChange={(e) => setLimitUsd(e.target.value)} style={{ marginTop: 4 }} /></label>

        <div style={labelStyle}>PERIOD
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {(['Daily', 'Monthly'] as const).map((p) => (
              <button key={p} className={`btn ${period === p ? 'btn-accent' : ''}`} onClick={() => setPeriod(p)}>{p.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div style={labelStyle}>SCOPE
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            {(['All', 'Source', 'Model'] as const).map((t) => (
              <button key={t} className={`btn ${scopeType === t ? 'btn-accent' : ''}`} onClick={() => setScopeType(t)}>{t.toUpperCase()}</button>
            ))}
          </div>
          {scopeType !== 'All' && (
            <input className="input" style={{ marginTop: 6 }}
              placeholder={scopeType === 'Source' ? 'claude or codex' : 'e.g. claude-sonnet-4-6'}
              value={scopeVal} onChange={(e) => setScopeVal(e.target.value)}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <label htmlFor="enabled" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-1)', cursor: 'pointer' }}>ENABLED</label>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn" onClick={onClose}>CANCEL</button>
          <button className="btn btn-accent" onClick={handleSubmit}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  color: 'var(--fg-2)',
  letterSpacing: '0.1em',
  display: 'flex',
  flexDirection: 'column',
};
