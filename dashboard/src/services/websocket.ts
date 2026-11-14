import { ScanEvent } from "@/types";

export type EventCallback = (event: ScanEvent) => void;
export type ConnectionStateCallback = (connected: boolean) => void;

export class ScanWebSocketClient {
  private socket: WebSocket | null = null;
  private listeners: Set<EventCallback> = new Set();
  private connectionListeners: Set<ConnectionStateCallback> = new Set();
  private scanId: string;
  private isExplicitlyClosed = false;

  constructor(scanId: string) {
    this.scanId = scanId;
  }

  public connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN ||
        this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.isExplicitlyClosed = false;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/${this.scanId}`;

    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      this.notifyConnectionState(true);
    };

    this.socket.onmessage = (event) => {
      try {
        const parsed: ScanEvent = JSON.parse(event.data);
        this.notify(parsed);
      } catch (err) {
        console.error("Failed to parse incoming WebSocket scan event:", err);
      }
    };

    this.socket.onerror = (err) => {
      console.warn(`WebSocket error on scan ${this.scanId}:`, err);
      this.notifyConnectionState(false);
    };

    this.socket.onclose = () => {
      this.notifyConnectionState(false);
      if (!this.isExplicitlyClosed) {
        console.info(`WebSocket closed for scan ${this.scanId}`);
      }
    };
  }

  public subscribe(cb: EventCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public onConnectionChange(cb: ConnectionStateCallback): () => void {
    this.connectionListeners.add(cb);
    return () => {
      this.connectionListeners.delete(cb);
    };
  }

  public get isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  private notifyConnectionState(connected: boolean): void {
    this.connectionListeners.forEach((cb) => {
      try {
        cb(connected);
      } catch (err) {
        console.error("Error in connection state listener:", err);
      }
    });
  }

  private notify(event: ScanEvent): void {
    this.listeners.forEach((cb) => {
      try {
        cb(event);
      } catch (err) {
        console.error("Error executing WebSocket event listener:", err);
      }
    });
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.listeners.clear();
    this.connectionListeners.clear();
  }
}
