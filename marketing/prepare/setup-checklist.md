# Phase 0 Setup Checklist (do before Day 1)

One-time foundation so that every `dayN/` post has a home. Takes ~2-4 hours total, all free.

## 1. Channel assets (create + optimize)

- [ ] **Facebook Page** "PublicLink" - profile logo, cover (blue `#0f4c81` + tagline), About (the one-line
      message), Username `@publiclink` (or closest available), WhatsApp/Zalo button, pinned welcome post.
- [ ] **TikTok** business account - bio: "Tạo link bán hàng + QR trong 30 giây • share-link.top", link in bio.
- [ ] **Instagram** (business) - mirror TikTok bio + link (use a UTM link).
- [ ] **YouTube** channel - banner + "About" + subscribe; this is where Shorts live.
- [ ] **Zalo OA** (official account, free tier) - name, avatar, intro, menu with "Tạo link" -> UTM URL.
- [ ] **Google Business Profile** - category "Software / E-commerce service", website `share-link.top`,
      description, contact email, 3-5 product screenshots as photos.

## 2. Seller communities to join & seed (target 15-20)

Find and join relevant groups/chats. Note the top 5 in a list to prioritize.

- [ ] Facebook groups: "Hội bán hàng online", "Cộng đồng seller TMĐT", "Hội kinh doanh online",
      "Mẹ bỉm sữa bán hàng online", "Hội shipper/bán hàng", "Startup Vietnam", local city seller groups.
- [ ] Facebook groups for fitness: "Cộng đồng HLV Yoga Việt Nam", "Yoga Hà Nội/HCM", "Kinh doanh phòng tập".
- [ ] Zalo groups: seller/reseller communities, local business groups, yoga student/coach groups.
- [ ] **Read each group's self-promo rules** - most allow value posts; some restrict links to a weekly thread.

## 3. Tracking (free)

- [ ] Set up **GA4** on `share-link.top` (see `brand-and-assets.md`).
- [ ] Decide the **UTM convention** and save it (source/medium/campaign/content).
- [ ] Create the **referral UTM link** to append to the powered-by CTA.

## 4. The viral loop - add a "Powered by" CTA on public pages

This is our strongest $0 acquisition lever. Ask the dev (or do it) to add, on the **public sale page**
(`PublinkPage`) footer/badge area, a small non-intrusive line for buyers:

```
Tạo trang bán hàng của bạn trên PublicLink - share-link.top
```
- Link it with `utm_source=publiclink&utm_medium=poweredby`.
- Rationale: every buyer who opens a seller's link sees it -> many become sellers. (Implementation lives in
  the frontend `src/page/PublinkPage.js` / `src/Footer.js`; keep it subtle and brand-blue.)

## 5. Produce the two videos (see the scripts + production guide)

- [ ] Record the raw screen captures for **video-1 (product link)**.
- [ ] Record the raw screen captures for **video-2 (yoga booking link)**.
- [ ] Edit both in CapCut (VN voiceover + big VN captions, no person on screen). Export 9:16.
- [ ] Save master + 2 re-cut variants (new first 2 seconds) for A/B in later weeks.

## 6. Content ready

- [ ] Skim `post-templates.md` so you know where each day's copy comes from.
- [ ] Prepare 3-5 Canva cards (tagline, comparison, feature) to use as still-image posts.
- [ ] Set a recurring daily reminder for your two posting windows (lunch + evening, VN time).

Done with prep? Start `../day1/day1.md`.
