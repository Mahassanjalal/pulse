import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChatService, Conversation, ChatMessage } from '../../core/services/chat.service';
import { SocketService } from '../../core/services/socket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'pulse-messages',
  templateUrl: './messages.page.html',
  styles: []
})
export class MessagesPageComponent implements OnInit, OnDestroy {
  activeChat: string | null = null;
  newMessage = '';
  conversations: Conversation[] = [];
  messages: any[] = [];
  private subscriptions: Subscription[] = [];

  constructor(
    private chatService: ChatService,
    private socketService: SocketService
  ) {}

  ngOnInit(): void {
    this.chatService.loadConversations();
    this.subscriptions.push(
      this.chatService.conversationsObs.subscribe(convs => this.conversations = convs)
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
  }

  selectConversation(convId: string): void {
    this.activeChat = convId;
    this.messages = [];
    this.chatService.getMessages(convId).subscribe({
      next: (res) => {
        const userId = localStorage.getItem('userId');
        this.messages = res.messages.map(m => ({
          id: m.id,
          text: m.content,
          self: m.senderId === userId,
          time: new Date(m.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }));
      }
    });
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.activeChat) return;
    const content = this.newMessage.trim();
    this.newMessage = '';
    this.chatService.sendMessage(this.activeChat, content);
  }

  getActiveConversation(): Conversation | undefined {
    return this.conversations.find(c => c.id === this.activeChat);
  }
}
