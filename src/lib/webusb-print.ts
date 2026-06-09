// Envia bytes (ESC/POS) direto para uma impressora USB pelo navegador, via WebUSB.
// Sem janela de impressão, sem driver no servidor. Requer Chrome/Edge + HTTPS.
// Na 1ª vez o usuário escolhe a impressora (permissão do navegador); depois é só clicar.

// ── tipos mínimos do WebUSB (não existem no lib DOM padrão) ──────────────────
type USBEndpoint = { endpointNumber: number; direction: "in" | "out"; type: "bulk" | "interrupt" | "isochronous" };
type USBAlternateInterface = { endpoints: USBEndpoint[] };
type USBInterfaceInfo = { interfaceNumber: number; alternate: USBAlternateInterface; claimed: boolean };
type USBConfiguration = { interfaces: USBInterfaceInfo[] } | null;
type USBOutResult = { status: "ok" | "stall" | "babble"; bytesWritten: number };
type USBDevice = {
  productName?: string;
  configuration: USBConfiguration;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(configurationValue: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<USBOutResult>;
};
type USB = {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: { filters: Array<Record<string, number>> }): Promise<USBDevice>;
};

function getUsb(): USB | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as unknown as { usb?: USB };
  return nav.usb ?? null;
}

export function isWebUsbSupported(): boolean {
  return getUsb() !== null;
}

// Acha a interface + endpoint BULK OUT (por onde se mandam os dados de impressão).
function findBulkOut(device: USBDevice): { iface: number; endpoint: number } {
  const interfaces = device.configuration?.interfaces ?? [];
  for (const intf of interfaces) {
    for (const ep of intf.alternate.endpoints) {
      if (ep.direction === "out" && ep.type === "bulk") {
        return { iface: intf.interfaceNumber, endpoint: ep.endpointNumber };
      }
    }
  }
  throw new Error("Impressora sem endpoint de saída compatível (não parece uma impressora ESC/POS USB).");
}

/**
 * Imprime os bytes na impressora USB.
 * - Reutiliza uma impressora já autorizada; se não houver, abre o seletor do navegador.
 * - `forcePicker` força a escolha de outra impressora.
 */
export async function printEscPosUSB(data: Uint8Array, forcePicker = false): Promise<void> {
  const usb = getUsb();
  if (!usb) throw new Error("Este navegador não suporta WebUSB. Use o Google Chrome ou o Microsoft Edge.");

  let device: USBDevice | undefined;
  if (!forcePicker) {
    const granted = await usb.getDevices();
    device = granted[0];
  }
  if (!device) {
    // filters: [] mostra todos os dispositivos USB para o usuário escolher a impressora
    device = await usb.requestDevice({ filters: [] });
  }

  await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const { iface, endpoint } = findBulkOut(device);
  await device.claimInterface(iface);

  // Envia em blocos para impressoras com buffer pequeno.
  const CHUNK = 4096;
  for (let i = 0; i < data.length; i += CHUNK) {
    const res = await device.transferOut(endpoint, data.slice(i, i + CHUNK));
    if (res.status !== "ok") throw new Error(`Falha ao enviar para a impressora (status: ${res.status}).`);
  }
  // Não fecha o device: mantém a permissão e agiliza impressões seguidas.
}
