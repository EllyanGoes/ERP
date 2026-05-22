"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Check, X, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Campo {
  key: string;
  label: string;
  placeholder?: string;
  width?: string;
  upper?: boolean;
}

interface CadastroSimplesProps {
  title: string;
  description?: string;
  apiPath: string;
  campos: Campo[];
  emptyText?: string;
  initialCreate?: boolean;
  initialValues?: Record<string, string>;
}

type Row = Record<string, unknown> & { id: string; ativo: boolean };

function extractErrorMsg(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e.error === "string") return e.error;
    if (e.error && typeof e.error === "object") {
      const fe = e.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      const first =
        fe.formErrors?.[0] ??
        Object.values(fe.fieldErrors ?? {}).flat()[0];
      if (first) return first;
    }
    if (typeof e.message === "string") return e.message;
  }
  return "Erro ao salvar";
}

export default function CadastroSimples({
  title,
  description,
  apiPath,
  campos,
  emptyText = "Nenhum registro cadastrado",
  initialCreate = false,
  initialValues = {},
}: CadastroSimplesProps) {
  const [rows, setRows]         = useState<Row[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm]         = useState<Record<string, string>>({});
  const [error, setError]       = useState<string | null>(null);

  // Dialog state for new record
  const [showDialog, setShowDialog] = useState(false);
  const [newForm, setNewForm]       = useState<Record<string, string>>({});
  const [newError, setNewError]     = useState<string | null>(null);
  const [newSaving, setNewSaving]   = useState(false);

  const load = async () => {
    setLoading(true);
    const res  = await fetch(apiPath);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : (data.data ?? []));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ── Auto-open dialog from URL param ───────────────────────────────── */
  useEffect(() => {
    if (initialCreate) {
      const vals: Record<string, string> = {};
      campos.forEach((c) => (vals[c.key] = initialValues[c.key] ?? ""));
      setNewForm(vals);
      setNewError(null);
      setShowDialog(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── New record dialog ─────────────────────────────────────────────── */
  function openNew() {
    const empty: Record<string, string> = {};
    campos.forEach((c) => (empty[c.key] = ""));
    setNewForm(empty);
    setNewError(null);
    setShowDialog(true);
  }

  async function saveNew(e: React.FormEvent) {
    e.preventDefault();
    setNewSaving(true); setNewError(null);
    const payload: Record<string, string> = {};
    campos.forEach((c) => {
      payload[c.key] = c.upper ? newForm[c.key].toUpperCase() : newForm[c.key];
    });
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { setNewError(extractErrorMsg(await res.json())); return; }
      setShowDialog(false);
      await load();
    } finally {
      setNewSaving(false);
    }
  }

  /* ── Inline edit ───────────────────────────────────────────────────── */
  const startEdit = (row: Row) => {
    const vals: Record<string, string> = {};
    campos.forEach((c) => (vals[c.key] = (row[c.key] as string) ?? ""));
    setForm(vals);
    setEditingId(row.id);
    setError(null);
  };

  const cancel = () => { setEditingId(null); setError(null); };

  const save = async () => {
    setSaving(true); setError(null);
    const payload: Record<string, string> = {};
    campos.forEach((c) => {
      payload[c.key] = c.upper ? form[c.key].toUpperCase() : form[c.key];
    });
    try {
      const res = await fetch(`${apiPath}/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { setError(extractErrorMsg(await res.json())); return; }
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleAtivo = async (row: Row) => {
    await fetch(`${apiPath}/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !row.ativo }),
    });
    await load();
  };

  return (
    <>
      {/* ── New Record Dialog ─────────────────────────────────────────── */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Novo registro — {title}</h2>
              <button onClick={() => setShowDialog(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={saveNew} className="px-6 py-4 space-y-4">
              {campos.map((c, i) => (
                <div key={c.key} className="space-y-1.5">
                  <Label>{c.label}</Label>
                  <Input
                    value={newForm[c.key] ?? ""}
                    onChange={(e) =>
                      setNewForm((f) => ({
                        ...f,
                        [c.key]: c.upper ? e.target.value.toUpperCase() : e.target.value,
                      }))
                    }
                    placeholder={c.placeholder ?? c.label}
                    autoFocus={i === 0}
                  />
                </div>
              ))}

              {newError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {newError}
                </p>
              )}

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowDialog(false)} disabled={newSaving}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={newSaving}>
                  {newSaving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Check className="w-4 h-4 mr-1" />}
                  Salvar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── List ──────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4 mr-1" /> Novo
          </Button>
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600 uppercase tracking-wide font-semibold">
                {campos.map((c) => (
                  <th key={c.key} className="text-left px-4 py-3 font-semibold" style={{ width: c.width }}>
                    {c.label}
                  </th>
                ))}
                <th className="text-center px-4 py-3 w-24 font-semibold">Ativo</th>
                <th className="px-4 py-3 w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={campos.length + 2} className="py-10 text-center text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={campos.length + 2} className="py-10 text-center text-gray-500 text-xs">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      !row.ativo && "opacity-50",
                      editingId === row.id ? "bg-blue-50/40" : "hover:bg-blue-50/40 transition-colors"
                    )}
                  >
                    {campos.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        {editingId === row.id ? (
                          <Input
                            value={form[c.key]}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                [c.key]: c.upper ? e.target.value.toUpperCase() : e.target.value,
                              }))
                            }
                            className="h-8 text-sm"
                            autoFocus={campos[0].key === c.key}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") save();
                              if (e.key === "Escape") cancel();
                            }}
                          />
                        ) : (
                          <span className="text-gray-900 font-medium">{row[c.key] as string}</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleAtivo(row)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        {row.ativo
                          ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                          : <ToggleLeft  className="w-5 h-5 text-gray-400" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {editingId === row.id ? (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50" onClick={save} disabled={saving}>
                              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-500 hover:bg-gray-100" onClick={cancel}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            size="icon" variant="ghost"
                            className="h-7 w-7 text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                            onClick={() => startEdit(row)}
                            disabled={editingId !== null}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {error && (
            <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
