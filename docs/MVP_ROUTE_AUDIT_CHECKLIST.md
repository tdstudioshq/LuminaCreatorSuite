# Lumina MVP Route Audit Checklist

## Purpose

This checklist is used to audit the practical MVP route set for Lumina before moving deeper into backend, payments, compliance, and launch preparation.

The goal is not to confirm every final route exists yet. The goal is to confirm the core MVP routes are present, usable, visually polished, and free of dead interactions.

## Audit Rules

For every route, verify:

- [ ] Route loads without error
- [ ] Correct layout/shell is used
- [ ] Page title/header is correct
- [ ] Primary buttons work
- [ ] Secondary buttons work or show clear feedback
- [ ] Empty state exists
- [ ] Error state exists where relevant
- [ ] Mobile layout works
- [ ] Dark mode works if enabled
- [ ] No console errors
- [ ] No broken links
- [ ] No placeholder-only screen unless intentionally marked
- [ ] User permissions make sense
- [ ] Route redirects correctly when unauthorized

Use this status format:

```txt
✅ Complete
🟡 Partial
🔴 Broken
⚪ Not built
```

---

# 1. Public / Guest MVP Routes

## `/`

Landing page / marketing homepage.

Checklist:

- [ ] Loads correctly
- [ ] Lumina/CABANA branding is clear
- [ ] Headline explains product
- [ ] CTA buttons work
- [ ] Login/signup links work
- [ ] Mobile responsive
- [ ] Legal/footer links exist
- [ ] No console errors

Status:

```txt
Status:
Notes:
```

---

## `/login`

Login page.

Checklist:

- [ ] Email/password fields render
- [ ] Sign in button works or clearly indicates demo mode
- [ ] Demo Fan login works
- [ ] Demo Creator login works
- [ ] Demo Admin login works
- [ ] Forgot password link works
- [ ] Create account link works
- [ ] Invalid login behavior is clear
- [ ] Mobile responsive
- [ ] No console errors

Status:

```txt
Status:
Notes:
```

---

## `/signup`

Signup page.

Checklist:

- [ ] Page loads correctly
- [ ] Fan signup path exists
- [ ] Creator signup path exists
- [ ] Age/18+ language is visible if adult content is enabled
- [ ] Links back to login
- [ ] Form validation works
- [ ] Mobile responsive
- [ ] No console errors

Status:

```txt
Status:
Notes:
```

---

## `/forgot-password`

Password reset request page.

Checklist:

- [ ] Email input renders
- [ ] Submit button works or shows demo feedback
- [ ] Success state exists
- [ ] Error state exists
- [ ] Back to login link works
- [ ] Mobile responsive

Status:

```txt
Status:
Notes:
```

---

## `/reset-password`

Password update page.

Checklist:

- [ ] New password field renders
- [ ] Confirm password field renders if required
- [ ] Validation works
- [ ] Submit works or shows demo feedback
- [ ] Success state exists
- [ ] Invalid/expired token state exists

Status:

```txt
Status:
Notes:
```

---

## `/explore`

Public creator discovery.

Checklist:

- [ ] Loads for logged-out users
- [ ] Search input exists
- [ ] Featured creators render
- [ ] Creator cards render
- [ ] Follow/subscribe actions route to login if logged out
- [ ] Creator profile links work
- [ ] Right rail or trending section works on desktop
- [ ] Mobile layout works
- [ ] No console errors

Status:

```txt
Status:
Notes:
```

---

## `/creator/:username`

Public creator profile.

Test examples:

```txt
/creator/valid-creator
/creator/not-real
```

Checklist:

- [ ] Valid creator loads correct profile
- [ ] Invalid creator shows polished not-found state
- [ ] Banner/avatar/name/handle render
- [ ] Bio/category/stats render
- [ ] Subscribe button works or routes to login
- [ ] Follow button works or routes to login
- [ ] Message button works or gates correctly
- [ ] Posts tab works
- [ ] Media tab works
- [ ] Locked content teaser exists
- [ ] Mobile layout works
- [ ] No console errors

Status:

```txt
Status:
Notes:
```

---

## `/post/:postId`

Post detail page.

Test examples:

```txt
/post/valid-post
/post/not-real
```

Checklist:

- [ ] Valid post loads
- [ ] Invalid post shows not-found state
- [ ] Creator info renders
- [ ] Post text renders
- [ ] Media renders or locked teaser renders
- [ ] Like works
- [ ] Save works
- [ ] Comment drawer/section works
- [ ] More menu works
- [ ] Report action works
- [ ] Subscribe/unlock CTA works
- [ ] Mobile layout works
- [ ] No console errors

Status:

```txt
Status:
Notes:
```

---

## `/legal/terms`

Terms page.

Checklist:

- [ ] Page loads
- [ ] Adult platform terms are referenced
- [ ] Navigation/footer works
- [ ] Mobile readable

Status:

```txt
Status:
Notes:
```

---

## `/legal/privacy`

Privacy policy page.

Checklist:

- [ ] Page loads
- [ ] Mentions account, payment, verification, and compliance data
- [ ] Mobile readable

Status:

```txt
Status:
Notes:
```

---

## `/legal/adult-content-policy`

Adult content policy.

Checklist:

- [ ] Page loads
- [ ] 18+ rule is clear
- [ ] Prohibited content is clear
- [ ] Consent requirements are clear
- [ ] Report/takedown path is linked

Status:

```txt
Status:
Notes:
```

---

## `/legal/2257`

2257/compliance statement.

Checklist:

- [ ] Page loads
- [ ] Custodian/recordkeeping language placeholder exists
- [ ] Adult-content compliance disclaimer exists
- [ ] Legal review needed is noted internally

Status:

```txt
Status:
Notes:
```

---

## `/support`

Help/support page.

Checklist:

- [ ] Page loads
- [ ] FAQ/help sections exist
- [ ] Contact/support action works
- [ ] Billing/support links exist
- [ ] Safety/reporting links exist

Status:

```txt
Status:
Notes:
```

---

## `/takedown`

DMCA/takedown request page.

Checklist:

- [ ] Page loads
- [ ] Form exists
- [ ] Required fields validate
- [ ] Submit gives feedback
- [ ] Adult/safety complaint path is clear

Status:

```txt
Status:
Notes:
```

---

# 2. Fan MVP Routes

## `/feed`

Main fan feed.

Checklist:

- [ ] Requires login
- [ ] Loads as Fan
- [ ] Three-column layout works on desktop
- [ ] Composer visibility makes sense for role
- [ ] Feed filters work
- [ ] Post cards render correctly
- [ ] Like works
- [ ] Save works
- [ ] Comment works
- [ ] Share/copy link works
- [ ] More menu works
- [ ] Report works
- [ ] Hide post works
- [ ] Locked post teaser exists
- [ ] Subscribe/unlock flow works
- [ ] Right rail suggestions work
- [ ] Mobile feed works
- [ ] No console errors

Status:

```txt
Status:
Notes:
```

---

## `/explore`

Fan explore page.

Checklist:

- [ ] Loads as logged-in fan
- [ ] Search works
- [ ] Category/filter controls work
- [ ] Creator cards work
- [ ] Follow/unfollow updates state
- [ ] Subscribe CTA works
- [ ] Creator profile links work
- [ ] Mobile layout works

Status:

```txt
Status:
Notes:
```

---

## `/creator/:username`

Fan view of creator profile.

Checklist:

- [ ] Fan can view creator
- [ ] Follow/unfollow works
- [ ] Subscribe/cancel works
- [ ] Message button works or gates correctly
- [ ] Tip button works if enabled
- [ ] Locked posts show teaser
- [ ] Subscribed fan sees unlocked content
- [ ] Non-subscriber sees locked content
- [ ] Tabs work
- [ ] Search creator posts works if present

Status:

```txt
Status:
Notes:
```

---

## `/post/:postId`

Fan post detail.

Checklist:

- [ ] Fan can open post
- [ ] Locked/unlocked state is correct
- [ ] Comments work
- [ ] Like/save work
- [ ] Report works
- [ ] Subscribe/unlock works
- [ ] Exact timestamp available on hover or detail
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

## `/messages`

Fan messages inbox.

Checklist:

- [ ] Requires login
- [ ] Conversation list loads
- [ ] Search conversations works
- [ ] Filters work
- [ ] New Message button exists
- [ ] Creator picker opens
- [ ] Starting a message creates or reuses conversation
- [ ] Selected thread state is clear
- [ ] Empty state exists
- [ ] Mobile layout works

Status:

```txt
Status:
Notes:
```

---

## `/messages/:conversationId`

Fan message thread.

Checklist:

- [ ] Valid thread loads
- [ ] Invalid thread shows not-found/empty state
- [ ] Messages render correctly
- [ ] Send message works
- [ ] Composer works
- [ ] Tip button works if present
- [ ] Attach/media buttons give feedback
- [ ] Read/unread state updates
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

## `/notifications`

Fan notification center.

Checklist:

- [ ] Notifications render
- [ ] Filters work
- [ ] Search works
- [ ] Mark read works
- [ ] Mark unread works
- [ ] Mark all read works
- [ ] Archive/clear read works if present
- [ ] Notification click navigates to relevant page
- [ ] Empty state exists
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

## `/subscriptions`

Fan subscriptions page.

Checklist:

- [ ] Active subscriptions render
- [ ] Canceled subscriptions render
- [ ] Cancel subscription requires confirmation
- [ ] Resume subscription works if supported
- [ ] Creator profile links work
- [ ] Renewal/end dates are clear
- [ ] Empty state exists
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

## `/billing`

Fan billing overview.

Checklist:

- [ ] Payment methods render
- [ ] Add card modal works
- [ ] Remove card works with confirmation
- [ ] Set default card works
- [ ] Invoices render
- [ ] Failed payment banner appears when needed
- [ ] Retry payment works
- [ ] Receipt download works
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

## `/settings`

Fan settings overview.

Checklist:

- [ ] Page loads
- [ ] Profile settings accessible
- [ ] Account settings accessible
- [ ] Security settings accessible
- [ ] Notification settings accessible
- [ ] Privacy settings accessible
- [ ] Billing settings accessible
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

# 3. Creator MVP Routes

## `/dashboard/home`

Creator dashboard home.

Checklist:

- [ ] Requires creator role
- [ ] KPIs render
- [ ] Revenue snapshot renders
- [ ] Subscriber count renders
- [ ] Recent activity renders
- [ ] Quick actions work
- [ ] Empty/new creator state exists
- [ ] Compliance status visible if adult mode
- [ ] Mobile/tablet layout works

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/posts`

Post manager.

Checklist:

- [ ] Post table/list renders
- [ ] Draft/scheduled/published/archived filters work
- [ ] Search works if present
- [ ] Create post action works
- [ ] Edit post works
- [ ] Duplicate post works if present
- [ ] Archive requires confirmation
- [ ] Delete requires confirmation
- [ ] Preview as fan works
- [ ] Scheduled status/countdown works
- [ ] Empty state exists

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/posts/new`

Create post page/modal.

Checklist:

- [ ] Text composer works
- [ ] Auto-growing textarea works
- [ ] Audience selector works
- [ ] Public/Subscribers/PPV options work
- [ ] PPV price validation works
- [ ] Media attach works or clear demo flow exists
- [ ] Poll builder works or clear demo flow exists
- [ ] Save draft works
- [ ] Publish works
- [ ] Schedule works
- [ ] Explicit-content compliance gate appears where required

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/media`

Media library.

Checklist:

- [ ] Media grid/list renders
- [ ] Upload action works or clear demo flow exists
- [ ] Filter by type works
- [ ] Search works if present
- [ ] Media detail opens
- [ ] Rename works if present
- [ ] Delete requires confirmation
- [ ] Used/unused indicators exist
- [ ] Empty state exists
- [ ] Mobile/tablet works

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/subscribers`

Creator subscriber page.

Checklist:

- [ ] Subscriber list renders
- [ ] Search works
- [ ] Filters work
- [ ] Active/canceled/past-due states are clear
- [ ] Lifetime spend displays
- [ ] Renewal/end dates display
- [ ] Message subscriber action works
- [ ] CSV export works if present
- [ ] Empty state exists

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/messages`

Creator inbox.

Checklist:

- [ ] Conversation list renders
- [ ] Search works
- [ ] Send message works
- [ ] New message works if allowed
- [ ] Unread state works
- [ ] Fan/creator identity is clear
- [ ] Mobile/tablet works

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/earnings`

Creator earnings.

Checklist:

- [ ] Gross/net revenue render
- [ ] Pending/available balance render
- [ ] Revenue by type renders
- [ ] Ledger/recent transactions render
- [ ] Filters work
- [ ] CSV export works
- [ ] Request payout works
- [ ] Payout method selection works
- [ ] Empty state exists

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/payouts`

Creator payout history/request.

Checklist:

- [ ] Payout history renders
- [ ] Request payout button works
- [ ] KYC gate appears if creator not verified
- [ ] Available balance gate works
- [ ] Payout status is clear
- [ ] Declined/held reason shows if applicable
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/profile`

Creator profile editor.

Checklist:

- [ ] Display name updates
- [ ] Handle/username behavior is clear
- [ ] Bio updates
- [ ] Avatar/banner edit works or clear demo flow exists
- [ ] Category updates
- [ ] Website/location update
- [ ] Public preview link works
- [ ] Save feedback appears
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/compliance`

Creator compliance checklist.

Checklist:

- [ ] Age verification status visible
- [ ] KYC status visible
- [ ] Payout eligibility visible
- [ ] Performer records section visible
- [ ] Consent/release section visible
- [ ] 2257/content records section visible
- [ ] Clear blockers shown
- [ ] CTA buttons work or clearly indicate demo state
- [ ] Adult-content requirements are clear

Status:

```txt
Status:
Notes:
```

---

## `/dashboard/settings`

Creator settings.

Checklist:

- [ ] Account settings render
- [ ] Subscription price settings render
- [ ] Tip settings render
- [ ] Messaging settings render
- [ ] Notification settings render
- [ ] Security settings render
- [ ] Payout settings render
- [ ] Save actions persist or show demo feedback
- [ ] Mobile works

Status:

```txt
Status:
Notes:
```

---

# 4. Admin MVP Routes

## `/admin`

Admin overview.

Checklist:

- [ ] Requires admin role
- [ ] Admin KPIs render
- [ ] Pending reports count renders
- [ ] Pending payouts count renders
- [ ] Pending verification/compliance counts render
- [ ] Recent audit activity renders
- [ ] Quick actions navigate correctly
- [ ] Mobile/tablet usable

Status:

```txt
Status:
Notes:
```

---

## `/admin/users`

User management.

Checklist:

- [ ] User table renders
- [ ] Search works
- [ ] Role filters work
- [ ] Status filters work
- [ ] User detail opens
- [ ] Suspend requires confirmation
- [ ] Reinstate requires confirmation
- [ ] Admin actions write audit log
- [ ] User IDs resolve to display names where useful

Status:

```txt
Status:
Notes:
```

---

## `/admin/creators`

Creator management.

Checklist:

- [ ] Creator table renders
- [ ] Search works
- [ ] Verification filter works
- [ ] Creator detail opens
- [ ] Verify creator works
- [ ] Reject/unverify requires reason
- [ ] Suspend creator works with confirmation
- [ ] Content visibility updates after suspension
- [ ] Audit logs created

Status:

```txt
Status:
Notes:
```

---

## `/admin/reports`

Reports queue.

Checklist:

- [ ] Reports render
- [ ] Filters work
- [ ] Report detail opens
- [ ] Reported content/user link works
- [ ] Resolve requires confirmation
- [ ] Dismiss requires confirmation
- [ ] Remove content works if present
- [ ] Notes/reasons save
- [ ] Audit logs created
- [ ] Empty state exists

Status:

```txt
Status:
Notes:
```

---

## `/admin/content`

Content review.

Checklist:

- [ ] Content queue renders
- [ ] Post/media/comment filters work
- [ ] Open content detail works
- [ ] Remove content requires confirmation
- [ ] Restore content requires confirmation
- [ ] Explicit/flagged content state is visible
- [ ] Audit logs created
- [ ] Empty state exists

Status:

```txt
Status:
Notes:
```

---

## `/admin/payouts`

Payout queue.

Checklist:

- [ ] Payouts render
- [ ] Status filters work
- [ ] Payout detail opens
- [ ] Approve requires confirmation
- [ ] Hold requires reason
- [ ] Decline requires reason
- [ ] Mark paid requires confirmation
- [ ] Creator KYC/payout status visible
- [ ] Creator notified after status change
- [ ] Audit logs created

Status:

```txt
Status:
Notes:
```

---

## `/admin/transactions`

Transaction/ledger admin.

Checklist:

- [ ] Transaction table renders
- [ ] Search works
- [ ] Type filters work
- [ ] Status filters work
- [ ] Transaction detail opens
- [ ] Gross/fee/net values are clear
- [ ] Refund/chargeback links exist if applicable
- [ ] Export works if present

Status:

```txt
Status:
Notes:
```

---

## `/admin/audit`

Audit log.

Checklist:

- [ ] Audit events render
- [ ] Actor IDs resolve to names
- [ ] Subject IDs link to detail where possible
- [ ] Filters work
- [ ] Search works
- [ ] Export works if present
- [ ] Audit log cannot be edited/deleted from UI
- [ ] Timestamps are exact

Status:

```txt
Status:
Notes:
```

---

## `/admin/compliance`

Adult compliance dashboard.

Checklist:

- [ ] Age verification queue summary renders
- [ ] KYC queue summary renders
- [ ] Performer records summary renders
- [ ] Consent/release summary renders
- [ ] 2257/content records summary renders
- [ ] Flagged explicit content summary renders
- [ ] Quick actions navigate correctly
- [ ] Admin role restrictions make sense

Status:

```txt
Status:
Notes:
```

---

## `/admin/takedowns`

Takedown/DMCA queue.

Checklist:

- [ ] Takedown requests render
- [ ] Detail opens
- [ ] Target content/user link works
- [ ] Resolve requires reason
- [ ] Remove content action works if present
- [ ] Audit logs created
- [ ] Empty state exists

Status:

```txt
Status:
Notes:
```

---

## `/admin/settings`

Admin/platform settings.

Checklist:

- [ ] Page loads
- [ ] Role/permission settings visible
- [ ] Policy settings visible
- [ ] Payment settings visible
- [ ] Compliance settings visible
- [ ] Notification template settings visible
- [ ] Feature flags visible
- [ ] Sensitive changes require confirmation
- [ ] Audit logs created

Status:

```txt
Status:
Notes:
```

---

# 5. Shared Utility MVP Routes

## `/checkout/subscribe/:creatorId`

Subscribe checkout.

Checklist:

- [ ] Creator summary visible
- [ ] Price visible
- [ ] Benefits visible
- [ ] Payment method selected
- [ ] Confirm action works
- [ ] Success/failure state exists
- [ ] Requires login

Status:

```txt
Status:
Notes:
```

---

## `/checkout/ppv/:postId`

PPV unlock checkout.

Checklist:

- [ ] Post/creator summary visible
- [ ] Price visible
- [ ] Payment method selected
- [ ] Confirm unlock works
- [ ] Entitlement updates after success
- [ ] Failure state exists

Status:

```txt
Status:
Notes:
```

---

## `/checkout/tip/:creatorId`

Tip checkout.

Checklist:

- [ ] Creator summary visible
- [ ] Tip amount input works
- [ ] Min/max validation works
- [ ] Optional message works
- [ ] Payment method selected
- [ ] Confirm tip works
- [ ] Success/failure state exists

Status:

```txt
Status:
Notes:
```

---

## `/payment/success`

Payment success.

Checklist:

- [ ] Success state loads
- [ ] Next action links work
- [ ] Receipt/subscription/unlock result is clear

Status:

```txt
Status:
Notes:
```

---

## `/payment/failed`

Payment failed.

Checklist:

- [ ] Failure state loads
- [ ] Retry link works
- [ ] Billing link works
- [ ] Error explanation is clear

Status:

```txt
Status:
Notes:
```

---

## `/verification/success`

Verification success.

Checklist:

- [ ] Success state loads
- [ ] Correct next step shown
- [ ] Creator/fan routing works

Status:

```txt
Status:
Notes:
```

---

## `/verification/failed`

Verification failed.

Checklist:

- [ ] Failure state loads
- [ ] Reason shown if available
- [ ] Retry/support links work

Status:

```txt
Status:
Notes:
```

---

## `/unauthorized`

Unauthorized page.

Checklist:

- [ ] Page loads
- [ ] Explains access issue
- [ ] Back/home links work

Status:

```txt
Status:
Notes:
```

---

## `/suspended`

Suspended account page.

Checklist:

- [ ] Page loads
- [ ] Explains suspension
- [ ] Appeal/support link works
- [ ] User cannot bypass protected routes

Status:

```txt
Status:
Notes:
```

---

## `/not-found`

404 page.

Checklist:

- [ ] Page loads for unknown routes
- [ ] Search/home links work
- [ ] Looks polished

Status:

```txt
Status:
Notes:
```

---

# 6. MVP Route Summary

## Public MVP

- [ ] `/`
- [ ] `/login`
- [ ] `/signup`
- [ ] `/forgot-password`
- [ ] `/reset-password`
- [ ] `/explore`
- [ ] `/creator/:username`
- [ ] `/post/:postId`
- [ ] `/legal/terms`
- [ ] `/legal/privacy`
- [ ] `/legal/adult-content-policy`
- [ ] `/legal/2257`
- [ ] `/support`
- [ ] `/takedown`

## Fan MVP

- [ ] `/feed`
- [ ] `/explore`
- [ ] `/creator/:username`
- [ ] `/post/:postId`
- [ ] `/messages`
- [ ] `/messages/:conversationId`
- [ ] `/notifications`
- [ ] `/subscriptions`
- [ ] `/billing`
- [ ] `/settings`

## Creator MVP

- [ ] `/dashboard/home`
- [ ] `/dashboard/posts`
- [ ] `/dashboard/posts/new`
- [ ] `/dashboard/media`
- [ ] `/dashboard/subscribers`
- [ ] `/dashboard/messages`
- [ ] `/dashboard/earnings`
- [ ] `/dashboard/payouts`
- [ ] `/dashboard/profile`
- [ ] `/dashboard/compliance`
- [ ] `/dashboard/settings`

## Admin MVP

- [ ] `/admin`
- [ ] `/admin/users`
- [ ] `/admin/creators`
- [ ] `/admin/reports`
- [ ] `/admin/content`
- [ ] `/admin/payouts`
- [ ] `/admin/transactions`
- [ ] `/admin/audit`
- [ ] `/admin/compliance`
- [ ] `/admin/takedowns`
- [ ] `/admin/settings`

## Shared Utility MVP

- [ ] `/checkout/subscribe/:creatorId`
- [ ] `/checkout/ppv/:postId`
- [ ] `/checkout/tip/:creatorId`
- [ ] `/payment/success`
- [ ] `/payment/failed`
- [ ] `/verification/success`
- [ ] `/verification/failed`
- [ ] `/unauthorized`
- [ ] `/suspended`
- [ ] `/not-found`

---

# 7. Final MVP Audit Scorecard

Use this after testing all routes.

```txt
Public routes:
__ / 14 complete

Fan routes:
__ / 10 complete

Creator routes:
__ / 11 complete

Admin routes:
__ / 11 complete

Shared utility routes:
__ / 10 complete

Total MVP routes:
__ / 56 complete
```

## Launch Readiness Rating

```txt
Frontend route coverage:
__ / 10

Fan experience:
__ / 10

Creator experience:
__ / 10

Admin experience:
__ / 10

Adult compliance readiness:
__ / 10

Billing/payment readiness:
__ / 10

Mobile usability:
__ / 10

Overall MVP readiness:
__ / 10
```

---

# 8. Audit Notes

## Broken Routes

```txt
-
-
-
```

## Partial Routes

```txt
-
-
-
```

## Missing Routes

```txt
-
-
-
```

## Dead Buttons Found

```txt
-
-
-
```

## Mobile Issues

```txt
-
-
-
```

## Permission Issues

```txt
-
-
-
```

## Highest Priority Fixes

```txt
1.
2.
3.
4.
5.
```
