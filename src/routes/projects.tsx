import { useState } from 'react';
import { useProjectStore, type ProjectGroup } from '../state/useProjectStore';
import { useMetricsStore } from '../state/useMetricsStore';

export function ProjectsRoute() {
  const { groups, selectedGroup, addGroup, updateGroup, deleteGroup, selectGroup } = useProjectStore();
  const { dailyRollup } = useMetricsStore();
  const [editing, setEditing] = useState<string | null>(null); // null = new, string = group name
  const [formName, setFormName] = useState('');
  const [formSelected, setFormSelected] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);

  // All known project names from historical data
  const allProjects = [...new Set(
    dailyRollup.map((r) => r.project).filter((p): p is string => p !== null)
  )].sort();

  const openNew = () => {
    setEditing(null);
    setFormName('');
    setFormSelected([]);
    setShowForm(true);
  };

  const openEdit = (g: ProjectGroup) => {
    setEditing(g.name);
    setFormName(g.name);
    setFormSelected([...g.projects]);
    setShowForm(true);
  };

  const handleSave = () => {
    const name = formName.trim();
    if (!name || formSelected.length === 0) return;
    if (editing === null) {
      addGroup(name, formSelected);
    } else {
      updateGroup(editing, formSelected);
    }
    setShowForm(false);
  };

  const handleDelete = (name: string) => {
    deleteGroup(name);
    if (showForm && editing === name) setShowForm(false);
  };

  const toggleProject = (p: string) => {
    setFormSelected((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%', gap: 1, background: 'var(--grid)' }}>

      {/* Groups sidebar */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="panel-header" style={{ justifyContent: 'space-between' }}>
          <span className="panel-title">Project Groups</span>
          <button className="btn btn-accent" style={{ padding: '1px 8px' }} onClick={openNew}>+ NEW</button>
        </div>

        {/* All projects shortcut */}
        <div
          onClick={() => { selectGroup(null); setShowForm(false); }}
          style={{
            padding: '10px 12px',
            cursor: 'pointer',
            borderBottom: 'var(--border)',
            background: selectedGroup === null ? 'var(--bg-3)' : 'transparent',
            color: selectedGroup === null ? 'var(--amber)' : 'var(--fg-1)',
            fontSize: 'var(--font-size-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 10, opacity: 0.6 }}>◈</span>
          All Projects
          <span style={{ marginLeft: 'auto', fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)' }}>
            {allProjects.length} detected
          </span>
        </div>

        {groups.map((g) => (
          <GroupItem
            key={g.name}
            group={g}
            active={selectedGroup === g.name}
            onSelect={() => { selectGroup(g.name); setShowForm(false); }}
            onEdit={() => openEdit(g)}
            onDelete={() => handleDelete(g.name)}
          />
        ))}

        {groups.length === 0 && (
          <div style={{ padding: 16, color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)', textAlign: 'center' }}>
            No groups yet. Create one to filter the dashboard by project.
          </div>
        )}
      </div>

      {/* Right panel: form or detail */}
      <div className="panel" style={{ overflow: 'auto' }}>
        {showForm ? (
          <GroupForm
            isNew={editing === null}
            name={formName}
            setName={setFormName}
            selectedProjects={formSelected}
            allProjects={allProjects}
            toggleProject={toggleProject}
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
          />
        ) : selectedGroup ? (
          <GroupDetail group={groups.find((g) => g.name === selectedGroup)!} />
        ) : (
          <AllProjectsDetail projects={allProjects} />
        )}
      </div>
    </div>
  );
}

function GroupItem({ group, active, onSelect, onEdit, onDelete }: {
  group: ProjectGroup;
  active: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '10px 12px',
        cursor: 'pointer',
        borderBottom: 'var(--border)',
        background: active ? 'var(--bg-3)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 'var(--font-size-sm)', color: active ? 'var(--amber)' : 'var(--fg-0)', fontWeight: active ? 600 : 400 }}>
          {group.name}
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', marginTop: 2 }}>
          {group.projects.length} project{group.projects.length !== 1 ? 's' : ''}
        </div>
      </div>
      <button
        className="btn"
        style={{ padding: '1px 6px', fontSize: 'var(--font-size-xs)' }}
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
      >
        EDIT
      </button>
      <button
        className="btn btn-danger"
        style={{ padding: '1px 6px', fontSize: 'var(--font-size-xs)' }}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
      >
        ✕
      </button>
    </div>
  );
}

function GroupForm({ isNew, name, setName, selectedProjects, allProjects, toggleProject, onSave, onCancel }: {
  isNew: boolean;
  name: string;
  setName: (n: string) => void;
  selectedProjects: string[];
  allProjects: string[];
  toggleProject: (p: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--fg-2)', marginBottom: 20 }}>
        {isNew ? 'NEW PROJECT GROUP' : 'EDIT PROJECT GROUP'}
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
          GROUP NAME
        </label>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          placeholder="e.g. Work, Personal, Client A"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isNew}
          autoFocus
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.08em', display: 'block', marginBottom: 8 }}>
          PROJECTS ({selectedProjects.length} selected)
        </label>
        {allProjects.length === 0 ? (
          <div style={{ color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)' }}>
            No projects detected yet. Projects are auto-detected from your cwd when Claude Code runs.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 320, overflow: 'auto' }}>
            {allProjects.map((p) => {
              const checked = selectedProjects.includes(p);
              return (
                <label
                  key={p}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px',
                    cursor: 'pointer',
                    background: checked ? 'var(--bg-3)' : 'transparent',
                    border: 'var(--border)',
                    color: checked ? 'var(--fg-0)' : 'var(--fg-1)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleProject(p)}
                    style={{ accentColor: 'var(--amber)' }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>{p}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-accent"
          onClick={onSave}
          disabled={!name.trim() || selectedProjects.length === 0}
        >
          {isNew ? 'CREATE GROUP' : 'SAVE CHANGES'}
        </button>
        <button className="btn" onClick={onCancel}>CANCEL</button>
      </div>
    </div>
  );
}

function GroupDetail({ group }: { group: ProjectGroup }) {
  return (
    <div style={{ padding: 24, maxWidth: 560 }}>
      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--fg-2)', marginBottom: 4 }}>
        GROUP
      </div>
      <div style={{ fontSize: 'var(--font-size-xl)', color: 'var(--amber)', marginBottom: 20 }}>
        {group.name}
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', letterSpacing: '0.08em', marginBottom: 8 }}>
        INCLUDED PROJECTS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {group.projects.map((p) => (
          <div key={p} style={{ padding: '6px 10px', border: 'var(--border)', color: 'var(--fg-1)', fontSize: 'var(--font-size-sm)' }}>
            {p}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)' }}>
        Selecting this group filters the Dashboard and Analytics views to only show data from these projects.
      </div>
    </div>
  );
}

function AllProjectsDetail({ projects }: { projects: string[] }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, letterSpacing: '0.15em', color: 'var(--fg-2)', marginBottom: 4 }}>
        ALL DETECTED PROJECTS
      </div>
      <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--fg-2)', marginBottom: 16 }}>
        These project names are auto-detected from the <code style={{ color: 'var(--cyan)' }}>cwd</code> of each Claude/Codex session.
        Create a group to bundle them and filter the dashboard.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {projects.map((p) => (
          <span key={p} style={{ padding: '3px 10px', border: 'var(--border)', color: 'var(--fg-1)', fontSize: 'var(--font-size-xs)' }}>
            {p}
          </span>
        ))}
        {projects.length === 0 && (
          <span style={{ color: 'var(--fg-2)', fontSize: 'var(--font-size-xs)' }}>
            No projects detected yet.
          </span>
        )}
      </div>
    </div>
  );
}
