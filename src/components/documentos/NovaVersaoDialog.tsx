"use client";

// Nova versão / conclusão de renovação de um documento (vira a vigente).
import { useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import DatePicker from "@/components/shared/DatePicker";
import { Modal } from "./Dialogos";
import { MSG_EXCEDE_ENVIO, excedeEnvio, fmtBytes } from "./comum";

export default function NovaVersaoDialog({
  documentoId, emRenovacao, onFechar, onSalvo,
}: {
  documentoId: string;
  emRenovacao?: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [validade, setValidade] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!file) return;
    if (excedeEnvio(file)) { setErro(MSG_EXCEDE_ENVIO); return; }
    setSalvando(true); setErro("");
    const fd = new FormData();
    fd.set("file", file);
    if (validade) fd.set("validade", validade);
    if (obs) fd.set("observacao", obs);
    const res = await fetch(`/api/documentos/${documentoId}/versoes`, { method: "POST", body: fd }).catch(() => null);
    setSalvando(false);
    if (res?.ok) { onSalvo(); onFechar(); return; }
    const json = await res?.json().catch(() => null);
    setErro(json?.error || (res?.status === 413 ? MSG_EXCEDE_ENVIO : "Falha ao enviar a versão."));
  }

  return (
    <Modal
      titulo={emRenovacao ? "Concluir renovação" : "Nova versão"}
      onFechar={onFechar}
      bloqueado={salvando}
      rodape={<>
        <Button variant="outline" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button onClick={salvar} disabled={salvando || !file}>
          {salvando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />} Salvar versão
        </Button>
      </>}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Arquivo <span className="text-danger">*</span></Label>
          <input type="file" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setErro(""); }} className="text-sm text-foreground" />
          {file && <p className="text-[11px] text-muted-foreground">{fmtBytes(file.size)}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Nova validade {emRenovacao && <span className="text-xs text-muted-foreground">(conclui a renovação)</span>}</Label>
          <DatePicker value={validade} onChange={setValidade} />
        </div>
        <div className="space-y-1.5">
          <Label>Observação</Label>
          <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder='Ex.: "renovada até 2027"' />
        </div>
        {erro && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{erro}</p>}
      </div>
    </Modal>
  );
}
