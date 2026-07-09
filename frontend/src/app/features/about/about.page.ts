import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { SharedModule } from '@shared/shared.module';

@Component({
  selector: 'pulse-about',
  template: `
    <div class="min-h-screen bg-background text-on-surface overflow-x-hidden">
      <main>
        <!-- Hero -->
        <section class="relative min-h-[600px] flex items-center justify-center overflow-hidden">
          <div class="absolute inset-0">
            <div class="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[128px]"></div>
            <div class="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[128px]"></div>
          </div>
          <div class="relative z-10 text-center px-lg max-w-4xl">
            <span class="font-label-md text-label-md text-secondary-fixed tracking-[0.2em] uppercase mb-md block">The Pulse Manifesto</span>
            <h2 class="font-display-lg text-display-lg text-white mb-lg">Connecting Strangers,<br/><span class="text-primary">Building Community.</span></h2>
            <p class="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
              In a world of static profiles, Pulse brings back the magic of spontaneous face-to-face interaction. We're not just an app; we're a global bridge.
            </p>
            <div class="mt-xl flex justify-center gap-md">
              <button class="bg-primary text-on-primary px-xl py-md rounded-xl font-headline-md text-headline-md neon-glow-primary transition-all active:scale-95">Our Story</button>
              <button class="glass-panel text-white px-xl py-md rounded-xl font-headline-md text-headline-md border border-white/20 transition-all hover:bg-white/10 active:scale-95">The Vision</button>
            </div>
          </div>
        </section>

        <!-- Story -->
        <section class="py-xl px-xl">
          <div class="max-w-6xl mx-auto">
            <div class="grid md:grid-cols-2 gap-xl items-center mb-40">
              <div class="space-y-lg">
                <h3 class="font-headline-lg text-headline-lg text-primary">Born from Isolation</h3>
                <p class="text-on-surface-variant leading-relaxed">
                  Pulse began in a cramped studio apartment during the 2020 lockdowns. Our founder, tired of the curated perfection of social media feeds, wanted something raw, real, and immediate.
                </p>
                <p class="text-on-surface-variant leading-relaxed">
                  We built a prototype that matched people for 3-minute video conversations. No likes, no comments—just human presence. The result was electric.
                </p>
              </div>
              <div class="relative group">
                <div class="absolute -inset-4 bg-primary/20 rounded-xl blur-2xl group-hover:bg-primary/30 transition-all"></div>
                <div class="aspect-square rounded-xl overflow-hidden glass-panel relative z-10">
                  <div class="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style="background-image: url('https://i.pravatar.cc/600?img=11')"></div>
                </div>
              </div>
            </div>
            <div class="grid md:grid-cols-2 gap-xl items-center">
              <div class="relative group">
                <div class="absolute -inset-4 bg-secondary-container/20 rounded-xl blur-2xl group-hover:bg-secondary-container/30 transition-all"></div>
                <div class="aspect-video rounded-xl overflow-hidden glass-panel relative z-10">
                  <div class="w-full h-full bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style="background-image: url('https://i.pravatar.cc/800?img=3')"></div>
                </div>
              </div>
              <div class="space-y-lg">
                <h3 class="font-headline-lg text-headline-lg text-secondary-fixed">The Global Bridge</h3>
                <p class="text-on-surface-variant leading-relaxed">
                  Today, Pulse facilitates over 10 million connections daily. From a baker in Paris teaching a student in Tokyo how to knead dough, to musicians jamming across oceans—we are the engine of serendipity.
                </p>
                <div class="flex items-center gap-md pt-md">
                  <div class="flex -space-x-4">
                    <div class="w-12 h-12 rounded-full border-2 border-surface overflow-hidden"><img class="w-full h-full object-cover" src="https://i.pravatar.cc/100?img=5" alt="" /></div>
                    <div class="w-12 h-12 rounded-full border-2 border-surface overflow-hidden"><img class="w-full h-full object-cover" src="https://i.pravatar.cc/100?img=15" alt="" /></div>
                    <div class="w-12 h-12 rounded-full border-2 border-surface overflow-hidden"><img class="w-full h-full object-cover" src="https://i.pravatar.cc/100?img=25" alt="" /></div>
                  </div>
                  <span class="font-label-md font-semibold text-secondary-fixed">+10M Lives Touched</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Safety -->
        <section class="bg-surface-container-low py-xl px-xl">
          <div class="max-w-6xl mx-auto">
            <h2 class="font-headline-lg text-headline-lg text-center mb-sm">Safety by Design</h2>
            <p class="text-center text-on-surface-variant max-w-2xl mx-auto mb-xl">Discovery is only fun when it's safe. We've built an invisible shield around every interaction.</p>
            <div class="grid grid-cols-1 md:grid-cols-6 gap-md">
              <div class="md:col-span-3 glass-panel p-xl rounded-xl flex flex-col justify-between border border-white/5">
                <div>
                  <div class="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center mb-md">
                    <span class="material-symbols-outlined text-primary">psychology</span>
                  </div>
                  <h4 class="font-headline-md text-headline-md text-white mb-sm">Real-time AI Moderation</h4>
                  <p class="text-on-surface-variant">Our custom-trained neural networks scan video feeds at 30fps to detect and block inappropriate content before it ever reaches your screen.</p>
                </div>
              </div>
              <div class="md:col-span-3 glass-panel p-xl rounded-xl border border-white/5">
                <div class="flex justify-between items-start mb-md">
                  <div class="w-12 h-12 bg-secondary-container/20 rounded-lg flex items-center justify-center">
                    <span class="material-symbols-outlined text-secondary-fixed">verified_user</span>
                  </div>
                  <div class="px-md py-xs bg-secondary-fixed/10 text-secondary-fixed rounded-full font-label-sm text-label-sm border border-secondary-fixed/30">ACTIVE SCORE</div>
                </div>
                <h4 class="font-headline-md text-headline-md text-white mb-sm">Dynamic Trust Score</h4>
                <p class="text-on-surface-variant mb-lg">Your reputation matters. Users with high Trust Scores gain access to premium discovery features.</p>
              </div>
              <div class="md:col-span-2 glass-panel p-lg rounded-xl flex flex-col items-center text-center border border-white/5">
                <span class="material-symbols-outlined text-error text-4xl mb-sm">gavel</span>
                <h5 class="text-white font-bold mb-xs">Zero Tolerance</h5>
                <p class="font-label-md text-label-md text-on-surface-variant">Verified reports lead to immediate, hardware-level bans.</p>
              </div>
              <div class="md:col-span-2 glass-panel p-lg rounded-xl flex flex-col items-center text-center border border-white/5">
                <span class="material-symbols-outlined text-tertiary text-4xl mb-sm">lock</span>
                <h5 class="text-white font-bold mb-xs">P2P Encryption</h5>
                <p class="font-label-md text-label-md text-on-surface-variant">All video streams are encrypted end-to-end.</p>
              </div>
              <div class="md:col-span-2 glass-panel p-lg rounded-xl flex flex-col items-center text-center border border-white/5">
                <span class="material-symbols-outlined text-primary text-4xl mb-sm">volunteer_activism</span>
                <h5 class="text-white font-bold mb-xs">24/7 Human Appeals</h5>
                <p class="font-label-md text-label-md text-on-surface-variant">Our global moderation team is available around the clock.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Team -->
        <section class="py-xl px-xl relative">
          <div class="max-w-6xl mx-auto">
            <h2 class="font-headline-lg text-headline-lg text-center mb-sm">The Architects of Connection</h2>
            <p class="text-center text-on-surface-variant mb-xl">A remote-first team spread across 14 timezones, united by one pulse.</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-lg">
              <div *ngFor="let member of team" class="group text-center">
                <div class="relative mb-md inline-block">
                  <div class="absolute -inset-1 bg-gradient-to-tr from-primary to-secondary-container rounded-2xl opacity-0 group-hover:opacity-100 blur-md transition-all duration-500"></div>
                  <div class="relative w-40 h-40 md:w-48 md:h-48 rounded-2xl overflow-hidden glass-panel border-2 border-white/5 mx-auto">
                    <img class="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500" [src]="member.avatar" alt="" />
                  </div>
                </div>
                <h5 class="font-headline-md text-headline-md text-white">{{ member.name }}</h5>
                <p class="font-label-md text-label-md" [class]="member.color">{{ member.role }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- CTA -->
        <section class="py-xl px-xl bg-surface-container-highest text-center">
          <h2 class="font-display-lg text-display-lg mb-lg">Ready to feel the <span class="text-primary italic">Pulse</span>?</h2>
          <p class="font-body-lg text-body-lg text-on-surface-variant mb-xl max-w-xl mx-auto">Join the millions who have already found their next best friend, mentor, or inspiration.</p>
          <button routerLink="/login" class="bg-primary text-on-primary font-display-lg text-headline-md px-xl py-lg rounded-2xl neon-glow-primary transition-all active:scale-95">Start Matching Now</button>
        </section>
      </main>

      <!-- Footer -->
      <footer class="bg-surface-container-lowest py-xl px-xl border-t border-white/5">
        <div class="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-xl">
          <div>
            <h2 class="font-display-lg text-headline-lg font-black text-primary tracking-tighter mb-md">Pulse</h2>
            <p class="text-on-surface-variant font-label-md text-label-md">Building the future of global connection, one conversation at a time.</p>
          </div>
          <div>
            <h6 class="font-bold text-white mb-md">Platform</h6>
            <ul class="space-y-sm text-on-surface-variant font-label-md text-label-md">
              <li><a class="hover:text-primary transition-colors" routerLink="/discover">Discover</a></li>
              <li><a class="hover:text-primary transition-colors" href="#">Safety Center</a></li>
              <li><a class="hover:text-primary transition-colors" routerLink="/premium">Premium Perks</a></li>
            </ul>
          </div>
          <div>
            <h6 class="font-bold text-white mb-md">Company</h6>
            <ul class="space-y-sm text-on-surface-variant font-label-md text-label-md">
              <li><a class="hover:text-primary transition-colors" routerLink="/about">About Us</a></li>
              <li><a class="hover:text-primary transition-colors" href="#">Careers</a></li>
              <li><a class="hover:text-primary transition-colors" href="#">Press Kit</a></li>
            </ul>
          </div>
          <div>
            <h6 class="font-bold text-white mb-md">Legal</h6>
            <ul class="space-y-sm text-on-surface-variant font-label-md text-label-md">
              <li><a class="hover:text-primary transition-colors" href="#">Privacy Policy</a></li>
              <li><a class="hover:text-primary transition-colors" href="#">Terms of Service</a></li>
              <li><a class="hover:text-primary transition-colors" href="#">Cookie Policy</a></li>
            </ul>
          </div>
        </div>
          <div class="max-w-6xl mx-auto mt-xl pt-lg border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-md">
          <p class="font-label-sm text-label-sm text-on-surface-variant">&copy; 2026 Pulse Discovery Inc. All rights reserved.</p>
          <div class="flex gap-md">
            <a href="https://pulse.app" target="_blank" rel="noopener noreferrer" class="w-10 h-10 rounded-full glass-panel flex items-center justify-center hover:text-primary transition-all" aria-label="Visit our website"><span class="material-symbols-outlined text-md">public</span></a>
            <a href="mailto:hello@pulse.app" class="w-10 h-10 rounded-full glass-panel flex items-center justify-center hover:text-primary transition-all" aria-label="Email us"><span class="material-symbols-outlined text-md">alternate_email</span></a>
            <button (click)="shareAbout()" type="button" class="w-10 h-10 rounded-full glass-panel flex items-center justify-center hover:text-primary transition-all" aria-label="Share this page"><span class="material-symbols-outlined text-md">share</span></button>
          </div>
        </div>
      </footer>
    </div>
  `,
  styles: []
})
export class AboutPageComponent {
  team = [
    { name: 'Elena Vance', role: 'FOUNDER & CEO', color: 'text-primary', avatar: 'https://i.pravatar.cc/300?img=32' },
    { name: 'Marcus Chen', role: 'CHIEF ARCHITECT', color: 'text-secondary-fixed', avatar: 'https://i.pravatar.cc/300?img=53' },
    { name: 'Sasha Roe', role: 'PRODUCT VISION', color: 'text-tertiary', avatar: 'https://i.pravatar.cc/300?img=45' },
    { name: 'Dr. Aris Thorne', role: 'VP OF SAFETY', color: 'text-error', avatar: 'https://i.pravatar.cc/300?img=22' }
  ];

  shareAbout(): void {
    if (navigator.share) {
      navigator.share({ title: 'Pulse - About Us', url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  }
}
