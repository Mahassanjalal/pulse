import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';
import { SocketService } from '../../core/services/socket.service';
import { FriendService } from '../../core/services/friend.service';
import { Subscription, Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Conversation, Friend } from '@models/user.model';

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
  showFriendPicker = false;
  friends: Friend[] = [];
  mobileShowChat = false;
  private subscriptions: Subscription[] = [];
  private searchSubject = new Subject<string>();

  constructor(
    private chatService: ChatService,
    private socketService: SocketService,
    private friendService: FriendService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.chatService.loadConversations();
    this.friendService.loadFriends();
    this.subscriptions.push(
      this.chatService.conversationsObs.subscribe(convs => {
        this.conversations = convs;
        this.applySearch();
      })
    );

    this.subscriptions.push(
      this.friendService.friendsObs.subscribe(friends => {
        this.friends = friends;
      })
    );

    this.subscriptions.push(
      this.route.queryParams.subscribe(params => {
        const userId = params['userId'];
        if (userId) {
          this.startConversationWith(userId);
        }
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
        const userId = localStorage.getItem('userId');
        this.chatService.updateConversationWithMessage(msg, userId, this.activeChat);
        if (msg.matchId === this.activeChat) {
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
        const userId = localStorage.getItem('userId');
        this.chatService.updateConversationWithMessage(msg, userId, this.activeChat);
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

  onTyping(): void {
    if (this.activeChat) {
      this.socketService.sendTyping(this.activeChat, true);
    }
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
    this.mobileShowChat = true;
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
        // Persist read receipts for incoming messages in this conversation.
        this.chatService.markConversationRead(convId, res.messages, userId);
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

  deleteConversation(convId: string): void {
    this.chatService.deleteConversation(convId).subscribe({
      next: () => {
        this.conversations = this.conversations.filter(c => c.id !== convId);
        this.applySearch();
        if (this.activeChat === convId) {
          this.activeChat = null;
          this.mobileShowChat = false;
          this.messages = [];
        }
      },
      error: (err) => {
        this.chatError = err?.error?.error || 'Could not delete conversation.';
      }
    });
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.activeChat) return;
    if (this.chatError) return;
    const content = this.newMessage.trim();
    this.newMessage = '';
    if (this.activeChat) {
      this.socketService.sendTyping(this.activeChat, false);
    }
    this.chatService.sendMessage(this.activeChat, content);
  }

  openFriendPicker(): void {
    this.friendService.loadFriends();
    this.showFriendPicker = true;
  }

  closeFriendPicker(): void {
    this.showFriendPicker = false;
  }

  startConversationWith(friendId: string): void {
    this.showFriendPicker = false;
    this.chatService.startConversation(friendId).subscribe({
      next: (res) => {
        this.chatService.loadConversations();
        this.router.navigate([], { queryParams: {}, replaceUrl: true });
        this.selectConversation(res.conversationId);
      },
      error: (err) => {
        this.chatError = err?.error?.error || 'Could not start conversation.';
      }
    });
  }

  sendFriendRequest(): void {
    const userId = this.route.snapshot.queryParams['userId'];
    if (!userId) return;
    this.friendService.sendRequest(userId).subscribe({
      next: () => {
        this.chatError = null;
      },
      error: (err) => {
        this.chatError = err?.error?.error || 'Could not send friend request.';
      }
    });
  }

  getActiveConversation(): Conversation | undefined {
    return this.conversations.find(c => c.id === this.activeChat);
  }

  backToList(): void {
    this.mobileShowChat = false;
  }

  callFriend(): void {
    const conv = this.getActiveConversation();
    if (!conv) return;
    this.socketService.callFriend(conv.peer.id);
    this.router.navigate(['/video']);
  }
}
