import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, Subscription, tap } from 'rxjs';
import { environment } from '@env/environment';
import { PresenceService } from './presence.service';

export interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  matchId: string;
  content: string;
  type: 'text' | 'image' | 'voice' | 'video' | 'emoji' | 'gif' | 'sticker';
  timestamp: Date;
  createdAt?: string;
  read: boolean;
  deleted: boolean;
}

export interface Conversation {
  id: string;
  peer: {
    id: string;
    displayName: string;
    profilePicture: string;
    status: string;
  };
  lastMessage: {
    content: string;
    createdAt: string;
  } | null;
  unreadCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService implements OnDestroy {
  private conversations$ = new BehaviorSubject<Conversation[]>([]);
  private newMessage$ = new Subject<ChatMessage>();
  private typing$ = new Subject<{ matchId: string; isTyping: boolean }>();
  private messageRead$ = new Subject<{ messageId: string; chatId: string }>();
  private presenceSub: Subscription;

  constructor(private http: HttpClient, private presenceService: PresenceService) {
    this.presenceSub = this.presenceService.onPresenceChanged$.subscribe(({ userId, status }) => {
      const current = this.conversations$.value;
      let changed = false;
      const updated = current.map(c => {
        if (c.peer.id === userId && c.peer.status !== status) {
          changed = true;
          return { ...c, peer: { ...c.peer, status } };
        }
        return c;
      });
      if (changed) {
        this.conversations$.next(updated);
      }
    });
  }

  ngOnDestroy(): void {
    this.presenceSub?.unsubscribe();
  }

  get conversationsObs(): Observable<Conversation[]> {
    return this.conversations$.asObservable();
  }

  get newMessages$(): Observable<ChatMessage> {
    return this.newMessage$.asObservable();
  }

  get typingObs$(): Observable<{ matchId: string; isTyping: boolean }> {
    return this.typing$.asObservable();
  }

  get readUpdates$(): Observable<{ messageId: string; chatId: string }> {
    return this.messageRead$.asObservable();
  }

  loadConversations(): void {
    this.http.get<{ conversations: Conversation[] }>(`${environment.apiUrl}/chat/conversations`).subscribe({
      next: (res) => {
        this.conversations$.next(res.conversations);
        const peerIds = res.conversations.map(c => c.peer.id);
        if (peerIds.length > 0) {
          this.presenceService.syncUsers(peerIds);
        }
      },
      error: () => this.conversations$.next([])
    });
  }

  getMessages(matchId: string, cursor?: string): Observable<{ messages: ChatMessage[]; nextCursor?: string }> {
    let url = `${environment.apiUrl}/chat/messages/${matchId}?limit=50`;
    if (cursor) url += `&cursor=${cursor}`;
    return this.http.get<{ messages: ChatMessage[]; nextCursor?: string }>(url);
  }

  sendMessage(matchId: string, content: string, type = 'TEXT'): void {
    this.http.post<{ message: ChatMessage }>(`${environment.apiUrl}/chat/messages`, { matchId, content, type }).subscribe({
      next: (res) => this.newMessage$.next(res.message),
      error: (err) => console.error('Failed to send message:', err)
    });
  }

  markAsRead(messageId: string): void {
    this.http.post(`${environment.apiUrl}/chat/messages/${messageId}/read`, {}).subscribe();
  }

  getUnreadCount(userId: string): number {
    const conversations = this.conversations$.value;
    return conversations.reduce((acc, c) => acc + c.unreadCount, 0);
  }
}
