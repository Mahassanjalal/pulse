import { Component } from '@angular/core';

@Component({
  selector: 'pulse-messages',
  templateUrl: './messages.page.html',
  styles: []
})
export class MessagesPageComponent {
  activeChat: string | null = 'kai-sterling';
  newMessage = '';

  conversations = [
    { id: 'kai-sterling', name: 'Kai Sterling', avatar: 'https://i.pravatar.cc/100?img=10', lastMsg: 'Hey! Are you free for a chat?', time: '2m', unread: 2, online: true },
    { id: 'mira-zhang', name: 'Mira Zhang', avatar: 'https://i.pravatar.cc/100?img=12', lastMsg: 'That was a great conversation!', time: '1h', unread: 0, online: true },
    { id: 'alex-river', name: 'Alex Rivera', avatar: 'https://i.pravatar.cc/100?img=15', lastMsg: 'See you around 👋', time: '3h', unread: 0, online: false }
  ];

  messages = [
    { id: 1, sender: 'kai-sterling', text: 'Hey! How are you doing today?', time: '10:02 AM', self: false },
    { id: 2, sender: 'me', text: 'I\'m great! Just finished a video chat session', time: '10:03 AM', self: true },
    { id: 3, sender: 'kai-sterling', text: 'Nice! I was matched with someone from Japan earlier, it was amazing 🇯🇵', time: '10:04 AM', self: false },
    { id: 4, sender: 'me', text: 'Oh wow! The translation feature really is a game changer', time: '10:05 AM', self: true },
    { id: 5, sender: 'kai-sterling', text: 'Absolutely! Are you free for a chat now?', time: '10:06 AM', self: false }
  ];

  getActiveConversation() {
    return this.conversations.find(c => c.id === this.activeChat);
  }
}
