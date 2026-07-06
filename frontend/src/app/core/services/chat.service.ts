import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  type: 'text' | 'image' | 'emoji' | 'gif' | 'sticker' | 'voice' | 'video';
  timestamp: Date;
  read: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private messages: Map<string, ChatMessage[]> = new Map();
  private typing$ = new Subject<string>();
  private newMessage$ = new Subject<ChatMessage>();
  private messageRead$ = new Subject<{ messageId: string; chatId: string }>();

  get newMessages$(): Observable<ChatMessage> {
    return this.newMessage$.asObservable();
  }

  get typing$(): Observable<string> {
    return this.typing$.asObservable();
  }

  get readUpdates$(): Observable<{ messageId: string; chatId: string }> {
    return this.messageRead$.asObservable();
  }

  sendMessage(chatId: string, message: ChatMessage): void {
    if (!this.messages.has(chatId)) {
      this.messages.set(chatId, []);
    }
    this.messages.get(chatId)!.push(message);
    this.newMessage$.next(message);
  }

  getMessages(chatId: string): ChatMessage[] {
    return this.messages.get(chatId) || [];
  }

  markAsRead(chatId: string, messageId: string): void {
    this.messageRead$.next({ messageId, chatId });
  }

  sendTypingStatus(userId: string): void {
    this.typing$.next(userId);
  }

  getUnreadCount(userId: string): number {
    let count = 0;
    this.messages.forEach((msgs) => {
      count += msgs.filter(m => m.receiverId === userId && !m.read).length;
    });
    return count;
  }

  clearChat(chatId: string): void {
    this.messages.delete(chatId);
  }
}
