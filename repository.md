# Repository Structure

This document describes the repository layout.

Every directory has one responsibility.

No module should have more than one primary responsibility.

---

## Root

```
docs/
src/
public/
index.html
package.json
vite.config.js
```

---

## docs/

Project documentation.

Contains the architectural philosophy of AnimePlex.

Files:

```
architecture.md
caching.md
repository.md
vision.md
```

---

## src/

Application source code.

```
main.js

reader/
framework/
ads/
cache/
config/
util/
```

---

## src/main.js

Purpose:

* Boot the application.
* Initialize the reader.
* Initialize optional services.
* Handle startup failures.

Must never:

* Render chapters.
* Render advertisements.

---

## src/reader/

Responsible for rendering manga chapters.

Files:

```
reader.js
loader.js
images.js
render.js
navigation.js
```

reader.js

Purpose:

* Coordinate the reader.

loader.js

Purpose:

* Download item.json.

images.js

Purpose:

* Generate image URLs.

render.js

Purpose:

* Create DOM elements.

navigation.js

Purpose:

* Previous chapter.
* Next chapter.
* Chapter selection.

The reader owns only:

```
#reader-container
```

The reader must never:

* Modify the header.
* Modify the footer.
* Render advertisements.
* Access PostgreSQL.

---

## src/framework/

Responsible for permanent page layout.

Files:

```
header.js
footer.js
layout.js
```

Owns:

* Header
* Footer
* Sidebars
* Layout
* Permanent containers

Must never:

* Render manga pages.
* Render advertisements.

---

## src/ads/

Responsible for advertisements.

Files:

```
ads.js
placements.js
provider.js
```

Owns:

* Advertisement containers.

Must never:

* Modify reader-container.
* Prevent the reader from loading.

All failures must be isolated.

---

## src/cache/

Responsible for browser caching.

Files:

```
cache.js
```

Responsibilities:

* IndexedDB
* LocalStorage
* Browser cache management

---

## src/config/

Responsible for configuration.

Files:

```
config.js
```

Configuration is generated from PostgreSQL.

The browser treats configuration as read-only.

---

## src/util/

Reusable helper functions.

Files:

```
dom.js
fetch.js
```

Contains only generic helper functions.

Business logic must never exist here.

---

# Dependency Flow

```
main.js

↓

reader/

↓

loader.js

↓

images.js

↓

render.js
```

Advertisements are independent.

Framework is independent.

Cache is independent.

Modules communicate through clearly defined interfaces.

No module should directly manipulate another module's internal state.
