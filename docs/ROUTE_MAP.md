# Route Map

Aligned to `docs/MVP_ROUTE_AUDIT_CHECKLIST.md`.

## Route Inventory

| Route                            | File path                                      | Current status                       | Keep / Build / Redirect / Remove | Reason                                                              |
| -------------------------------- | ---------------------------------------------- | ------------------------------------ | -------------------------------- | ------------------------------------------------------------------- |
| `/`                              | `src/routes/index.tsx`                         | Redirects to `/login`                | Keep                             | Home URL intentionally enters auth for current demo flow.           |
| `/login`                         | `src/routes/login.tsx`                         | Working auth page                    | Keep                             | Public MVP auth route.                                              |
| `/signup`                        | `src/routes/signup.tsx`                        | Working signup page                  | Keep                             | Public MVP auth route.                                              |
| `/forgot-password`               | `src/routes/forgot-password.tsx`               | Working reset request page           | Keep                             | Public MVP auth route.                                              |
| `/reset-password`                | `src/routes/reset-password.tsx`                | Working password update page         | Keep                             | Public MVP auth route.                                              |
| `/explore`                       | `src/routes/explore.tsx`                       | Discovery page                       | Build                            | Public/fan creator discovery route.                                 |
| `/creator/:username`             | `src/routes/creator.$username.tsx`             | Dynamic creator profile              | Build                            | Replaces root `/:username` route and handles invalid creators.      |
| `/post/:postId`                  | `src/routes/post.$postId.tsx`                  | Dynamic post detail                  | Keep                             | Handles valid and missing posts.                                    |
| `/legal/terms`                   | `src/routes/legal.terms.tsx`                   | MVP shell                            | Build                            | Public legal route.                                                 |
| `/legal/privacy`                 | `src/routes/legal.privacy.tsx`                 | MVP shell                            | Build                            | Public legal route.                                                 |
| `/legal/adult-content-policy`    | `src/routes/legal.adult-content-policy.tsx`    | MVP shell                            | Build                            | Adult content policy route.                                         |
| `/legal/2257`                    | `src/routes/legal.2257.tsx`                    | MVP shell                            | Build                            | 2257/compliance statement route.                                    |
| `/support`                       | `src/routes/support.tsx`                       | MVP shell                            | Build                            | Public support route.                                               |
| `/takedown`                      | `src/routes/takedown.tsx`                      | MVP shell                            | Build                            | DMCA/safety intake route.                                           |
| `/feed`                          | `src/routes/feed.tsx`                          | Fan feed, signed-in guard            | Keep                             | Fan MVP route.                                                      |
| `/messages`                      | `src/routes/messages.tsx`                      | Inbox, signed-in guard               | Keep                             | Fan MVP route.                                                      |
| `/messages/:conversationId`      | `src/routes/messages.$conversationId.tsx`      | Thread, signed-in guard              | Keep                             | Fan MVP route.                                                      |
| `/notifications`                 | `src/routes/notifications.tsx`                 | Notification center, signed-in guard | Keep                             | Fan MVP route.                                                      |
| `/subscriptions`                 | `src/routes/subscriptions.tsx`                 | MVP shell, signed-in guard           | Build                            | Fan subscription management route.                                  |
| `/billing`                       | `src/routes/billing.tsx`                       | MVP shell, signed-in guard           | Build                            | Fan billing route.                                                  |
| `/settings`                      | `src/routes/settings.tsx`                      | MVP shell, signed-in guard           | Build                            | Fan settings route and member landing.                              |
| `/dashboard`                     | `src/routes/dashboard.tsx`                     | Creator layout                       | Keep                             | Parent layout for creator MVP routes.                               |
| `/dashboard/home`                | `src/routes/dashboard.home.tsx`                | Creator dashboard                    | Keep                             | Creator MVP route.                                                  |
| `/dashboard/posts`               | `src/routes/dashboard.posts.tsx`               | Post manager                         | Keep                             | Creator MVP route.                                                  |
| `/dashboard/posts/new`           | `src/routes/dashboard.posts.new.tsx`           | MVP shell                            | Build                            | Creator post creation route.                                        |
| `/dashboard/media`               | `src/routes/dashboard.media.tsx`               | MVP shell                            | Build                            | Creator media library route.                                        |
| `/dashboard/subscribers`         | `src/routes/dashboard.subscribers.tsx`         | Subscriber page                      | Keep                             | Creator MVP route.                                                  |
| `/dashboard/messages`            | `src/routes/dashboard.messages.tsx`            | Creator inbox                        | Keep                             | Creator MVP route.                                                  |
| `/dashboard/earnings`            | `src/routes/dashboard.earnings.tsx`            | Earnings page                        | Keep                             | Creator MVP route.                                                  |
| `/dashboard/payouts`             | `src/routes/dashboard.payouts.tsx`             | MVP shell                            | Build                            | Creator payout route.                                               |
| `/dashboard/profile`             | `src/routes/dashboard.profile.tsx`             | Profile editor                       | Keep                             | Creator MVP route.                                                  |
| `/dashboard/compliance`          | `src/routes/dashboard.compliance.tsx`          | MVP shell                            | Build                            | Creator compliance route.                                           |
| `/dashboard/settings`            | `src/routes/dashboard.settings.tsx`            | Creator settings                     | Keep                             | Creator MVP route.                                                  |
| `/admin`                         | `src/routes/admin.tsx`                         | Admin overview with child outlet     | Keep                             | Admin MVP parent/overview route.                                    |
| `/admin/users`                   | `src/routes/admin.users.tsx`                   | MVP shell                            | Build                            | Admin user management route.                                        |
| `/admin/creators`                | `src/routes/admin.creators.tsx`                | MVP shell                            | Build                            | Admin creator management route.                                     |
| `/admin/reports`                 | `src/routes/admin.reports.tsx`                 | Reports queue                        | Keep                             | Admin MVP route.                                                    |
| `/admin/content`                 | `src/routes/admin.content.tsx`                 | MVP shell                            | Build                            | Admin content review route.                                         |
| `/admin/payouts`                 | `src/routes/admin.payouts.tsx`                 | Payout queue                         | Keep                             | Admin payout route.                                                 |
| `/admin/transactions`            | `src/routes/admin.transactions.tsx`            | Ledger/transactions page             | Build                            | Replaces finance/ledger exposure.                                   |
| `/admin/audit`                   | `src/routes/admin.audit.tsx`                   | Audit log                            | Keep                             | Admin MVP route.                                                    |
| `/admin/compliance`              | `src/routes/admin.compliance.tsx`              | MVP shell                            | Build                            | Admin compliance route.                                             |
| `/admin/takedowns`               | `src/routes/admin.takedowns.tsx`               | MVP shell                            | Build                            | Admin takedown queue route.                                         |
| `/admin/settings`                | `src/routes/admin.settings.tsx`                | MVP shell                            | Build                            | Admin platform settings route.                                      |
| `/checkout/subscribe/:creatorId` | `src/routes/checkout.subscribe.$creatorId.tsx` | MVP shell, signed-in guard           | Build                            | Shared checkout route.                                              |
| `/checkout/ppv/:postId`          | `src/routes/checkout.ppv.$postId.tsx`          | MVP shell, signed-in guard           | Build                            | Shared PPV checkout route.                                          |
| `/checkout/tip/:creatorId`       | `src/routes/checkout.tip.$creatorId.tsx`       | MVP shell, signed-in guard           | Build                            | Shared tip checkout route.                                          |
| `/payment/success`               | `src/routes/payment.success.tsx`               | MVP shell                            | Build                            | Shared payment result route.                                        |
| `/payment/failed`                | `src/routes/payment.failed.tsx`                | MVP shell                            | Build                            | Shared payment result route.                                        |
| `/verification/success`          | `src/routes/verification.success.tsx`          | MVP shell                            | Build                            | Shared verification result route.                                   |
| `/verification/failed`           | `src/routes/verification.failed.tsx`           | MVP shell                            | Build                            | Shared verification result route.                                   |
| `/unauthorized`                  | `src/routes/unauthorized.tsx`                  | Access page                          | Build                            | Role guard target.                                                  |
| `/suspended`                     | `src/routes/suspended.tsx`                     | Account status page                  | Build                            | Suspended-user route.                                               |
| `/not-found`                     | `src/routes/not-found.tsx`                     | 404 page                             | Build                            | Explicit 404 route.                                                 |
| `/discover`                      | `src/routes/discover.tsx`                      | Redirects to `/explore`              | Redirect                         | Legacy discovery URL.                                               |
| `/demo`                          | `src/routes/demo.tsx`                          | Redirects to `/creator/aurora`       | Redirect                         | Legacy demo URL.                                                    |
| `/account`                       | `src/routes/account.tsx`                       | Redirects to `/settings`             | Redirect                         | Replaced by MVP fan settings.                                       |
| `/onboarding`                    | `src/routes/onboarding.tsx`                    | Redirects to `/signup`               | Redirect                         | Signup owns account creation entry.                                 |
| `/pricing`                       | `src/routes/pricing.tsx`                       | Redirects to `/signup`               | Redirect                         | Not in MVP route set.                                               |
| `/docs/system`                   | `src/routes/docs.system.tsx`                   | Redirects to `/support`              | Redirect                         | Not in MVP route set.                                               |
| `/docs/data-model`               | `src/routes/docs.data-model.tsx`               | Redirects to `/support`              | Redirect                         | Not in MVP route set.                                               |
| `/dashboard/`                    | `src/routes/dashboard.index.tsx`               | Redirects to `/dashboard/home`       | Redirect                         | Canonical creator dashboard home.                                   |
| `/dashboard/analytics`           | `src/routes/dashboard.analytics.tsx`           | Redirects to `/dashboard/home`       | Redirect                         | Not in MVP route set.                                               |
| `/dashboard/performance`         | `src/routes/dashboard.performance.tsx`         | Redirects to `/dashboard/home`       | Redirect                         | Not in MVP route set.                                               |
| `/dashboard/media-kit`           | `src/routes/dashboard.media-kit.tsx`           | Redirects to `/dashboard/profile`    | Redirect                         | Profile owns public presentation.                                   |
| `/dashboard/links`               | `src/routes/dashboard.links.tsx`               | Redirects to `/dashboard/profile`    | Redirect                         | Profile owns public links.                                          |
| `/dashboard/storefront`          | `src/routes/dashboard.storefront.tsx`          | Redirects to `/dashboard/profile`    | Redirect                         | Storefront is not MVP route.                                        |
| `/dashboard/notifications`       | `src/routes/dashboard.notifications.tsx`       | Redirects to `/dashboard/settings`   | Redirect                         | Settings owns creator notification controls.                        |
| `/admin/finance`                 | `src/routes/admin.finance.tsx`                 | Redirects to `/admin/transactions`   | Redirect                         | Replaced by transactions route.                                     |
| `/admin/ledger`                  | `src/routes/admin.ledger.tsx`                  | Redirects to `/admin/transactions`   | Redirect                         | Replaced by transactions route.                                     |
| `/admin/ledger/:transactionId`   | `src/routes/admin.ledger.$transactionId.tsx`   | Redirects to `/admin/transactions`   | Redirect                         | Transaction detail is not exposed in MVP route set.                 |
| `/td`                            | `src/routes/td.tsx`                            | Route file removed                   | Remove                           | Client/demo microsite route, not Lumina MVP.                        |
| `/eldondolla`                    | `src/routes/eldondolla.tsx`                    | Route file removed                   | Remove                           | Client/demo microsite route, not Lumina MVP.                        |
| `/:username`                     | `src/routes/$username.tsx`                     | Route file removed                   | Remove                           | Replaced by `/creator/:username` to avoid swallowing static routes. |

## Kept Routes

Core working routes kept in place include auth, feed, messages, notifications, creator dashboard
routes, existing admin reports/payouts/audit routes, dynamic posts, and the dashboard/admin parent
layouts.

## Newly Added Route Shells

Added MVP shells for legal/support/takedown pages, fan subscriptions/billing/settings, creator
post creation/media/payouts/compliance, admin users/creators/content/transactions/compliance/
takedowns/settings, checkout flows, payment/verification results, unauthorized, suspended, and
explicit not-found.

## Redirected Routes

Legacy or non-MVP routes now redirect to the closest MVP route:

- `/discover` -> `/explore`
- `/demo` -> `/creator/aurora`
- `/account` -> `/settings`
- `/onboarding` and `/pricing` -> `/signup`
- `/docs/system` and `/docs/data-model` -> `/support`
- `/dashboard`, analytics, performance, media-kit, links, storefront, notifications -> MVP dashboard routes
- `/admin/finance`, `/admin/ledger`, `/admin/ledger/:transactionId` -> `/admin/transactions`

## Removed Routes

Removed route exposure for `/td`, `/eldondolla`, and root `/:username`. Reusable components were not
deleted unless they were only route exposure.

## Remaining Route Limitations

- Many new routes are polished MVP shells and still need backend-backed workflows.
- `/` currently redirects to `/login` to preserve the requested home-login behavior.
- Fan and checkout guards are client-side Supabase session checks only.
- Unknown URLs use the root not-found component; `/not-found` also exists as an explicit route.
