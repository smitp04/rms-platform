'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LookupOption {
  id: string;
  name: string;
}

interface ProfileMe {
  id: string;
  name: string;
  email: string;
  platforms: LookupOption[];
  skills: LookupOption[];
}

export function ProfileEditModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const {
    data: me,
    isLoading,
    error: loadError,
  } = useQuery<ProfileMe>({
    queryKey: ['me'],
    queryFn: async () => {
      const res = await fetch('/api/v1/me');
      const r = await res.json();
      if (!res.ok || !r.success) throw new Error(r.error ?? `Failed to load profile (${res.status})`);
      return r.data as ProfileMe;
    },
    retry: false,
  });

  const { data: platformsData, isPending: platformsPending } = useQuery({
    queryKey: ['lookup-platforms'],
    queryFn: () => fetch('/api/v1/platforms').then((r) => r.json()),
    staleTime: 300_000,
  });

  const { data: skillsData, isPending: skillsPending } = useQuery({
    queryKey: ['lookup-skills'],
    queryFn: async () => {
      const res = await fetch('/api/v1/skills');
      const r = await res.json();
      if (!res.ok || !r.success) throw new Error(r.error ?? 'Failed to load skills');
      return r;
    },
    staleTime: 0,
  });

  const allPlatforms: LookupOption[] = platformsData?.data ?? [];
  const allSkills: { id: string; name: string; platform_id: string | null }[] = skillsData?.data ?? [];

  const [name, setName] = useState('');
  const [skillIds, setSkillIds] = useState<string[]>([]);

  useEffect(() => {
    if (me) {
      setName(me.name);
      setSkillIds(me.skills.map((s) => s.id));
    }
  }, [me]);

  const selectedSkillSet = new Set(skillIds);

  const platformIds = [
    ...new Set(
      allSkills.filter((s) => selectedSkillSet.has(s.id) && s.platform_id).map((s) => s.platform_id as string),
    ),
  ];

  const skillsByPlatform = allPlatforms
    .map((platform) => ({
      platform,
      skills: allSkills.filter((s) => s.platform_id === platform.id),
    }))
    .filter((group) => group.skills.length > 0);

  function toggleSkill(skillId: string) {
    setSkillIds((prev) => (prev.includes(skillId) ? prev.filter((id) => id !== skillId) : [...prev, skillId]));
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!me) return;
      const res = await fetch(`/api/v1/employees/${me.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          platform_ids: platformIds,
          skill_ids: skillIds,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 transition-opacity" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Edit Profile</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {loadError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                {(loadError as Error).message}
              </div>
            ) : isLoading || !me || platformsPending || skillsPending ? (
              <div className="text-sm text-gray-500">Loading…</div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 dark:text-gray-200 dark:bg-gray-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Email</label>
                  <input
                    type="email"
                    value={me.email}
                    disabled
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Synced from Google — cannot be changed.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">Skills</label>
                  <div className="space-y-4">
                    {skillsByPlatform.map(({ platform, skills }) => (
                      <div key={platform.id}>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{platform.name}</p>
                        <div className="flex flex-wrap gap-2">
                          {skills.map((skill) => {
                            const selected = selectedSkillSet.has(skill.id);
                            return (
                              <button
                                key={skill.id}
                                type="button"
                                onClick={() => toggleSkill(skill.id)}
                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                  selected
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400'
                                }`}
                              >
                                {skill.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!me || !name.trim() || saveMutation.isPending}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
