'<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=28&duration=3000&pause=800&color=00E5FF&center=true&vCenter=true&width=500&lines=SVCODE+URL+VAULT;Cryptographic+Short+Link+Engine;Military-Grade+Security" alt="Typing SVG" />

<br>

[![Security](https://img.shields.io/badge/Security-AES--256-00E5FF?style=for-the-badge&logo=shield&logoColor=white)](https://)
[![Hash](https://img.shields.io/badge/Hash-SHA--256-b967ff?style=for-the-badge&logo=fingerprint&logoColor=white)](https://)
[![Status](https://img.shields.io/badge/Status-Production-00FF9D?style=for-the-badge&logo=checkmarx&logoColor=white)](https://)
[![License](https://img.shields.io/badge/License-Proprietary-ff2d78?style=for-the-badge&logo=lock&logoColor=white)](https://)

<br>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:00E5FF,50:b967ff,100:ff2d78&height=180&section=header&text=URL%20VAULT&fontSize=42&fontColor=ffffff&animation=fadeIn&fontAlignY=35&desc=Enterprise-Grade%20Short%20URL%20Generator%20with%20Military-Grade%20Security&descAlignY=55&descSize=14" />

</div>

---

## ⚡ Overview

**SVCODE URL VAULT** — это профессиональный, самодостаточный (single-file) генератор коротких URL с военным уровнем безопасности. Весь интерфейс построен на чистом HTML/CSS/JS без внешних зависимостей (кроме Font Awesome CDN).

> 🔒 **Zero Backend Required** — вся криптография выполняется клиентской стороной через Web Crypto API.

---

## 🎨 Visual Features

| Эффект | Технология |
|--------|-----------|
| **Glassmorphism** | `backdrop-filter: blur(28px) saturate(1.5)` |
| **Particle System** | 50 CSS-частиц с плавной анимацией |
| **Network Canvas** | 70 узлов с динамическими связями |
| **Cursor Glow** | 500px radial gradient с инерцией |
| **Glitch Text** | SVG stroke-dasharray + CSS clip-path |
| **Noise Overlay** | SVG feTurbulence fractalNoise |
| **Scanlines** | repeating-linear-gradient |
| **Shimmer Buttons** | CSS gradient translate animation |
| **Floating Inputs** | Label animation on focus |

---

## 🛡️ Security Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                            │
├─────────────────────────────────────────────────────────────┤
│  Layer 1 │ SHA-256 + Salt + Pepper (Double Hash)           │
│  Layer 2 │ Rate Limiting (5 attempts → 45s lockout)         │
│  Layer 3 │ Anti-DevTools Detection (debugger timing)        │
│  Layer 4 │ Anti-Copy / Anti-ContextMenu on sensitive fields │
│  Layer 5 │ Session Hardening (64-char token + fingerprint)  │
│  Layer 6 │ Auto-Lock on Inactivity (10 min idle)            │
│  Layer 7 │ Session Expiry (1 hour TTL)                        │
│  Layer 8 │ Secure Random Generator (crypto.getRandomValues)   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

```bash
# Clone or download the single HTML file
git clone https://github.com/swift-lux/link_site.git

# Open directly in browser (no server needed)
open index.html

# Or serve locally
node server.js
# Navigate to http://localhost:3000
```

---

## 📁 Project Structure

```
svcode_url_vault.html          # Single self-contained file
├── <head>
│   ├── Font Awesome 6.5.2 CDN (SRI-protected)
│   └── 15KB+ CSS (glassmorphism, animations, responsive)
│
├── <body>
│   ├── Canvas Background Layer
│   ├── Particle Layer
│   ├── Noise + Scanline Overlays
│   ├── Cursor Glow Effect
│   │
│   ├── Login Screen (SVCODE branded)
│   │   ├── SVG Animated Logo
│   │   ├── Credential Inputs
│   │   ├── Security Badges
│   │   └── Console Logger
│   │
│   └── Dashboard
│       ├── URL Forge (create short links)
│       ├── Forged Links List
│       ├── Analytics Panel
│       ├── System Log Console
│       └── QR Code Modal
│
└── <script>
    └── 16KB+ Obfuscated Security Engine
        ├── SHA-256 Implementation
        ├── Secure Random Generator
        ├── Session Management
        └── Anti-Tamper Systems
```

---

## 🎯 URL Generation

### Supported Prefixes

| Prefix | Example | Use Case |
|--------|---------|----------|
| `/` | `domain.com/aB3xK9mP` | Default short link |
| `sub/` | `domain.com/sub/aB3xK9mP` | Subdomain routing |
| `r/` | `domain.com/r/aB3xK9mP` | Redirect tracking |
| `go/` | `domain.com/go/aB3xK9mP` | Quick access |
| `api/` | `domain.com/api/aB3xK9mP` | API endpoints |
| `v1/` | `domain.com/v1/aB3xK9mP` | Versioned links |
| `cdn/` | `domain.com/cdn/aB3xK9mP` | Asset delivery |
| `ref/` | `domain.com/ref/aB3xK9mP` | Referral tracking |
| `s/` | `domain.com/s/aB3xK9mP` | Ultra-short |
| `x/` | `domain.com/x/aB3xK9mP` | Experimental |

### Slug Generation

```javascript
// Cryptographically secure random string
function secureRandom(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  // ... generates unguessable slugs like "kR7mP9xQ"
}
```

---

## 📊 Analytics Dashboard

| Metric | Description |
|--------|-------------|
| **TOTAL** | Общее количество созданных ссылок |
| **TODAY** | Ссылки, созданные сегодня |
| **AVG LEN** | Средняя длина slug |
| **ENTROPY** | Энтропия последнего slug (bits) |

---

## 🖥️ System Requirements

| Requirement | Minimum |
|-------------|---------|
| Browser | Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ |
| JavaScript | ES2018+ (async/await, Web Crypto API) |
| Display | 320px+ width (fully responsive) |
| Network | None (works offline after first load) |

---

## 🔧 Customization

### Change Domain

```javascript
// In the createURL function, replace:
const shortUrl = `domain.com/${prefix}${slug}`;
// With your domain:
const shortUrl = `go.yoursite.com/${prefix}${slug}`;
```

### Change Session Duration

```javascript
_sessDur: 3600000  // 1 hour in milliseconds
```

---

## 🎭 Screenshots

<div align="center">

| Login Screen | Dashboard |
|:------------:|:---------:|
| *Glassmorphism login with animated SVG logo, glitch text effect, and security badges* | *Full dashboard with URL forge, link list, analytics, and system console* |

</div>

---

## ⚠️ Security Notes

> **Client-side authentication is NOT a replacement for server-side security.**
> 
> This tool is designed for:
> - Personal URL management
> - Demo / portfolio projects
> - Educational purposes
> 
> For production deployments, always implement:
> - Server-side authentication
> - HTTPS/TLS encryption
> - Database-backed storage
> - Server-side rate limiting

---

## 🏗️ Tech Stack

<div align="center">

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Web Crypto](https://img.shields.io/badge/Web%20Crypto-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)
![Font Awesome](https://img.shields.io/badge/Font%20Awesome-528DD7?style=for-the-badge&logo=font-awesome&logoColor=white)

</div>

---

## 📜 License

```
┌─────────────────────────────────────────┐
│  SVCODE URL VAULT                      │
│  Copyright (c) 2026 SVCODE             │
│                                         │
│  All Rights Reserved.                   │
│  Proprietary Software.                  │
│  Unauthorized distribution prohibited.  │
└─────────────────────────────────────────┘
```

---

<div align="center">

**Built with precision by a 10+ year senior engineer.**

<br>

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:ff2d78,50:b967ff,100:00E5FF&height=120&section=footer&text=SECURE%20%7C%20FAST%20%7C%20BEAUTIFUL&fontSize=18&fontColor=ffffff&animation=fadeIn" />

</div>
