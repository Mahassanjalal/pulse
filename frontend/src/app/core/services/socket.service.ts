import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: any = null;

  init(url: string, config: any = {}): void { }

  connect(): void { }

  disconnect(): void { }

  on(event: string, callback: (...args: any[]) => void): void { }

  emit(event: string, data?: any): void { }

  auth(token: string): void { }

  joinRoom(roomId: string): void { }

  leaveRoom(roomId: string): void { }

  isConnected(): boolean {
    return false;
  }

  onConnect(callback: () => void): void { }

  onDisconnect(callback: () => void): void { }

  onReconnect(callback: () => void): void { }

  onMatchFound(data: any): void { }

  onMatchEnded(data: any): void { }

  onMessage(data: any): void { }

  onUserTyping(data: any): void { }

  onReaction(data: any): void { }

  onUserOnline(data: any): void { }

  onUserOffline(data: any): void { }
}
