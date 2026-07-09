import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, Subscription, tap } from 'rxjs';
import { environment } from '@env/environment';
import { PresenceService } from './presence.service';
import { SocketService } from './socket.service';
import { ChatMessage, Conversation } from '@models/user.model';

@Injectable({
  providedIn: 'root'
})
export class ChatService implements OnDestroy {
  private conversations$ = new BehaviorSubject<Conversation[]>([]);
  private newMessage$ = new Subject<ChatMessage>();
  private typing$ = new Subject<{ matchId: string; isTyping: boolean }>();
  private messageRead$ = new Subject<{ messageId: string; chatId: string }>();
  private presenceSub: Subscription;
  private typingSub: Subscription;

  constructor(
    private http: HttpClient,
    private presenceService: PresenceService,
    private socketService: SocketService
  ) {
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

    // Forward real-time peer typing events so the UI can show the indicator.
    this.typingSub = this.socketService.on('peer_typing').subscribe((evt: any) => {
      this.typing$.next({ matchId: evt.matchId, isTyping: !!evt.isTyping });
    });
  }

  ngOnDestroy(): void {
    this.presenceSub?.unsubscribe();
    this.typingSub?.unsubscribe();
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

  startConversation(friendId: string): Observable<{ conversationId: string }> {
    return this.http.post<{ conversationId: string }>(`${environment.apiUrl}/chat/conversations`, { friendId });
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

  /**
   * Update the conversation list in real time when a message arrives over the
   * socket (incoming or outgoing). Moves the conversation to the top, sets the
   * last message, and bumps the unread count for the recipient — unless that
   * conversation is already open (activeChatId), in which case no badge.
   */
  updateConversationWithMessage(message: ChatMessage, currentUserId: string | null, activeChatId: string | null = null): void {
    const conversations = this.conversations$.value.slice();
    const idx = conversations.findIndex(c => c.id === message.matchId);
    if (idx === -1) return;

    const conv = conversations[idx];
    const isIncoming = message.senderId !== currentUserId;
    const isOpen = message.matchId === activeChatId;
    const updated: Conversation = {
      ...conv,
      lastMessage: {
        content: message.content,
        createdAt: message.createdAt || new Date().toISOString(),
      },
      unreadCount: isIncoming && !isOpen ? conv.unreadCount + 1 : (isOpen ? 0 : conv.unreadCount),
    };

    conversations.splice(idx, 1);
    conversations.unshift(updated);
    this.conversations$.next(conversations);
  }

  markAsRead(messageId: string): void {
    this.http.post(`${environment.apiUrl}/chat/messages/${messageId}/read`, {}).subscribe();
  }

  /**
   * Persist read receipts for all currently-unread incoming messages of a
   * conversation (called when the conversation is opened). Also clears the
   * local unread badge.
   */
  markConversationRead(matchId: string, messages: { id: string; senderId: string; read: boolean }[], currentUserId: string | null): void {
    const incomingUnread = messages.filter(m => m.senderId !== currentUserId && !m.read);
    incomingUnread.forEach(m => this.markAsRead(m.id));

    const conversations = this.conversations$.value.slice();
    const idx = conversations.findIndex(c => c.id === matchId);
    if (idx !== -1 && conversations[idx].unreadCount > 0) {
      const updated = { ...conversations[idx], unreadCount: 0 };
      conversations.splice(idx, 1);
      conversations.unshift(updated);
      this.conversations$.next(conversations);
    }
  }

  deleteConversation(matchId: string): Observable<any> {
    return this.http.delete(`${environment.apiUrl}/chat/conversations/${matchId}`);
  }

  getUnreadCount(userId: string): number {
    const conversations = this.conversations$.value;
    return conversations.reduce((acc, c) => acc + c.unreadCount, 0);
  }
}
