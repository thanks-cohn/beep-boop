# Architecture

## Philosophy

This project is designed around one central principle:

> The browser should perform as much work as possible.

Every component of the platform exists to reduce server load, simplify deployment, maximize CDN efficiency, and make ownership transfers nearly effortless.

The website is intentionally built as a static-first platform.

There are no per-page database queries.

There is no server-side page rendering.

There is no dynamic chapter generation.

Instead, the browser combines static content with cached configuration to produce the final reading experience.

---

# Core Design Principles

## 1. Content Never Knows Business Logic

Chapter data should describe only the chapter.

A chapter knows:

* title
* subtitle
* number of pages
* image format
* image locations

A chapter does **not** know:

* advertisements
* monetization
* ExoClick
* owner IDs
* account information
* experiments
* themes
* feature flags

Content is permanent.

Business logic is temporary.

The two must never be coupled.

---

## 2. Single Source of Truth

All website behavior is defined from a single administrative source.

This includes:

* advertisement placement
* advertisement frequency
* advertisement HTML
* enabled networks
* themes
* feature flags
* experiments
* reader behavior

The administrative database is the source of truth.

Static configuration files are generated from that database.

Visitors never communicate directly with PostgreSQL.

---

## 3. Static Website

The deployed website is entirely static.

GitHub hosts:

* HTML
* CSS
* JavaScript
* configuration files
* manifests

Cloudflare distributes those assets.

R2 stores media.

No application server is required for visitors.

---

## 4. R2 Stores Media Only

Cloudflare R2 exists only for media.

Examples include:

* manga pages
* covers
* thumbnails
* artwork

R2 should never contain:

* advertisement configuration
* owner information
* feature flags
* reader policies
* account configuration

This separation allows content to remain untouched while the website evolves.

---

## 5. Browser-First Architecture

The browser is the application.

Upon startup it downloads configuration once.

Configuration is stored locally.

Future chapters reuse cached configuration.

The browser should avoid repeated downloads whenever possible.

The browser is responsible for:

* page rendering
* advertisement scheduling
* lazy loading
* image prefetching
* cache management
* reader preferences

---

# Deployment Pipeline

```
Administrator

        │

        ▼

PostgreSQL

        │

Generate Static Configuration

        │

        ▼

Git Repository

        │

GitHub Pages

        │

Cloudflare CDN

        │

User Browser
```

Visitors never query PostgreSQL.

---

# Content Flow

```
Chapter Selected

        │

Load item.json

        │

Load Images

        │

Reader Engine

        │

Cached Configuration

        │

Final Reader
```

The reader combines content with cached policy.

The chapter itself remains completely unaware of monetization.

---

# Advertisement Engine

Advertisements are policies.

They are not chapter data.

An advertisement definition includes:

* placement
* frequency
* priority
* enabled state
* device targeting
* HTML embed code

Changing advertisement behavior should never require modifying chapter files.

A single configuration update should affect the entire website.

---

# Ownership Transfer

Ownership transfer should require no source code modifications.

A new owner should be capable of:

1. Logging into the administration panel.
2. Updating advertisement configuration.
3. Saving changes.
4. Publishing updated configuration.

No chapter regeneration.

No R2 synchronization.

No repository-wide search-and-replace.

No image uploads.

---

# Scalability

The platform is designed assuming growth from dozens of readers to millions.

Scaling should occur through caching rather than additional infrastructure.

Goals include:

* minimal origin traffic
* maximum CDN cache utilization
* aggressive browser caching
* immutable assets
* static deployment
* low operational cost

Whenever possible:

One write.

Millions of reads.

---

# Caching Strategy

Everything that can be cached should be cached.

Priority order:

1. Browser memory
2. IndexedDB
3. Browser HTTP cache
4. Cloudflare CDN
5. GitHub origin
6. R2 origin

Origin requests should be considered the final fallback.

---

# Reader Independence

The reader engine should operate independently of content.

Changing:

* themes
* advertisement frequency
* placement rules
* monetization
* experiments

must never require changing existing chapter metadata.

Reader behavior evolves.

Content does not.

---

# Separation of Responsibilities

## PostgreSQL

Administrative editing.

Never serves visitors.

---

## GitHub

Version-controlled static deployment.

---

## Cloudflare

Global caching.

---

## R2

Media storage only.

---

## Browser

Rendering.

Caching.

Reader logic.

Advertisement scheduling.

Navigation.

Lazy loading.

---

# Long-Term Goal

The architecture should remain fundamentally unchanged regardless of traffic.

Whether serving:

10 visitors

10,000 visitors

10 million visitors

or more,

the system should continue functioning primarily as a static website whose intelligence resides inside the browser rather than the server.

This architecture minimizes infrastructure complexity, minimizes operating cost, simplifies ownership transfers, and allows the platform to evolve without modifying existing content.
