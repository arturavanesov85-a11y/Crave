'use client';

// Доступы сотрудника: роль как шаблон и отдельные галочки по правам и направлениям.
import { useState } from 'react';

type Group = { title: string; perms: [string, string][] };

export function AccessEditor({ isOwnerEditingSelf, role: role0, roles, roleLabels, groups, directions, current }: { isOwnerEditingSelf: boolean; role: string; roles: Record<string, { perms: string[]; directions: string[] }>; roleLabels: Record<string, string>; groups: Group[]; directions: [string, string][]; current: { perms: string[]; directions: string[]; custom: boolean } }) {
  const [role, setRole] = useState(role0);
  const [perms, setPerms] = useState<string[]>(current.perms);
  const [dirs, setDirs] = useState<string[]>(current.directions);
  const isOwner = role === 'owner';
  const def = roles[role];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  const custom = !isOwner && (!same(perms, def.perms) || !same(dirs, def.directions));
  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <section className="card pad stack">
      <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <h2>Роль и доступы</h2>
        {isOwner ? <span className="tag gold">полный доступ</span> : custom ? <span className="tag gold">настроены вручную</span> : <span className="tag">как у роли</span>}
      </div>
      <label className="field" style={{ maxWidth: 360 }}>Роль (шаблон прав)
        <select
          className="input"
          name="role"
          value={role}
          disabled={isOwnerEditingSelf}
          onChange={(e) => {
            const r = e.target.value;
            setRole(r);
            setPerms(roles[r].perms);
            setDirs(roles[r].directions);
          }}
        >
          {Object.keys(roles).map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
        </select>
      </label>
      {isOwnerEditingSelf ? <input type="hidden" name="role" value={role} /> : null}
      {isOwner ? (
        <p className="muted small">У владельца всегда полный доступ ко всем разделам.</p>
      ) : (
        <>
          <div className="wrap-row">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setPerms(def.perms); setDirs(def.directions); }} disabled={!custom}>Вернуть права роли</button>
            <span className="muted small">Разделы без доступа сотрудник не увидит в меню. Изменения действуют сразу после сохранения.</span>
          </div>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="eyebrow" style={{ marginBottom: 8 }}>Направления (какие клиенты и заявки видны)</legend>
            <div className="wrap-row">
              {directions.map(([d, l]) => (
                <label key={d} className="check"><input type="checkbox" name={`dir_${d}`} checked={dirs.includes(d)} onChange={() => toggle(dirs, setDirs, d)} />{l}</label>
              ))}
            </div>
          </fieldset>
          <div className="boxes">
            {groups.map((g) => (
              <fieldset key={g.title} className="box" style={{ margin: 0 }}>
                <legend className="eyebrow" style={{ padding: '0 4px' }}>{g.title}</legend>
                {g.perms.map(([p, l]) => (
                  <label key={p} className="check small" style={{ minHeight: 34 }}>
                    <input type="checkbox" name={`perm_${p}`} checked={perms.includes(p)} disabled={p === 'users.manage'} onChange={() => toggle(perms, setPerms, p)} />
                    <span>{l}{def.perms.includes(p) !== perms.includes(p) ? <span className="gold"> ·изм.</span> : null}</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <p className="muted small">«Сотрудники и доступы» есть только у владельца.</p>
        </>
      )}
    </section>
  );
}
