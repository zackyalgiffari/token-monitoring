import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProjectGroup {
  name: string;
  projects: string[];
}

interface ProjectStoreState {
  groups: ProjectGroup[];
  selectedGroup: string | null;
  addGroup: (name: string, projects: string[]) => void;
  updateGroup: (name: string, projects: string[]) => void;
  deleteGroup: (name: string) => void;
  selectGroup: (name: string | null) => void;
}

export const useProjectStore = create<ProjectStoreState>()(
  persist(
    (set) => ({
      groups: [],
      selectedGroup: null,

      addGroup: (name, projects) =>
        set((s) => ({ groups: [...s.groups, { name, projects }] })),

      updateGroup: (name, projects) =>
        set((s) => ({
          groups: s.groups.map((g) => (g.name === name ? { name, projects } : g)),
        })),

      deleteGroup: (name) =>
        set((s) => ({
          groups: s.groups.filter((g) => g.name !== name),
          selectedGroup: s.selectedGroup === name ? null : s.selectedGroup,
        })),

      selectGroup: (name) => set({ selectedGroup: name }),
    }),
    {
      name: 'tm-project-groups',
      // Only persist group definitions, not selection
      partialize: (s) => ({ groups: s.groups }),
    }
  )
);
