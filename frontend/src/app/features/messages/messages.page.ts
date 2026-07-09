import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChatService } from '../../core/services/chat.service';
import { SocketService } from '../../core/services/socket.service';
import { Subscription, Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Conversation } from '@models/user.model';

@Component({
  selector: 'pulse-messages',
  templateUrl: './messages.page.html',
  styles: []
})
export class MessagesPageComponent implements OnInit, OnDestroy {
  activeChat: string | null = null;
  newMessage = '';
  searchQuery = '';
  conversations: Conversation[] = [];
  filteredConversations: Conversation[] = [];
  messages: any[] = [];
  chatError: string | null = null;
  isPeerTyping = false;
  private subscriptions: Subscription[] = [];
  private searchSubject = new Subject<string>();

  constructor(
    private chatService: ChatService,
    private socketService: SocketService
  ) {}

  ngOnInit(): void {
    this.chatService.loadConversations();
    this.subscriptions.push(
      this.chatService.conversationsObs.subscribe(convs => {
        this.conversations = convs;
        this.applySearch();
      })
    );

    this.subscriptions.push(
      this.searchSubject.pipe(
        debounceTime(300),
        distinctUntilChanged()
      ).subscribe(() => this.applySearch())
    );

    this.subscriptions.push(
      this.chatService.newMessages$.subscribe(msg => {
        if (msg.matchId === this.activeChat) {
          const userId = localStorage.getItem('userId');
          this.messages.push({
            id: msg.id,
            text: msg.content,
            self: msg.senderId === userId,
            time: new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }
      })
    );

    this.subscriptions.push(
      this.chatService.typingObs$.subscribe(({ matchId, isTyping }) => {
        if (matchId === this.activeChat) {
          this.isPeerTyping = isTyping;
        }
      })
    );

    this.subscriptions.push(
      this.socketService.on('match_message').subscribe((msg: any) => {
        if (msg.matchId === this.activeChat) {
          this.messages.push({
            id: msg.id,
            text: msg.content,
            self: false,
            time: new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          });
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.searchSubject.complete();
  }

  onSearchChange(): void {
    this.searchSubject.next(this.searchQuery);
  }

  private applySearch(): void {
    if (!this.searchQuery.trim()) {
      this.filteredConversations = this.conversations;
    } else {
      const q = this.searchQuery.toLowerCase();
      this.filteredConversations = this.conversations.filter(c =>
        c.peer.displayName.toLowerCase().includes(q)
      );
    }
  }

  selectConversation(convId: string): void {
    this.activeChat = convId;
    this.messages = [];
    this.chatError = null;
    this.isPeerTyping = false;
    this.chatService.getMessages(convId).subscribe({
      next: (res) => {
        const userId = localStorage.getItem('userId');
        this.messages = res.messages.map(m => ({
          id: m.id,
          text: m.content,
          self: m.senderId === userId,
          time: new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
      },
      error: (err) => {
        if (err.error?.error) {
          this.chatError = err.error.error;
        } else {
          this.chatError = 'Could not load messages.';
        }
      }
    });
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.activeChat) return;
    if (this.chatError) return;
    const content = this.newMessage.trim();
    this.newMessage = '';
    this.chatService.sendMessage(this.activeChat, content);
  }

  getActiveConversation(): Conversation | undefined {
    return this.conversations.find(c => c.id === this.activeChat);
  }
}
